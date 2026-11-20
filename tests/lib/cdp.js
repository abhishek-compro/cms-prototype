// Minimal Chrome DevTools Protocol driver: real mouse, keyboard and drag input against the prototype.
// No dependencies: needs Node 22+ (global WebSocket and fetch) and a Chromium/Chrome binary.
//   CHROMIUM=/path/to/chrome   overrides the binary lookup
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const candidates = [process.env.CHROMIUM, 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { stdio: 'ignore' });
    if (!r.error && r.status === 0) return c;
  }
  return null;
}

/** Why UI tests cannot run here, or null when they can. */
function unavailableReason() {
  if (typeof WebSocket === 'undefined') return 'needs Node 22+ (global WebSocket)';
  if (!findChrome()) return 'no Chromium/Chrome found (install one, or set CHROMIUM=/path/to/chrome)';
  return null;
}

async function launch(url, scheme = 'light', size = '1500,1300') {
  const chrome = findChrome();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-tests-chrome-'));
  const proc = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
    '--remote-debugging-port=0', `--user-data-dir=${userDir}`, `--window-size=${size}`, 'about:blank'
  ], { stdio: 'ignore' });

  // port 0 = pick a free port; Chrome writes it to DevToolsActivePort (so parallel runs never collide)
  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = parseInt(fs.readFileSync(path.join(userDir, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10); } catch (e) { await sleep(100); }
  }
  if (!port) { proc.kill(); throw new Error('Chrome did not start (no DevToolsActivePort)'); }

  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch (e) { /* retry */ }
    await sleep(100);
  }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let id = 0, dragData = null;
  const pending = {}, errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) pending[d.id](d);
    else if (d.method === 'Input.dragIntercepted') dragData = d.params.data;
    else if (d.method === 'Runtime.exceptionThrown') {
      const x = d.params.exceptionDetails;
      errors.push((x.exception && x.exception.description) || x.text);
    } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      errors.push('console.error: ' + d.params.args.map(a => a.value || a.description).join(' '));
    }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.enable');
  await send('Page.navigate', { url });

  // Waiting instead of fixed sleeps keeps the suites fast: a page is "ready" when it has loaded and rendered the app, and an
  // action has "settled" once the browser has run the handlers it triggered, painted twice and drained the zero-delay timers.
  const waitReady = async oldMarker => {
    for (let i = 0; i < 500; i++) {
      let r = false;
      try { r = await api.ev(`${oldMarker ? '!window.__old && ' : ''}document.readyState === 'complete' && !!document.querySelector('#app > *')`); } catch (e) { /* page is navigating */ }
      if (r) return;
      await sleep(20);
    }
    throw new Error('the page did not load');
  };
  const settle = () => api.ev('new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(r, 0); }); }); })');

  const api = {
    errors,
    sleep,
    settle,
    /** Evaluate an expression in the page and return its (JSON-able) value. */
    ev: async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result.result.value;
    },
    reload: async () => { await api.ev('window.__old = 1; location.reload(); 0'); await waitReady(true); },
    /** Wipe saved data and reload: the page starts from the sample data again. */
    fresh: async () => { await api.ev('localStorage.clear(); 0'); await api.reload(); },
    setScheme: v => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] }),
    /**
     * Point inside an element (fx, fy = fraction of its width/height from the top-left), scrolled into view first
     * unless scroll === false (use that for the END of a drag: scrolling again would move the start point).
     */
    point: (sel, fx = 0.5, fy = 0.5, scroll = true) => api.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; if(${scroll}) e.scrollIntoView({block:'center',inline:'nearest'}); var r=e.getBoundingClientRect(); return [r.left+r.width*${fx}, r.top+r.height*${fy}];})()`),
    center: sel => api.point(sel),
    click: async sel => {
      const c = await api.center(sel);
      if (!c) throw new Error('click: no element ' + sel);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c[0], y: c[1] });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await settle();
    },
    /** Move the mouse over an element (for :hover effects). */
    hover: async (sel, fx = 0.5, fy = 0.5) => {
      const c = await api.point(sel, fx, fy);
      if (!c) throw new Error('hover: no element ' + sel);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c[0], y: c[1] });
      await sleep(140);       // let the hover transition finish (transitions in style.css are .12s)
    },
    /** Move the mouse to page coordinates (for :hover effects on things that are not easy to select). */
    moveTo: async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(140); },
    clickAt: async (x, y) => {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      await settle();
    },
    /** Type into the focused element (replaces the selection). */
    type: async text => { await send('Input.insertText', { text }); await settle(); },
    key: async (key, code, vk) => {
      // Enter/Space need a char payload so the browser performs its default action (e.g. activating a focused button)
      const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', Object.assign({ type, key, code: code || key, windowsVirtualKeyCode: vk || 0 }, type === 'keyDown' && text ? { text } : {}));
      }
      await settle();
    },
    /** Select all text in a field and type over it (Backspace for an empty string). */
    fill: async (sel, text) => {
      await api.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select(); return 1})()`);
      if (text === '') await api.key('Backspace', 'Backspace', 8); else await api.type(text);
    },
    /** Real mouse drag: press on `from`, move to `to` (opts.fx / opts.fy = where inside it, default the centre), replay the intercepted drag as dragEnter/dragOver/drop, release. */
    drag: async (fromSel, toSel, opts = {}) => {
      const a = await api.center(fromSel), t = await api.point(toSel, opts.fx === undefined ? 0.5 : opts.fx, opts.fy === undefined ? 0.5 : opts.fy, false);
      if (!a || !t) throw new Error('drag: missing ' + (a ? toSel : fromSel));
      dragData = null;
      await send('Input.setInterceptDrags', { enabled: true });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0] + (t[0] - a[0]) * i / 8, y: a[1] + (t[1] - a[1]) * i / 8, button: 'left', buttons: 1 });
        if (dragData) break;
      }
      for (let i = 0; i < 100 && !dragData; i++) await sleep(10);
      if (!dragData) {
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t[0], y: t[1], button: 'left', clickCount: 1 });
        await send('Input.setInterceptDrags', { enabled: false });
        throw new Error('drag was not intercepted (dragstart did not start a drag)');
      }
      await send('Input.dispatchDragEvent', { type: 'dragEnter', x: t[0], y: t[1], data: dragData });
      await send('Input.dispatchDragEvent', { type: 'dragOver', x: t[0], y: t[1], data: dragData });
      if (opts.hold) await opts.hold();
      await send('Input.dispatchDragEvent', { type: opts.cancel ? 'dragCancel' : 'drop', x: t[0], y: t[1], data: dragData });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t[0], y: t[1], button: 'left', clickCount: 1 });
      await send('Input.setInterceptDrags', { enabled: false });
      await settle();
    },
    /**
     * Plain mouse drag (press, move in steps, release) for things that use mousedown/mousemove/mouseup rather than
     * HTML5 drag and drop, e.g. moving a node on the flow canvas or drawing an edge from a port.
     * from/to: selectors; opts.fx/fy (start) and opts.tx/ty (end) = where inside each element (default centre).
     * Or pass an array [dx, dy] as `to` to drag by an offset from the start point. opts.scroll === false: do not scroll the start into view.
     */
    pointerDrag: async (fromSel, to, opts = {}) => {
      const a = await api.point(fromSel, opts.fx === undefined ? 0.5 : opts.fx, opts.fy === undefined ? 0.5 : opts.fy, opts.scroll !== false);
      if (!a) throw new Error('pointerDrag: no element ' + fromSel);
      const t = Array.isArray(to) ? [a[0] + to[0], a[1] + to[1]] : await api.point(to, opts.tx === undefined ? 0.5 : opts.tx, opts.ty === undefined ? 0.5 : opts.ty, false);
      if (!t) throw new Error('pointerDrag: no element ' + to);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', clickCount: 1 });
      const steps = opts.steps || 6;
      for (let i = 1; i <= steps; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0] + (t[0] - a[0]) * i / steps, y: a[1] + (t[1] - a[1]) * i / steps, button: 'left', buttons: 1 });
      }
      if (opts.hold) await opts.hold();
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t[0], y: t[1], button: 'left', clickCount: 1 });
      await settle();
    },
    /** PNG screenshot, e.g. when debugging a failing test. */
    shot: async file => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(s.result.data, 'base64')); },
    close: () => {
      try { ws.close(); } catch (e) { /* ignore */ }
      proc.kill();
      try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  };
  await waitReady(false);     // the page loaded what Page.navigate asked for
  return api;
}

module.exports = { launch, findChrome, unavailableReason };
