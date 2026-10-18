type ObjectPage = { objects: { key: string; uploaded: Date }[]; truncated: boolean; cursor?: string };
type CleanupBucket = {
  list(options: { prefix: string; limit: number; cursor?: string }): Promise<ObjectPage>;
  delete(key: string): Promise<void>;
};

// One bounded page per request; the caller may continue with the returned cursor.
// An upload/DB write has at least 48 hours to finish before becoming eligible.
export async function cleanupMusicObjects(
  bucket: CleanupBucket,
  camporeeId: string,
  readReferences: () => Promise<ReadonlySet<string>>,
  options: { apply?: boolean; now?: Date; cursor?: string } = {},
) {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  if (!new RegExp(`^${uuid}$`, 'i').test(camporeeId)) throw new Error('Invalid camporee');
  const prefix = `camporee-app/${camporeeId}/songs/`;
  const ownedName = new RegExp(`^(?:${uuid}|[0-9a-f]{64})\\.mp3$`, 'i');
  const cutoff = (options.now ?? new Date()).getTime() - 48 * 60 * 60 * 1000;
  const references = await readReferences();
  const page = await bucket.list({ prefix, limit: 100, ...(options.cursor ? { cursor: options.cursor } : {}) });
  const candidates = page.objects.filter(object =>
    object.key.startsWith(prefix) && ownedName.test(object.key.slice(prefix.length)) &&
    object.uploaded.getTime() < cutoff && !references.has(object.key),
  ).map(object => object.key);
  const deleted: string[] = [];
  if (options.apply) for (const key of candidates) {
    // Fail closed if the DB is unavailable, and protect newly created references.
    if ((await readReferences()).has(key)) continue;
    await bucket.delete(key);
    deleted.push(key);
  }
  return { candidates, deleted, cursor: page.truncated ? page.cursor ?? null : null };
}
