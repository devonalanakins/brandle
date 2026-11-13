import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareSource, validateBaseline } from './compare-release-baseline.mjs';

const baselineBytes = await readFile(new URL('../docs/releases/live-assets-2026-10-30.json', import.meta.url));
const baseline = JSON.parse(baselineBytes);
test('historical asset baseline is valid and immutable in scope', () => {
  assert.equal(validateBaseline(baseline).length,12);
  assert.equal(baseline.worker,'brandle-glimmer-grove');
});
test('historical asset manifest retains its original Git blob identity', () => {
  const hash = createHash('sha1').update('blob ' + baselineBytes.length + '\\0').update(baselineBytes).digest('hex');
  assert.equal(hash,'ee4ec6b52559fe1f68ac594e6a3d334709874968');
});
test('comparison distinguishes historical source drift from release integrity', async () => {
  const outcome = await compareSource(baseline);
  assert.equal(outcome.total,12);
  assert.equal(outcome.matched + outcome.differences.length,12);
  assert.ok(outcome.differences.every(item => item.reason === 'source differs from historical release baseline'));
  // New source changes may intentionally differ from an immutable October 2026 live snapshot.
  // Actual production parity remains a separate cutover gate.
});
test('offline comparison detects changed assets', async () => {
  const original = await readFile(new URL('../index.html', import.meta.url));
  const outcome = await compareSource(baseline, path => path.endsWith('index.html') ? Buffer.concat([original,Buffer.from('x')]) : readFile(path));
  assert.equal(outcome.identical,false);
  assert.ok(outcome.differences.some(v=>v.name==='index.html'));
});
test('invalid manifest and missing asset fail closed', async () => {
  assert.throws(()=>validateBaseline({...baseline,files:{}}));
  const outcome = await compareSource(baseline, async path => {if(path.endsWith('sw.js'))throw Object.assign(new Error('missing'),{code:'ENOENT'});return readFile(path)});
  assert.ok(outcome.differences.some(v=>v.name==='sw.js'&&v.reason==='asset missing'));
});
