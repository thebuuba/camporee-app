import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { resolveCamporeeContext, TenantAccessError, isTenantId } from '@/lib/tenant-context';
import { songPayload } from '@/lib/songs';
import { assertMusicKey, musicObjectKey, parseR2Audio, validateMp3 } from '@/lib/song-audio';
import { getMusicBucket, streamMusic } from '@/lib/r2-music';

const COLUMNS = 'id,camporee_id,title,document_type,notes,external_url,file_path';
const MAX_REQUEST = 16 * 1024 * 1024;
class MusicError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new MusicError('Origen no permitido.', 403);
}
function failure(error: unknown) {
  if (error instanceof MusicError) return Response.json({ error: error.message, message: error.message }, { status: error.status });
  if (error instanceof TenantAccessError) return Response.json({ error: 'Acceso no permitido.' }, { status: error.reason === 'authentication' ? 401 : 403 });
  console.error('Song operation failed', { code: (error as { code?: string })?.code ?? 'unavailable' });
  return Response.json({ error: 'No se pudo completar la operación. Comprueba la conexión y el almacenamiento.' }, { status: 503 });
}
async function fieldsWithinLimit(request: Request) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_REQUEST)) throw new MusicError('El audio debe pesar como máximo 15 MB.', 413);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new MusicError('Formato de formulario no válido.', 400);
  const reader = request.body?.getReader();
  if (!reader) throw new MusicError('Formulario vacío.', 400);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_REQUEST) { await reader.cancel(); throw new MusicError('El audio debe pesar como máximo 15 MB.', 413); }
      parts.push(new Uint8Array(chunk.value));
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(new Blob(parts), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData(); }
  catch { throw new MusicError('No se pudo leer el formulario.', 400); }
}
async function scope(request: Request, camporeeId: string, organizationId: string, write = false) {
  const context = await resolveCamporeeContext(await createClient(), { organizationId, camporeeId });
  if (write && !context.canEdit('settings')) throw new MusicError('No tienes permiso para modificar canciones.', 403);
  return context;
}
async function documentFor(context: Awaited<ReturnType<typeof scope>>, songId: string) {
  if (!isTenantId(songId)) throw new MusicError('Canción no válida.', 400);
  const { data, error } = await context.supabase.from('camporee_documents').select(COLUMNS).eq('camporee_id', context.camporeeId).eq('id', songId).like('document_type', 'song:%').maybeSingle();
  if (error) throw error;
  if (!data) throw new MusicError('Canción no encontrada.', 404);
  return data;
}
function audioInNotes(notes: string | null) {
  try { return parseR2Audio(JSON.parse(notes ?? '{}')?.audio); } catch { return null; }
}

export async function saveSong(request: Request, camporeeId: string) {
  let uploaded: { bucket: Awaited<ReturnType<typeof getMusicBucket>>; key: string } | null = null;
  let owner: Awaited<ReturnType<typeof scope>> | null = null;
  let committed = false;
  try {
    sameOrigin(request);
    // Resolve the user's session before accepting/buffering a large request.
    // Tenant ids are in the multipart form; Supabase getUser still rejects anonymous uploads first.
    const authClient = await createClient();
    const { data: auth, error: authError } = await authClient.auth.getUser();
    if (authError && (authError.status ?? 0) >= 500) throw authError;
    if (authError || !auth.user) throw new MusicError('Inicia sesión para modificar canciones.', 401);
    const fields = await fieldsWithinLimit(request);
    const organizationId = String(fields.get('organization_id') ?? '');
    const context = await scope(request, camporeeId, organizationId, true);
    owner = context;
    const id = String(fields.get('id') ?? '');
    const previous = id ? await documentFor(context, id) : null;
    const fileValue = fields.get('audio_file');
    const file = fileValue && typeof fileValue !== 'string' && (fileValue.name || fileValue.size) ? fileValue : null;
    if (file) fields.set('audio_url', '');
    let payload: ReturnType<typeof songPayload>;
    try { payload = songPayload(fields); } catch (error) { throw new MusicError((error as Error).message, 400); }
    if (payload.title.length > 200 || payload.notes.length > 500_000) throw new MusicError('El texto de la canción es demasiado largo.', 400);
    let audio = previous ? audioInNotes(previous.notes) : null;
    if (audio) assertMusicKey(audio.key, camporeeId);
    let filePath = previous?.file_path ?? null;
    if (file) {
      let validated: Awaited<ReturnType<typeof validateMp3>>;
      try { validated = await validateMp3(file); } catch (error) { throw new MusicError((error as Error).message, file.size > 15 * 1024 * 1024 ? 413 : 400); }
      const bucket = await getMusicBucket();
      const key = musicObjectKey(camporeeId);
      const stored = await bucket.put(key, validated.bytes, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: { camporeeId, sha256: validated.sha256 } });
      if (!stored) throw new MusicError('No se pudo subir el audio.', 503);
      uploaded = { bucket, key };
      audio = { provider: 'r2', key, size: validated.size, contentType: 'audio/mpeg', sha256: validated.sha256 };
      filePath = null;
      payload.external_url = null;
    } else if ((payload.external_url ?? '') !== (previous?.external_url ?? '')) {
      audio = null;
      filePath = null;
    }
    const notes = JSON.parse(payload.notes);
    if (audio) notes.audio = audio;
    const document = { ...payload, notes: JSON.stringify(notes), file_path: filePath };
    const query = previous
      ? context.supabase.rpc('compare_and_update_song_document', {
        p_camporee_id: camporeeId, p_song_id: previous.id,
        p_expected: { notes: previous.notes, file_path: previous.file_path, external_url: previous.external_url }, p_changes: document,
      })
      : context.supabase.from('camporee_documents').insert({ ...document, camporee_id: camporeeId, created_by: context.userId });
    const { data, error } = await query.select(COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) throw new MusicError('La canción cambió mientras la editabas. Recarga antes de guardar.', 409);
    committed = true;
    // Older R2 objects are retained for the orphan cleanup grace period; legacy originals are never deleted here.
    return Response.json({ document: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (uploaded && !committed) {
      try {
        // A failed HTTP response can follow a successful DB commit. Never remove
        // the audio until the database confirms it has no owner.
        if (!owner) throw new Error('Cannot confirm upload ownership');
        const references = await owner.supabase.from('camporee_documents').select('id').eq('camporee_id', camporeeId).like('notes', `%${uploaded.key}%`).limit(1);
        if (references.error) throw references.error;
        if (!references.data?.length) await uploaded.bucket.delete(uploaded.key);
      }
      catch {
        console.error('Unowned music upload needs reconciliation', { key: uploaded.key });
        return Response.json({ error: 'No se guardó la canción. Hay una subida pendiente de limpieza; no se eliminó ningún original.' }, { status: 503 });
      }
    }
    return failure(error);
  }
}

export async function readSong(request: Request, camporeeId: string, songId: string) {
  try {
    const context = await scope(request, camporeeId, new URL(request.url).searchParams.get('organization_id') ?? '');
    const document = await documentFor(context, songId);
    const audio = audioInNotes(document.notes);
    if (!audio) throw new MusicError('Esta canción no tiene audio R2.', 404);
    assertMusicKey(audio.key, camporeeId);
    return await streamMusic(await getMusicBucket(), audio.key, request, context.camporeeId);
  } catch (error) { return failure(error); }
}

export async function deleteSong(request: Request, camporeeId: string, songId: string) {
  try {
    sameOrigin(request);
    const context = await scope(request, camporeeId, new URL(request.url).searchParams.get('organization_id') ?? '', true);
    const previous = await documentFor(context, songId);
    const audio = audioInNotes(previous.notes);
    if (audio) assertMusicKey(audio.key, camporeeId);
    const { data, error } = await context.supabase.from('camporee_documents').delete().eq('camporee_id', camporeeId).eq('id', songId).like('document_type', 'song:%').select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new MusicError('La canción ya no está disponible.', 409);
    // Authorization immediately revokes the audio route. Physical R2 deletion is deferred
    // to the reference-aware 48h cleanup, avoiding deletion of shared migration objects.
    return Response.json({ deleted: true, audioCleanup: audio ? 'deferred' : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
