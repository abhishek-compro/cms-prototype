// The Flows list is a table: every entry is a row of aligned columns (grip | icon | n days | before/after | reference date | name),
// and the demo flow opens top down.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flows list as a table: aligned columns; the demo flow opens top down', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const edge = (sel, side) => b.ev(`JSON.stringify([].map.call(document.querySelectorAll(${JSON.stringify('#content-list .flow-item ' + sel)}), function(e){return Math.round(e.getBoundingClientRect().${side} * 10) / 10}))`).then(JSON.parse);
  const same = a => a.length > 3 && a.every(x => Math.abs(x - a[0]) < 0.6);

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  const rows = await b.ev(`document.querySelectorAll('#content-list .flow-item').length`);
  ok('under All content the Flows list has the flow and the single-template flows as rows (a flow, Appointment reminder and the ten ANC messages)', rows === 12, rows);
  ok('the list is a table: a grid of six columns (grip, icon, days, before/after, date, name), every row is a subgrid of it, so the columns are shared', await b.ev(`(function(){var l=document.getElementById('content-list'), g=getComputedStyle(l); return g.display === 'grid' && g.gridTemplateColumns.split(' ').length === 6 && [].every.call(l.querySelectorAll('.flow-item'), function(li){return getComputedStyle(li).display === 'grid' && /^subgrid/.test(getComputedStyle(li).gridTemplateColumns) && li.children.length === 6})})()`));
  ok('every row has the same six cells in the same order', await b.ev(`[].every.call(document.querySelectorAll('#content-list .flow-item'), function(li){return [].map.call(li.children, function(c){return c.className.split(' ')[0]}).join() === 'drag-handle,fi-ind,fi-days,fi-when,fi-ref,name'})`));

  // ---- the columns line up, whatever is in them (240 days, 7 days, a flow with no icon, a template with one)
  ok('the grips line up (same left edge in every row)', same(await edge('.drag-handle', 'left')));
  ok('the icon column lines up (a flow has none, a single-template flow has one: still the same column)', same(await edge('.fi-ind', 'left')));
  ok('the days are right-aligned: "7 days" and "240 days" end at the same place', same(await edge('.fi-days', 'right')));
  ok('"before / after" starts at the same place in every row', same(await edge('.fi-when', 'left')));
  ok('the reference dates start at the same place in every row', same(await edge('.fi-ref', 'left')));
  ok('and so do the names', same(await edge('.name', 'left')));
  ok('the rows are the same height, one line each', await b.ev(`(function(){var h=[].map.call(document.querySelectorAll('#content-list .flow-item'), function(li){return Math.round(li.getBoundingClientRect().height)}); return h.every(function(x){return x === h[0]}) && h[0] < 40})()`));
  ok('the rows read as the sentence: 240 days before expected_date_of_delivery ANC welcome and registration', await b.ev(`document.querySelector('#content-list .flow-item:nth-child(3)').textContent.replace(/\\s+/g, ' ').trim()`) === '240 days before expected_date_of_delivery ANC welcome and registration');
  ok('the numbers of different lengths do not push the other columns (7 days and 240 days: same x for the date)', await b.ev(`(function(){var a=document.querySelector('#content-list .flow-item:nth-child(1) .fi-ref').getBoundingClientRect().left, c=document.querySelector('#content-list .flow-item:nth-child(3) .fi-ref').getBoundingClientRect().left; return Math.abs(a - c) < 0.6})()`));

  // ---- searching keeps it a table
  await b.click('[data-action=open-search]'); await b.type('iron');
  ok('searching keeps the table: one row, still the six columns', await b.ev(`document.querySelectorAll('#content-list .flow-item').length`) === 1 && await b.ev(`getComputedStyle(document.getElementById('content-list')).gridTemplateColumns.split(' ').length`) === 6);
  await b.key('Escape', 'Escape', 27);

  // ---- the demo flow opens top down
  await b.click('.camp-item[data-id=k1]');
  ok('the demo flow opens with "Top down" selected', await b.ev(`document.querySelector('.dir-toggle .btn.on').textContent.trim()`) === '↓ Top down' && await b.ev(`document.querySelector('.dir-toggle .btn.on').getAttribute('aria-pressed')`) === 'true');
  ok('its steps are laid out downwards: the input first, then the welcome template, then the logic node, in one column', await b.ev(`(function(){var y=function(t){var n=[].filter.call(document.querySelectorAll('.fnode'), function(x){return x.textContent.indexOf(t) !== -1})[0].getBoundingClientRect(); return [n.left, n.top]}; var i=y('Input 1'), w=y('Welcome message'), l=y('Logic 1'); return i[1] < w[1] && w[1] < l[1] && Math.abs(i[0] - w[0]) < 2 && Math.abs(w[0] - l[0]) < 2})()`));
  await b.click('.dir-toggle .btn:not(.on)');
  ok('and left to right is still there (and still laid out left to right)', await b.ev(`document.querySelector('.dir-toggle .btn.on').textContent.trim()`) === '→ Left to right' && await b.ev(`(function(){var x=function(t){return [].filter.call(document.querySelectorAll('.fnode'), function(n){return n.textContent.indexOf(t) !== -1})[0].getBoundingClientRect().left}; return x('Input 1') < x('Welcome message') && x('Welcome message') < x('Logic 1')})()`));
  await b.click('[data-action=open-add]'); await b.type('Brand new flow'); await b.click('.add-confirm');
  ok('a flow you create is not forced: it starts left to right (only the demo flow is top down)', await b.ev(`document.querySelector('.dir-toggle .btn.on').textContent.trim()`) === '→ Left to right');
});
