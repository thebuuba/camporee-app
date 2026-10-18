import { readSong, deleteSong } from '@/lib/song-api';

type Context = { params: Promise<{ camporeeId: string; songId: string }> };
export async function GET(request: Request, { params }: Context) {
  const { camporeeId, songId } = await params;
  return readSong(request, camporeeId, songId);
}
export const HEAD = GET;
export async function DELETE(request: Request, { params }: Context) {
  const { camporeeId, songId } = await params;
  return deleteSong(request, camporeeId, songId);
}
