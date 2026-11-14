import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const html = await read('index.html');
const css = await read('glimmer-v2.css');
const workerBuilder = await read('build-worker.mjs');
const serviceWorker = await read('sw.js');
const app = await read('app.mjs');
const manifest = JSON.parse(await read('manifest.webmanifest'));
const serviceWorkerSource = serviceWorker;

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
  assert.ok(!('orientation' in manifest),'installed game must allow landscape rotation');
  assert.match(serviceWorkerSource, /req\.mode === "navigate"/);
  assert.match(serviceWorkerSource, /status: 503/);
  assert.match(app, /window\.isSecureContext/);
  assert.match(workerBuilder, /"glimmer-v2\.css"/);
  assert.match(serviceWorker, /"\.\/glimmer-v2\.css"/);
  assert.match(serviceWorker, /brandle-glimmer-grove-v2/);
});

test('first play starts immediately with optional help and accessible feedback', () => {
  assert.doesNotMatch(app, /setTimeout\(\s*\(\)\s*=>\s*openModal\("help"\)/);
  assert.match(app, /guessFeedback\(game\.guesses\.at\(-1\), game\.answer\)/);
  assert.match(html, /id="status-line" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="help-button"[^>]*aria-label="How to play"/);
  assert.match(html, /<dialog id="modal" class="modal" aria-labelledby="dialog-title">/);
  assert.match(app, /heading\.id = "dialog-title"/);
  assert.match(app, /function canRestoreFocus\(element\)/);
});
