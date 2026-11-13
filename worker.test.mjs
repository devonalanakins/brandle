import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from './dist/worker.mjs';

const assets = [
  'index.html', 'styles.css', 'glimmer-v2.css', 'app.mjs', 'logic.mjs', 'words.mjs',
  'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png',
  'og.png', 'og.svg', 'sw.js'
];

test('built Worker serves every bundled asset byte-for-byte', async () => {
  for (const path of assets) {
    const response = await worker.fetch(new Request(`https://example.test/${path}`));
    assert.equal(response.status, 200, path);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(path, import.meta.url)), path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
  }
});

test('root, HEAD, cache and unsupported requests behave correctly', async () => {
  const root = await worker.fetch(new Request('https://example.test/'));
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type'), /^text\/html/);
  assert.equal(root.headers.get('cache-control'), 'no-cache');
  assert.deepEqual(Buffer.from(await root.arrayBuffer()), await readFile(new URL('index.html', import.meta.url)));

  const head = await worker.fetch(new Request('https://example.test/styles.css', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.match(head.headers.get('content-type'), /^text\/css/);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await worker.fetch(new Request('https://example.test/sw.js'))).headers.get('cache-control'), 'no-cache');
  assert.equal((await worker.fetch(new Request('https://example.test/missing'))).status, 404);
  assert.equal((await worker.fetch(new Request('https://example.test/', { method: 'POST' }))).status, 405);
});
