// The top of a flow (not a single template), simplified: one header row, one toolbar row, hints behind an i button.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flow top section: simplified header row and toolbar row', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const rect = s => b.ev(`(function(){var r=document.querySelector(${JSON.stringify(s)}).getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,h:r.height}})()`);
  const midY = async s => { const r = await rect(s); return (r.t + r.b) / 2; };

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item[data-id=k1]');

  // ---- the header row
  ok('the header is ONE row: the name, a small pencil, the timing as text, and the comments icon and History at the right, all on one line', await (async () => {
    const ys = [await midY('.flow-head h2'), await midY('.flow-head [data-action=rename-start]'), await midY('.flow-head [data-t=days]'), await midY('.flow-head .cm-open'), await midY('.flow-head [data-action=toggle-history-pane]')];
    return ys.every(y => Math.abs(y - ys[0]) < 8);
  })());
  ok('left to right: name, pencil, timing, then (right edge) comments and History', await b.ev(`(function(){var x=function(s){return document.querySelector('.flow-head '+s).getBoundingClientRect().left}; return x('h2') < x('[data-action=rename-start]') && x('[data-action=rename-start]') < x('[data-t=days]') && x('[data-t=days]') < x('.cm-open') && x('.cm-open') < x('[data-action=toggle-history-pane]')})()`));
  ok('no "Flow · 2 templates · 1 logic…" summary line, no "Campaign:" line and no text "Rename" link: the header has just the name, the timing and two buttons', !/templates|Campaign:|Rename/.test(await txt('.flow-head')) && !await q('.content-head'));
  ok('what used to be in that line is in the name\'s tooltip', /Flow · 2 templates · 1 logic · 1 action · 1 input · Campaign: Newborn care/.test(await b.ev(`document.querySelector('.flow-head h2').title`)));
  ok('the timing is not repeated with the name', !await q('.flow-head .tl-name') && (await txt('.flow-head h2')) === 'Newborn first weeks');

  // ---- the toolbar row
  ok('the toolbar is ONE row: + Template…, + Flow…, + Logic, + Action, + Input, the direction switch and an i button, all on one line', await (async () => {
    const sels = ['[data-combo=add] .combo-btn', '[data-combo=addflow] .combo-btn', '[data-action=add-node][data-type=logic]', '[data-action=add-node][data-type=action]', '[data-action=add-node][data-type=input]', '.dir-toggle', '.flow-toolbar .info-btn'];
    const ys = []; for (const s of sels) ys.push(await midY(s));
    return ys.every(y => Math.abs(y - ys[0]) < 8);
  })());
  ok('the hint about dragging is not on screen; an i button holds it', !await q('#flow-help') && await b.ev(`document.querySelector('.flow-toolbar .info-btn').getAttribute('aria-expanded')`) === 'false' && !/Drag a node/.test(await txt('.main')));
  await b.click('.flow-toolbar .info-btn');
  ok('clicking the i button shows the hint under the toolbar; clicking again hides it', await q('#flow-help') && /Drag a node by its header/.test(await txt('#flow-help')) && await b.ev(`document.querySelector('.flow-toolbar .info-btn').getAttribute('aria-expanded')`) === 'true' && (await b.click('.flow-toolbar .info-btn'), !await q('#flow-help')));

  // ---- it takes much less room
  ok('everything above the canvas takes about 100px or less (it was over 190px)', await b.ev(`document.getElementById('canvas-wrap').getBoundingClientRect().top - document.querySelector('.main').getBoundingClientRect().top`) <= 110);
  ok('the rows are not tall: header and toolbar are each about one control high', (await rect('.flow-head')).h < 50 && (await rect('.flow-toolbar')).h < 56);

  // ---- everything still works
  await b.click('.flow-head [data-action=rename-start]');
  ok('the pencil turns the name into a text box with ✓ and ✕, right there', await q('.flow-head #rename-input') && await b.ev(`document.getElementById('rename-input').value`) === 'Newborn first weeks' && await q('.flow-head [data-action=rename-save]') && await q('.flow-head [data-action=rename-cancel]') && !await q('.flow-head h2'));
  await b.fill('#rename-input', 'First weeks'); await b.key('Enter', 'Enter', 13);
  ok('Enter saves the new name: the heading and the list show it', await txt('.flow-head h2') === 'First weeks' && /First weeks/.test(await txt('#content-list .flow-item')));
  await b.click('.flow-head [data-action=rename-start]'); await b.fill('#rename-input', 'Nope'); await b.key('Escape', 'Escape', 27);
  ok('Escape cancels it', await txt('.flow-head h2') === 'First weeks' && !await q('#rename-input'));
  const before = await b.ev(`document.querySelectorAll('.fnode').length`);
  await b.click('[data-action=add-node][data-type=logic]');
  ok('+ Logic still adds a node', await b.ev(`document.querySelectorAll('.fnode').length`) === before + 1);
  await b.click('.dir-toggle .btn:not(.on)');
  ok('the direction switch still works', await b.ev(`document.querySelector('.dir-toggle .btn.on').textContent.trim()`) === '→ Left to right');
  await b.click('.flow-head .cm-open');
  ok('and the comments button opens the comments sidebar for the flow', await q('#comments-pane'));
  await b.click('.flow-head .cm-open');
  await b.click('.flow-head [data-action=toggle-history-pane]');
  ok('and History opens the history (the button then leaves the header, like before)', await q('#history-pane') && !await q('.flow-head [data-action=toggle-history-pane]'));
  await b.click('[data-action=toggle-history-pane]');

  // ---- a single-template flow keeps its own line (it has no heading): the timing with its name
  await b.click('.camp-item[data-id=k4]');
  ok('a single-template flow is unchanged: its line has the timing and the template\'s name', await b.ev(`(function(){var c=document.querySelector('.flow-card'); return !!c.querySelector('.tl-name') && c.querySelector('.tl-name').textContent === 'ANC welcome and registration' && !document.querySelector('.flow-head')})()`));

  // ---- theme
  await b.click('.camp-item[data-id=k1]');
  const col = () => b.ev(`getComputedStyle(document.querySelector('.flow-head h2')).color`);
  await b.setScheme('light'); const light = await col();
  await b.setScheme('dark'); const dark = await col();
  await b.setScheme('light');
  ok('it follows the theme', light !== dark);
});
