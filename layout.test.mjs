import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const html = await read('index.html');
const css = await read('glimmer-v2.css');
const workerBuilder = await read('build-worker.mjs');
const serviceWorker = await read('sw.js');

test('single-screen layout keeps existing gameplay hooks wired', () => {
  for (const id of ['board', 'keyboard', 'mode-daily', 'mode-wild', 'result-button',
    'next-button', 'clock-strip', 'next-countdown', 'modal', 'modal-body',
    'status-line', 'puzzle-label', 'progress-indicator']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) ?? []).length, 1, id);
  }
  assert.match(html, /href="\.\/glimmer-v2\.css"/);
  assert.match(html, /src="\.\/app\.mjs"/);
});

test('game surface is viewport-locked and includes short-screen/landscape adaptation', () => {
  assert.match(css, /html,body\s*\{[^}]*overflow:hidden/s);
  assert.match(css, /\.shell\s*\{[^}]*height:100dvh;[^}]*overflow:hidden/s);
  assert.match(css, /\.main\s*\{[^}]*min-height:0;[^}]*overflow:hidden/s);
  assert.match(css, /@media\(max-height:620px\)/);
  assert.match(css, /@media\(max-height:500px\) and \(orientation:landscape\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.modal\s*\{[^}]*max-height:/s);
});

test('offline bundle includes every visual dependency', () => {
  assert.match(workerBuilder, /"glimmer-v2\.css"/);
  assert.match(serviceWorker, /"\.\/glimmer-v2\.css"/);
  assert.match(serviceWorker, /brandle-glimmer-grove-v2/);
});
