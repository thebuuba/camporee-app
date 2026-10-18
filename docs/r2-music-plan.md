# Cloudflare R2 music implementation plan

**Goal:** Store new MP3 uploads in an exclusive private R2 bucket while preserving Supabase documents, permissions, playback and offline downloads.

**Architecture:** Native `MUSIC_BUCKET` R2 binding in the existing OpenNext Worker. Authenticated same-origin routes stream R2 bodies directly with Range support; no Supabase audio relay, public bucket or S3 credentials in the browser. The user confirmed R2 as the destination after an intermediate clarification about Google.

## Constraints

- Preserve the existing player/UI, 15 MiB limit and legacy Supabase/local/external sources. Existing non-MP3 files remain playable; new uploads require real MP3.
- Use `camporee_documents.notes` JSON for `audio` metadata alongside `lyrics/chords`. A SECURITY INVOKER RPC provides body-based compare-and-swap for long lyrics; no new columns, tables or RLS changes.
- Audio metadata: `{provider:'r2',key:string,size:number,contentType:'audio/mpeg',sha256:string}`. Parse only valid metadata. Keys use `camporee-app/<camporee UUID>/songs/<UUID>.mp3` (migration keys may use SHA-256 instead of random UUID). Reject other keys, buckets and traversal.
- Preserve legacy `file_path` and `external_url` during migration; R2 takes precedence. Download identity prefers original legacy source for migrated identical files; replacements clear legacy source and use the R2 key.
- `Song` gains optional `audio?: R2Audio` and `camporeeId?:string`. `songsFromDocuments` accepts optional `camporee_id` and metadata in notes. Do not add undefined fields to legacy song objects.

## Tasks

1. Finish audit and record baseline (239 tests on origin/main 150bdb6).
2. Build `lib/song-audio.ts`: shared metadata/key/MP3 validation and Range parsing with behavioral tests. `lib/r2-music.ts`: server-only native binding accessor and private HTTP streaming with 200/206/416, HEAD, ETag, If-Range and no whole-file buffering on playback.
3. Build `lib/song-api.ts` and `app/api/music/[camporeeId]/route.ts` POST for save and `app/api/music/[camporeeId]/[songId]/route.ts` GET/HEAD for audio and DELETE for stored song. POST FormData contains `organization_id`, optional `id`, and existing fields. GET/HEAD/DELETE use `organization_id` query parameter. Authenticate Supabase session with `resolveCamporeeContext`; writes require `canEdit('settings')`. Verify CSRF Origin on writes, scope all DB queries to camporee and song document type. Re-read DB-owned metadata, never trust client object keys. Validate upload before put; remove newly uploaded unowned object if DB save fails; never remove legacy originals. Allow metadata-only edits without configured R2. Log/retain failed cleanup for CLI reconciliation; avoid blind retry/duplicate writes.
4. Adapt current songs manager to API (XMLHttpRequest upload progress) and minimal delete control with confirmation. Existing text edits go through server. Adapt only source resolution/player identity needed for R2 URLs. Preserve offline scope, transport and Media Session. Update affected old tests and add authorization, upload validation/compensation, Range, replacement and player tests.
5. Prepare idempotent migration/rollback and orphan cleanup scripts: dry-run default, manifest before DB changes, compare original notes before update, hash verification, no legacy deletion. Initially migrate Supabase `file_path` MP3 plus bundled MP3 using explicit mapping; skip arbitrary external URLs. Scripts use server-only environment and exclusive bucket/prefix, and document required credentials without values. Tests use fixtures/mock storage, including failures and rollback conflicts.
6. Configure binding/template once bucket known, local dev and env example; document architecture, configuration, migration, costs and physical-device checklist. Execute npm test/check/build and OpenNext compile. No cloud data changes or deleting originals without required authorization.
7. Independent review, focused commits and PR against main; no merge.

## Review focus

Tenant mismatch/archived/read-only requests cannot write or sign/read another club's audio; multipart oversized uploads are bounded; ID3 tags without MPEG frames are rejected; malformed/suffix/open-ended/multi-range and If-Range behave safely; rollback preserves concurrent edits and original files. Actual iOS/Android and production bucket checks require devices/cloud access and must not be claimed from unit tests.
