// The timing above a flow / single-template flow is one line of flowing text: "<n> days <before/after> <reference date> <name>", with no
// borders, boxes or dropdown arrows (the parts stay editable).
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('timing line: "<n> days <before/after> <ref date> <name>" as plain single-line text', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const val = s => b.ev(`document.querySelector(${JSON.stringify(s)}).value`);
  const toast = () => txt('#toast');
  const parts = () => b.ev(`(function(){var c=document.querySelector('.flow-card'); return [c.querySelector('[data-t=days]').value, c.querySelector('.tl-word').textContent, c.querySelector('[data-t=when]').value, c.querySelector('[data-t=ref]').value, c.querySelector('.tl-name').textContent].join(' ')})()`);

  await b.click('.camp-item[data-id=k4]');
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  ok('a single-template flow opens with its line: 240 days before expected_date_of_delivery <its name>', await parts() === '240 days before expected_date_of_delivery ANC welcome and registration', await parts());
  ok('the parts are in that order from left to right, all on one line', await b.ev(`(function(){var c=document.querySelector('.flow-card'), xs=['[data-t=days]','.tl-word','[data-t=when]','[data-t=ref]','.tl-name'].map(function(s){return c.querySelector(s).getBoundingClientRect()}); return xs.every(function(r,i){return i === 0 || (r.left >= xs[i-1].right - 1 && Math.abs((r.top + r.bottom) / 2 - (xs[0].top + xs[0].bottom) / 2) < 6)}) && c.getBoundingClientRect().height < 46})()`));
  ok('it is plain text: no border or background on the line, and none on its parts', await b.ev(`(function(){var c=document.querySelector('.flow-card'), all=[c].concat([].slice.call(c.querySelectorAll('input, select'))); return all.every(function(e){var s=getComputedStyle(e); return ['Top','Right','Bottom','Left'].every(function(k){return s['border'+k+'Width'] === '0px'}) && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.boxShadow === 'none'})})()`));
  ok('no dropdown arrows and no number spinners (the selects have no native appearance)', await b.ev(`[].every.call(document.querySelectorAll('.flow-card select, .flow-card input'), function(e){var s=getComputedStyle(e); return s.appearance === 'none' || s.webkitAppearance === 'none' || s.appearance === 'textfield'})`));
  ok('nothing else is in the card: no "Single template" pill, no "Sent", no heading, no hint, no buttons', !await q('.flow-card .flow-ind') && !await q('.flow-card button') && !/Sent|This template is itself a flow|It is in no flow/.test(await txt('.flow-card')) && await b.ev(`document.querySelector('.flow-card').children.length`) === 2);
  ok('the text is the same size and colour as the surrounding text (it flows)', await b.ev(`(function(){var c=document.querySelector('.flow-card'), cs=getComputedStyle(c), n=getComputedStyle(c.querySelector('[data-t=days]')), r=getComputedStyle(c.querySelector('[data-t=ref]')); return n.fontSize === cs.fontSize && r.fontSize === cs.fontSize && n.color === cs.color && r.color === cs.color})()`));
  ok('each part is only as wide as its text (no empty boxes between the words)', await b.ev(`(function(){var c=document.querySelector('.flow-card'); return c.querySelector('[data-t=days]').getBoundingClientRect().width < 40 && c.querySelector('[data-t=when]').getBoundingClientRect().width < 70})()`));

  // ---- still editable: it just looks like text
  await b.fill('.flow-card [data-t=days]', '200'); await b.key('Enter', 'Enter', 13);
  ok('the number is edited in place (click, type, Enter): 200 days now, saved and shown in the list', await parts() === '200 days before expected_date_of_delivery ANC welcome and registration' && /200 days before/.test(await txt('#content-list .content-item.active')));
  await b.ev(`(function(){var s=document.querySelector('.flow-card [data-t=when]'); s.value='after'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  await b.ev(`(function(){var s=document.querySelector('.flow-card [data-t=ref]'); s.value='baby_dob'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('before/after and the reference date change the same way', await parts() === '200 days after baby_dob ANC welcome and registration', await parts());
  await b.fill('.flow-card [data-t=days]', '1000'); await b.key('Enter', 'Enter', 13);
  ok('an invalid number is refused with a message and the line goes back', /whole number from 0 to 999/.test(await toast()) && await val('.flow-card [data-t=days]') === '200');

  // ---- a flow with a graph has the same line, with the flow's name
  await b.click('.camp-item[data-id=k1]');
  ok('a flow shows its own line: 7 days before expected_date_of_delivery Newborn first weeks, on one line above the toolbar of the canvas', await parts() === '7 days before expected_date_of_delivery Newborn first weeks' && await b.ev(`document.querySelector('.flow-card').getBoundingClientRect().height < 46 && document.querySelector('.flow-card').getBoundingClientRect().top < document.querySelector('.flow-toolbar').getBoundingClientRect().top`), await parts());

  // ---- theme
  const col = () => b.ev(`getComputedStyle(document.querySelector('.flow-card [data-t=days]')).color`);
  await b.setScheme('light'); const light = await col();
  await b.setScheme('dark'); const dark = await col();
  await b.setScheme('light');
  ok('it follows the theme (the text changes colour in dark mode)', light !== dark, light + ' / ' + dark);
});
