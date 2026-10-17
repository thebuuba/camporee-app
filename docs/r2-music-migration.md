# R2 music migration (CLI)

This document describes the **scripts and tests** that move song MP3s out of the
private Supabase Storage bucket `camporee-files` into the exclusive private
Cloudflare R2 bucket `camporee-app-music`. It is the migration companion to
[`docs/r2-music-plan.md`](./r2-music-plan.md) and
[`docs/r2-music-audit.md`](./r2-music-audit.md).

No product code, UI, API route, `wrangler.jsonc` binding or Supabase schema is
changed here. Supabase stays the database: songs remain rows of
`public.camporee_documents` (`document_type = 'song:<category>'`), with
`notes` holding the JSON `{lyrics, chords, audio}`.

## Files

| File | Role |
|---|---|
| `scripts/migrate-song-audio.mjs` | CLI. Parses args, validates environment, wires the Supabase SDK + Wrangler adapters. |
| `scripts/song-audio-migration.mjs` | Dependency-injected core (planning, migration, rollback, cleanup). No Supabase/Wrangler/network coupling, so it is fully testable. |
| `tests/song-audio-migration.test.mjs` | Behavioral tests using fake storage/DB and a real temporary manifest directory. |

## Metadata contract (mirrors the backend worker `lib/song-audio.ts`)

The core re-implements the same pure helpers exported by the backend worker's
`lib/song-audio.ts`, so CLI writes interoperate with API writes:

- `parseR2Audio(value): R2Audio | null` — reads `notes.audio` (or a raw parsed
  object) and accepts only `{provider:'r2',key,size,contentType:'audio/mpeg',sha256}`.
- `musicObjectKey(camporeeId, id?)` — `camporee-app/<camporee UUID>/songs/<id>.mp3`.
  The `id` is a UUID (new API uploads) or a SHA-256 hex digest (migration dedup);
  when omitted a random UUID is generated.
- `assertMusicKey(key, camporeeId)` — rejects other buckets, camporees and
  traversal keys.
- `validateMp3(bytes)` — uses the shared `isMp3Bytes` validator and requires two
  complete consecutive MPEG Layer III frames (ID3-only files are rejected).
  Returns `{bytes, sha256, contentType:'audio/mpeg', size}`.

`notes.audio` written by the migration is:

```json
{
  "provider": "r2",
  "key": "camporee-app/<camporeeId>/songs/<sha256>.mp3",
  "size": 9336117,
  "contentType": "audio/mpeg",
  "sha256": "<sha256 of the exact bytes>"
}
```

`lyrics` and `chords` are preserved, as are the document `id`, `file_path` and
`external_url`. Migration objects are deduplicated per camporee: two documents
with identical bytes share one key `<sha256>.mp3`.

## Prerequisites and environment

Apply migration `20261017234228_compare_and_update_song_document.sql` before migration/rollback. It adds an invoker RPC for body-based compare-and-swap, preserving the table RLS and avoiding oversized URLs for long lyrics.

Credentials are read only by the CLI and are **never printed**, never written to
manifests and never exposed to the browser. `.env*` files are git-ignored.

| Variable | Notes |
|---|---|
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Current project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | CLI only. Bypasses RLS for migration reads/writes. |
| `CLOUDFLARE_ACCOUNT_ID` | Must equal `fbfe781a453c090425c8bfe52d9e96a6`. |
| `MUSIC_R2_BUCKET` | Must equal `camporee-app-music`. Any other value aborts. |
| `CLOUDFLARE_API_TOKEN` | Optional; otherwise use a Wrangler OAuth login. |

Object I/O shells out to the installed Wrangler CLI:

```
execFile(process.execPath, [node_modules/wrangler/bin/wrangler.js,
  'r2','object','get|put|delete', `${bucket}/${key}`, ..., '--remote'])
```

It uses no shell, no new dependencies and no custom S3 signer. `--help` works
without any environment variable.

## Commands

Dry-run is the default for every command; nothing uploads, updates the database
unless `--apply` is present. CLI cleanup is always inventory-only and rejects `--apply`.

```bash
# Inventory only (no downloads/uploads) — safe by default.
node scripts/migrate-song-audio.mjs
node scripts/migrate-song-audio.mjs --camporee-id <uuid>

# Migrate legacy file_path MP3s (download → validate → upload → verify → DB).
node scripts/migrate-song-audio.mjs --camporee-id <uuid> --apply

# Seed the two bundled local MP3s as song documents.
node scripts/migrate-song-audio.mjs --include-bundled \
  --camporee-id <uuid> --created-by <uuid> [--apply]

# Restore documents exactly as they were before a manifest's migration.
node scripts/migrate-song-audio.mjs --rollback <manifest> [--apply]

# Inventory possible orphan objects recorded by our own manifests.
node scripts/migrate-song-audio.mjs --cleanup [--grace-hours 48]
```

Other flags: `--manifest-dir <dir>` (default `.music-migration`, git-ignored),
`--grace-hours <n>` (minimum 48), `--dry-run`.

## Migration rules

A document is migrated only when **all** hold:

- `document_type` starts with `song:`.
- `file_path` ends in `.mp3` and starts with `<camporee_id>/songs/`.

The bytes are downloaded **only** from the Supabase Storage bucket
`camporee-files` through the SDK and kept in memory (max 15 MB). A document's
`external_url` is never fetched, so arbitrary/SSRF URLs cannot be reached.

Per candidate, `--apply`:

1. If verified R2 metadata already exists and the object matches its `sha256`,
   the document is skipped (`already-verified`) — re-runs never re-upload.
2. Otherwise it downloads, validates a real MP3 and computes `sha256`.
3. It ensures the deterministic object exists (upload if needed) and then
   **re-reads the destination and verifies the full `sha256`**.
4. It writes the durable manifest entry **before** touching the database.
5. It updates only `notes`, guarded by an exact `notes` match against the value
   read at the start. If a concurrent edit changed `notes`, the update matches
   zero rows and the document is left untouched (`skipped-concurrent`).

Failures leave the original document and `file_path`/`external_url` intact and
leave a recoverable manifest entry (status `failed`) so the object can be
reconciled or cleaned up later.

## Manifests

One `manifest-<timestamp>-<random>.json` per run in the manifest directory
(durable write via temp file + rename). It records, per entry: source id,
`camporeeId`, legacy `file_path`/`external_url`, the exact `originalNotes`, the
target `key`, `sha256`, `size`, the exact `writtenNotes`, and a `status`
(`planned`, `uploaded`, `verified`, `applied`, `already-verified`,
`skipped-concurrent`, `failed`, `rolled-back`, `protected`). Secrets are never
stored.

## Rollback

`--rollback <manifest>` restores only documents that still match the exact
`writtenNotes` the migration stored:

- Migrated documents: `notes` is set back to `originalNotes` (removing only the
  R2 metadata, preserving everything else).
- Bundled documents: the seeded document ID is preserved and its metadata is
  restored so the original local URL remains playable.
- If the document changed since migration, rollback reports a `conflict` and
  touches nothing.
- Rollback **never deletes the R2 object and never deletes legacy sources**.
  Entries it processes are marked `protected` so cleanup will not remove their
  objects.

## Orphan cleanup

Wrangler has **no `r2 object list` command** (verified against
`wrangler r2 object --help`). Cleanup therefore trusts only manifests written by
this migrator:

- It considers only keys under our own prefix
  `camporee-app/<camporeeId>/songs/` and re-validates them with `assertMusicKey`.
- It skips keys still referenced by any `camporee_documents` row's
  `notes.audio`, keys belonging to rollback-protected entries, and objects newer
  than the grace period (minimum 48 h).
- It reports exact object keys from manifests; it never deletes objects.

CLI cleanup inventories candidates only. Physical deletion uses the authenticated native R2 cleanup endpoint, which can verify actual upload timestamps. A manifest age alone cannot safely establish a 48-hour grace period after a later re-upload.

### API-created orphans

New API uploads or replacements are **not** covered by CLI manifests. Use the
authenticated administration endpoint described in `r2-music-delivery.md` for
these objects. It lists only the current camporee prefix through the native R2
binding, defaults to dry-run, applies a 48-hour grace period and rechecks database
references before deletion. Never run cleanup concurrently with migration or
other administration of the same camporee.

## Bundled local MP3s

The two starter MP3s in `public/audio/` remain packaged assets and are **never
deleted**. `--include-bundled --camporee-id <uuid> --created-by <uuid>` uploads
them to R2 with the same deterministic keys and creates `song:club` documents
titled `Maranata` and `Contracorriente` (category and titles taken from
`lib/songs.ts`). A document whose normalized title already exists is skipped, so
the command is idempotent. If this does not fit the desired tenant model, the
same two songs can be loaded manually through the UI; the inventory/dry-run
support above remains available either way.

Bundled documents keep `file_path: null` and the original `/audio/<name>.mp3`
in `external_url`. The original download identity remains usable. Rollback
removes the R2 metadata while preserving the document ID and the local fallback;
it does not delete the document or MP3.

## What was not done

The migration has not been executed against remote data. Bucket provisioning
and overall branch verification are recorded in `r2-music-delivery.md`.
Script verification includes `node --test tests/song-audio-migration.test.mjs`,
which covers dry-run, idempotency, upload failure, verification mismatch,
concurrency conflicts, rollback conflict/restore, cleanup prefix/references/
grace/protection, bundled seeding and SSRF isolation.
