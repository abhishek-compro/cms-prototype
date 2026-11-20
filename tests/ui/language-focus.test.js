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
