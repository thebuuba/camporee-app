import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { assertMusicKey } from '@/lib/song-audio';

type MusicObject = { size: number; httpEtag: string; uploaded?: Date; body?: ReadableStream<Uint8Array> };
export type MusicBucket = {
  head(key: string): Promise<MusicObject | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<MusicObject | null>;
  put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string }; customMetadata: Record<string,string> }): Promise<unknown>;
  delete(key: string): Promise<void>;
};
export async function getMusicBucket(): Promise<MusicBucket> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as { MUSIC_BUCKET?: MusicBucket }).MUSIC_BUCKET;
  if (!bucket) throw new Error('El binding MUSIC_BUCKET no está configurado.');
  return bucket;
}
export function musicRange(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(Number(match[1] || match[2])) || (!match[1] && Number(match[2]) === 0) || start >= size || end < start) return null;
  return { offset: start, length: end - start + 1 };
}
export async function streamMusic(bucket: MusicBucket, key: string, request: Request, camporeeId: string): Promise<Response> {
  assertMusicKey(key, camporeeId);
  const object = await bucket.head(key);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({
    'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'ETag': object.httpEtag,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  });
  if (object.uploaded) headers.set('Last-Modified', object.uploaded.toUTCString());
  const noneMatch = request.headers.get('if-none-match');
  if (noneMatch?.split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === object.httpEtag)) return new Response(null, { status: 304, headers });
  const ifRange = request.headers.get('if-range');
  const dateMatches = ifRange && object.uploaded && Number.isFinite(Date.parse(ifRange)) && Math.floor(object.uploaded.getTime() / 1000) <= Math.floor(Date.parse(ifRange) / 1000);
  const rangeHeader = request.method === 'GET' && (!ifRange || ifRange === object.httpEtag || dateMatches) ? request.headers.get('range') : null;
  const range = rangeHeader ? musicRange(rangeHeader, object.size) : null;
  if (rangeHeader && !range) {
    headers.set('Content-Range', `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Length', String(range?.length ?? object.size));
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  const body = await bucket.get(key, range ? { range } : undefined);
  if (!body) return new Response(null, { status: 404 });
  if (!body.body) throw new Error('El objeto R2 no contiene audio.');
  return new Response(body.body, { status: range ? 206 : 200, headers });
}
