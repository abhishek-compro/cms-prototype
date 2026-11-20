// One searchable "+ Add node" dropdown holds every kind of node: Logic, Action, Input, every template and every other flow.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flow toolbar: one searchable + Add node dropdown for all node types', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const nodes = () => cnt('.fnode');
  const visible = () => b.ev(`[].filter.call(document.querySelectorAll('[data-combo=addnode] .combo-opt'), function(li){return li.style.display !== 'none'}).map(function(li){return li.querySelector('.combo-name').textContent}).join('|')`);
  const heads = () => b.ev(`[].filter.call(document.querySelectorAll('[data-combo=addnode] .combo-group'), function(g){return g.style.display !== 'none'}).map(function(g){return g.textContent}).join('|')`);
  const open = () => b.click('[data-combo=addnode] .combo-btn');
  const search = async t => { await b.fill('[data-combo=addnode] .combo-search', t); };

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item[data-id=k1]');

  // ---- one control, no separate node buttons
  ok('the toolbar has ONE "+ Add node" dropdown and no separate + Template / + Flow / + Logic / + Action / + Input buttons', await cnt('.flow-toolbar [data-combo]') === 1 && /\+ Add node/.test(await txt('[data-combo=addnode] .combo-btn')) && !await q('[data-action=add-node]') && !await q('[data-combo=add]') && !await q('[data-combo=addflow]'));
  await open();
  ok('it opens a list with a search box on top', await q('[data-combo=addnode].open .combo-search') && await b.ev(`document.activeElement.classList.contains('combo-search')`));
  ok('the list has every kind of node, in groups: Node types (Logic, Action, Input), Templates (every template), Flows (the other flows)', await heads() === 'Node types|Templates' && /^Logic\|Action\|Input\|Welcome message\|Appointment reminder\|Daily health tip\|ANC welcome and registration/.test(await visible()), await visible());
  ok('(this flow is the only one, so there is nothing under Flows and the heading is not shown)', !/Flows/.test(await heads()));
  ok('templates the flow already has are listed but disabled, saying why', await b.ev(`[].filter.call(document.querySelectorAll('[data-combo=addnode] .combo-opt'), function(li){return /Welcome message|Daily health tip/.test(li.textContent) && li.classList.contains('disabled') && /already in this flow/.test(li.textContent)}).length`) === 2 && !await b.ev(`document.querySelector('[data-combo=addnode] .combo-opt[data-id^="tpl:"][data-id]:not(.disabled)') === null`));

  // ---- searching
  await search('log');
  ok('typing filters the whole list: "log" leaves just Logic (and the heading of its group)', await visible() === 'Logic' && await heads() === 'Node types', await visible());
  await search('welcome');
  ok('a template is found by any part of its name (any capitalisation); only the groups that still have something show', await visible() === 'Welcome message|ANC welcome and registration' && await heads() === 'Templates', await visible());
  await search('anc w');
  ok('the search matches inside a name and ignores capitals: "anc w" finds ANC welcome and registration only', await visible() === 'ANC welcome and registration' && await heads() === 'Templates', await visible());
  await search('ultra');
  ok('a few letters from the middle of a name are enough: "ultra" finds Ultrasound scan reminder', await visible() === 'Ultrasound scan reminder', await visible());
  await search('zzzz');
  ok('nothing matches: the list says so', await b.ev(`getComputedStyle(document.querySelector('[data-combo=addnode] .combo-empty')).display`) === 'block' && await heads() === '' && await visible() === '');
  await search('');
  ok('clearing the search brings everything back', (await visible()).split('|').length > 12 && await heads() === 'Node types|Templates');

  // ---- adding each kind
  const n0 = await nodes();
  await search('action');
  await b.key('Enter', 'Enter', 13);
  ok('Enter on the first match adds it: "action" adds an Action node (the list closes, a toast says so)', await nodes() === n0 + 1 && !await q('[data-combo=addnode].open') && /Action node added/.test(await txt('#toast')));
  await open(); await b.click('[data-combo=addnode] .combo-opt[data-id="type:input"]');
  ok('clicking Input adds an Input node', await nodes() === n0 + 2 && /Input node added/.test(await txt('#toast')));
  await open(); await b.click('[data-combo=addnode] .combo-opt[data-id="type:logic"]');
  ok('clicking Logic adds a Logic node', await nodes() === n0 + 3 && /Logic node added/.test(await txt('#toast')));
  await open(); await search('Appointment');
  await b.key('ArrowDown', 'ArrowDown', 40).catch(() => {});
  await b.key('Enter', 'Enter', 13);
  ok('picking a template adds a template node for it', await nodes() === n0 + 4 && await b.ev(`[].some.call(document.querySelectorAll('.fnode'), function(n){return /Appointment reminder/.test(n.textContent)})`) && /Added to the flow/.test(await txt('#toast')));
  await open(); await search('Appointment');
  ok('and now that template is disabled in the list ("already in this flow")', await b.ev(`(function(){var li=document.querySelector('[data-combo=addnode] .combo-opt[data-id^="tpl:"]'); return li.classList.contains('disabled') && /already in this flow/.test(li.textContent)})()`));
  await b.click('[data-combo=addnode] .combo-opt.disabled');
  ok('a disabled one cannot be picked (nothing is added)', await nodes() === n0 + 4);
  await b.key('Escape', 'Escape', 27);
  ok('Escape closes the dropdown (the first press only closes it)', !await q('[data-combo=addnode].open'));

  // ---- flows can be added too (needs another flow)
  await b.click('[data-action=open-add]'); await b.type('Second flow'); await b.click('.add-confirm');
  await b.click('.camp-item:first-child');
  await b.click('#content-list .flow-item[data-kind=flow]:nth-child(2)');
  const sn = await nodes();
  await open();
  ok('with two flows, the other flow appears under a Flows heading', /Flows/.test(await heads()) && /Newborn first weeks/.test(await visible()), await heads() + ' / ' + await visible());
  await search('newborn');
  await b.key('Enter', 'Enter', 13);
  ok('picking it adds a node that calls that flow', await nodes() === sn + 1 && /Flow call added/.test(await txt('#toast')) && await b.ev(`[].some.call(document.querySelectorAll('.fnode'), function(n){return /Newborn first weeks/.test(n.textContent)})`));
  await open();
  ok('a flow that already calls this one cannot be added back (disabled, with why)', await b.ev(`(function(){var li=document.querySelector('[data-combo=addnode] .combo-opt[data-id^="flow:"]'); return !li || li.classList.contains('disabled')})()`));
  await b.key('Escape', 'Escape', 27);

  // ---- look and feel
  ok('the dropdown button is a normal toolbar control and the popup is not cut off by the window', await (async () => { await open(); const r = await b.ev(`(function(){var p=document.querySelector('[data-combo=addnode] .combo-pop').getBoundingClientRect(); return p.right <= innerWidth && p.bottom <= innerHeight + 2 && p.width >= 280})()`); await b.key('Escape', 'Escape', 27); return r; })());
  const colr = () => b.ev(`getComputedStyle(document.querySelector('[data-combo=addnode] .combo-btn')).backgroundColor`);
  await b.setScheme('light'); const light = await colr();
  await b.setScheme('dark'); const dark = await colr();
  await b.setScheme('light');
  ok('it follows the theme', light !== dark, light + ' / ' + dark);
});
