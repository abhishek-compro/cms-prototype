// The content / flows column can be made narrower or wider by dragging its right edge.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('content column: resize by dragging its edge', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const w = s => b.ev(`Math.round(document.querySelector(${JSON.stringify(s)}).getBoundingClientRect().width * 10) / 10`);
  const near = (a, e, tol = 2.5) => Math.abs(a - e) <= tol;
  const drag = dx => b.pointerDrag('.list-resizer', [dx, 0], { steps: 8 });

  // ---- the handle
  ok('the column has a resize handle on its right edge (a vertical separator, keyboard reachable, col-resize cursor)', await q('.sidebar .list-resizer') && await b.ev(`document.querySelector('.list-resizer').getAttribute('role')`) === 'separator' && await b.ev(`document.querySelector('.list-resizer').tabIndex`) === 0 && await b.ev(`getComputedStyle(document.querySelector('.list-resizer')).cursor`) === 'col-resize' && await b.ev(`(function(){var h=document.querySelector('.list-resizer').getBoundingClientRect(), s=document.querySelector('.sidebar').getBoundingClientRect(); return Math.abs(h.right - s.right) < 1.5 && h.height >= s.height - 1 && h.width <= 10})()`));
  const w0 = await w('.sidebar'), main0 = await w('.main'), camp0 = await w('.campaigns');
  ok('by default the Templates column is 260px wide', near(w0, 260, 3), w0);

  // ---- wider and narrower
  await drag(120);
  const w1 = await w('.sidebar');
  ok('dragging the edge 120px to the right makes the column 120px wider; the editor gives up the same room and the campaigns column does not change', near(w1, w0 + 120) && near(await w('.main'), main0 - 120, 3) && near(await w('.campaigns'), camp0, 1), w0 + ' -> ' + w1);
  await drag(-200);
  const w2 = await w('.sidebar');
  ok('dragging 200px to the left makes it narrower (it follows the pointer)', near(w2, w1 - 200) && await w('.main') > main0, w1 + ' -> ' + w2);
  await drag(-1000);
  ok('it cannot be made narrower than 180px', near(await w('.sidebar'), 180, 1.5), await w('.sidebar'));
  await drag(3000);
  const wMax = await w('.sidebar');
  ok('nor so wide that the editor disappears: the editor keeps at least 360px', await w('.main') >= 355 && wMax > 400, wMax + ' / main ' + await w('.main'));
  ok('the page does not overflow sideways while resizing', await b.ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
  await drag(-3000); await drag(150);

  // ---- names are never truncated, however narrow the column is made
  await drag(-1000);
  ok('Templates at the narrowest width: every name is shown in full (wrapped over lines, nothing cut off, no ellipsis)', await b.ev(`[].every.call(document.querySelectorAll('#content-list .content-item .name'), function(n){var s=getComputedStyle(n); return s.textOverflow !== 'ellipsis' && n.scrollWidth <= n.clientWidth + 1})`) && await b.ev(`document.querySelector('#content-list .content-item:nth-child(4) .name').textContent.trim()`) === 'ANC welcome and registration');
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await drag(-3000);
  ok('Flows at the narrowest width: no name or date is cut off with an ellipsis; the text keeps its full width', await b.ev(`[].every.call(document.querySelectorAll('#content-list .flow-item > span, #content-list .flow-item > .name'), function(n){var s=getComputedStyle(n); return s.textOverflow !== 'ellipsis' && s.overflow !== 'hidden' && n.scrollWidth <= n.clientWidth + 1})`));
  ok('instead the list scrolls sideways: it is wider than the column and can be scrolled to see the end of the longest name', await b.ev(`(function(){var l=document.getElementById('content-list'); l.scrollLeft = 10000; var n=l.querySelector('.flow-item:nth-child(12) .name').getBoundingClientRect(), r=l.getBoundingClientRect(); return l.scrollWidth > l.clientWidth + 100 && l.scrollLeft > 100 && n.right <= r.right + 1})()`));
  ok('the whole name is really there: the longest one, "Healthy diet in late pregnancy", fits inside the scrollable width', await b.ev(`(function(){var l=document.getElementById('content-list'), n=[].filter.call(l.querySelectorAll('.name'), function(x){return x.textContent === 'Healthy diet in late pregnancy'})[0]; return !!n && n.getBoundingClientRect().width >= 150})()`));
  // ---- clicking an item (the page is redrawn) must not throw the list back to the start
  await b.ev(`(function(){var l=document.getElementById('content-list'); l.scrollLeft = 10000; l.scrollTop = 0; return 1})()`); await b.settle();
  const sl0 = await b.ev(`document.getElementById('content-list').scrollLeft`);
  const pt = await b.ev(`(function(){var l=document.getElementById('content-list').getBoundingClientRect(), n=document.querySelector('#content-list .flow-item:nth-child(4) .name').getBoundingClientRect(); return [(Math.max(n.left, l.left) + Math.min(n.right, l.right)) / 2, (n.top + n.bottom) / 2]})()`);   // the visible part of the name
  await b.clickAt(pt[0], pt[1]);
  ok('clicking a flow item keeps the list scrolled where it was: the horizontal position is the same after the click (it did go back to the start)', sl0 > 100 && Math.abs(await b.ev(`document.getElementById('content-list').scrollLeft`) - sl0) <= 1 && await q('#content-list .flow-item.active'), sl0 + ' -> ' + await b.ev(`document.getElementById('content-list').scrollLeft`));
  ok('and the item was selected (it is the active one, the editor shows it)', await b.ev(`document.querySelectorAll('#content-list .flow-item')[3].classList.contains('active')`));
  await b.ev(`document.getElementById('content-list').scrollLeft = 80; 0`); await b.settle();
  await b.click('[data-action=toggle-history-pane]');
  ok('any other redraw (opening the history) keeps the position too', Math.abs(await b.ev(`document.getElementById('content-list').scrollLeft`) - 80) <= 1);
  await b.click('[data-action=toggle-history-pane]');
  await b.click('[data-action=set-list-tab][data-tab=templates]'); await b.click('[data-action=set-list-tab][data-tab=flows]');
  ok('switching tabs starts the other list at its start (the position belongs to the list you redraw)', await b.ev(`document.getElementById('content-list').scrollLeft`) === 0);
  await drag(-3000);
  await b.ev(`document.getElementById('content-list').scrollLeft = 0; 0`);
  await drag(3000);
  ok('wide again: the rows fill the width of the column (the selected row\'s highlight reaches the edge) and there is no sideways scrolling', await b.ev(`(function(){var l=document.getElementById('content-list'), r=l.querySelector('.flow-item').getBoundingClientRect(), lr=l.getBoundingClientRect(); return l.scrollWidth <= l.clientWidth + 1 && r.right >= lr.right - 16})()`));
  await b.click('[data-action=set-list-tab][data-tab=templates]');
  await drag(-3000); await drag(150);

  // ---- the list and its fixed parts follow the new width
  ok('the tabs, the search and + buttons and the list all take the column\'s width (nothing is cut off at the edge)', await b.ev(`(function(){var s=document.querySelector('.sidebar').getBoundingClientRect(); return ['.list-tabs','#side-tools','#content-list'].every(function(q){var r=document.querySelector(q).getBoundingClientRect(); return r.right <= s.right + 1 && r.left >= s.left - 1})})()`));
  ok('the handle moves with the edge', await b.ev(`Math.abs(document.querySelector('.list-resizer').getBoundingClientRect().right - document.querySelector('.sidebar').getBoundingClientRect().right) < 1.5`));

  // ---- one width per tab
  const tplW = await w('.sidebar');
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  const flowsDefault = await w('.sidebar');
  ok('the Flows tab has its own width (its default fits the longest entry), not the one set for Templates', Math.abs(flowsDefault - tplW) > 30, tplW + ' vs ' + flowsDefault);
  await drag(-120);
  const flowsW = await w('.sidebar');
  ok('and can be resized on its own: dragging 120px to the left makes it 120px narrower', near(flowsW, flowsDefault - 120), flowsDefault + ' -> ' + flowsW);
  await b.click('[data-action=set-list-tab][data-tab=templates]');
  ok('back in Templates the width set there is still there', near(await w('.sidebar'), tplW, 1.5), await w('.sidebar'));
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  ok('and in Flows too', near(await w('.sidebar'), flowsW, 1.5), await w('.sidebar'));
  await b.click('[data-action=set-list-tab][data-tab=templates]');

  // ---- it is remembered, the page redraws without losing it
  await b.click('.content-item:nth-child(2)');
  ok('picking an item (the page is redrawn) keeps the width', near(await w('.sidebar'), tplW, 1.5));
  await b.reload();
  ok('after a reload the widths are still there (remembered in this browser)', near(await w('.sidebar'), tplW, 1.5), await w('.sidebar'));

  // ---- reset and keyboard
  await b.ev(`document.querySelector('.list-resizer').dispatchEvent(new MouseEvent('dblclick', {bubbles: true})); 0`); await b.settle();
  ok('a double-click on the handle resets the width to the default (260px)', near(await w('.sidebar'), 260, 3), await w('.sidebar'));
  await b.ev(`document.querySelector('.list-resizer').focus(); 0`);
  await b.key('ArrowRight', 'ArrowRight', 39);
  ok('with the handle focused, the right arrow makes the column 16px wider', near(await w('.sidebar'), 276, 3), await w('.sidebar'));
  await b.key('ArrowLeft', 'ArrowLeft', 37); await b.key('ArrowLeft', 'ArrowLeft', 37);
  ok('the left arrow makes it narrower again (16px per press)', near(await w('.sidebar'), 244, 3), await w('.sidebar'));
  await b.ev(`(function(){var h=document.querySelector('.list-resizer'); h.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', shiftKey: true, bubbles: true})); return 1})()`); await b.settle();
  ok('Shift + arrow moves it by 64px', near(await w('.sidebar'), 308, 3), await w('.sidebar'));
  await b.key('Home', 'Home', 36);
  ok('Home resets it', near(await w('.sidebar'), 260, 3), await w('.sidebar'));

  // ---- it works with the other panes too
  await b.click('[data-action=toggle-history-pane]');
  await drag(100);
  ok('with the history open the column can still be resized, and the history keeps its width', near(await w('.sidebar'), 360, 3) && await b.ev(`document.getElementById('history-pane').getBoundingClientRect().width`) > 300, await w('.sidebar'));
  await b.click('[data-action=toggle-history-pane]');
  await b.click('.camp-toggle');
  await drag(-60);
  ok('and with the campaigns collapsed', near(await w('.sidebar'), 300, 3) && await w('.campaigns') <= 50, await w('.sidebar'));
  await b.click('.camp-expand');
  ok('selecting nothing: a drag on the handle does not select text or start dragging a list item', await b.ev(`window.getSelection().toString()`) === '' && !await q('.dragging'));
});
