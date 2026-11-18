// Rewinding a template's history: an undo tree (like Emacs' undo-tree) drawn as a git-like graph, one line per step.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('rewind: the Tree tab, current marker, rewinding as a new step, branches', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const rows = () => b.ev(`[].map.call(document.querySelectorAll('.tree-row'), function(r){return r.querySelector('.tree-what').textContent})`);
  const body = () => b.ev(`document.querySelector('.panel.edit [data-input=text]').value`);
  const eventsCount = () => b.ev(`Store.historyFor(Store.list()[0].id,'all').length`);
  const saveText = async t => { await b.fill('.panel.edit [data-input=text]', t); await b.click('.panel.edit .save'); };
  const rewindBtn = i => `.tree-row:nth-child(${i}) [data-action=rewind]`;

  await b.click('[data-action=toggle-history-pane]');
  ok('the sidebar has a Tree tab after the language tab and Other', await b.ev(`[].map.call(document.querySelectorAll('.hp-tab'), function(t){return t.textContent.trim()}).join('|')`) === 'English|Other|Tree');
  await b.click('[data-tab=tree]');
  ok('the Tree tab is selected and the sidebar gets wider to fit one line per step', await b.ev(`document.querySelector('[data-tab=tree]').getAttribute('aria-selected')`) === 'true' && await b.ev(`document.querySelector('#history-pane').getBoundingClientRect().width`) > 400);
  const n0 = await eventsCount();
  ok('there is one line for every step of the template (all languages and name-level steps), newest first', await cnt('.tree-row') === n0 && n0 > 10, n0);
  ok('every line says what, who and when, on one line', await b.ev(`[].every.call(document.querySelectorAll('.tree-row'), function(r){ var w=r.querySelector('.tree-what').textContent, m=r.querySelector('.tree-meta').textContent; return w.length>3 && /Demo user · \\w+ \\d+, /.test(m) && r.getBoundingClientRect().height < 40 })`));
  ok('lines name the language and the part: "Hindi · published as welcome_message_v1", "English · edited the buttons"', (await rows()).some(r => /^Hindi · published as welcome_message_v1/.test(r)) && (await rows()).some(r => /^English · edited the buttons/.test(r)), (await rows()).join(' | '));
  ok('exactly one line is marked current, the newest', await cnt('.tree-cur') === 1 && await q('.tree-row:first-child .tree-cur') && await q('.tree-row.current'));
  ok('each line has a graph with a dot, and the dot of the current step is bigger', await cnt('.tree-row .tree-graph circle.node') === n0 && await b.ev(`+document.querySelector('.tree-row.current circle').getAttribute('r')`) > await b.ev(`+document.querySelector('.tree-row:nth-child(2) circle').getAttribute('r')`));
  ok('the current step has no Rewind button; every other one has one, enabled (the sample steps all have snapshots)', await cnt('.tree-rewind') === n0 - 1 && await b.ev(`![].some.call(document.querySelectorAll('.tree-rewind'), function(x){return x.disabled})`));
  ok('a straight history is a single lane', await b.ev(`document.querySelector('.tree-graph').getAttribute('width')`) === '18' && !await q('.tree-graph .l1'));

  // ---- make some changes: A, B, C
  await b.click('.hp-tab[data-tab=edit]');
  await saveText('Version A {{name}}');
  await saveText('Version B {{name}}');
  await saveText('Version C {{name}}');
  await b.click('[data-tab=tree]');
  ok('saving adds lines at the top, each with a snippet of the new text, and moves the current marker', (await rows())[0] === 'English · text → “Version C {{name}}”' && (await rows())[1] === 'English · text → “Version B {{name}}”' && await cnt('.tree-row') === n0 + 3 && await q('.tree-row:first-child .tree-cur'), (await rows()).slice(0, 4).join(' | '));

  // ---- rewind to A
  await b.hover(rewindBtn(3));
  ok('a Rewind button shows when its line is hovered (not on other lines)', await b.ev(`getComputedStyle(document.querySelector('${rewindBtn(3)}')).opacity`) === '1' && await b.ev(`getComputedStyle(document.querySelector('${rewindBtn(6)}')).opacity`) === '0');
  await b.click(rewindBtn(3));
  ok('rewinding puts the text back: the editor shows version A, a toast says where to', await body() === 'Version A {{name}}' && /Rewound to: English · text → “Version A/.test(await txt('#toast')), await body());
  ok('it is a NEW step at the top: "Rewound to: …", marked current; nothing was removed', await cnt('.tree-row') === n0 + 4 && /^Rewound to: English · text → “Version A/.test((await rows())[0]) && await q('.tree-row:first-child .tree-cur') && await cnt('.tree-cur') === 1);
  ok('the steps after A (B and C) are still listed, as another branch: the graph now has a second lane', (await rows()).slice(1, 3).join('|') === 'English · text → “Version C {{name}}”|English · text → “Version B {{name}}”' && await q('.tree-graph .l1') && await cnt('.tree-row:first-child .tree-graph circle.rw') === 1);
  ok('the saved status follows the rule: the English text now differs from what was published', /Edited since publish/.test(await txt('.panel.edit .panel-head')));
  ok('the Rewound step shows under Other too (it is not tied to one language), and not in the English tab', await (async () => { await b.click('.hp-tab[data-tab=other]'); const o = /Rewound/.test(await txt('#history-pane')); await b.click('.hp-tab[data-tab=edit]'); return o && !/Rewound/.test(await txt('#history-pane')); })());

  // ---- editing from here grows a new branch; the abandoned one can still be rewound to
  await saveText('Version D {{name}}');
  await b.click('[data-tab=tree]');
  ok('editing after a rewind adds a step on top of the Rewound step (a new branch from A)', (await rows())[0] === 'English · text → “Version D {{name}}”' && /^Rewound to:/.test((await rows())[1]));
  await b.click(rewindBtn(3));      // rows: D, Rewound, C, B ...
  ok('the abandoned branch can be rewound to: version C comes back', await body() === 'Version C {{name}}' && /^Rewound to: English · text → “Version C/.test((await rows())[0]), await body() + ' | ' + (await rows())[0]);

  // ---- unsaved edits block it
  await b.fill('.panel.edit [data-input=text]', 'half typed');
  ok('with unsaved edits every Rewind button is disabled (updates while typing) and a note says why', await b.ev(`[].every.call(document.querySelectorAll('.tree-rewind'), function(x){return x.disabled})`) && /Save or revert/.test(await txt('.tree-note')));
  await b.click('.panel.edit .revert');
  ok('reverting enables them again (except steps that look exactly like now) and removes the note', !await b.ev(`document.querySelector('${rewindBtn(5)}').disabled`) && await b.ev(`document.querySelector('${rewindBtn(4)}').disabled`) && /already looks like this/.test(await b.ev(`document.querySelector('${rewindBtn(4)}').title`)) && !await q('.tree-note'));

  // ---- keyboard
  await b.ev(`document.querySelector('${rewindBtn(5)}').focus(); 0`);
  ok('a Rewind button can be focused by keyboard, then it is visible, and its label names the step', await b.ev(`document.activeElement.getAttribute('data-action')`) === 'rewind' && await b.ev(`getComputedStyle(document.activeElement).opacity`) === '1' && /^Rewind to: /.test(await b.ev(`document.activeElement.getAttribute('aria-label')`)));

  // ---- leaving the tab
  await b.click('tr.clickable[data-lang=hi]');
  ok('picking a language row leaves the Tree tab (like Other)', !await q('.tree') && /Hindi/.test(await txt('.hp-tab.active')));
  await b.click('[data-tab=tree]');
  await b.click('.item[data-id]:nth-child(2), [data-action=select]:nth-of-type(2)');
  ok('picking another template shows that template\'s language tab, not the tree', !await q('.tree'));

  // ---- the rewound text is what is saved (survives a reload) and the current marker too
  await b.click('[data-action=select][data-id]');
  await b.reload();
  ok('after a reload the text is still the rewound one', (await b.ev(`Store.list()[0].translations[0].text`)) === 'Version C {{name}}');
  await b.click('[data-action=toggle-history-pane]').catch(() => {});
  if (!await q('#history-pane')) await b.click('[data-action=toggle-history-pane]');
  await b.click('[data-tab=tree]');
  ok('and so is the tree, with its current marker on the newest step', await cnt('.tree-cur') === 1 && await q('.tree-row:first-child .tree-cur') && /^Rewound to:/.test((await rows())[0]));

  // ---- dark theme
  await b.setScheme('dark');
  ok('lane colours are theme variables: they differ in dark mode', await b.ev(`getComputedStyle(document.querySelector('.tree-graph circle.l0')).fill`) !== 'rgb(31, 111, 235)');
  await b.setScheme('light');
});
