// The language panels: the default order is English first, then the others alphabetically; they can be reordered by dragging, for this view only.
// The horizontal scrollbar of the row of panels is at the bottom of the screen.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('language panels: default order, temporary reordering by drag, scrollbar at the bottom', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const order = () => b.ev(`[].map.call(document.querySelectorAll('.panels > .panel'), function(p){return p.dataset.lang}).join()`);
  const dataOrder = () => b.ev(`Store.get(document.querySelector('.content-item.active').dataset.id).translations.map(function(t){return t.lang}).join()`);
  const addLang = l => b.ev(`(function(){var s=document.querySelector('[data-change=add-lang]'); s.value='${l}'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  const histOrder = () => b.ev(`[].map.call(document.querySelectorAll('#history-pane [data-change=hist-lang] option'), function(o){return o.value}).join()`);
  const toStart = () => b.ev(`document.querySelector('.panels').scrollLeft = 0; 0`);

  // ---- a template whose languages were added in a different order than the view shows them
  await b.click('[data-action=open-add]'); await b.type('Order test'); await b.click('.add-confirm');
  await addLang('ta'); await addLang('hi');
  ok('the data keeps the order the languages were added in: English, Tamil, Hindi', await dataOrder() === 'en,ta,hi', await dataOrder());
  ok('but they are shown English first, then the others alphabetically by name: English, Hindi, Tamil', await order() === 'en,hi,ta', await order());
  await b.click('.content-item:nth-child(2)');
  ok('the sample (English, Hindi, Kannada) is shown in the same way', await order() === 'en,hi,kn', await order());
  await b.click('.content-item:last-child');

  // ---- reorder by dragging the grip of a panel onto another panel
  ok('every panel has a grip in its head, with a tooltip saying the order is for this view only', await b.ev(`[].every.call(document.querySelectorAll('.panels > .panel'), function(p){var g=p.querySelector('.lang-grip'); return !!g && g.draggable && /not saved/.test(g.title) && g.querySelector('svg')})`));
  await b.drag('.panel.edit[data-lang=ta] .lang-grip', '.panel.edit[data-lang=en]', { fx: 0.2, fy: 0.4 });
  ok('dragging Tamil onto the left half of English puts Tamil first: Tamil, English, Hindi', await order() === 'ta,en,hi', await order());
  ok('only the view changed: the data order is as it was and nothing is unsaved', await dataOrder() === 'en,ta,hi' && !await b.ev(`[].some.call(document.querySelectorAll('.panel.edit .save'), function(s){return !s.disabled})`));
  await b.drag('.panel.edit[data-lang=ta] .lang-grip', '.panel.edit[data-lang=hi]', { fx: 0.8, fy: 0.4 });
  ok('dropping on the right half puts it after: English, Hindi, Tamil', await order() === 'en,hi,ta', await order());
  await b.drag('.panel.edit[data-lang=hi] .lang-grip', '.panel.edit[data-lang=en]', { fx: 0.2, fy: 0.4 });
  ok('and Hindi can go first: Hindi, English, Tamil', await order() === 'hi,en,ta', await order());
  ok('dropping a panel on itself changes nothing', (await b.drag('.panel.edit[data-lang=en] .lang-grip', '.panel.edit[data-lang=en]', { fx: 0.5, fy: 0.4 }).catch(() => {}), await order()) === 'hi,en,ta');

  // ---- the temporary order follows you around, then goes
  await b.fill('.panel.edit[data-lang=ta] [data-input=text]', 'Unsaved Tamil');
  await b.drag('.panel.edit[data-lang=ta] .lang-grip', '.panel.edit[data-lang=hi]', { fx: 0.2, fy: 0.4 });
  ok('reordering keeps unsaved edits (the text is still there, Save still enabled)', await b.ev(`document.querySelector('.panel.edit[data-lang=ta] [data-input=text]').value`) === 'Unsaved Tamil' && !await b.ev(`document.querySelector('.panel.edit[data-lang=ta] .save').disabled`) && await order() === 'ta,hi,en', await order());
  await b.click('.panel.edit[data-lang=ta] .revert');
  await b.click('.content-item:first-child');
  ok('another template is shown in its own default order', await order() === 'en,hi');
  await b.click('.content-item:last-child');
  ok('coming back to this one: the temporary order is still there (while the page stays open)', await order() === 'ta,hi,en', await order());
  await b.click('[data-action=toggle-history-pane]');
  ok('the history\'s language dropdown follows the shown order', await histOrder() === 'ta,hi,en', await histOrder());
  await b.click('[data-action=toggle-history-pane]');
  await b.reload();
  await b.click('.content-item:last-child');
  ok('after a reload the order is the default again: nothing was stored', await order() === 'en,hi,ta', await order());

  // ---- a language added later goes to the end of a temporary order
  await toStart();
  await b.drag('.panel.edit[data-lang=ta] .lang-grip', '.panel.edit[data-lang=en]', { fx: 0.2, fy: 0.4 });
  await addLang('bn'); await addLang('gu');
  ok('languages added while the view is reordered go at the end: Tamil, English, Hindi, Bengali, Gujarati', await order() === 'ta,en,hi,bn,gu', await order());
  await b.click('.content-item:first-child'); await b.click('.content-item:last-child');
  await b.ev(`Store.get(document.querySelector('.content-item.active').dataset.id).translations.length`);

  // ---- the horizontal scrollbar is at the bottom of the screen
  ok('the row of panels fills the room under the toolbar: it ends at the bottom of the window', await b.ev(`Math.round(document.querySelector('.panels').getBoundingClientRect().bottom) >= innerHeight - 1`));
  ok('five panels are wider than the editor, so the row has a horizontal scrollbar, and it is at the bottom of the screen (inside the row, not at the end of a long page)', await b.ev(`(function(){var p=document.querySelector('.panels'); return p.scrollWidth > p.clientWidth + 10 && p.offsetHeight - p.clientHeight > 5 && Math.abs(p.getBoundingClientRect().bottom - innerHeight) < 2})()`));
  ok('the panels scroll vertically inside the row; the editor area itself and the page do not scroll', await b.ev(`(function(){var p=document.querySelector('.panels'), m=document.querySelector('.main'); return p.scrollHeight > p.clientHeight + 50 && getComputedStyle(m).overflow === 'hidden' && document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1})()`));
  ok('the toolbar stays on top while the panels scroll', await b.ev(`(function(){var p=document.querySelector('.panels'); p.scrollTop = 300; return Math.round(document.querySelector('.toolbar').getBoundingClientRect().top - document.querySelector('.main').getBoundingClientRect().top)})()`) === 0);
  await b.ev(`document.querySelector('.panels').scrollLeft = 5000; 0`); await b.settle();
  ok('scrolling to the right reaches the last panel (the row really scrolls sideways)', await b.ev(`(function(){var p=document.querySelector('.panels'), l=p.querySelector('.panel:last-child').getBoundingClientRect(); return p.scrollLeft > 100 && l.right <= p.getBoundingClientRect().right + 1})()`));
  await b.click('[data-action=stage-next]');
  ok('redrawing the page (a click on a workflow arrow) keeps the scroll position of the row', await b.ev(`document.querySelector('.panels').scrollLeft`) > 100 && await b.ev(`document.querySelector('.panels').scrollTop`) > 100);
}, { size: '1900,800' });
