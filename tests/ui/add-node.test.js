// The flow toolbar's "+ Add node" dropdown lists the node TYPES only (Template, Flow, Logic, Action, Input), plain labels, searchable.
// A template node can be added more than once (the same template twice), and the template is chosen in the node itself.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flow toolbar: the + Add node dropdown (node types only) and duplicate template nodes', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const nodes = () => cnt('.fnode');
  const visible = () => b.ev(`[].filter.call(document.querySelectorAll('[data-combo=addnode] .combo-opt'), function(li){return li.style.display !== 'none'}).map(function(li){return li.querySelector('.combo-name').textContent}).join('|')`);
  const open = () => b.click('[data-combo=addnode] .combo-btn');
  const search = async t => { await b.fill('[data-combo=addnode] .combo-search', t); };
  const pick = async type => { await open(); await b.click('[data-combo=addnode] .combo-opt[data-id="type:' + type + '"]'); };
  const tplNodes = name => b.ev(`[].filter.call(document.querySelectorAll('.fnode'), function(n){return n.classList.contains('template') ? false : false}).length + [].filter.call(document.querySelectorAll('.fnode'), function(n){var t=n.querySelector('.fnode-body'); return /Template/.test(n.textContent) && n.textContent.indexOf(${JSON.stringify(name)}) !== -1}).length`);
  const storeTemplates = () => b.ev(`Store.listFlows().filter(function(f){return f.name==='Newborn first weeks'})[0].nodes.filter(function(n){return n.type==='template'}).map(function(n){return Store.get(n.templateId).name})`);

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item[data-id=k1]');

  // ---- the dropdown: node types only
  ok('the toolbar has ONE "+ Add node" dropdown (no separate add buttons)', await cnt('.flow-bar [data-combo]') === 1 && /\+ Add node/.test(await txt('[data-combo=addnode] .combo-btn')) && !await q('[data-action=add-node]'));
  await open();
  ok('it opens a list with a search box on top (focused)', await q('[data-combo=addnode].open .combo-search') && await b.ev(`document.activeElement.classList.contains('combo-search')`));
  ok('the list has the node types only: Template, Flow, Logic, Action, Input', await visible() === 'Template|Flow|Logic|Action|Input', await visible());
  ok('no list of templates or flows inside it, and no group headings', !await q('[data-combo=addnode] .combo-group') && (await cnt('[data-combo=addnode] .combo-opt')) === 5 && !/Welcome message|Appointment reminder|Daily health tip|ANC/.test(await txt('[data-combo=addnode] .combo-pop')));
  ok('no descriptions: each option is just its name (no "branch on conditions" and the like)', await b.ev(`[].every.call(document.querySelectorAll('[data-combo=addnode] .combo-opt'), function(li){return li.children.length === 1 && li.textContent.trim() === li.querySelector('.combo-name').textContent.trim()})`) && !/branch|define|starts|already/.test(await txt('[data-combo=addnode] .combo-pop')));
  ok('"Flow" is greyed out here: this is the only flow, so there is no other flow it could call', await b.ev(`document.querySelector('[data-combo=addnode] .combo-opt[data-id="type:flow"]').classList.contains('disabled')`));

  // ---- still searchable
  await search('log');
  ok('typing filters the types: "log" leaves just Logic', await visible() === 'Logic', await visible());
  await search('T');
  ok('any part of a name, capitals ignored: "t" finds Template, Action and Input', await visible() === 'Template|Action|Input', await visible());
  await search('zzzz');
  ok('nothing matches: the list says so', await b.ev(`getComputedStyle(document.querySelector('[data-combo=addnode] .combo-empty')).display`) === 'block' && await visible() === '');
  await search('');
  ok('clearing the search brings all five back', await visible() === 'Template|Flow|Logic|Action|Input');

  // ---- the simple types
  const n0 = await nodes();
  await search('action'); await b.key('Enter', 'Enter', 13);
  ok('Enter on the first match adds it: "action" adds an Action node (the list closes, a toast says so)', await nodes() === n0 + 1 && !await q('[data-combo=addnode].open') && /Action node added/.test(await txt('#toast')));
  await pick('input');
  ok('Input adds an Input node', await nodes() === n0 + 2 && /Input node added/.test(await txt('#toast')));
  await pick('logic');
  ok('Logic adds a Logic node', await nodes() === n0 + 3 && /Logic node added/.test(await txt('#toast')));
  ok('none of those opens the editor (they are added ready to use)', !await q('.fnode.editing'));

  // ---- a template node: added, then the template is chosen in the node
  const before = await storeTemplates();
  await pick('template');
  ok('Template adds a template node and opens it for editing, with its template picker ready (the template is chosen there, not in the dropdown)', await nodes() === n0 + 4 && await q('.fnode.editing') && await q('.fnode.editing .combo[data-combo=node] .combo-btn') && await b.ev(`document.activeElement.classList.contains('combo-btn')`));
  ok('it starts with a template the flow does not have yet', (await storeTemplates()).length === before.length + 1 && !before.includes((await storeTemplates())[before.length]), JSON.stringify(await storeTemplates()));
  await b.click('.fnode.editing .combo[data-combo=node] .combo-btn');
  ok('the picker in the node lists every template, none greyed out: the templates the flow already has can be chosen again', await b.ev(`(function(){var o=document.querySelectorAll('.fnode.editing .combo[data-combo=node] .combo-opt'); return o.length >= 13 && [].every.call(o, function(li){return !li.classList.contains('disabled')}) && !/already in this flow/.test(document.querySelector('.fnode.editing .combo-pop').textContent)})()`));
  await b.click('.fnode.editing .combo[data-combo=node] .combo-opt[data-id="' + await b.ev(`Store.list().filter(function(c){return c.name==='Welcome message'})[0].id`) + '"]');
  await b.click('.fnode.editing [data-action=node-save]');
  ok('choosing Welcome message (already in this flow) and saving works: the flow now has two Welcome message nodes', (await storeTemplates()).filter(n => n === 'Welcome message').length === 2 && !await q('.fnode.editing'), JSON.stringify(await storeTemplates()));
  ok('both are on the canvas, side by side as separate nodes', await b.ev(`[].filter.call(document.querySelectorAll('.fnode'), function(n){return n.textContent.indexOf('Welcome message') !== -1}).length`) === 2);

  // ---- adding a template node twice in a row
  await pick('template'); await b.click('.fnode.editing [data-action=node-save]');
  await pick('template');
  ok('a Template node can be added again and again (each starts with a template the flow lacks, or the first one when it has them all)', await nodes() === n0 + 6 && await q('.fnode.editing'));
  await b.click('.fnode.editing [data-action=node-cancel]');
  ok('✕ keeps the node as it was added (it exists; only the editing is cancelled)', await nodes() === n0 + 6 && !await q('.fnode.editing'));

  // ---- a flow node: needs another flow
  await b.click('[data-action=open-add]'); await b.type('Second flow'); await b.click('.add-confirm');
  await b.click('.camp-item:first-child');
  await b.click('#content-list .flow-item[data-kind=flow]:nth-child(2)');
  const sn = await nodes();
  await open();
  ok('with two flows, Flow is enabled in the dropdown', !await b.ev(`document.querySelector('[data-combo=addnode] .combo-opt[data-id="type:flow"]').classList.contains('disabled')`));
  await b.click('[data-combo=addnode] .combo-opt[data-id="type:flow"]');
  ok('Flow adds a node that calls the other flow and opens it for editing (the flow is chosen in the node)', await nodes() === sn + 1 && await q('.fnode.editing') && /Flow call added|Flow node added/.test(await txt('#toast')) && await q('.fnode.editing .combo[data-combo=fnode] .combo-btn'));
  await b.click('.fnode.editing [data-action=node-save]');

  // ---- the i button is gone
  ok('there is no i button or hint on the flow toolbar any more', !await q('.flow-bar .info-btn') && !await q('#flow-help'));

  // ---- look and feel
  ok('the popup is not cut off by the window, and Escape closes it', await (async () => { await open(); const r = await b.ev(`(function(){var p=document.querySelector('[data-combo=addnode] .combo-pop').getBoundingClientRect(); return p.right <= innerWidth && p.bottom <= innerHeight + 2})()`); await b.key('Escape', 'Escape', 27); return r && !await q('[data-combo=addnode].open'); })());
  const colr = () => b.ev(`getComputedStyle(document.querySelector('[data-combo=addnode] .combo-btn')).backgroundColor`);
  await b.setScheme('light'); const light = await colr();
  await b.setScheme('dark'); const dark = await colr();
  await b.setScheme('light');
  ok('it follows the theme', light !== dark, light + ' / ' + dark);
});
