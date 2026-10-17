import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createClient } from '@/lib/supabase/server';
import { resolveCamporeeContext, TenantAccessError } from '@/lib/tenant-context';
import { cleanupMusicObjects } from '@/lib/r2-cleanup';

// Explicit administration action: dry-run by default, at most 100 objects per page.
export async function POST(request: Request, { params }: { params: Promise<{ camporeeId: string }> }) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) return Response.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const { camporeeId } = await params;
    const organizationId = url.searchParams.get('organization_id') ?? '';
    const supabase = await createClient();
    const context = await resolveCamporeeContext(supabase, { organizationId, camporeeId });
    if (!context.canEdit('settings')) return Response.json({ error: 'Sin permiso para administrar canciones.' }, { status: 403 });
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as { MUSIC_BUCKET?: Parameters<typeof cleanupMusicObjects>[0] }).MUSIC_BUCKET;
    if (!bucket) return Response.json({ error: 'El almacenamiento de música no está configurado.' }, { status: 503 });
    const readReferences = async () => {
      const references = new Set<string>();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('camporee_documents').select('notes').eq('camporee_id', camporeeId).order('id').range(offset, offset + 999);
        if (error) throw error;
        // Protect references even in old/corrupted metadata or non-song documents.
        for (const row of data ?? []) {
          try {
            const key = JSON.parse(row.notes ?? '{}')?.audio?.key;
            if (typeof key === 'string') references.add(key);
          } catch { /* Also protect raw references in malformed notes. */ }
          for (const match of String(row.notes ?? '').matchAll(/camporee-app\/[0-9a-f-]+\/songs\/[0-9a-f-]+\.mp3/gi)) references.add(match[0]);
        }
        if (!data || data.length < 1000) break;
      }
      return references;
    };
    const result = await cleanupMusicObjects(bucket, camporeeId, readReferences, {
      apply: url.searchParams.get('apply') === 'true',
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof TenantAccessError) return Response.json({ error: 'Acceso no permitido.' }, { status: error.reason === 'authentication' ? 401 : 403 });
    console.error('Music orphan cleanup failed');
    return Response.json({ error: 'No se pudo comprobar la limpieza de música. No continúes hasta resolver el error.' }, { status: 503 });
  }
}
