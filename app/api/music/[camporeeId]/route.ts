import { saveSong } from '@/lib/song-api';

export async function POST(request: Request, { params }: { params: Promise<{ camporeeId: string }> }) {
  return saveSong(request, (await params).camporeeId);
}
