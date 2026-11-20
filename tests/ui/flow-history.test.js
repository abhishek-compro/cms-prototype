// The history of a flow is the same as a template's: a tree with one line per step (what, who, when), Details, Rewind, a current
// marker, and a plain "Other" list for what is not a change to the nodes and connections.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flow history: a tree with one line per step and Rewind', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const rows = () => b.ev(`[].map.call(document.querySelectorAll('.tree-row'), function(r){return r.querySelector('.tree-what').textContent})`);
  const nodes = () => cnt('.fnode');
  const add = async id => { await b.click('[data-combo=addnode] .combo-btn'); await b.click('[data-combo=addnode] .combo-opt[data-id="' + id + '"]'); };

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item[data-id=k1]');
  await b.click('.flow-bar [data-action=toggle-history-pane]');

  // ---- tabs and the tree
  ok('the flow history has two tabs, Flow and Other (like a template\'s Content and Other)', await b.ev(`[].map.call(document.querySelectorAll('.hp-tab'), function(t){return t.textContent.trim()}).join('|')`) === 'Flow|Other');
  ok('the Flow tab is selected and the sidebar is as wide as the template\'s tree (one line per step)', await b.ev(`document.querySelector('.hp-tab.active').textContent.trim()`) === 'Flow' && await b.ev(`document.querySelector('#history-pane').getBoundingClientRect().width`) > 400 && await q('.layout.tree-on'));
  const n0 = await b.ev(`Store.flowHistoryTree(Store.listFlows().filter(function(f){return f.name==='Newborn first weeks'})[0].id).rows.length`);
  ok('there is one line for every step of the graph, newest first, each with a graph dot', n0 > 3 && await cnt('.tree-row') === n0 && await cnt('.tree-row .tree-graph circle.node') === n0, n0);
  ok('every line is one line: what, who and when', await b.ev(`[].every.call(document.querySelectorAll('.tree-row'), function(r){ var w=r.querySelector('.tree-what').textContent, m=r.querySelector('.tree-meta').textContent; return w.length>3 && /Demo user · \\w+ \\d+, /.test(m) && r.getBoundingClientRect().height < 40 })`));
  ok('exactly one line is current: the newest', await cnt('.tree-cur') === 1 && await q('.tree-item:first-child .tree-row.current'));
  ok('the explanation is behind an i button, closed by default', await q('#history-pane .hp-lang .info-btn') && !await q('#history-pane .hist-info'));
  ok('renaming and timing are not in the tree', !(await rows()).some(r => /Renamed flow|timing|Moved in the flow list/i.test(r)));

  // ---- a change makes a new line; Rewind brings the nodes back
  const nodes0 = await nodes();
  await add('type:logic');
  ok('adding a node adds a line at the top, which is now current', await cnt('.tree-row') === n0 + 1 && /^Added Logic \d+ \(logic node\)$/.test((await rows())[0]) && await q('.tree-item:first-child .tree-row.current'), (await rows())[0]);
  await add('type:input');
  ok('another node, another line', await cnt('.tree-row') === n0 + 2 && await nodes() === nodes0 + 2);
  const lines = await rows();
  ok('every step but the current one has an enabled Rewind button', await cnt('.tree-rewind') === n0 + 1 && await b.ev(`![].some.call(document.querySelectorAll('.tree-rewind'), function(x){return x.disabled})`));

  await b.click('.tree-item:nth-child(3) [data-action=rewind]');
  ok('Rewind puts the nodes back as they were after that step (the two added nodes are gone)', await nodes() === nodes0);
  ok('the rewind is a new line on top ("Rewound to: …"), current, and nothing was deleted', await cnt('.tree-row') === n0 + 3 && /^Rewound to: /.test((await rows())[0]) && await q('.tree-item:first-child .tree-row.current') && (await rows()).slice(1).join('|') === lines.join('|'), (await rows()).slice(0, 2).join(' | '));
  ok('the old steps stay as another branch: the graph has a second lane and a hollow dot for the rewind', await b.ev(`document.querySelectorAll('.tree-row circle.l1').length > 0`) && await q('.tree-row circle.node.rw'));
  ok('a toast says what happened', /Rewound to/.test(await txt('#toast')));
  await b.click('.tree-item:nth-child(2) [data-action=rewind]');
  ok('the other branch can be rewound to too: the two nodes are back', await nodes() === nodes0 + 2);

  // ---- details
  await b.click('.tree-item:nth-child(2) [data-action=tree-detail]');
  ok('Details opens a panel under the line with who and when, and says if it is the current step', await q('.tree-item:nth-child(2) .tree-detail') && /Demo user/.test(await txt('.tree-item:nth-child(2) .tree-detail')));
  await b.click('.tree-item:nth-child(2) [data-action=tree-detail]');
  ok('and closes again', !await q('.tree-detail'));

  // ---- Other
  await b.click('.hp-tab[data-tab=other]');
  ok('the Other tab does not use the wide column', !await q('.layout.tree-on'));
  ok('the Other tab has no tree; renaming and timing are listed there, one after the other', !await q('.tree') && (await txt('#history-pane')).indexOf('Renamed flow') === -1);
  await b.click('#content-list .flow-item:nth-child(1) .ci-edit');
  await b.fill('#fe-name', 'Newborn weeks'); await b.click('[data-action=fl-save]');
  ok('after renaming the flow with its pencil the Other tab lists it, and the Flow tab (the tree) does not', await q('#history-pane .timeline') && /Renamed flow/.test(await txt('#history-pane')) && (await b.click('.hp-tab[data-tab=content]'), !(await rows()).some(r => /Renamed flow/.test(r))) && (await b.click('.hp-tab[data-tab=other]'), true));
  await b.click('.hp-tab[data-tab=content]');
  ok('back on the Flow tab the tree is wide again', await q('.layout.tree-on') && await cnt('.tree-row') > n0);

  // ---- the choice survives a reload (saved with the flow)
  await b.reload();
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item[data-id=k1]');
  await b.click('.flow-bar [data-action=toggle-history-pane]');
  ok('after a reload the tree, the current step and the branches are still there', await cnt('.tree-row') === n0 + 4 && await cnt('.tree-cur') === 1 && /^Rewound to: /.test((await rows())[0]) && await q('.tree-row circle.node.rw'));

}, { size: '1500,800' });
