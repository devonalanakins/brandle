import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = new Set(['index.html','styles.css','glimmer-v2.css','app.mjs','logic.mjs',
  'words.mjs','manifest.webmanifest','icon.svg','icon-180.png','icon-512.png',
  'og.png','og.svg','sw.js']);
const types = {html:'text/html',css:'text/css',mjs:'text/javascript',js:'text/javascript',
  svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};

async function poll(fn, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await delay(80);
  }
  throw new Error('Timed out waiting for browser');
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.next = 0; this.pending = new Map();
    ws.addEventListener('message', event => {
      const response = JSON.parse(String(event.data));
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      response.error ? pending.reject(new Error(response.error.message)) : pending.resolve(response.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve,reject) => {
      this.pending.set(id,{resolve,reject});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async eval(expression) {
    const response = await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (response.exceptionDetails) throw new Error('Browser evaluation failed: ' + response.exceptionDetails.text);
    return response.result.value;
  }
}
const inspect = '(() => { const rect = q => { const r=document.querySelector(q)?.getBoundingClientRect(); return r && {left:r.left,top:r.top,right:r.right,bottom:r.bottom}; }; return {width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,game:rect(".game"),board:rect(".board"),keyboard:rect(".keyboard"),footer:rect(".footer"),tiles:document.querySelectorAll("#board .tile").length,keys:document.querySelectorAll("#keyboard button").length}; })()';

test('real browser: board, keyboard, controls and footer fit without scrolling', {timeout:60000}, async () => {
  const profile = await mkdtemp(join(tmpdir(),'brandle-chrome-'));
  const server = createServer(async (req,res) => {
    const path = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
    if (!assets.has(path)) {res.writeHead(404);res.end();return;}
    try {
      const body = await readFile(join(root,path));
      res.writeHead(200,{'content-type':types[path.split('.').at(-1)] || 'application/octet-stream'});
      res.end(body);
    } catch {res.writeHead(404);res.end();}
  });
  let chrome, ws;
  try {
    await new Promise((ok,fail) => server.once('error',fail).listen(0,'127.0.0.1',ok));
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    const binary = [process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium',
      '/usr/bin/chromium-browser','google-chrome'].find(p => p && (p==='google-chrome'||existsSync(p)));
    chrome = spawn(binary,['--headless=new','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0',
      '--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','pipe','pipe']});
    let launchError = null;
    let chromeStderr = '';
    chrome.on('error',error => {launchError=error.message;});
    chrome.stderr.on('data',buffer => {chromeStderr=(chromeStderr+buffer.toString()).slice(-4000);});
    let port;
    try {
      port = await poll(async () => {
        if (launchError) throw new Error('Failed to spawn Chrome: '+launchError);
        if (chrome.exitCode !== null) throw new Error('Chrome exited before startup: '+chrome.exitCode);
        try {return (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}
        catch {return null;}
      });
    } catch (error) {
      throw new Error(error.message+'; binary='+binary+'; chrome stderr='+chromeStderr.slice(-2000));
    }
    const response = await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'});
    assert.equal(response.ok,true,'create Chrome debugging tab');
    const tab = await response.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((ok,fail) => {
      ws.addEventListener('open',ok,{once:true});
      ws.addEventListener('error',fail,{once:true});
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate',{url});
    await poll(() => cdp.eval('document.readyState==="complete" && document.querySelectorAll("#keyboard button").length===28'));
    assert.equal(await cdp.eval('Boolean(document.querySelector("#modal")?.open)'),false,'no forced help overlay');
    for (const [width,height] of [[320,568],[390,650],[390,844],[430,932],[844,390],[1440,900]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await cdp.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const state = await cdp.eval(inspect);
      assert.equal(state.tiles,30,'tile count at '+width+'x'+height);
      assert.equal(state.keys,28,'keyboard count at '+width+'x'+height);
      assert.ok(state.scrollH<=state.height+1 && state.scrollW<=state.width+1,
        'page overflow at '+width+'x'+height);
      for (const name of ['board','keyboard','footer']) {
        const r=state[name];
        assert.ok(r && r.left>=-1 && r.right<=width+1 && r.top>=-1 && r.bottom<=height+1,
          name+' clipped at '+width+'x'+height+': '+JSON.stringify(r));
      }
      for (const name of ['board','keyboard']) {
        const r=state[name];
        assert.ok(r.top>=state.game.top-1 && r.bottom<=state.game.bottom+1,
          name+' clipped inside game at '+width+'x'+height);
      }
      console.log(width+'x'+height+': visible board, keyboard, footer; no page overflow');
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await cdp.eval('document.querySelector(\'[data-key="C"]\').click()');
    assert.equal(await cdp.eval('document.querySelector("#board .tile").textContent'),'C','tap enters a letter');
    await cdp.eval('document.querySelector("#mode-wild").click()');
    assert.equal(await cdp.eval('document.querySelector("#mode-wild").getAttribute("aria-pressed")'),'true');
    await cdp.eval('document.querySelector("#mode-daily").click()');
    assert.equal(await cdp.eval('document.querySelector("#board .tile").textContent'),'C','draft survives mode switch');
    await cdp.eval('document.querySelector("#help-button").click()');
    assert.equal(await cdp.eval('document.querySelector("#modal").open'),true,'help opens on demand');
    await cdp.eval('document.querySelector("#modal-close").click()');
    assert.equal(await cdp.eval('document.querySelector("#modal").open'),false,'help can close');
  } finally {
    ws?.close();
    if (chrome) {chrome.kill();await delay(200);}
    await new Promise(ok=>server.close(ok));
    await rm(profile,{recursive:true,force:true});
  }
});
