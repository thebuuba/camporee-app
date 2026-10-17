import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import * as audio from '../lib/song-audio.ts';

const CAMP = '60000000-0000-4000-8000-000000000001';
const KEY = `camporee-app/${CAMP}/songs/70000000-0000-4000-8000-000000000001.mp3`;
const frames = () => {
  const result = new Uint8Array(834);
  for (const offset of [0, 417]) result.set([255, 251, 144, 100], offset);
  return result;
};
async function storage() {
  const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
  await loadBindings();
  const filename = 'lib/r2-music.ts';
  const { code } = await transform(await readFile(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  const modules = { 'server-only': {}, '@/lib/song-audio': audio, '@opennextjs/cloudflare': { async getCloudflareContext() { return { env: {} }; } } };
  vm.runInNewContext(code, { module, exports: module.exports, Request, Response, Headers, Date, require: name => modules[name] });
  return module.exports;
}
test('valida MPEG real, ID3 y metadatos, rechazando firmas falsas y claves ajenas', async () => {
  assert.equal(audio.isMp3Bytes(frames()), true);
  assert.equal(audio.isMp3Bytes(new TextEncoder().encode('ID3 not an audio file')), false);
  assert.equal(audio.isMp3Bytes(frames().slice(0, 500)), false);
  const tagged = new Uint8Array(844); tagged.set([73,68,51,4,0,0,0,0,0,0]); tagged.set(frames(), 10);
  assert.equal(audio.isMp3Bytes(tagged), true);
  const result = await audio.validateMp3(new File([tagged], 'song.mp3', { type: 'audio/mpeg' }));
  assert.equal(result.size, 844); assert.match(result.sha256, /^[0-9a-f]{64}$/);
  await assert.rejects(audio.validateMp3(new File([frames()], 'song.html', { type: 'text/html' })), /MP3/);
  await assert.rejects(audio.validateMp3(new File([], 'song.mp3')), /vacío/);
  const metadata = { provider: 'r2', key: KEY, size: 844, sha256: result.sha256, contentType: 'audio/mpeg' };
  assert.deepEqual(audio.parseR2Audio(metadata), metadata);
  assert.equal(audio.parseR2Audio({ ...metadata, key: 'other-project/music.mp3' }), null);
  assert.throws(() => audio.assertMusicKey(KEY, 'another-camporee'));
  assert.throws(() => audio.musicObjectKey(CAMP, '../outside'));
});
test('los dos MP3 locales actuales pasan la validación estructural', async () => {
  for (const name of ['maranata', 'contracorriente']) {
    const bytes = await readFile(`public/audio/${name}.mp3`);
    assert.equal(audio.isMp3Bytes(bytes), true, name);
  }
});
test('stream HTTP sirve rangos reales y HEAD sin cargar el objeto completo', async () => {
  const { streamMusic, getMusicBucket } = await storage();
  await assert.rejects(getMusicBucket(), /MUSIC_BUCKET/);
  const bytes = new TextEncoder().encode('0123456789');
  const reads = [];
  const metadata = { size: bytes.length, httpEtag: '"v1"', uploaded: new Date('2026-10-10T00:00:00Z') };
  const bucket = {
    async head() { return metadata; },
    async get(_key, options) {
      reads.push(options?.range);
      const range = options?.range;
      const part = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
      return { ...metadata, body: new Response(part).body };
    },
  };
  const server = createServer(async (req, res) => {
    try {
      const response = await streamMusic(bucket, KEY, new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers }), CAMP);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/audio`;
  try {
    for (const [range, status, body] of [
      ['bytes=0-1',206,'01'], ['bytes=7-',206,'789'], ['bytes=-3',206,'789'],
      ['bytes=8-99',206,'89'], ['bytes=10-',416,''], ['bytes=4-2',416,''],
      ['bytes=0-1,4-5',416,''], ['bytes=-0',416,''],
    ]) {
      const response = await fetch(url, { headers: { range } });
      assert.equal(response.status, status, range);
      assert.equal(await response.text(), body, range);
      if (status === 206) assert.equal(response.headers.get('content-length'), String(body.length));
    }
    const full = await fetch(url, { headers: { range: 'bytes=0-1', 'if-range': '"old"' } });
    assert.equal(full.status, 200); assert.equal(await full.text(), '0123456789');
    const beforeHead = reads.length;
    const head = await fetch(url, { method: 'HEAD', headers: { range: 'bytes=0-1' } });
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '10');
    assert.equal(reads.length, beforeHead);
    assert.equal((await fetch(url, { headers: { 'if-none-match': 'W/"v1"' } })).status, 304);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
