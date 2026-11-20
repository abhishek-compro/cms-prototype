// The content column: only the list scrolls; the Templates / Flows tabs, the search and + buttons and the list title stay where they are.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('content list: only the list scrolls (tabs, search and + stay fixed)', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const top = s => b.ev(`Math.round(document.querySelector(${JSON.stringify(s)}).getBoundingClientRect().top)`);
  const scroll = (s, n) => b.ev(`document.querySelector(${JSON.stringify(s)}).scrollTop = ${n}; document.querySelector(${JSON.stringify(s)}).scrollTop`);
  const fixed = () => b.ev(`JSON.stringify(['.list-tabs','#side-tools','#list-title'].map(function(s){var r=document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]}))`);

  await b.click('.camp-item:first-child');                      // All content: 13 items, more than a short window shows
  ok('the list is longer than the room it has (so it has to scroll)', await b.ev(`(function(){var l=document.getElementById('content-list'); return l.scrollHeight > l.clientHeight + 50})()`));
  ok('the list is the thing that scrolls (overflow auto) and the column itself does not (no scrollbar on it)', await b.ev(`getComputedStyle(document.getElementById('content-list')).overflowY`) === 'auto' && await b.ev(`(function(){var s=document.querySelector('.sidebar'); return getComputedStyle(s).overflowY === 'hidden' && s.scrollHeight <= s.clientHeight + 1})()`));
  const before = await fixed();
  const moved = await scroll('#content-list', 400);
  ok('scrolling the list moves the list', moved > 200 && await top('.content-item:first-child') < 0 + await top('#content-list'));
  ok('the Templates / Flows tabs, the search and + buttons and the title do not move', await fixed() === before && await b.ev(`document.querySelector('.sidebar').scrollTop`) === 0, before + ' vs ' + await fixed());
  ok('they stay visible: the tabs and the two buttons are inside the window at the top of the column', await b.ev(`(function(){var s=document.querySelector('.sidebar').getBoundingClientRect(); return ['.list-tabs','[data-action=open-search]','[data-action=open-add]'].every(function(q){var r=document.querySelector(q).getBoundingClientRect(); return r.top >= s.top && r.bottom <= s.top + 140})})()`));
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  ok('the same in the Flows tab: the list scrolls under fixed tabs and buttons', await b.ev(`getComputedStyle(document.getElementById('content-list')).overflowY`) === 'auto' && await q('#side-tools') && await b.ev(`document.querySelector('.sidebar').scrollTop`) === 0);
  const f2 = await fixed();
  await scroll('#content-list', 300);
  ok('...and scrolling it there moves nothing else either', await fixed() === f2);
  await b.click('[data-action=open-search]');
  ok('the search box opens in place (the buttons area is not clipped by the column)', await q('#search') && await b.ev(`(function(){var s=document.getElementById('search').getBoundingClientRect(), c=document.querySelector('.sidebar').getBoundingClientRect(); return s.top >= c.top && s.bottom <= c.bottom && s.width > 100})()`));
  await b.key('Escape', 'Escape', 27);
  await b.click('[data-action=set-list-tab][data-tab=templates]');
  await scroll('#content-list', 100000);
  const atEnd = await b.ev(`document.getElementById('content-list').scrollTop`);
  await b.click('.content-item:last-child');
  ok('picking an item far down the list does not throw the list back to the top (the page is redrawn, the list keeps its place)', atEnd > 200 && Math.abs(await b.ev(`document.getElementById('content-list').scrollTop`) - atEnd) < 3);
  ok('...and that item is in view, with the fixed parts unmoved', await b.ev(`(function(){var l=document.getElementById('content-list').getBoundingClientRect(), a=document.querySelector('.content-item.active').getBoundingClientRect(); return a.bottom <= l.bottom + 1 && a.top >= l.top - 1})()`));
}, { size: '1500,600' });
