export const MAX_MP3_BYTES = 15 * 1024 * 1024;
export type R2Audio = { provider: 'r2'; key: string; size: number; contentType: 'audio/mpeg'; sha256: string };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY = new RegExp(`^camporee-app/(${UUID})/songs/(?:${UUID}|[0-9a-f]{64})\\.mp3$`, 'i');
export function assertMusicKey(key: string, camporeeId: string) {
  const match = KEY.exec(key);
  if (!match || match[1].toLowerCase() !== camporeeId.toLowerCase()) throw new Error('El objeto de audio no pertenece al camporee.');
}
export function musicObjectKey(camporeeId: string, id = crypto.randomUUID()) {
  const key = `camporee-app/${camporeeId.toLowerCase()}/songs/${id.toLowerCase()}.mp3`;
  assertMusicKey(key, camporeeId);
  return key;
}
export function parseR2Audio(value: unknown): R2Audio | null {
  if (!value || typeof value !== 'object') return null;
  const audio = value as Record<string, unknown>;
  if (audio.provider !== 'r2' || audio.contentType !== 'audio/mpeg' || typeof audio.key !== 'string' || !KEY.test(audio.key)) return null;
  if (!Number.isSafeInteger(audio.size) || Number(audio.size) <= 0 || Number(audio.size) > MAX_MP3_BYTES || typeof audio.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(audio.sha256)) return null;
  return { provider: 'r2', key: audio.key, size: Number(audio.size), contentType: 'audio/mpeg', sha256: audio.sha256 };
}
function frame(data: Uint8Array, offset: number) {
  if (offset + 4 > data.length || data[offset] !== 255 || (data[offset + 1] & 224) !== 224) return null;
  const version = (data[offset + 1] >> 3) & 3;
  const layer = (data[offset + 1] >> 1) & 3;
  const bitRateIndex = data[offset + 2] >> 4;
  const sampleIndex = (data[offset + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || bitRateIndex === 0 || bitRateIndex === 15 || sampleIndex === 3) return null;
  const bitRate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitRateIndex];
  const sampleRate = [44100,48000,32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const length = Math.floor((version === 3 ? 144 : 72) * bitRate * 1000 / sampleRate) + ((data[offset + 2] >> 1) & 1);
  return { length, version, sampleRate };
}
export function isMp3Bytes(data: Uint8Array) {
  let offset = 0;
  if (data[0] === 73 && data[1] === 68 && data[2] === 51) {
    if (data.length < 10 || ![2,3,4].includes(data[3]) || data.slice(6,10).some(byte => byte > 127)) return false;
    offset = 10 + data[6] * 2097152 + data[7] * 16384 + data[8] * 128 + data[9];
    if (data[3] === 4 && (data[5] & 16)) offset += 10;
  }
  const first = frame(data, offset);
  if (!first || offset + first.length > data.length) return false;
  const second = frame(data, offset + first.length);
  return Boolean(second && first.version === second.version && first.sampleRate === second.sampleRate && offset + first.length + second.length <= data.length);
}
export async function validateMp3(file: File) {
  if (!/\.mp3$/i.test(file.name) || !['', 'audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(file.type.toLowerCase())) throw new Error('Selecciona un archivo MP3.');
  if (!file.size) throw new Error('El archivo de audio está vacío.');
  if (file.size > MAX_MP3_BYTES) throw new Error('El audio debe pesar como máximo 15 MB.');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isMp3Bytes(bytes)) throw new Error('El archivo no contiene audio MP3 válido.');
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { bytes, sha256, contentType: 'audio/mpeg' as const, size: bytes.byteLength };
}
