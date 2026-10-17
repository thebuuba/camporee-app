#!/usr/bin/env node
// Migration CLI for moving song MP3s from the private Supabase Storage bucket
// `camporee-files` to the exclusive private R2 bucket `camporee-app-music`.
//
// - Dry-run by default everywhere; pass --apply to change anything.
// - Only documents of type `song:*` whose file_path is `<camporeeId>/songs/*.mp3`
//   are considered. external_url is never fetched (no SSRF).
// - Object I/O shells out to the installed Wrangler CLI via execFile and the
//   node executable; no shell, no new dependencies, no custom S3 signer.
// - Manifests are durable, live outside git and are written before the DB is
//   touched. They are the only source cleanup trusts (Wrangler has no
//   `r2 object list`).
//
// See docs/r2-music-migration.md.

import { execFile } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  AUTHORIZED_ACCOUNT_ID, BUNDLED_SONGS, LEGACY_BUCKET, MIN_GRACE_HOURS, OWNED_BUCKET,
  createManifestStore, runBundledMigration, runCleanup, runMigration, runRollback,
} from './song-audio-migration.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const wranglerBin = path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const HELP = `camporee R2 music migration

Usage:
  node scripts/migrate-song-audio.mjs [options]

Options:
  -h, --help                 Show this help (no environment required)
      --apply                Apply changes (default is dry-run)
      --camporee-id <uuid>   Restrict migration to one camporee
      --include-bundled      Seed the 2 bundled local MP3 songs as documents
                             (requires --camporee-id and --created-by)
      --created-by <uuid>    Author of the seeded bundled documents
      --rollback <manifest>  Restore documents from a migration manifest
      --cleanup              Inventory orphan candidates from our manifests
      --grace-hours <n>      Minimum age before cleanup (>= 48, default 48)
      --manifest-dir <dir>   Manifest directory (default: .music-migration)

Environment (CLI only, never printed, never exposed to the browser):
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  CLOUDFLARE_ACCOUNT_ID=${AUTHORIZED_ACCOUNT_ID}
  MUSIC_R2_BUCKET=${OWNED_BUCKET}
  CLOUDFLARE_API_TOKEN (or a Wrangler OAuth login)

Examples:
  node scripts/migrate-song-audio.mjs                         # inventory (dry-run)
  node scripts/migrate-song-audio.mjs --camporee-id <uuid> --apply
  node scripts/migrate-song-audio.mjs --include-bundled --camporee-id <uuid> --created-by <uuid> --apply
  node scripts/migrate-song-audio.mjs --rollback .music-migration/manifest-....json
  node scripts/migrate-song-audio.mjs --rollback .music-migration/manifest-....json --apply
  node scripts/migrate-song-audio.mjs --cleanup               # preview orphans
  # Physical cleanup uses the authenticated native R2 cleanup API.
`;

function parseArgs(argv) {
  const opts = {
    help: false, apply: false, rollback: null, cleanup: false,
    includeBundled: false, camporeeId: null, createdBy: null,
    manifestDir: '.music-migration', graceHours: MIN_GRACE_HOURS,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { const value = argv[++i]; if (value == null) throw new Error(`${arg} requires a value`); return value; };
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--cleanup') opts.cleanup = true;
    else if (arg === '--include-bundled') opts.includeBundled = true;
    else if (arg === '--rollback') opts.rollback = next();
    else if (arg === '--camporee-id') opts.camporeeId = next();
    else if (arg === '--created-by') opts.createdBy = next();
    else if (arg === '--manifest-dir') opts.manifestDir = next();
    else if (arg === '--grace-hours') opts.graceHours = Number(next());
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

const logger = { info: message => console.log(message), warn: message => console.warn(message), error: message => console.error(message) };

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function loadEnv() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const bucket = requireEnv('MUSIC_R2_BUCKET');
  if (bucket !== OWNED_BUCKET) throw new Error(`MUSIC_R2_BUCKET must be ${OWNED_BUCKET}`);
  if (accountId !== AUTHORIZED_ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID is not the authorized account');
  return { url, serviceKey, accountId, bucket };
}

const DOC_COLUMNS = 'id,camporee_id,title,document_type,notes,file_path,external_url,created_at';

async function readAll(query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error('Database read failed: ' + error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function createSupabaseRepository(client) {
  return {
    async listSongFileDocuments({ camporeeId } = {}) {
      let query = client.from('camporee_documents').select(DOC_COLUMNS)
        .like('document_type', 'song:%').not('file_path', 'is', null).ilike('file_path', '%.mp3')
        .order('created_at', { ascending: true });
      if (camporeeId) query = query.eq('camporee_id', camporeeId);
      return readAll(query.order('id'));
    },
    async listSongDocuments({ camporeeId } = {}) {
      let query = client.from('camporee_documents').select(DOC_COLUMNS).like('document_type', 'song:%');
      if (camporeeId) query = query.eq('camporee_id', camporeeId);
      return readAll(query.order('id'));
    },
    async listReferencingDocuments({ camporeeIds = [] } = {}) {
      if (!camporeeIds.length) return [];
      return readAll(client.from('camporee_documents')
        .select('id,camporee_id,notes').in('camporee_id', camporeeIds).order('id'));
    },
    async getDocument(id, camporeeId) {
      const { data, error } = await client.from('camporee_documents').select(DOC_COLUMNS).eq('id', id).eq('camporee_id', camporeeId).like('document_type', 'song:%').maybeSingle();
      if (error) throw new Error(`get document: ${error.message}`);
      return data ?? null;
    },
    async updateDocumentNotes({ id, camporeeId, previousNotes, nextNotes, previousFilePath, previousExternalUrl }) {
      const { data, error } = await client.rpc('compare_and_update_song_document', {
        p_camporee_id: camporeeId, p_song_id: id,
        p_expected: { notes: previousNotes,
          ...(previousFilePath !== undefined ? { file_path: previousFilePath } : {}),
          ...(previousExternalUrl !== undefined ? { external_url: previousExternalUrl } : {}),
        }, p_changes: { notes: nextNotes },
      }).select('id,notes');
      if (error) throw new Error(`update document notes: ${error.message}`);
      return { applied: (data?.length ?? 0) === 1, currentNotes: data?.[0]?.notes ?? null };
    },
    async insertDocument(payload) {
      const { data, error } = await client.from('camporee_documents').insert(payload).select(DOC_COLUMNS).single();
      if (error) throw new Error(`insert document: ${error.message}`);
      return data;
    },
    async deleteDocument({ id, expectedNotes }) {
      let query = client.from('camporee_documents').delete().eq('id', id);
      query = expectedNotes === null ? query.is('notes', null) : query.eq('notes', expectedNotes);
      const { data, error } = await query.select('id');
      if (error) throw new Error(`delete document: ${error.message}`);
      return { applied: (data?.length ?? 0) === 1 };
    },
    async downloadFile(filePath) {
      if (typeof filePath !== 'string' || filePath.includes('..') || filePath.includes('\\')) {
        throw new Error('refusing unsafe storage path');
      }
      const { data, error } = await client.storage.from(LEGACY_BUCKET).download(filePath);
      if (error || !data) throw new Error(`storage download failed for ${filePath}`);
      if (typeof data.size === 'number' && data.size > 15 * 1024 * 1024) throw new Error('file exceeds 15 MB');
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('file exceeds 15 MB');
      return bytes;
    },
  };
}

function createWranglerR2({ accountId, bucket, tmpDir, nodeExec = process.execPath }) {
  const run = args => new Promise((resolve, reject) => {
    execFile(nodeExec, [wranglerBin, ...args], {
      // No shell. Credentials come from the inherited environment or Wrangler OAuth.
      env: process.env, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `wrangler ${args.slice(0, 3).join(' ')} failed: ${(stderr || stdout || error.message).toString().trim()}`;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
  const tempFile = () => path.join(tmpDir, `r2-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  const objectPath = key => `${bucket}/${key}`;
  return {
    accountId,
    async putObject(key, bytes) {
      await fsp.mkdir(tmpDir, { recursive: true });
      const file = tempFile();
      try {
        await fsp.writeFile(file, bytes);
        await run(['r2', 'object', 'put', objectPath(key), '--file', file, '--content-type', 'audio/mpeg', '--remote', '--force']);
      } finally {
        await fsp.rm(file, { force: true });
      }
    },
    async getObject(key) {
      await fsp.mkdir(tmpDir, { recursive: true });
      const file = tempFile();
      try {
        await run(['r2', 'object', 'get', objectPath(key), '--file', file, '--remote']);
        return new Uint8Array(await fsp.readFile(file));
      } catch (error) {
        if (/10007|NoSuchKey|specified key does not exist|object.*not found/i.test(error.message)) return null;
        throw error;
      } finally {
        await fsp.rm(file, { force: true });
      }
    },
    async deleteObject(key) {
      await run(['r2', 'object', 'delete', objectPath(key), '--remote', '--force']);
    },
  };
}

async function readFile(filePath) {
  return new Uint8Array(await fsp.readFile(filePath));
}

function resolveManifestPath(raw, manifestDir) {
  if (path.isAbsolute(raw)) return raw;
  if (raw.includes('/') || raw.includes('\\')) return path.resolve(raw);
  return path.join(manifestDir, raw);
}

function report(totals) {
  return Object.entries(totals).map(([key, value]) => `${key}=${value}`).join(' ');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); return; }

  const env = loadEnv();
  const client = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const repo = createSupabaseRepository(client);
  const manifests = createManifestStore(opts.manifestDir);
  const tmpDir = path.join(opts.manifestDir, '.tmp');
  const r2 = createWranglerR2({ accountId: env.accountId, bucket: env.bucket, tmpDir });

  if (opts.cleanup) {
    const result = await runCleanup({ repo, r2, manifests, logger, apply: opts.apply, graceHours: opts.graceHours });
    console.log(`cleanup ${result.apply ? 'APPLIED' : 'dry-run'} (grace >= ${result.graceHours}h): ${report(result.totals)}`);
    console.log('note: Wrangler has no `r2 object list`; only objects recorded in our manifests are considered.');
    console.log('Physical deletion requires the authenticated native R2 cleanup API and its actual object timestamps.');
    return;
  }

  if (opts.rollback) {
    const manifestPath = resolveManifestPath(opts.rollback, opts.manifestDir);
    const result = await runRollback({ repo, manifests, manifestPath, logger, apply: opts.apply });
    console.log(`rollback ${result.apply ? 'APPLIED' : 'dry-run'} ${manifestPath}: ${report(result.totals)}`);
    if (!result.apply) console.log('re-run with --apply to restore documents.');
    return;
  }

  if (opts.includeBundled) {
    if (!opts.camporeeId || !opts.createdBy) throw new Error('--include-bundled requires --camporee-id and --created-by');
    const result = await runBundledMigration({
      repo, r2, manifests, readFile, files: BUNDLED_SONGS, camporeeId: opts.camporeeId,
      createdBy: opts.createdBy, logger, accountId: env.accountId, bucket: env.bucket, dryRun: !opts.apply,
    });
    console.log(`bundled seeds ${result.dryRun ? 'dry-run' : 'APPLIED'}: ${report(result.totals)}${result.manifestPath ? ` manifest=${result.manifestPath}` : ''}`);
    if (result.dryRun && result.entries.length) {
      for (const entry of result.entries) console.log(`  planned: ${entry.title} -> ${entry.status}`);
    }
    if (result.totals.failed) process.exitCode = 1;
    return;
  }

  const result = await runMigration({
    repo, r2, manifests, logger, accountId: env.accountId, bucket: env.bucket,
    dryRun: !opts.apply, camporeeId: opts.camporeeId,
  });
  console.log(`migration ${result.dryRun ? 'dry-run' : 'APPLIED'}: ${report(result.totals)}${result.manifestPath ? ` manifest=${result.manifestPath}` : ''}`);
  if (result.dryRun) {
    for (const entry of result.entries) {
      console.log(`  ${entry.status}: ${entry.id} ${entry.legacyFilePath ?? ''}`);
    }
  }
  if (result.totals.failed || result.totals.concurrent) process.exitCode = 1;
}

main().catch(error => {
  console.error(`error: ${error?.message ?? error}`);
  process.exitCode = 1;
});
