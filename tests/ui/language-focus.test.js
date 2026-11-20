// The language you are working in gets an outline; the language selected in the history gets the very same outline.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('language outline: the focused language panel and the language selected in the history', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const outline = lang => b.ev(`(function(){var s=getComputedStyle(document.querySelector('.panel.edit[data-lang=${lang}]')); return s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor})()`);
  const outlined = async () => { const r = []; for (const l of ['en', 'hi']) if (!/^none/.test(await outline(l))) r.push(l); return r.join(); };
  const accent = () => b.ev(`(function(){var d=document.createElement('i'); d.style.color='var(--accent)'; document.body.appendChild(d); var c=getComputedStyle(d).color; d.remove(); return c})()`);
  const pickHist = v => b.ev(`(function(){var s=document.querySelector('#history-pane [data-change=hist-lang]'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);

  ok('nothing is outlined while nothing is focused and the history is closed', await outlined() === '');

  // ---- focus
  await b.click('.panel.edit[data-lang=hi] [data-input=text]');
  ok('focusing something inside the Hindi panel outlines the Hindi panel (and only it)', await outlined() === 'hi');
  const focusOutline = await outline('hi');
  ok('the outline is solid, 2px, in the accent colour', focusOutline === 'solid 2px ' + await accent(), focusOutline);
  await b.click('.panel.edit[data-lang=en] [data-input=footer]');
  ok('moving to the English panel moves the outline with it', await outlined() === 'en');
  await b.key('Tab', 'Tab', 9);
  ok('tabbing inside the panel keeps it outlined (the outline is on the panel, not on a field)', await outlined() === 'en');
  await b.ev(`document.activeElement.blur(); document.body.focus(); 0`);
  ok('when the focus leaves the language panels the outline goes', await outlined() === '');

  // ---- history
  await b.click('[data-action=toggle-history-pane]');
  ok('opening the history (Content tab): the language it shows (English, the first) gets the same outline on its panel', await outlined() === 'en' && await outline('en') === focusOutline, await outlined());
  await pickHist('hi');
  ok('selecting Hindi in the history dropdown moves the outline to the Hindi panel, with the same style', await outlined() === 'hi' && await outline('hi') === focusOutline, await outlined());
  await b.click('.panel.edit[data-lang=en] [data-input=text]');
  ok('working in English while the history shows Hindi: both panels are outlined, the same way', await outlined() === 'en,hi' && await outline('en') === await outline('hi'));
  await b.ev(`document.activeElement.blur(); document.body.focus(); 0`);
  await b.click('.hp-tab[data-tab=other]');
  ok('on the Other tab the history has no language selected, so no panel is outlined for it', await outlined() === '');
  await b.click('.hp-tab[data-tab=content]');
  ok('back on the Content tab the selected language (Hindi) is outlined again', await outlined() === 'hi');
  await b.click('[data-action=toggle-history-pane]');
  ok('closing the history removes its outline', await outlined() === '' && !await q('.panel.hist-sel'));

  // ---- dark theme
  await b.click('[data-action=toggle-history-pane]');
  const light = await outline('hi');
  await b.setScheme('dark');
  const dark = await outline('hi');
  ok('the outline colour is a theme variable (it follows the dark accent)', light !== dark && /^solid 2px/.test(dark), light + ' / ' + dark);
  await b.setScheme('light');
});

uiSuite('language lock: a small lock in the toolbar while a language is in focus', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const lockVisible = () => b.ev(`(function(){var e=document.getElementById('lang-lock'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0})()`);
  const tbH = () => b.ev(`Math.round(document.querySelector('.toolbar').getBoundingClientRect().height)`);

  ok('the lock is in the toolbar but not shown while no language is in focus', await q('.toolbar #lang-lock') && !await lockVisible());
  const h0 = await tbH();
  await b.click('.panel.edit[data-lang=hi] [data-input=text]');
  ok('focusing the Hindi panel shows a small lock in the toolbar, naming Hindi', await lockVisible() && /Hindi/.test(await txt('#lang-lock .lock-name')) && await q('#lang-lock svg'));
  ok('it says what it means: other users cannot edit that language meanwhile (tooltip and accessible name)', /Hindi is locked while you are in it: other users cannot edit it/.test(await b.ev(`document.getElementById('lang-lock').title`)) && await b.ev(`document.getElementById('lang-lock').getAttribute('aria-label')`) === await b.ev(`document.getElementById('lang-lock').title`) && await b.ev(`document.getElementById('lang-lock').getAttribute('role')`) === 'status');
  ok('it is small and sits in the toolbar strip: same height as the controls, the icon is 14px, and the toolbar does not grow', await b.ev(`(function(){var l=document.getElementById('lang-lock').getBoundingClientRect(), c=document.querySelector('.toolbar [data-action=csv-one]').getBoundingClientRect(), i=document.querySelector('#lang-lock svg').getBoundingClientRect(); return Math.abs(l.height - c.height) < 1.5 && i.width === 14 && l.width < 140 && l.left > document.querySelector('.stages').getBoundingClientRect().right})()`) && await tbH() === h0);
  await b.type('x');
  ok('typing keeps it (nothing is re-rendered)', await lockVisible() && /Hindi/.test(await txt('#lang-lock .lock-name')));
  await b.click('.panel.edit[data-lang=en] [data-input=footer]');
  ok('moving to the English panel changes the lock to English', await lockVisible() && /English/.test(await txt('#lang-lock .lock-name')) && !/Hindi/.test(await txt('#lang-lock .lock-name')));
  await b.key('Tab', 'Tab', 9);
  ok('tabbing between fields of the same language keeps it', await lockVisible() && /English/.test(await txt('#lang-lock .lock-name')));
  await b.click('[data-action=toggle-history-pane]');
  ok('moving the focus out of the language panels (to the History button / sidebar) removes the lock', !await lockVisible());
  await b.click('.panel.edit[data-lang=hi] [data-input=text]');
  ok('and it comes back when a panel is focused again', await lockVisible());
  await b.ev(`document.activeElement.blur(); document.body.focus(); 0`); await b.settle();
  ok('blurring everything hides it', !await lockVisible());
});
