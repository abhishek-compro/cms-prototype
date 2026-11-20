// The ANC sample: ten medical messages timed from the expected date of delivery, shown in the content list and in the Flows tab.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('ANC sample: ten medical messages in the ANC campaign, each also a flow in the Flows tab', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const names = () => b.ev(`[].map.call(document.querySelectorAll('#content-list .content-item .name'), function(n){return n.textContent.replace(/\\s+/g,' ').trim()})`);
  const ancId = () => b.ev(`Store.listCampaigns().filter(function(k){return k.name==='ANC'})[0].id`);

  ok('the campaigns list has an ANC campaign', /ANC/.test(await txt('.campaigns')) && await q('.camp-item[data-id]'));
  await b.click(`.camp-item[data-id="${await ancId()}"]`);
  const list = await names();
  ok('picking ANC lists its ten messages, in the order they are sent (earliest first)', list.length === 10 && list[0] === 'ANC welcome and registration' && list[9] === 'Delivery is close', list.join(' | '));
  ok('each of them sits with the Medical group', await b.ev(`Store.contentsIn(${JSON.stringify(await ancId())}).every(function(c){return c.stage === 'medical'})`));
  await b.click('.content-item:nth-child(10)');
  ok('opening one shows it in the editor: English text with the placeholders and their defaults, and the workflow shows Medical', /Hi \{\{name\}\}, your expected date of delivery is \{\{edd\}\}/.test(await b.ev(`document.querySelector('.panel.edit[data-lang=en] [data-input=text]').value`)) && await b.ev(`document.querySelector('.stage.now').textContent.trim()`) === 'Medical' && await cnt('.panel.edit') === 3 && await b.ev(`[].map.call(document.querySelectorAll('.panel.edit'), function(p){return p.dataset.lang}).join()`) === 'en,hi,kn' && await b.ev(`document.querySelector('.panel.edit [data-input=default][data-name=edd]').value`) === '15 March');

  // ---- the Flows section
  const tplW = await b.ev(`Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)`);
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  const flows = await names();
  ok('the Flows tab of the ANC campaign lists the ten messages (each a flow by itself), in send order', flows.length === 10 && flows[0] === 'ANC welcome and registration' && flows[9] === 'Delivery is close', flows.join(' | '));
  ok('the content column is wider in the Flows tab than in the Templates tab (room for the one-line entries), but not unlimited', await b.ev(`Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)`) > tplW + 100 && await b.ev(`document.querySelector('.sidebar').getBoundingClientRect().width`) <= 700, tplW + ' -> ' + await b.ev(`Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)`));
  ok('each entry is one line of text: "<n> days before expected_date_of_delivery <name>" (the first: 240 days, the last: 7 days)', await b.ev(`[].every.call(document.querySelectorAll('#content-list .content-item'), function(li){return /^\\d+ days? before expected_date_of_delivery .+/.test(li.textContent.replace(/\\s+/g, ' ').trim())}) && document.querySelector('#content-list .content-item:first-child').textContent.replace(/\\s+/g, ' ').trim() === '240 days before expected_date_of_delivery ANC welcome and registration' && /^7 days before expected_date_of_delivery Delivery is close$/.test(document.querySelector('#content-list .content-item:last-child').textContent.replace(/\\s+/g, ' ').trim())`));
  ok('the single-template indicator is a plain small icon with no text (its meaning is the tooltip / accessible name), no pill or box', await b.ev(`[].every.call(document.querySelectorAll('#content-list .content-item'), function(li){var i=li.querySelector('.flow-ind'), s=i && getComputedStyle(i); return !!i && i.querySelector('svg') && i.textContent.trim() === '' && /itself a flow/.test(i.getAttribute('aria-label')) && /itself a flow/.test(i.title) && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderTopWidth === '0px'}) && !/Single template/.test(document.getElementById('content-list').textContent)`));
  ok('the entries have no borders, and the selected one is marked by its background only', await b.ev(`[].every.call(document.querySelectorAll('#content-list .flow-item'), function(li){var s=getComputedStyle(li); return ['Top','Right','Bottom','Left'].every(function(k){return s['border'+k+'Width'] === '0px'})}) && getComputedStyle(document.querySelector('#content-list .flow-item.active')).backgroundColor !== 'rgba(0, 0, 0, 0)'`));
  ok('the Flows tab makes room: every entry fits on its line (nothing wrapped, nothing cut off), one line high', await b.ev(`[].every.call(document.querySelectorAll('#content-list .content-item'), function(li){var n=li.querySelector('.name'), r=li.querySelector('.fi-ref'); return n.scrollWidth <= n.clientWidth + 1 && r.scrollWidth <= r.clientWidth + 1 && li.getBoundingClientRect().height < 40})`));
  await b.click('#content-list .content-item:nth-child(3)');
  ok('opening one in the Flows tab shows its timing as one line of plain text above the template editor: 196 days before expected_date_of_delivery <name>', await b.ev(`document.querySelector('.flow-card [data-t=days]').value`) === '196' && await b.ev(`document.querySelector('.flow-card [data-t=when]').value`) === 'before' && await b.ev(`document.querySelector('.flow-card [data-t=ref]').value`) === 'expected_date_of_delivery' && (await txt('.flow-card .tl-name')) === 'Iron and folic acid tablets' && await q('.panel.edit'));
  await b.click('.camp-item:first-child');
  ok('under All content the ten also appear in the Flows tab (after the flow and the other single-template flow)', (await names()).length === 12 && (await names())[0] === 'Newborn first weeks');

  // ---- published? the ten are valid and publishable
  ok('none of the ten has problems (they can be published)', await b.ev(`Store.contentsIn(${JSON.stringify(await ancId())}).every(function(c){return Store.problems(c, Store.partsOf(c.translations[0])).length === 0 && Store.canDeploy(c, c.translations[0]) === null})`));
});
