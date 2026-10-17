// Core, dependency-injected logic for the R2 music migration.
//
// This module is intentionally free of Supabase, Wrangler and filesystem
// coupling so it can be exercised with fakes in tests. The CLI wrapper
// (scripts/migrate-song-audio.mjs) wires the real adapters.
//
// It mirrors the contract exported by the backend worker's lib/song-audio.ts:
//   parseR2Audio(value): R2Audio|null
//   musicObjectKey(camporeeId, id?)
//   assertMusicKey(key, camporeeId)
//   validateMp3(bytes): {bytes, sha256, contentType:'audio/mpeg', size}
//
// Only MP3 bytes are handled. Nothing here ever fetches a document's
// external_url, so there is no SSRF surface.

import { createHash, randomUUID } from 'node:crypto';
import { isMp3Bytes } from '../lib/song-audio.ts';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

export const PROVIDER = 'r2';
export const CONTENT_TYPE = 'audio/mpeg';
export const KEY_PREFIX = 'camporee-app';
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const MIN_GRACE_HOURS = 48;
export const OWNED_BUCKET = 'camporee-app-music';
export const AUTHORIZED_ACCOUNT_ID = 'fbfe781a453c090425c8bfe52d9e96a6';
export const LEGACY_BUCKET = 'camporee-files';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/;
const OBJECT_ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64})$/i;
const KEY_RE = /^camporee-app\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/songs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64})\.mp3$/i;

export const silentLogger = { info() {}, warn() {}, error() {} };

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

// Same normalization used by lib/songs.ts to dedupe bundled starter songs.
export function normalizeTitle(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function musicObjectKey(camporeeId, id) {
  if (!isUuid(camporeeId)) throw new Error('camporeeId must be a UUID');
  const objectId = id == null ? randomUUID() : String(id);
  if (!OBJECT_ID_RE.test(objectId)) throw new Error('object id must be a UUID or SHA-256 hex digest');
  return `${KEY_PREFIX}/${camporeeId}/songs/${objectId}.mp3`;
}

export function assertMusicKey(key, camporeeId) {
  if (!isUuid(camporeeId)) throw new Error('camporeeId must be a UUID');
  if (typeof key !== 'string' || key.includes('..') || key.includes('\\')) throw new Error('invalid music key');
  const match = KEY_RE.exec(key);
  if (!match) throw new Error('music key must be camporee-app/<camporeeId>/songs/<id>.mp3');
  if (match[1].toLowerCase() !== camporeeId.toLowerCase()) throw new Error('music key camporee does not match');
  return { camporeeId: match[1], id: match[2] };
}

// Accepts a raw notes string or an already parsed object (optionally the whole
// notes object, from which the `audio` field is read).
export function parseR2Audio(value) {
  let source = value;
  if (typeof value === 'string') {
    try { source = JSON.parse(value); } catch { return null; }
  }
  if (!source || typeof source !== 'object') return null;
  const audio = source.audio && typeof source.audio === 'object' ? source.audio : source;
  if (audio.provider !== PROVIDER) return null;
  if (typeof audio.key !== 'string' || audio.key.includes('..') || audio.key.includes('\\')) return null;
  if (!KEY_RE.test(audio.key)) return null;
  if (!Number.isInteger(audio.size) || audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) return null;
  if (audio.contentType !== CONTENT_TYPE) return null;
  if (typeof audio.sha256 !== 'string' || !SHA_RE.test(audio.sha256)) return null;
  return { provider: PROVIDER, key: audio.key, size: audio.size, contentType: CONTENT_TYPE, sha256: audio.sha256 };
}

export function buildAudioMetadata({ key, bytes, sha256 }) {
  return { provider: PROVIDER, key, size: bytes.byteLength, contentType: CONTENT_TYPE, sha256 };
}

// Preserve lyrics/chords (and any other existing fields) and set `audio`.
// Legacy plain-text notes become {lyrics: text, audio}.
export function mergeAudioIntoNotes(notes, audio) {
  let base = {};
  if (notes != null && notes !== '') {
    try {
      const parsed = JSON.parse(notes);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = { ...parsed };
      else base = { lyrics: String(notes) };
    } catch {
      base = { lyrics: String(notes) };
    }
  }
  base.audio = audio;
  return JSON.stringify(base);
}

// A real MPEG audio frame (not just an ID3 tag) must be present.
export function validateMp3(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!data.byteLength) throw new Error('MP3 file is empty');
  if (data.byteLength > MAX_AUDIO_BYTES) throw new Error('MP3 file exceeds 15 MB');
  if (!isMp3Bytes(data)) throw new Error('File is not a real MP3 (no MPEG audio frame)');
  return { bytes: data, sha256: sha256Hex(data), contentType: CONTENT_TYPE, size: data.byteLength };
}

// ---------- manifest store ----------

export function manifestFileName(date, random = randomUUID) {
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return `manifest-${stamp}-${random().slice(0, 8)}.json`;
}

export function createManifestStore(dir, { fs = fsp } = {}) {
  return {
    dir,
    async write(fileName, manifest) {
      await fs.mkdir(dir, { recursive: true });
      const target = path.join(dir, fileName);
      const tmp = `${target}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(manifest, null, 2));
      await fs.rename(tmp, target);
      return target;
    },
    async read(fileName) {
      return JSON.parse(await fs.readFile(path.join(dir, fileName), 'utf8'));
    },
    async readPath(fullPath) {
      return JSON.parse(await fs.readFile(fullPath, 'utf8'));
    },
    async writePath(fullPath, manifest) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const tmp = `${fullPath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(manifest, null, 2));
      await fs.rename(tmp, fullPath);
      return fullPath;
    },
    async list() {
      let names;
      try { names = await fs.readdir(dir); } catch { return []; }
      return names.filter(name => /^manifest-.*\.json$/.test(name)).sort();
    },
  };
}

// ---------- shared helpers ----------

export function legacyPathIsMigratable(doc) {
  const filePath = doc?.file_path;
  if (typeof filePath !== 'string' || !filePath) return false;
  if (!/\.mp3$/i.test(filePath)) return false;
  if (filePath.includes('..') || filePath.includes('\\')) return false;
  return filePath.startsWith(`${doc.camporee_id}/songs/`);
}

function referenceKeys(rows) {
  const keys = new Set();
  for (const row of rows ?? []) {
    try {
      const key = JSON.parse(row?.notes ?? '{}')?.audio?.key;
      if (typeof key === 'string') keys.add(key);
    } catch { /* Raw references below also protect malformed metadata. */ }
    for (const match of String(row?.notes ?? '').matchAll(/camporee-app\/[0-9a-f-]+\/songs\/[0-9a-f-]+\.mp3/gi)) keys.add(match[0]);
  }
  return keys;
}

// Upload if needed, then re-read and confirm the bytes hash. Idempotent.
async function ensureRemoteObject(r2, key, bytes, sha256) {
  const existing = await r2.getObject(key);
  if (existing && sha256Hex(existing) === sha256) return 'existing';
  await r2.putObject(key, bytes);
  const verified = await r2.getObject(key);
  if (!verified) throw new Error(`R2 verification failed: object ${key} is missing after upload`);
  if (sha256Hex(verified) !== sha256) throw new Error(`R2 verification failed: hash mismatch for ${key}`);
  return 'uploaded';
}

// ---------- migration ----------

export async function runMigration({
  repo, r2, manifests, logger = silentLogger, now = () => new Date(),
  accountId, bucket, dryRun = true, camporeeId = null,
}) {
  const startedAt = now();
  const fileName = manifestFileName(startedAt);
  const manifest = {
    version: 1, mode: 'migrate', accountId, bucket,
    createdAt: startedAt.toISOString(), dryRun, entries: [],
  };
  const persist = async () => { if (!dryRun) await manifests.write(fileName, manifest); };

  const documents = await repo.listSongFileDocuments({ camporeeId });
  const uploaded = new Map();
  const totals = { planned: 0, applied: 0, skippedExisting: 0, concurrent: 0, failed: 0, notMigratable: 0 };

  for (const doc of documents) {
    if (!legacyPathIsMigratable(doc)) {
      totals.notMigratable++;
      manifest.entries.push({
        id: doc.id, camporeeId: doc.camporee_id, title: doc.title ?? null,
        source: 'supabase', legacyFilePath: doc.file_path ?? null, status: 'not-migratable',
      });
      continue;
    }
    const entry = {
      id: doc.id, camporeeId: doc.camporee_id, title: doc.title ?? null,
      source: 'supabase', legacyFilePath: doc.file_path,
      legacyExternalUrl: doc.external_url ?? null,
      originalNotes: doc.notes ?? null, key: null, sha256: null, size: null,
      contentType: CONTENT_TYPE, writtenNotes: null, status: 'planned',
      fromBundled: false, protected: false, createdAt: startedAt.toISOString(),
    };
    manifest.entries.push(entry);

    if (dryRun) {
      totals.planned++;
      entry.status = 'planned';
      continue;
    }

    try {
      await persist(); // durable record before any download/upload

      const currentAudio = parseR2Audio(doc.notes);
      if (currentAudio) {
        const object = await r2.getObject(currentAudio.key);
        if (object && sha256Hex(object) === currentAudio.sha256) {
          entry.status = 'already-verified';
          entry.key = currentAudio.key;
          entry.sha256 = currentAudio.sha256;
          entry.size = currentAudio.size;
          totals.skippedExisting++;
          await persist();
          continue;
        }
        entry.status = 'failed';
        entry.error = 'existing R2 metadata does not verify; manual reconciliation required';
        totals.failed++;
        await persist();
        continue;
      }

      const bytes = await repo.downloadFile(doc.file_path);
      const validated = validateMp3(bytes);
      const key = musicObjectKey(doc.camporee_id, validated.sha256);
      assertMusicKey(key, doc.camporee_id);
      entry.key = key;
      entry.sha256 = validated.sha256;
      entry.size = validated.size;

      const dedupeKey = `${doc.camporee_id}:${validated.sha256}`;
      if (uploaded.has(dedupeKey)) {
        entry.status = 'uploaded';
      } else {
        await ensureRemoteObject(r2, key, validated.bytes, validated.sha256);
        uploaded.set(dedupeKey, key);
        entry.status = 'uploaded';
      }

      const metadata = buildAudioMetadata({ key, bytes: validated.bytes, sha256: validated.sha256 });
      entry.writtenNotes = mergeAudioIntoNotes(doc.notes, metadata);
      entry.status = 'verified';
      await persist(); // CRITICAL: manifest is durable before the DB change

      const update = await repo.updateDocumentNotes({
        id: doc.id, camporeeId: doc.camporee_id,
        previousNotes: doc.notes ?? null, nextNotes: entry.writtenNotes,
        previousFilePath: doc.file_path ?? null, previousExternalUrl: doc.external_url ?? null,
      });
      if (update.applied) {
        entry.status = 'applied';
        entry.appliedAt = now().toISOString();
        totals.applied++;
      } else {
        entry.status = 'skipped-concurrent';
        entry.error = 'notes changed concurrently; original document left untouched';
        totals.concurrent++;
        logger.warn(`[migrate] concurrent edit detected for ${doc.id}; skipped`);
      }
      await persist();
    } catch (error) {
      entry.status = 'failed';
      entry.error = error?.message ?? String(error);
      totals.failed++;
      await persist();
      logger.error(`[migrate] failed ${doc.id}: ${entry.error}`);
    }
  }

  return { mode: 'migrate', dryRun, manifestPath: dryRun ? null : path.join(manifests.dir, fileName), manifest, totals, entries: manifest.entries };
}

// ---------- bundled starter songs ----------

export async function runBundledMigration({
  repo, r2, manifests, readFile, files, camporeeId, createdBy,
  logger = silentLogger, now = () => new Date(), accountId, bucket, dryRun = true,
}) {
  if (!isUuid(camporeeId)) throw new Error('--camporee-id must be a UUID');
  if (!isUuid(createdBy)) throw new Error('--created-by must be a UUID');
  const startedAt = now();
  const fileName = manifestFileName(startedAt);
  const manifest = {
    version: 1, mode: 'bundled', accountId, bucket,
    createdAt: startedAt.toISOString(), dryRun, entries: [],
  };
  const persist = async () => { if (!dryRun) await manifests.write(fileName, manifest); };

  const existing = await repo.listSongDocuments({ camporeeId });
  const existingTitles = new Set(existing.map(row => normalizeTitle(row.title)));
  const totals = { planned: 0, applied: 0, duplicate: 0, failed: 0 };

  for (const file of files) {
    const entry = {
      id: randomUUID(), camporeeId, title: file.title, source: 'bundled',
      legacyFilePath: null, legacyExternalUrl: null, originalNotes: null,
      key: null, sha256: null, size: null, contentType: CONTENT_TYPE,
      writtenNotes: null, status: 'planned', fromBundled: true, protected: false,
      createdAt: startedAt.toISOString(),
    };
    manifest.entries.push(entry);

    if (existingTitles.has(normalizeTitle(file.title))) {
      entry.status = 'duplicate';
      totals.duplicate++;
      logger.info(`[bundled] skipping "${file.title}" (already present)`);
      continue;
    }
    if (dryRun) {
      entry.status = 'planned';
      totals.planned++;
      continue;
    }

    try {
      await persist();
      const bytes = await readFile(file.path);
      const validated = validateMp3(bytes);
      const key = musicObjectKey(camporeeId, validated.sha256);
      assertMusicKey(key, camporeeId);
      await ensureRemoteObject(r2, key, validated.bytes, validated.sha256);
      const metadata = buildAudioMetadata({ key, bytes: validated.bytes, sha256: validated.sha256 });
      entry.key = key;
      entry.sha256 = validated.sha256;
      entry.size = validated.size;
      entry.writtenNotes = mergeAudioIntoNotes(null, metadata);
      entry.status = 'verified';
      await persist();

      const inserted = await repo.insertDocument({
        id: entry.id,
        camporee_id: camporeeId,
        title: file.title,
        document_type: `song:${file.category}`,
        notes: entry.writtenNotes,
        file_path: null,
        external_url: file.path.replace(/^public/, ''),
        created_by: createdBy,
      });
      entry.id = inserted?.id ?? entry.id;
      entry.status = 'applied';
      entry.appliedAt = now().toISOString();
      totals.applied++;
      await persist();
    } catch (error) {
      entry.status = 'failed';
      entry.error = error?.message ?? String(error);
      totals.failed++;
      await persist();
      logger.error(`[bundled] failed "${file.title}": ${entry.error}`);
    }
  }

  return { mode: 'bundled', dryRun, manifestPath: dryRun ? null : path.join(manifests.dir, fileName), manifest, totals, entries: manifest.entries };
}

// ---------- rollback ----------

export async function runRollback({
  repo, manifests, manifestPath, logger = silentLogger, now = () => new Date(), apply = false,
}) {
  const manifest = await manifests.readPath(manifestPath);
  if (manifest.accountId !== AUTHORIZED_ACCOUNT_ID || manifest.bucket !== OWNED_BUCKET) throw new Error('Foreign migration manifest');
  const totals = { rolledBack: 0, deleted: 0, conflicts: 0, missing: 0, wouldChange: 0 };
  let mutated = false;

  for (const entry of manifest.entries ?? []) {
    if (!['applied', 'verified', 'failed'].includes(entry.status) || !entry.id || !entry.writtenNotes || entry.rollbackStatus === 'rolled-back') continue;
    assertMusicKey(entry.key, entry.camporeeId);
    const doc = await repo.getDocument(entry.id, entry.camporeeId);
    if (!doc) {
      entry.rollbackStatus = 'missing';
      totals.missing++;
      mutated = true;
      continue;
    }
    if ((doc.notes ?? null) !== (entry.writtenNotes ?? null)) {
      entry.rollbackStatus = 'conflict';
      totals.conflicts++;
      logger.warn(`[rollback] document ${entry.id} changed since migration; left untouched`);
      continue;
    }
    if (!apply) {
      entry.rollbackStatus = entry.fromBundled ? 'would-delete' : 'would-rollback';
      totals.wouldChange++;
      continue;
    }
    const restored = await repo.updateDocumentNotes({
      id: entry.id, camporeeId: entry.camporeeId,
      previousNotes: entry.writtenNotes, nextNotes: entry.originalNotes ?? null,
      previousFilePath: doc.file_path ?? null, previousExternalUrl: doc.external_url ?? null,
    });
    entry.rollbackStatus = restored.applied ? 'rolled-back' : 'conflict';
    if (restored.applied) { totals.rolledBack++; } else { totals.conflicts++; }
    entry.protected = true; // never let cleanup delete these objects
    mutated = true;
  }

  if (apply && mutated) await manifests.writePath(manifestPath, manifest);
  return { mode: 'rollback', apply, manifest, totals, entries: manifest.entries ?? [] };
}

// ---------- orphan cleanup ----------

export async function runCleanup({
  repo, r2, manifests, logger = silentLogger, now = () => new Date(),
  apply = false, graceHours = MIN_GRACE_HOURS,
}) {
  const grace = Math.max(MIN_GRACE_HOURS, Number(graceHours) || MIN_GRACE_HOURS) * 3600 * 1000;
  const list = await manifests.list();
  const entries = [];
  for (const name of list) {
    let manifest;
    manifest = await manifests.read(name);
    if (manifest.accountId !== AUTHORIZED_ACCOUNT_ID || manifest.bucket !== OWNED_BUCKET) throw new Error('Foreign migration manifest');
    for (const entry of manifest.entries ?? []) {
      if (entry?.key) entries.push({ manifest: name, entry });
    }
  }

  const protectedKeys = new Set(entries.filter(({ entry }) => entry.protected).map(({ entry }) => entry.key));
  const camporees = [...new Set(entries.map(({ entry }) => entry.camporeeId).filter(Boolean))];
  const referenced = referenceKeys(camporees.length ? await repo.listReferencingDocuments({ camporeeIds: camporees }) : []);
  const nowMs = now().getTime();
  const totals = { deleted: 0, wouldDelete: 0, grace: 0, referenced: 0, protected: 0, foreignPrefix: 0, missingKey: 0 };
  const done = new Set();

  for (const { entry } of entries) {
    const key = entry.key;
    if (typeof key !== 'string' || !key) { totals.missingKey++; continue; }
    if (done.has(key)) continue;
    done.add(key);

    let owned = false;
    try { assertMusicKey(key, entry.camporeeId); owned = true; } catch { owned = false; }
    if (!owned || !key.startsWith(`${KEY_PREFIX}/${entry.camporeeId}/songs/`)) {
      totals.foreignPrefix++;
      logger.warn(`[cleanup] refusing non-owned key ${key}`);
      continue;
    }
    if (protectedKeys.has(key)) { totals.protected++; continue; }
    if (referenced.has(key)) { totals.referenced++; continue; }
    const age = nowMs - new Date(entry.createdAt ?? 0).getTime();
    if (!(age >= grace)) { totals.grace++; continue; }

    if (apply) {
      // Only the native cleanup API can verify the actual R2 upload timestamp.
      // A manifest timestamp is insufficient after an object is re-uploaded.
      throw new Error('Use the authenticated cleanup API: it verifies the actual R2 upload timestamp. CLI cleanup is inventory only.');
    } else {
      totals.wouldDelete++;
    }
  }

  return { mode: 'cleanup', apply, graceHours: grace / 3600000, totals };
}

// ---------- CLI bundle definitions ----------

export const BUNDLED_SONGS = [
  { path: 'public/audio/maranata.mp3', title: 'Maranata', category: 'club' },
  { path: 'public/audio/contracorriente.mp3', title: 'Contracorriente', category: 'club' },
];
