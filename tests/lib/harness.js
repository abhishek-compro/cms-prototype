// Shared helpers: run a UI suite in a real browser, and load the store with a fake localStorage.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { launch, unavailableReason } = require('./cdp');

const PROTOTYPE = path.resolve(__dirname, '../../prototype');
const INDEX_URL = 'file://' + path.join(PROTOTYPE, 'index.html');

/**
 * One UI suite = one browser session. Inside `fn`, drive the page with `b` and record checks with
 * ok(name, condition, detail) (or ok.skip(name, reason)). Every check is reported as its own sub-test once the suite finishes, so a
 * failing check does not hide the ones after it. A final check fails the suite on any console error.
 */
function uiSuite(name, fn, opts = {}) {
  const skip = unavailableReason();
  test(name, { skip: skip || false, timeout: opts.timeout || 300000 }, async t => {
    const results = [];
    const ok = (n, c, d) => results.push({ n, c: !!c, d: d === undefined ? '' : String(d) });
    ok.skip = (n, why) => results.push({ n, skip: why || true });   // a check that cannot run here (shown as skipped)
    let b;
    try {
      b = await launch(INDEX_URL, opts.scheme || 'light', opts.size || '1500,1300');
      await b.fresh();
      await fn({ b, ok });
      ok('no console errors or uncaught exceptions', b.errors.length === 0, JSON.stringify(b.errors));
    } catch (e) {
      results.push({ n: 'the suite ran to the end without throwing', c: false, d: (e && e.stack) || String(e) });
    } finally {
      if (b) b.close();
    }
    for (const r of results) await t.test(r.n, { skip: r.skip || false }, () => assert.ok(r.c, r.d));
  });
}

/** A fresh copy of store.js backed by an in-memory localStorage (pass `mem` to start from saved data). */
function loadStore(mem = {}) {
  globalThis.localStorage = {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }
  };
  const file = path.join(PROTOTYPE, 'store.js');
  delete require.cache[require.resolve(file)];
  const S = require(file);
  S.load();
  return { S, mem };
}

module.exports = { uiSuite, loadStore, PROTOTYPE, INDEX_URL, test, assert };
