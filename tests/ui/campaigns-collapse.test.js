// The campaigns column can be collapsed to a narrow rail that shows the selected campaign's name turned 90 degrees.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('campaigns: collapse to a rail with the selected campaign turned 90 degrees', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const w = s => b.ev(`Math.round(document.querySelector(${JSON.stringify(s)}).getBoundingClientRect().width)`);
  const names = () => b.ev(`[].map.call(document.querySelectorAll('#content-list .content-item .name'), function(n){return n.textContent.replace(/\\s+/g,' ').trim()}).slice(0, 3).join('|')`);
  const idOf = n => b.ev(`Store.listCampaigns().filter(function(k){return k.name===${JSON.stringify(n)}})[0].id`);

  // ---- expanded: a collapse button in the header
  ok('the campaigns header has a collapse button (next to the + button), not pressed', await q('.campaigns .camp-head .camp-toggle') && await q('.campaigns .camp-head [data-action=open-add-campaign]') && await b.ev(`document.querySelector('.camp-toggle').getAttribute('aria-expanded')`) === 'true' && /Collapse/.test(await b.ev(`document.querySelector('.camp-toggle').getAttribute('aria-label')`)));
  const wide = await w('.campaigns'), mainWide = await w('.main');
  ok('expanded: the column is the normal width and lists the campaigns', wide >= 170 && await q('.camp-list') && !await q('.camp-rail'));

  // ---- collapse
  await b.click(`.camp-item[data-id="${await idOf('ANC')}"]`);
  const listBefore = await names();
  await b.click('.camp-toggle');
  ok('collapsing turns the column into a narrow rail: much narrower, the list is gone, and the editor gets the room', await w('.campaigns') <= 50 && await w('.campaigns') < wide - 120 && !await q('.camp-list') && !await q('.camp-item') && await w('.main') > mainWide + 100 && await q('.campaigns.collapsed'), await w('.campaigns'));
  ok('the rail shows the SELECTED campaign\'s name (ANC)', (await txt('.camp-rail-text')).trim() === 'ANC');
  ok('the name is turned the other way: it reads from the bottom up (vertical writing flipped 180 degrees, i.e. rotated 90 degrees counter-clockwise), taller than wide', await b.ev(`(function(){var e=document.querySelector('.camp-rail-text'), r=e.getBoundingClientRect(), s=getComputedStyle(e); return s.writingMode === 'vertical-rl' && s.transform === 'matrix(-1, 0, 0, -1, 0, 0)' && r.height > r.width * 1.5})()`));
  ok('its first letter is at the bottom and its last letter at the top (checked with a range over the characters)', await b.ev(`(function(){var n=document.querySelector('.camp-rail-text').firstChild, r=document.createRange(); r.setStart(n,0); r.setEnd(n,1); var first=r.getBoundingClientRect(); r.setStart(n,n.length-1); r.setEnd(n,n.length); var last=r.getBoundingClientRect(); return first.top > last.top})()`));
  ok('the name fits inside the narrow rail (not cut off sideways)', await b.ev(`(function(){var t=document.querySelector('.camp-rail-text').getBoundingClientRect(), a=document.querySelector('.campaigns').getBoundingClientRect(); return t.left >= a.left && t.right <= a.right})()`));
  ok('collapsing changes nothing else: the same campaign stays selected and the same content is listed', await names() === listBefore && await b.ev(`document.querySelector('#list-title').textContent`) === 'ANC');
  ok('the way back is a button that says so, and it is marked collapsed (not expanded)', await b.ev(`document.querySelector('.camp-expand').getAttribute('aria-expanded')`) === 'false' && /Show the campaigns/.test(await b.ev(`document.querySelector('.camp-expand').getAttribute('aria-label')`)));
  ok('the rail itself is a button with an accessible name that has the campaign', /Campaign: ANC/.test(await b.ev(`document.querySelector('.camp-rail').getAttribute('aria-label')`)) && await b.ev(`document.querySelector('.camp-rail').tagName`) === 'BUTTON');

  // ---- expand again, from either button
  await b.click('.camp-expand');
  ok('the chevron expands it again: the list is back, ANC still selected, same width as before', await q('.camp-list') && !await q('.camp-rail') && await w('.campaigns') === wide && await b.ev(`document.querySelector('.camp-item.active').textContent`) === 'ANC' && await w('.main') === mainWide);
  await b.click('.camp-toggle');
  await b.click('.camp-rail');
  ok('clicking the rotated name expands it too', await q('.camp-list') && !await q('.campaigns.collapsed'));

  // ---- the rail follows the selection
  await b.click('.camp-item[data-id="k1"]');
  await b.click('.camp-toggle');
  ok('the rail shows another campaign when that one is selected (Newborn care)', (await txt('.camp-rail-text')).trim() === 'Newborn care');
  await b.click('.camp-expand');
  await b.click('.camp-item:first-child');
  await b.click('.camp-toggle');
  ok('and "All content" when none is picked', (await txt('.camp-rail-text')).trim() === 'All content');

  // ---- keyboard, add box, and the editor still works while collapsed
  ok('after collapsing the focus is on the toggle (keyboard users keep their place)', await b.ev(`document.activeElement.classList.contains('camp-toggle')`));
  await b.key('Enter', 'Enter', 13);
  ok('Enter on it expands again', await q('.camp-list'));
  await b.click('[data-action=open-add-campaign]');
  ok('with the add-campaign box open there is no collapse button to lose the box (it is closed when the column collapses)', await q('#new-campaign'));
  await b.key('Escape', 'Escape', 27);
  await b.click('.camp-toggle');
  ok('the editor and toolbar work while collapsed (the workflow arrow moves the content)', await q('.stages') && (await b.click('[data-action=stage-next]'), /Moved to/.test(await txt('#toast'))));

  // ---- theme and layout
  const rail = () => b.ev(`getComputedStyle(document.querySelector('.camp-rail')).color`);
  await b.setScheme('light'); const light = await rail();
  await b.setScheme('dark'); const dark = await rail();
  await b.setScheme('light');
  ok('the rail colours are theme variables (the name changes colour in dark mode)', light !== dark, light + ' / ' + dark);
  ok('no horizontal page overflow while collapsed', await b.ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
});
