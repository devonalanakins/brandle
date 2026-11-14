import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = new Set(['index.html', 'styles.css', 'glimmer-v2.css', 'app.mjs',
  'logic.mjs', 'words.mjs', 'manifest.webmanifest', 'sw.js', 'icon.svg',
  'icon-180.png', 'icon-512.png', 'og.png', 'og.svg']);
const mime = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', js: 'text/javascript; charset=utf-8',
  png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/manifest+json'
};

function startServer() {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost/').pathname.slice(1) || 'index.html';
    if (!assets.has(path)) { res.writeHead(404); res.end(); return; }
    try {
      const body = await readFile(join(root, path));
      res.writeHead(200, { 'Content-Type': mime[path.split('.').at(-1)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return server;
}

const inspect = () => {
  const rect = selector => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height,
      visible: style.display !== 'none' && style.visibility !== 'hidden'
        && r.width > 0 && r.height > 0
    };
  };
  const buttonHeights = selector => Array.from(document.querySelectorAll(selector),
    node => node.getBoundingClientRect().height);
  return {
    viewport: { width: innerWidth, height: innerHeight },
    document: { width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight },
    board: rect('#board'), keyboard: rect('#keyboard'),
    footer: rect('.footer'), countdown: rect('#next-countdown'),
    tiles: document.querySelectorAll('#board .tile').length,
    keys: document.querySelectorAll('#keyboard button').length,
    keyHeights: buttonHeights('#keyboard button'),
    modeHeights: buttonHeights('.mode button')
  };
};

test('WebKit mobile game layout, touch inputs, dialogs and saved draft', { timeout: 90000 }, async () => {
  const server = startServer();
  let browser;
  try {
    await new Promise((resolve, reject) =>
      server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    browser = await webkit.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.locator('#keyboard button').first().waitFor();
    assert.equal(await page.locator('#modal').evaluate(el => el.open), false,
      'game starts without blocking help');

    for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const view = await page.evaluate(inspect);
      assert.equal(view.tiles, 30, 'six rows of five tiles at ' + width + 'x' + height);
      assert.equal(view.keys, 28, '28 keyboard buttons at ' + width + 'x' + height);
      assert.ok(view.document.width <= view.viewport.width + 1
          && view.document.height <= view.viewport.height + 1,
        'no page scrolling at ' + width + 'x' + height + ': ' + JSON.stringify(view));
      for (const item of ['board', 'keyboard', 'footer']) {
        const r = view[item];
        assert.ok(r?.visible && r.left >= -1 && r.top >= -1 &&
          r.right <= width + 1 && r.bottom <= height + 1,
          item + ' must fit at ' + width + 'x' + height + ': ' + JSON.stringify(r));
      }
      if (height >= 500) {
        assert.ok(view.countdown?.visible, 'countdown visible on portrait');
        assert.ok(Math.min(...view.keyHeights) >= 43.5,
          'portrait touch keys >=44px: ' + JSON.stringify(view.keyHeights));
        assert.ok(Math.min(...view.modeHeights) >= 43.5,
          'mode controls >=44px: ' + JSON.stringify(view.modeHeights));
      }
      if (process.env.BRANDLE_WEBKIT_SCREENSHOT_DIR
          && ((width === 390 && height === 844) || (width === 844 && height === 390))) {
        await mkdir(process.env.BRANDLE_WEBKIT_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.BRANDLE_WEBKIT_SCREENSHOT_DIR,
          'webkit-' + width + 'x' + height + '.png') });
      }
      console.log('WebKit ' + width + 'x' + height + ': no scrolling, visible board and keyboard');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-key="C"]').tap();
    assert.equal(await page.locator('#board .tile').first().textContent(), 'C',
      'touch enters letter');
    await page.locator('#mode-wild').tap();
    assert.equal(await page.locator('#mode-wild').getAttribute('aria-pressed'), 'true',
      'mode responds to touch');
    await page.locator('#mode-daily').tap();
    assert.equal(await page.locator('#board .tile').first().textContent(), 'C',
      'daily draft survives mode switching');
    await page.locator('#help-button').tap();
    assert.equal(await page.locator('#modal').evaluate(el => el.open), true,
      'help opens on request');
    await page.locator('#modal-close').tap();
    assert.equal(await page.locator('#modal').evaluate(el => el.open), false,
      'help closes');

    await page.reload({ waitUntil: 'load' });
    await page.locator('#keyboard button').first().waitFor();
    assert.equal(await page.locator('#board .tile').first().textContent(), 'C',
      'partial word persists in local browser storage after reload');
    assert.deepEqual(errors, [], 'no unhandled WebKit exceptions');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
