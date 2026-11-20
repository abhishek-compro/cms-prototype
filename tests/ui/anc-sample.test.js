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
  ok('opening one shows it in the editor: English text with the placeholders and their defaults, and the workflow shows Medical', /Hi \{\{name\}\}, your expected date of delivery is \{\{edd\}\}/.test(await b.ev(`document.querySelector('.panel.edit[data-lang=en] [data-input=text]').value`)) && await b.ev(`document.querySelector('.stage.now').textContent.trim()`) === 'Medical' && await cnt('.panel.edit') === 1 && await b.ev(`document.querySelector('.panel.edit [data-input=default][data-name=edd]').value`) === '15 March');

  // ---- the Flows section
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  const flows = await names();
  ok('the Flows tab of the ANC campaign lists the ten messages (each a flow by itself)', flows.length === 10 && flows.every(n => /Single template/.test(n)), flows.join(' | '));
  ok('each shows the "Single template" indicator, and its timing: N days before expected_date_of_delivery', await b.ev(`[].every.call(document.querySelectorAll('#content-list .content-item'), function(li){return /Single template/.test(li.textContent) && /days? before expected_date_of_delivery/.test(li.textContent)})`) && /240 days before expected_date_of_delivery/.test(await txt('#content-list .content-item:first-child')) && /7 days before expected_date_of_delivery/.test(await txt('#content-list .content-item:last-child')), (await txt('#content-list .content-item:first-child')));
  await b.click('#content-list .content-item:nth-child(3)');
  ok('opening one in the Flows tab shows its timing card (EDD based) above the template editor', /Sent/.test(await txt('.flow-card')) && await b.ev(`document.querySelector('.flow-card [data-t=days]').value`) === '196' && await b.ev(`document.querySelector('.flow-card [data-t=ref]').value`) === 'expected_date_of_delivery' && await q('.panel.edit'));
  await b.click('.camp-item:first-child');
  ok('under All content the ten also appear in the Flows tab (after the flow and the other single-template flow)', (await names()).length === 12 && (await names())[0] === 'Newborn first weeks');

  // ---- published? the ten are valid and publishable
  ok('none of the ten has problems (they can be published)', await b.ev(`Store.contentsIn(${JSON.stringify(await ancId())}).every(function(c){return Store.problems(c, Store.partsOf(c.translations[0])).length === 0 && Store.canDeploy(c, c.translations[0]) === null})`));
});
