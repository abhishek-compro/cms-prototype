// Campaigns sidebar (far left): filtering the content list, creating content inside a campaign, data saved before campaigns, reset.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('campaigns sidebar: filter, create under a campaign, legacy data, reset', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const names = () => b.ev(`[].map.call(document.querySelectorAll('.content-item .name'), e => e.childNodes[0].textContent.trim()).join(', ')`);
  const camps = () => b.ev(`[].map.call(document.querySelectorAll('.camp-item'), e => e.textContent.trim()).join(' | ')`);
  const h2 = () => b.ev(`(document.querySelector('.content-item.active .name')||{}).textContent || ''`);   // the open template = the selected item in the list (the editor has no name heading)
  const title = () => b.ev(`document.getElementById('list-title').textContent`);
  const reload = async () => { await b.ev(`location.reload(); 0`); await b.sleep(900); };

  await b.ev(`localStorage.clear(); 0`); await reload();
  ok('campaigns sidebar lists names (All content first)', await camps() === 'All content | Newborn care | Postnatal check-ups | Immunisation', await camps());
  const x = await b.ev(`(function(){var c=document.querySelector('.campaigns').getBoundingClientRect(), s=document.querySelector('.sidebar').getBoundingClientRect(), m=document.querySelector('.main').getBoundingClientRect(); return [c.left,c.right,s.left,s.right,m.left].map(Math.round).join(',')})()`);
  const [cl, cr, sl, sr, ml] = x.split(',').map(Number);
  ok('campaigns sidebar is left-most, then the content sidebar, then main (' + x + ')', cl === 0 && cr <= sl + 1 && sr <= ml + 1 && cr > 100, x);
  ok('default: All content active, all 3 names, list title "All content"',
    await b.ev(`document.querySelector('.camp-item.active').textContent`) === 'All content' && await names() === 'Welcome message, Appointment reminder, Daily health tip' && await title() === 'All content', await names());

  await b.click('[data-action=select-campaign][data-id=k1]');
  ok('Newborn care filters the list (2 names), title follows', await names() === 'Welcome message, Daily health tip' && await title() === 'Newborn care', await names());
  ok('current selection kept when it is in the campaign', await h2() === 'Welcome message', await h2());
  ok('the template header has no name heading and no description line (no campaign list either)', !await q('.content-head') && !await q('.main h2') && !/Template name base/.test(await b.ev(`document.querySelector('.main').textContent`)));

  await b.click('[data-action=select-campaign][data-id=k2]');
  ok('Postnatal: 1 name and the editor switches to it', await names() === 'Appointment reminder' && await h2() === 'Appointment reminder', await names() + ' / ' + await h2());

  await b.click('[data-action=select-campaign][data-id=k3]');
  ok('empty campaign: no names, helpful empty state in main, no crash',
    await names() === '' && /No content in this campaign yet/.test(await b.ev(`document.querySelector('.main').textContent`)) && !await q('.toolbar'), await names());

  await b.click('[data-action=open-add]'); await b.type('Polio drops'); await b.click('.add-confirm');
  ok('adding while a campaign is selected files it there, selects it, says so in the toast',
    await names() === 'Polio drops' && await h2() === 'Polio drops' && /in Immunisation/.test(await b.ev(`document.getElementById('toast').textContent`)), await names());

  await b.click('[data-action=select-campaign][data-id=""]');
  ok('All content shows everything incl. the new one (4)', (await names()).split(', ').length === 4, await names());

  await b.click('[data-action=select-campaign][data-id=k1]');
  await b.click('[data-action=open-search]'); await b.type('daily');
  ok('search applies within the campaign', await names() === 'Daily health tip', await names());
  await b.key('Escape', 'Escape', 27);
  ok('Escape clears search; the campaign filter remains', await names() === 'Welcome message, Daily health tip' && await title() === 'Newborn care', await names());

  await b.ev(`document.querySelector('[data-action=select-campaign][data-id=k2]').focus(); 0`);
  await b.key('Enter', 'Enter', 13);
  ok('campaign buttons are keyboard accessible (Enter selects)', await title() === 'Postnatal check-ups', await title());

  await b.click('[data-action=select-campaign][data-id=""]');
  await b.click('[data-action=open-add]'); await b.type('Loose note'); await b.click('.add-confirm');
  ok('adding under All content creates content without a campaign (no Campaign label)',
    await h2() === 'Loose note');

  await reload();
  ok('after reload content keeps its campaign (Immunisation has Polio drops)',
    await b.ev(`JSON.parse(localStorage.getItem('cms-prototype-v1')).contents.filter(c=>c.campaignIds.indexOf('k3')!==-1).map(c=>c.name).join()`) === 'Polio drops');
  ok('CSV header unchanged (no campaign column)', await b.ev(`Store.toCsv().split('\\r\\n')[0]`) === 'name,language,wa_template_name,text');

  // data saved before campaigns existed (this is what an existing browser holds)
  await b.ev(`(function(){var s=JSON.parse(localStorage.getItem('cms-prototype-v1')); delete s.campaigns; s.contents.forEach(function(c){delete c.campaignIds;}); localStorage.setItem('cms-prototype-v1', JSON.stringify(s)); return 1})()`);
  await reload();
  ok('legacy data: campaigns appear and existing content is kept',
    await camps() === 'All content | Newborn care | Postnatal check-ups | Immunisation' && (await names()).split(', ').length >= 5, await camps() + ' / ' + await names());
  await b.click('[data-action=select-campaign][data-id=k1]');
  ok('legacy sample content is filed under its campaign', await names() === 'Welcome message, Daily health tip', await names());
  await b.click('[data-action=select-campaign][data-id=""]');
  ok('legacy user-made content stays reachable under All content', /Polio drops/.test(await names()) && /Loose note/.test(await names()), await names());

  await b.click('[data-action=select-campaign][data-id=k2]');
  await b.ev(`window.confirm = function(){return true}; 0`);
  await b.click('[data-action=reset]');
  ok('Reset demo data returns to All content with the sample data', await title() === 'All content' && (await names()).split(', ').length === 3, await title());
});
