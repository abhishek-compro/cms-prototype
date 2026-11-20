// Rewinding a template's history: an undo tree (like Emacs' undo-tree) drawn as a git-like graph, one line per step.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('rewind: the Tree tab, current marker, rewinding as a new step, branches', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const rows = () => b.ev(`[].map.call(document.querySelectorAll('.tree-row'), function(r){return r.querySelector('.tree-what').textContent})`);
  const body = () => b.ev(`document.querySelector('.panel.edit[data-lang=en] [data-input=text]').value`);
  const eventsCount = () => b.ev(`Store.historyFor(Store.list()[0].id,'all').length`);
  const saveText = async t => { await b.fill('.panel.edit[data-lang=en] [data-input=text]', t); await b.click('.panel.edit[data-lang=en] .save'); };
  const rewindBtn = i => `.tree-item:nth-child(${i}) [data-action=rewind]`;

  await b.click('[data-action=toggle-history-pane]');
  ok('the sidebar has exactly two tabs: Content and Other (the tree lives in Content)', await b.ev(`[].map.call(document.querySelectorAll('.hp-tab'), function(t){return t.textContent.trim()}).join('|')`) === 'Content|Other');
  await b.click('[data-tab=content]');
  ok('the Content tab is selected (first) and the sidebar gets wider to fit one line per step', await b.ev(`document.querySelector('[data-tab=content]').getAttribute('aria-selected')`) === 'true' && await b.ev(`document.querySelector('#history-pane').getBoundingClientRect().width`) > 400);
  ok('the explanation is not on screen by default: an "i" button sits next to the language dropdown instead', !await q('#history-pane .hist-info') && await q('#history-pane .hp-lang .info-btn svg') && await b.ev(`document.querySelector('#history-pane .info-btn').getAttribute('aria-expanded')`) === 'false' && !/Rewind puts/.test(await txt('#history-pane')));
  await b.click('#history-pane .info-btn');
  ok('clicking the i button shows the explanation (Details, Rewind, branches, Other) under it', await q('#history-pane .hist-info') && /Details/.test(await txt('#history-pane .hist-info')) && /Rewind/.test(await txt('#history-pane .hist-info')) && /Other/.test(await txt('#history-pane .hist-info')) && await b.ev(`document.querySelector('#history-pane .info-btn').getAttribute('aria-expanded')`) === 'true' && await b.ev(`document.querySelector('#history-pane .info-btn').getBoundingClientRect().bottom <= document.querySelector('#history-pane .hist-info').getBoundingClientRect().top + 1`));
  await b.click('.hp-tab[data-tab=other]');
  ok('the Other tab has its own i button; the explanation stays open there and describes that tab', await q('#history-pane .info-btn') && /Other activity/.test(await txt('#history-pane .hist-info')));
  await b.click('#history-pane .info-btn');
  ok('clicking the i button again hides it', !await q('#history-pane .hist-info') && await b.ev(`document.querySelector('#history-pane .info-btn').getAttribute('aria-expanded')`) === 'false');
  await b.click('[data-tab=content]');
  const n0 = await b.ev(`Store.historyTree(Store.list()[0].id, 'en').rows.length`);
  ok('the Content tab shows one language at a time: a Language dropdown at its top with every language of the template, English first and selected', await b.ev(`[].map.call(document.querySelectorAll('#history-pane [data-change=hist-lang] option'), function(o){return o.value}).join()`) === 'en,hi' && await b.ev(`document.querySelector('#history-pane [data-change=hist-lang]').value`) === 'en');
  ok('there is one line for every CONTENT step of that language (plus the steps for every language), newest first', await cnt('.tree-row') === n0 && n0 > 4, n0);
  ok('every line says what, who and when, on one line', await b.ev(`[].every.call(document.querySelectorAll('.tree-row'), function(r){ var w=r.querySelector('.tree-what').textContent, m=r.querySelector('.tree-meta').textContent; return w.length>3 && /Demo user · \\w+ \\d+, /.test(m) && r.getBoundingClientRect().height < 40 })`));
  ok('lines name the language and the part ("English · edited the buttons"); no Hindi line is shown while English is selected', (await rows()).some(r => /^English · edited the buttons/.test(r)) && !(await rows()).some(r => /^Hindi · /.test(r)), (await rows()).join(' | '));
  ok('exactly one line is marked current, the newest', await cnt('.tree-cur') === 1 && await q('.tree-item:first-child .tree-row .tree-cur') && await q('.tree-row.current'));
  ok('each line has a graph with a dot, and the dot of the current step is bigger', await cnt('.tree-row .tree-graph circle.node') === n0 && await b.ev(`+document.querySelector('.tree-row.current circle').getAttribute('r')`) > await b.ev(`+document.querySelector('.tree-item:nth-child(2) circle').getAttribute('r')`));
  const allEvents = await eventsCount();
  ok('the tree has only content steps: publishing, renaming, campaign and timing steps are not in it', n0 < allEvents && !(await rows()).some(r => /published as|Renamed|Copied|Moved to|timing/i.test(r)) && (await rows()).some(r => /^English · footer/.test(r)), (await rows()).join(' | '));
  ok('every step except the current one has a Rewind button, enabled (the sample steps all have snapshots)', await cnt('.tree-rewind') === n0 - 1 && await b.ev(`![].some.call(document.querySelectorAll('.tree-rewind'), function(x){return x.disabled})`));
  ok('the sample\'s publish steps are not lost: they are in the Other tab, as a plain list (every language)', await (async () => {
    await b.click('.hp-tab[data-tab=other]');
    const o = await b.ev(`[].map.call(document.querySelectorAll('#history-pane .event'), function(e){return e.querySelector('.event-head strong').textContent + '|' + (e.querySelector('.chip')||{}).textContent}).join(' ; ')`);
    const n = await cnt('#history-pane .event');
    await b.click('[data-tab=content]');
    return n === await b.ev(`Store.historyFor(Store.list()[0].id,'activity').length`) && /Published as template\|English/.test(o) && /Published as template\|Hindi/.test(o) && await q('#history-pane .tree');
  })());

  // ---- Details
  ok('every line has a Details button, closed to begin with (no detail panels, aria-expanded false)', await cnt('.tree-details') === n0 && await cnt('.tree-detail') === 0 && await b.ev(`document.querySelector('.tree-details').getAttribute('aria-expanded')`) === 'false');
  await b.click('.tree-item:first-child .tree-details');
  ok('Details on the current step opens a panel under that line: title, kind, who and when, a note that it is current', await cnt('.tree-detail') === 1 && /Demo user/.test(await txt('.tree-detail')) && /current step/.test(await txt('.tree-detail')) && await b.ev(`document.querySelector('.tree-item:first-child .tree-details').getAttribute('aria-expanded')`) === 'true', await txt('.tree-detail'));
  await b.click('.tree-item:nth-child(2) .tree-details');
  ok('several can be open at once; a text step shows the word diff of what changed', await cnt('.tree-detail') === 2 && await q('.tree-item:nth-child(2) .tree-detail .d-add'), await txt('.tree-item:nth-child(2) .tree-detail'));
  ok('the graph lines keep running through an open panel', await q('.tree-item:nth-child(2) .tree-detail svg.through line'));
  await b.click('.tree-item:first-child .tree-details');
  ok('clicking Details again closes it', await cnt('.tree-detail') === 1 && !await q('.tree-item:first-child .tree-detail'));
  await b.click('.tree-item:nth-child(2) .tree-details');
  ok('and nothing else changed: same lines, same current marker', await cnt('.tree-detail') === 0 && await cnt('.tree-row') === n0 && await q('.tree-item:first-child .tree-cur'));

  ok('a straight history is a single lane', await b.ev(`document.querySelector('.tree-graph').getAttribute('width')`) === '18' && !await q('.tree-graph .l1'));

  // ---- make some changes: A, B, C
  await b.click('.hp-tab[data-tab=content]');
  await saveText('Version A {{name}}');
  await saveText('Version B {{name}}');
  await saveText('Version C {{name}}');
  await b.click('[data-tab=content]');
  ok('saving adds lines at the top, each with a snippet of the new text, and moves the current marker', (await rows())[0] === 'English · text → “Version C {{name}}”' && (await rows())[1] === 'English · text → “Version B {{name}}”' && await cnt('.tree-row') === n0 + 3 && await q('.tree-item:first-child .tree-row .tree-cur'), (await rows()).slice(0, 4).join(' | '));

  // ---- rewind to A
  await b.hover(rewindBtn(3));
  ok('a Rewind button shows when its line is hovered (not on other lines)', await b.ev(`getComputedStyle(document.querySelector('${rewindBtn(3)}')).opacity`) === '1' && await b.ev(`getComputedStyle(document.querySelector('${rewindBtn(4)}')).opacity`) === '0');
  await b.click(rewindBtn(3));
  ok('rewinding puts the text back: the editor shows version A, a toast says where to', await body() === 'Version A {{name}}' && /Rewound to: English · text → “Version A/.test(await txt('#toast')), await body());
  ok('it is a NEW step at the top: "Rewound to: …", marked current; nothing was removed', await cnt('.tree-row') === n0 + 4 && /^Rewound to: English · text → “Version A/.test((await rows())[0]) && await q('.tree-item:first-child .tree-row .tree-cur') && await cnt('.tree-cur') === 1);
  ok('the steps after A (B and C) are still listed, as another branch: the graph now has a second lane', (await rows()).slice(1, 3).join('|') === 'English · text → “Version C {{name}}”|English · text → “Version B {{name}}”' && await q('.tree-graph .l1') && await cnt('.tree-item:first-child .tree-row .tree-graph circle.rw') === 1);
  ok('the saved status follows the rule: the English text now differs from what was published', /Edited since publish/.test(await txt('.panel.edit[data-lang=en] .panel-head')));
  ok('the Rewound step is a content step: it is in the Content tree, not in Other', await (async () => { await b.click('.hp-tab[data-tab=other]'); const o = /Rewound/.test(await txt('#history-pane')); await b.click('.hp-tab[data-tab=content]'); return !o && /Rewound/.test(await txt('#history-pane')); })());

  // ---- editing from here grows a new branch; the abandoned one can still be rewound to
  await saveText('Version D {{name}}');
  await b.click('[data-tab=content]');
  ok('editing after a rewind adds a step on top of the Rewound step (a new branch from A)', (await rows())[0] === 'English · text → “Version D {{name}}”' && /^Rewound to:/.test((await rows())[1]));
  await b.click(rewindBtn(3));      // rows: D, Rewound, C, B ...
  ok('the abandoned branch can be rewound to: version C comes back', await body() === 'Version C {{name}}' && /^Rewound to: English · text → “Version C/.test((await rows())[0]), await body() + ' | ' + (await rows())[0]);

  // ---- unsaved edits block it
  await b.fill('.panel.edit[data-lang=en] [data-input=text]', 'half typed');
  ok('with unsaved edits every Rewind button is disabled (updates while typing) and a note says why', await b.ev(`[].every.call(document.querySelectorAll('.tree-rewind'), function(x){return x.disabled})`) && /Save or revert/.test(await txt('.tree-note')));
  await b.click('.panel.edit[data-lang=en] .revert');
  ok('reverting enables them again (except steps that look exactly like now) and removes the note', !await b.ev(`document.querySelector('${rewindBtn(5)}').disabled`) && await b.ev(`document.querySelector('${rewindBtn(4)}').disabled`) && /already looks like this/.test(await b.ev(`document.querySelector('${rewindBtn(4)}').title`)) && !await q('.tree-note'));

  // ---- keyboard
  await b.ev(`document.querySelector('${rewindBtn(5)}').focus(); 0`);
  ok('a Rewind button can be focused by keyboard, then it is visible, and its label names the step', await b.ev(`document.activeElement.getAttribute('data-action')`) === 'rewind' && await b.ev(`getComputedStyle(document.activeElement).opacity`) === '1' && /^Rewind to: /.test(await b.ev(`document.activeElement.getAttribute('aria-label')`)));

  // ---- the tab stays
  await b.click('.panel.edit[data-lang=hi] [data-input=text]');
  ok('working in another language panel keeps the Content tab and its tree (languages are named on the lines)', await q('.tree') && /Content/.test(await txt('.hp-tab.active')));
  await b.click('.item[data-id]:nth-child(2), [data-action=select]:nth-of-type(2)');
  ok('picking another template shows that template\'s tree in the same tab', await q('.tree') && await cnt('.tree-row') > 0);

  // ---- the rewound text is what is saved (survives a reload) and the current marker too
  await b.click('[data-action=select][data-id]');
  await b.reload();
  ok('after a reload the text is still the rewound one', (await b.ev(`Store.list()[0].translations[0].text`)) === 'Version C {{name}}');
  await b.click('[data-action=toggle-history-pane]').catch(() => {});
  if (!await q('#history-pane')) await b.click('[data-action=toggle-history-pane]');
  await b.click('[data-tab=content]');
  ok('and so is the tree, with its current marker on the newest step', await cnt('.tree-cur') === 1 && await q('.tree-item:first-child .tree-row .tree-cur') && /^Rewound to:/.test((await rows())[0]));
});
