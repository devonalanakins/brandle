import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
    if (response.exceptionDetails) throw new Error('Browser evaluation failed: ' +
      (response.exceptionDetails.exception?.description || response.exceptionDetails.text));
    return response.result.value;
  }
}
const inspect = '(() => { const rect = q => { const e=document.querySelector(q); const r=e?.getBoundingClientRect(); const s=e && getComputedStyle(e); return r && {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,visible:s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)>0&&r.width>0&&r.height>0}; }; return {width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,game:rect(".game"),board:rect(".board"),keyboard:rect(".keyboard"),footer:rect(".footer"),countdown:rect("#next-countdown"),tiles:document.querySelectorAll("#board .tile").length,keys:document.querySelectorAll("#keyboard button").length}; })()';

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
    const screenshotDir = process.env.BRANDLE_SCREENSHOT_DIR;
    async function capture(label) {
      if (!screenshotDir) return;
      await mkdir(screenshotDir,{recursive:true});
      const shot = await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
      await writeFile(join(screenshotDir,label+'.png'),Buffer.from(shot.data,'base64'));
    }
    await cdp.send('Page.navigate',{url});
    await poll(() => cdp.eval('document.readyState==="complete" && document.querySelectorAll("#keyboard button").length===28'));
    const enterLabelFits = '(() => {const key=document.querySelector(\'[data-key="ENTER"]\');const t=key?.querySelector("span");if(!key||!t)return false;const a=key.getBoundingClientRect(),b=t.getBoundingClientRect();return b.width>0&&b.left>=a.left-.75&&b.right<=a.right+.75;})()';
    assert.equal(await cdp.eval('Boolean(document.querySelector("#modal")?.open)'),false,'no forced help overlay');
    for (const [width,height] of [[320,568],[390,650],[390,844],[430,932],[844,390],[1440,900]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await cdp.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const state = await cdp.eval(inspect);
      assert.equal(state.tiles,30,'tile count at '+width+'x'+height);
      assert.equal(state.keys,28,'keyboard count at '+width+'x'+height);
      assert.equal(await cdp.eval(enterLabelFits),true,'Enter label overflows its key at '+width+'x'+height);
      assert.ok(state.scrollH<=state.height+1 && state.scrollW<=state.width+1,
        'page overflow at '+width+'x'+height);
      for (const name of ['board','keyboard','footer','countdown']) {
        const r=state[name];
        assert.ok(r?.visible, name+' must be displayed at '+width+'x'+height+': '+JSON.stringify(r));
        assert.ok(r.left>=-1 && r.right<=width+1 && r.top>=-1 && r.bottom<=height+1,
          name+' clipped at '+width+'x'+height+': '+JSON.stringify(r));
      }
      if (height>=500) assert.ok(state.board.bottom<=state.keyboard.top+1,
        'portrait board overlaps keyboard at '+width+'x'+height);
      if (height<500) assert.ok(state.board.right<=state.keyboard.left+1,
        'landscape board overlaps keyboard at '+width+'x'+height);
      for (const name of ['board','keyboard']) {
        const r=state[name];
        assert.ok(r.top>=state.game.top-1 && r.bottom<=state.game.bottom+1,
          name+' clipped inside game at '+width+'x'+height);
      }
      if ((width===320 && height===568) || (width===1440 && height===900)) {
        await capture('brandle-'+width+'x'+height);
      }
      console.log(width+'x'+height+': visible board, keyboard, footer; no page overflow');
    }
    // Mobile viewport emulation uses the actual viewport meta rule, not only
    // desktop window resizing. This remains Chromium, not WebKit/Safari.
    for (const [width,height] of [[320,568],[390,844],[844,390]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:3,mobile:true});
      await cdp.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const state = await cdp.eval(inspect);
      assert.equal(await cdp.eval(enterLabelFits),true,'mobile Enter label overflows its key at '+width+'x'+height);
      assert.ok(state.scrollH<=height+1 && state.scrollW<=width+1,'mobile page overflows '+width+'x'+height);
      for (const name of ['board','keyboard','footer','countdown']) {
        const rect = state[name];
        assert.ok(rect?.visible,'mobile '+name+' must be displayed at '+width+'x'+height+': '+JSON.stringify(rect));
        assert.ok(rect.left>=-1 && rect.right<=width+1 && rect.top>=-1 && rect.bottom<=height+1,
          'mobile '+name+' clipped at '+width+'x'+height+': '+JSON.stringify(rect));
      }
      if ((width===390 && height===844) || (width===844 && height===390)) {
        await capture('brandle-mobile-'+width+'x'+height);
      }
      console.log('mobile '+width+'x'+height+': board, keyboard and footer visible');
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    assert.equal(await cdp.eval('(() => { const grid=document.querySelector("#board"); window.__firstTile=grid.querySelector(".tile"); return grid.getAttribute("aria-rowcount")+"x"+grid.getAttribute("aria-colcount"); })()'),"6x5","grid advertises its complete dimensions");
    assert.equal(await cdp.eval('document.querySelectorAll("#board [role=row]")[5]?.children[4]?.getAttribute("aria-colindex")==="5"'),true,"grid indexes the final cell");
    await cdp.eval('document.querySelector(\'[data-key="C"]\').click()');
    assert.equal(await cdp.eval('document.querySelector("#board .tile").textContent'),'C','tap enters a letter');
    assert.equal(await cdp.eval('document.querySelector("#board .tile") === window.__firstTile'),true,'typing reuses the same grid cell');
    assert.equal(await cdp.eval('(() => { window.__focusedKey = document.querySelector(\'[data-key="A"]\'); window.__focusedKey.focus(); return document.activeElement === window.__focusedKey; })()'),true,'keyboard key takes focus');
    await cdp.eval('document.querySelector("#mode-wild").click()');
    assert.equal(await cdp.eval('document.querySelector("#mode-wild").getAttribute("aria-pressed")'),'true');
    assert.equal(await cdp.eval('document.querySelector("#board .tile") === window.__firstTile'),true,'switching modes reuses grid cells');
    assert.equal(await cdp.eval('document.activeElement === window.__focusedKey'),true,'mode change preserves keyboard focus');
    await cdp.eval('document.querySelector("#mode-daily").click()');
    assert.equal(await cdp.eval('document.querySelector("#board .tile").textContent'),'C','draft survives mode switch');
    assert.equal(await cdp.eval('document.querySelector("#board .tile") === window.__firstTile'),true,'mode restoration retains cell identity');
    assert.equal(await cdp.eval('document.activeElement === window.__focusedKey'),true,'return to daily preserves keyboard focus');
    await cdp.eval('document.querySelector("#help-button").focus()');
    await cdp.eval('document.querySelector("#help-button").click()');
    assert.equal(await cdp.eval('document.querySelector("#modal").open'),true,'help opens on demand');
    assert.equal(await cdp.eval('document.activeElement.id'),"modal-close",'dialog manages focus');
    await cdp.eval('document.querySelector("#modal-close").click()');
    assert.equal(await cdp.eval('document.querySelector("#modal").open'),false,'help can close');
    await poll(() => cdp.eval('document.activeElement.id === "help-button"'));

    // The localhost origin is secure. Test offline behavior through the actual
    // installed service worker, rather than inspecting source strings alone.
    assert.equal(await cdp.eval('window.isSecureContext'),true,'localhost is a secure context');
    await poll(() => cdp.eval('Boolean(navigator.serviceWorker?.controller)'),18000);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions',{
      offline:true,latency:0,downloadThroughput:0,uploadThroughput:0
    });
    const cached = await cdp.eval('fetch("./logic.mjs").then(r => ({status:r.status,kind:r.headers.get("content-type")}))');
    assert.equal(cached.status,200,'offline game module available');
    assert.match(cached.kind,/javascript/,'offline module has correct MIME type');
    const missing = await cdp.eval('fetch("./missing-module.mjs").then(r => ({status:r.status,kind:r.headers.get("content-type")}))');
    assert.ok(missing.status === 404 || missing.status === 503,'missing module must fail instead of receiving the app shell');
    assert.doesNotMatch(missing.kind ?? "",/text\/html/i,'missing module must not fall back to HTML');
    await cdp.send('Page.reload');
    await poll(() => cdp.eval('document.readyState==="complete" && document.querySelectorAll("#keyboard button").length===28'),18000);
    assert.equal(await cdp.eval('document.querySelector("#board .tile").textContent'),'C','offline reload restores the typed draft');
    await cdp.send('Network.emulateNetworkConditions',{
      offline:false,latency:0,downloadThroughput:0,uploadThroughput:0
    });
    // Reduced-motion gameplay must still reveal a valid guess, announce its
    // keyboard hints, retain focus and present a completed result without a
    // long animation delay. No answer is printed into CI logs.
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await cdp.eval('matchMedia("(prefers-reduced-motion: reduce)").matches'),true);
    assert.equal(await cdp.eval('(() => { window.__revealTile = document.querySelector("#board .tile"); return !!window.__revealTile; })()'),true,'board available before reveal');
    assert.equal(await cdp.eval("(async () => { const logic = await import(\"./logic.mjs\"); const answer = logic.dailyAnswer(new Date()); const guess = answer === \"CRANE\" ? \"ROAST\" : \"CRANE\"; window.__testAnswer = answer; window.__testHints = logic.keyboardHints([guess],answer); document.querySelector('[data-key=\"BACK\"]').click(); for (const letter of guess) document.querySelector('[data-key=\"' + letter + '\"]').click(); const enter = document.querySelector('[data-key=\"ENTER\"]'); enter.focus(); enter.click(); return true; })()"),true,'submit a valid non-winning guess');
    await poll(() => cdp.eval('document.querySelector("#progress-indicator").textContent === "02 / 06"'),3000);
    assert.equal(await cdp.eval('document.activeElement.dataset.key'),"ENTER",'submit retains focus during reduced-motion reveal');
    assert.equal(await cdp.eval('document.querySelector("#board .tile") === window.__revealTile'),true,'guess reveal preserves the grid cell');
    assert.equal(await cdp.eval('document.querySelectorAll("#board [role=row]").length'),6,'grid retains six indexed rows after reveal');
    assert.equal(await cdp.eval("Object.entries(window.__testHints).every(([letter,status]) => { const labels={correct:\"correct position\",present:\"in word, other position\",absent:\"not in word\"}; return document.querySelector('[data-key=\"' + letter + '\"]').getAttribute(\"aria-label\") === letter + \", \" + labels[status]; })"),true,'learned keyboard hints are spoken in button labels');
    assert.match(await cdp.eval('document.querySelector("#status-line").textContent'),/RIGHT.+ELSEWHERE.+OUT/);
    assert.equal(await cdp.eval("(() => { for (const letter of window.__testAnswer) document.querySelector('[data-key=\"' + letter + '\"]').click(); const enter=document.querySelector('[data-key=\"ENTER\"]'); enter.focus(); enter.click(); return true; })()"),true,'submit the known answer');
    await poll(() => cdp.eval('document.querySelector("#modal").open && document.querySelector("#progress-indicator").textContent === "SOLVED"'),3000);
    const result = await cdp.eval('JSON.parse(localStorage.getItem("brandle-v1:stats-daily"))');
    assert.equal(result.played,1,'completed round recorded exactly once');
    assert.equal(result.wins,1,'completed win recorded');
    assert.equal(await cdp.eval('document.querySelector("#board .tile") === window.__revealTile'),true,'winning reveal preserves the grid cell');
    assert.equal(await cdp.eval('document.querySelector("#modal").getAttribute("aria-labelledby")'),
      "dialog-title",'result dialog gets its name from the visible title');
    assert.equal(await cdp.eval('document.querySelector("#modal #dialog-title")?.tagName'),
      "H2",'result dialog has an accessible heading');
    // Enter is disabled after the round ends. Closing results must return to
    // the now-visible results control rather than the disabled Enter key.
    await cdp.eval('document.querySelector("#modal-close").click()');
    await poll(() => cdp.eval('document.activeElement?.id === "result-button"'));
    assert.equal(await cdp.eval('document.activeElement.disabled'),false,'restored focus remains usable');
    await cdp.eval('document.querySelector("#result-button").click()');
    assert.equal(await cdp.eval('document.querySelector("#modal").open'),true,'result remains accessible');
    await cdp.eval('document.querySelector("#modal-close").click()');
    await poll(() => cdp.eval('document.activeElement?.id === "result-button"'));
  } finally {
    ws?.close();
    if (chrome) {chrome.kill();await delay(200);}
    await new Promise(ok=>server.close(ok));
    await rm(profile,{recursive:true,force:true});
  }
});
