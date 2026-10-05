import type { Song } from './songs';

export type DownloadedSong = { key: string; scope: string; song: Song; blob: Blob; bytes: number; createdAt: number };

export function songSourceKey(song: Song) { return song.filePath || song.audioUrl; }

function openDownloads(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no admite descargas de audio sin conexión.'));
      return;
    }
    const request = indexedDB.open('camporee-music', 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('tracks')) request.result.createObjectStore('tracks', { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento de descargas.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Cierra las otras pestañas de Camporee para habilitar las descargas.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close(); else resolve(db);
    };
  });
}

async function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDownloads();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('tracks', mode);
      const request = operation(transaction.objectStore('tracks'));
      // A successful request can still be rolled back (for example by quota).
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('No se pudo guardar la descarga.'));
    });
  } finally {
    db.close();
  }
}

export async function listDownloadedSongs(scope: string): Promise<DownloadedSong[]> {
  const tracks = await runTransaction<DownloadedSong[]>('readonly', store => store.getAll());
  return tracks.filter(track => track.scope === scope);
}

export async function saveDownloadedSong(scope: string, song: Song, blob: Blob): Promise<DownloadedSong> {
  const track: DownloadedSong = { key: `${scope}:${songSourceKey(song)}`, scope, song, blob, bytes: blob.size, createdAt: Date.now() };
  await runTransaction('readwrite', store => store.put(track));
  return track;
}

export async function removeDownloadedSong(scope: string, song: Song): Promise<void> {
  await runTransaction('readwrite', store => store.delete(`${scope}:${songSourceKey(song)}`));
}
