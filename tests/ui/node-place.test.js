// A node added from the "+ Add node" dropdown lands in the middle of the part of the canvas you can see, on top of the others.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('new nodes land in the middle of the visible canvas, on top', async ({ b, ok }) => {
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const add = async id => { await b.click('[data-combo=addnode] .combo-btn'); await b.click('[data-combo=addnode] .combo-opt[data-id="' + id + '"]'); };
  const scrollTo = (l, t) => b.ev(`(function(){var w=document.getElementById('canvas-wrap'); w.scrollLeft = ${l}; w.scrollTop = ${t}; return JSON.stringify([w.scrollLeft, w.scrollTop])})()`);
  // the last node's centre against the centre of what is visible of the canvas, in screen pixels
  const where = () => b.ev(`(function(){var w=document.getElementById('canvas-wrap'), wr=w.getBoundingClientRect(), n=[].slice.call(document.querySelectorAll('.fnode')).pop().getBoundingClientRect(); var vx=wr.left + w.clientLeft + w.clientWidth / 2, vy=wr.top + w.clientTop + w.clientHeight / 2; return JSON.stringify({dx: Math.round((n.left + n.right) / 2 - vx), dy: Math.round((n.top + n.bottom) / 2 - vy), inside: n.left >= wr.left && n.right <= wr.left + w.clientWidth + 1 && n.top >= wr.top && n.bottom <= wr.top + w.clientHeight + 1})})()`).then(JSON.parse);
  const onTop = () => b.ev(`(function(){var all=document.querySelectorAll('.fnode'), n=all[all.length - 1], r=n.getBoundingClientRect(), e=document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return !!e && n.contains(e)})()`);
  const tops = () => b.ev(`JSON.stringify([].map.call(document.querySelectorAll('.fnode'), function(n){var r=n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]}))`).then(JSON.parse);
  const savedLast = () => b.ev(`JSON.stringify(Store.listFlows().filter(function(f){return f.name==='Newborn first weeks'})[0].nodes.slice(-1).map(function(n){return [n.x, n.y]}))`);

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item[data-id=k1]');
  const n0 = await cnt('.fnode');

  // ---- not scrolled
  await add('type:logic');
  let w = await where();
  ok('a new Logic node is in the middle of the visible canvas (a few pixels sideways at most; a little off vertically only because the node has its own height)', await cnt('.fnode') === n0 + 1 && Math.abs(w.dx) <= 6 && Math.abs(w.dy) <= 45 && w.inside, JSON.stringify(w));
  ok('and it is on top: the node under its centre is the new one', await onTop());

  // ---- scrolled somewhere else: the middle follows what you see
  const sc = JSON.parse(await scrollTo(120, 260));
  ok('(the canvas can scroll both ways here)', sc[0] > 40 && sc[1] > 100, JSON.stringify(sc));
  await add('type:action');
  w = await where();
  ok('scrolled down and to the right, a new Action node is still in the middle of what is visible', Math.abs(w.dx) <= 6 && Math.abs(w.dy) <= 45 && w.inside, JSON.stringify(w));
  ok('on top again', await onTop());
  await scrollTo(0, 0);
  await add('type:input');
  w = await where();
  ok('scrolled back to the start, the next node is in the middle of the start (not where the last one went)', Math.abs(w.dx) <= 6 && Math.abs(w.dy) <= 45 && w.inside, JSON.stringify(w));

  // ---- a node already in the middle: the new one is shifted, but still on top
  const before = await tops();
  await add('type:input');
  const after = await tops();
  const last = after[after.length - 1], prev = before[before.length - 1];
  ok('adding again without moving the canvas does not hide the new node exactly under the old one: it is shifted down and to the right', Math.abs(last[0] - prev[0]) >= 12 && Math.abs(last[1] - prev[1]) >= 12 && last[0] > prev[0], JSON.stringify([prev, last]));
  ok('and it is on top of it', await onTop());

  // ---- templates are placed the same way
  await scrollTo(60, 120);
  await add('type:template');
  w = await where();
  ok('a template node is also placed in the middle of what is visible, on top', Math.abs(w.dx) <= 6 && Math.abs(w.dy) <= 60 && w.inside && await onTop(), JSON.stringify(w));
  await b.click('.fnode.editing [data-action=node-save]');       // a new template node opens for editing: keep the template it got

  // ---- left to right too
  await b.click('.dir-toggle .btn:not(.on)');
  await scrollTo(80, 40);
  await add('type:action');
  w = await where();
  ok('in the left-to-right layout as well', Math.abs(w.dx) <= 6 && Math.abs(w.dy) <= 45 && w.inside && await onTop(), JSON.stringify(w));

  // ---- it stays there
  const pos = await savedLast();
  await b.reload();
  ok('the position is saved: after a reload the node is where it was put', await savedLast() === pos && JSON.parse(pos)[0][0] > 0, pos);
  ok('placing is layout only: the history has "node added" steps and no extra "moved" step', await b.ev(`Store.historyForFlow(Store.listFlows().filter(function(f){return f.name==='Newborn first weeks'})[0].id).every(function(e){return !/moved/i.test(e.action)})`));
}, { size: '1500,700' });
