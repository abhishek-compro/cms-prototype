// The top of a flow (not a single template): ONE cohesive toolbar (the + Add node dropdown and the direction icons; comments and
// History at the right). No name, no timing, no summary: those are edited with the pencil of the flow's row in the Flows list.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flow top section: one cohesive toolbar', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const rect = s => b.ev(`(function(){var r=document.querySelector(${JSON.stringify(s)}).getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,h:r.height,w:r.width}})()`);
  const midY = async s => { const r = await rect(s); return (r.t + r.b) / 2; };

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item[data-id=k1]');

  // ---- nothing but the toolbar above the canvas
  ok('the flow\'s section has no name heading, no timing line, no summary and no "Rename": only the toolbar above the canvas', !await q('.flow-head') && !await q('.content-head') && !await q('.flow-card') && !await q('.timing-line') && !await q('.main h2') && !/Newborn first weeks|days before|templates ·|Campaign:|Rename/.test(await txt('.main')) && await q('.main > .toolbar.flow-bar'));
  ok('the toolbar is directly followed by the canvas, so the section starts with it (about one control high)', await b.ev(`(function(){var tb=document.querySelector('.flow-bar').getBoundingClientRect(), cv=document.getElementById('canvas-wrap').getBoundingClientRect(), m=document.querySelector('.main').getBoundingClientRect(); return tb.top - m.top <= 2 && cv.top - tb.bottom <= 2 && tb.height >= 44 && tb.height <= 50})()`));

  // ---- one line
  ok('everything is on ONE line: + Add node, the two direction icons, then (right) comments and History', await (async () => {
    const sels = ['[data-combo=addnode] .combo-btn', '.dir-toggle .btn:first-child', '.dir-toggle .btn:last-child', '.flow-bar .cm-open', '.flow-bar [data-action=toggle-history-pane]'];
    const ys = []; for (const s of sels) ys.push(await midY(s));
    return ys.every(y => Math.abs(y - ys[0]) < 3);
  })());
  ok('in that order from the left, with comments and History at the right edge', await b.ev(`(function(){var x=function(s){return document.querySelector(s).getBoundingClientRect()}, tb=x('.flow-bar'); var ord=['[data-combo=addnode] .combo-btn','.dir-toggle .btn:first-child','.dir-toggle .btn:last-child','.flow-bar .cm-open','.flow-bar [data-action=toggle-history-pane]'].map(function(s){return x(s).left}); return ord.every(function(v,i){return i === 0 || v > ord[i-1]}) && tb.right - x('.flow-bar [data-action=toggle-history-pane]').right < 3})()`));

  // ---- cohesive: the same strip as the template editor's toolbar
  ok('it is the same kind of bar as the template editor\'s toolbar: white, a bottom border, 46px controls, square corners', await b.ev(`(function(){var tb=getComputedStyle(document.querySelector('.flow-bar')); return tb.backgroundColor === 'rgb(255, 255, 255)' && tb.borderBottomWidth === '1px' && [].every.call(document.querySelectorAll('.flow-bar .btn, .flow-bar .combo-btn'), function(e){var s=getComputedStyle(e); return Math.round(e.getBoundingClientRect().height) === 46 && s.borderRadius === '0px'})})()`));
  ok('the controls touch each other (no gaps between the dropdown and the direction icons, nor between those icons)', await b.ev(`(function(){var a=document.querySelector('[data-combo=addnode] .combo-btn').getBoundingClientRect(), d=document.querySelectorAll('.dir-toggle .btn'), r1=d[0].getBoundingClientRect(), r2=d[1].getBoundingClientRect(); return r1.left - a.right <= 2 && r2.left - r1.right <= 1})()`));

  // ---- the direction switch has icons, no labels
  ok('the direction switch has no text labels: two icon buttons (an arrow right, an arrow down), named for assistive technology and in tooltips', await b.ev(`[].every.call(document.querySelectorAll('.dir-toggle .btn'), function(x){return x.textContent.trim() === '' && !!x.querySelector('svg')})`) && await b.ev(`[].map.call(document.querySelectorAll('.dir-toggle .btn'), function(x){return x.getAttribute('aria-label') + '|' + x.title}).join()`) === 'Left to right|Left to right,Top down|Top down' && !/Left to right|Top down/.test(await txt('.flow-bar')));
  ok('the one in use is shown pressed (the demo flow is top down)', await b.ev(`document.querySelector('.dir-toggle .btn.on').getAttribute('aria-label')`) === 'Top down' && await b.ev(`document.querySelector('.dir-toggle .btn.on').getAttribute('aria-pressed')`) === 'true');
  await b.click('.dir-toggle .btn:not(.on)');
  ok('clicking the other one switches the flow to left to right (and back)', await b.ev(`document.querySelector('.dir-toggle .btn.on').getAttribute('aria-label')`) === 'Left to right' && (await b.click('.dir-toggle .btn:not(.on)'), await b.ev(`document.querySelector('.dir-toggle .btn.on').getAttribute('aria-label')`) === 'Top down'));

  // ---- no i button, no hint
  ok('there is no i button and no hint text on the flow toolbar', !await q('.flow-bar .info-btn') && !await q('#flow-help') && !await q('.flow-help') && !/Drag a node|Drag from the output/.test(await txt('.main')));

  // ---- everything still works
  const before = await b.ev(`document.querySelectorAll('.fnode').length`);
  await b.click('[data-combo=addnode] .combo-btn'); await b.click('[data-combo=addnode] .combo-opt[data-id="type:logic"]');
  ok('+ Add node → Logic adds a node', await b.ev(`document.querySelectorAll('.fnode').length`) === before + 1);
  await b.click('.flow-bar .cm-open');
  ok('the comments button opens the comments sidebar for the flow', await q('#comments-pane'));
  await b.click('.flow-bar .cm-open');
  await b.click('.flow-bar [data-action=toggle-history-pane]');
  ok('History opens the history (the button then leaves the bar, like before)', await q('#history-pane') && !await q('.flow-bar [data-action=toggle-history-pane]'));
  await b.click('[data-action=toggle-history-pane]');

  // ---- a single-template flow has no flow bar: it is the template editor
  await b.click('.camp-item[data-id=k4]');
  ok('a single-template flow shows the template editor with its own toolbar (no flow bar, no name / timing line)', await q('.panel.edit') && !await q('.flow-bar') && !await q('.flow-card'));

  // ---- theme
  await b.click('.camp-item[data-id=k1]');
  const col = () => b.ev(`getComputedStyle(document.querySelector('.flow-bar')).backgroundColor`);
  await b.setScheme('light'); const light = await col();
  await b.setScheme('dark'); const dark = await col();
  await b.setScheme('light');
  ok('it follows the theme', light !== dark);
});
