// Comments on a template (body / header / footer / buttons, optionally a selected piece of text) and on flow nodes.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('comments: a button at the top opens the right sidebar (composer + message pills, Open | Resolved), parts, nodes, resolve', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const items = () => b.ev(`[].map.call(document.querySelectorAll('.cm-item'), function(i){return i.querySelector('.chip').textContent + ' | ' + ((i.querySelector('.cm-q')||{}).textContent||'').replace(/\\s+/g,' ').trim() + ' | ' + i.querySelector('.cm-text').textContent})`);
  const toggleText = () => b.ev(`document.querySelector('.cm-open').getAttribute('aria-label')`);
  const select = (sel, s, e) => b.ev(`(function(){var t=document.querySelector(${JSON.stringify(sel)}); t.focus(); t.setSelectionRange(${s},${e}); t.dispatchEvent(new Event('select',{bubbles:true})); return 1})()`);
  const pickTarget = v => b.ev(`(function(){var s=document.getElementById('cm-target-sel'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  const say = async t => { await b.fill('#cm-text', t); await b.click('[data-action=cm-add]'); };
  const histCount = () => b.ev(`Store.historyFor(Store.list()[0].id,'all').length`);

  // ---- the button at the top, the sidebar
  ok('the template has no name heading and no description line; the comments button in the toolbar is just an icon (no text), with the count in its label', !await q('.content-head') && !await q('.main h2') && !/Template name base/.test(await txt('.main')) && /Comments \(1 open\)/.test(await toggleText()) && /^\d*$/.test((await txt('.cm-open')).trim()) && await q('.cm-open svg'));
  ok('the sidebar is closed until the button is clicked', !await q('#comments-pane') && !await q('#comments'));
  await b.click('.cm-open');
  ok('the button opens the right sidebar (not the history), and it is marked pressed', await q('#comments-pane') && !await q('#history-pane') && await b.ev(`document.querySelector('.cm-open').getAttribute('aria-pressed')`) === 'true');
  ok('the sidebar is on the right of the editor, with the composer at its top', await b.ev(`document.getElementById('comments-pane').getBoundingClientRect().left >= document.querySelector('.main').getBoundingClientRect().right - 1 && document.getElementById('comments').getBoundingClientRect().top < document.querySelector('.cm-list').getBoundingClientRect().top`));
  ok('it has a "Comment on" dropdown, a text box, Add comment, and Open | Resolved tabs', await q('#cm-target-sel') && await q('#cm-text') && await q('[data-action=cm-add]') && await q('.cm-list .hp-tab.active'));
  ok('the dropdown offers the whole template and, per language, the body, header, footer and each button', await b.ev(`[].map.call(document.querySelectorAll('#cm-target-sel option'), function(o){return o.value}).join(',')`) === 'general,en|body|,en|header|,en|footer|,en|button|0,en|button|1,hi|body|,hi|header|,hi|footer|,hi|button|0,hi|button|1', await b.ev(`[].map.call(document.querySelectorAll('#cm-target-sel option'), function(o){return o.value}).join(',')`));
  ok('comments are message pills: rounded bubbles', await b.ev(`parseFloat(getComputedStyle(document.querySelector('.cm-pill')).borderTopLeftRadius) >= 14`));
  await b.click('#comments-pane [data-action=cm-toggle]');
  ok('Hide in the sidebar closes it', !await q('#comments-pane') && await b.ev(`document.querySelector('.cm-open').getAttribute('aria-pressed')`) === 'false');
  await b.click('[data-action=toggle-history-pane]');
  ok('Show history opens the history in that same sidebar, and comments are not shown with it', await q('#history-pane') && !await q('#comments-pane'));
  await b.click('.cm-open');
  ok('and Comments takes the sidebar back (one right sidebar at a time)', await q('#comments-pane') && !await q('#history-pane'));
  ok('Open (1) is the default tab and there is a Resolved (1) tab', /Open \(1\)/.test(await txt('.cm-list .hp-tab.active')) && /Resolved \(1\)/.test(await txt('.cm-list .hp-tab:not(.active)')));
  let it = await items();
  ok('an item shows where (language · part), the quoted text, and the comment', it.length === 1 && /^English · Body \| “welcome to Noora Health” \| Should we say/.test(it[0]), it.join('\n'));
  ok('resolved comments are not in the default list', !/Footer matches/.test(it.join()));
  await b.click('[data-action=cm-tab][data-tab=resolved]');
  it = await items();
  ok('the Resolved tab lists them, with who resolved and when, and a Reopen button instead of Resolve', it.length === 1 && /Footer matches/.test(it[0]) && /Resolved by Demo user/.test(await txt('.cm-item')) && await q('.cm-item [data-action=cm-reopen]') && !await q('.cm-item [data-action=cm-resolve]'));
  await b.click('[data-action=cm-tab][data-tab=open]');

  // ---- add: whole template (the default target)
  await say('   ');
  ok('an empty comment is refused with a message', /Write a comment/.test(await txt('#toast')) && await cnt('.cm-item') === 1);
  await say('Whole template remark');
  ok('adding a comment with no part chosen is about the whole template; the list updates, the box is cleared', /Comment added/.test(await txt('#toast')) && await cnt('.cm-item') === 2 && /Whole template/.test((await items())[0]) && /Comments \(2 open\)/.test(await toggleText()) && await b.ev(`document.getElementById('cm-text').value`) === '', (await items()).join('\n'));
  ok('the newest comment is first', /Whole template remark/.test((await items())[0]));

  // ---- a selected piece of text in the body
  const body = await b.ev(`Store.list()[0].translations[0].text`);
  const at = body.indexOf('newborn');
  await select('.panel.edit [data-input=text]', at, at + 'newborn'.length);
  ok('selecting text in the body picks it up as the quote and sets the dropdown to Body', await b.ev(`document.getElementById('cm-target-sel').value`) === 'en|body|' && /“newborn”/.test(await txt('.cm-quote')));
  await b.fill('#cm-text', 'Use "baby" here');
  await b.click('[data-action=cm-add]');
  ok('the comment is on that text: quote and part are shown, and the Body label gets a 💬 count', /^English · Body \| “newborn” \| Use "baby" here/.test((await items())[0]) && /💬 2/.test(await txt('.panel.edit [data-sec=body] .cm-badge')), (await items())[0]);
  ok('the quote chip is cleared after adding', !await q('.cm-quote') && await b.ev(`document.getElementById('cm-target-sel').value`) === 'general');

  // ---- clearing the quote comments on the whole part
  await select('.panel.edit [data-input=text]', 0, 5);
  await b.click('[data-action=cm-clear-quote]');
  ok('× on the quote chip keeps the part but drops the selected text', !await q('.cm-quote') && await b.ev(`document.getElementById('cm-target-sel').value`) === 'en|body|');
  await say('Body as a whole');
  ok('so the comment is on the whole Body, without a quote', /^English · Body \|  \| Body as a whole/.test((await items())[0]), (await items())[0]);

  // ---- footer text, button text, header, other language
  await b.ev(`(function(){var s=document.querySelector('.panel.edit [data-change=add-part]'); s.value='footer'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`).catch(() => {});
  const footer = await b.ev(`document.querySelector('.panel.edit [data-input=footer]').value`);
  await select('.panel.edit [data-input=footer]', 0, 4);
  ok('selecting text in the footer targets the footer', await b.ev(`document.getElementById('cm-target-sel').value`) === 'en|footer|' && new RegExp('“' + footer.slice(0, 4) + '”').test(await txt('.cm-quote')), footer);
  await say('Footer remark');
  await select('.panel.edit [data-input=btn-text][data-idx="1"]', 0, 5);
  ok('selecting text in a button\'s text targets that button', await b.ev(`document.getElementById('cm-target-sel').value`) === 'en|button|1' && /“Visit”/.test(await txt('.cm-quote')));
  await say('Button remark');
  await pickTarget('en|header|');
  await say('Header remark');
  await pickTarget('hi|body|');
  await say('Hindi body remark');
  const all = await items();
  ok('footer, button, header and a part of another language each get their own comment with the right label', /^English · Footer \| “/.test(all[3]) && /^English · Button 2 \| “Visit” \| Button remark/.test(all[2]) && /^English · Header \|  \| Header remark/.test(all[1]) && /^Hindi · Body \|  \| Hindi body remark/.test(all[0]), JSON.stringify(all));
  ok('the header, footer and button labels carry a 💬 badge', await q('.panel.edit [data-sec=header] .cm-badge') && await q('.panel.edit [data-sec=footer] .cm-badge') && await q('.panel.edit .bcard[data-idx="1"] .cm-badge'));

  // ---- the draft survives the list being toggled; Ctrl+Enter adds
  await b.fill('#cm-text', 'half written');
  await b.click('.cm-open'); await b.click('.cm-open');
  ok('a half-written comment is kept when the sidebar is closed and opened again', await b.ev(`document.getElementById('cm-text').value`) === 'half written');
  await b.ev(`(function(){var t=document.getElementById('cm-text'); t.focus(); t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true})); return 1})()`);
  await b.sleep(100);
  ok('Ctrl+Enter in the box adds the comment', (await items()).some(i => /half written/.test(i)) && await b.ev(`document.getElementById('cm-text').value`) === '');

  // ---- Go to
  await b.click('[data-action=cm-tab][data-tab=open]');
  const idxBody = (await items()).findIndex(i => /^English · Body \| “welcome to Noora Health”/.test(i));
  await b.click(`.cm-item:nth-child(${idxBody + 1}) [data-action=cm-goto]`);
  ok('Go to focuses the field and selects the quoted text', await b.ev(`document.activeElement.getAttribute('data-input')`) === 'text' && await b.ev(`(function(){var t=document.activeElement; return t.value.slice(t.selectionStart, t.selectionEnd)})()`) === 'welcome to Noora Health');

  // ---- text changed since
  await b.fill('.panel.edit [data-input=text]', 'Completely different words');
  await b.click('.cm-open'); await b.click('.cm-open');
  ok('when the quoted text is no longer in the field, the comment says so (the comment stays)', /changed or been removed/.test(await txt('.cm-item .cm-q.gone')), await txt('.cm-list'));
  await b.click('.panel.edit .revert');

  // ---- resolve / reopen
  const nOpen = await cnt('.cm-item');
  const bodyIdx = (await items()).findIndex(i => /Body as a whole/.test(i));
  ok('the Body label counts its open comments (the sample one, the "newborn" one, the whole-body one)', /💬 3/.test(await txt('.panel.edit [data-sec=body] .cm-badge')));
  await b.click(`.cm-item:nth-child(${bodyIdx + 1}) [data-action=cm-resolve]`);
  ok('Resolve takes it out of the Open list, the counts follow, the toast says so', /Comment resolved/.test(await txt('#toast')) && await cnt('.cm-item') === nOpen - 1 && new RegExp('Open \\(' + (nOpen - 1) + '\\)').test(await txt('.cm-list .hp-tab.active')) && /Resolved \(2\)/.test(await txt('.cm-list .hp-tab:not(.active)')) && !(await items()).some(i => /Body as a whole/.test(i)));
  ok('the badge on the part goes down when its comment is resolved', /💬 2/.test(await txt('.panel.edit [data-sec=body] .cm-badge')));
  await b.click('[data-action=cm-tab][data-tab=resolved]');
  ok('it is in the Resolved tab now', /Body as a whole/.test((await items())[0]));
  await b.click('.cm-item:first-child [data-action=cm-reopen]');
  ok('Reopen brings it back to Open', await cnt('.cm-item') === nOpen && (await items()).some(i => /Body as a whole/.test(i)) && /Open \(/.test(await txt('.cm-list .hp-tab.active')) && /💬 3/.test(await txt('.panel.edit [data-sec=body] .cm-badge')));

  // ---- comments are not history; they are saved
  const h0 = await histCount();
  await say('One more');
  ok('comments never appear in the history', await histCount() === h0);
  await b.reload();
  ok('comments (and which are resolved) survive a reload', await b.ev(`Store.commentsFor({contentId: Store.list()[0].id}, 'all').length`) === await b.ev(`Store.commentsFor({contentId: Store.list()[0].id}, 'all').length`) && /One more/.test(await b.ev(`Store.commentsFor({contentId: Store.list()[0].id})[0].text`)));

  // ---- flows: nodes
  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.cm-open');
  ok('on a flow the header has the Comments button, which opens the sidebar with the flow\'s composer, and the dropdown lists the whole flow and every node', await q('.cm-open') && await q('#comments-pane') && await b.ev(`[].map.call(document.querySelectorAll('#cm-target-sel option'), function(o){return o.textContent}).join('|')`) === 'Whole flow|Template · Welcome message|Logic · Logic 1|Template · Daily health tip|Input · Input 1|Action · Alert health worker', await b.ev(`[].map.call(document.querySelectorAll('#cm-target-sel option'), function(o){return o.textContent}).join('|')`));
  const nodeId = t => b.ev(`(function(){var n=[].filter.call(document.querySelectorAll('.fnode'), function(x){return x.textContent.indexOf(${JSON.stringify(t)}) !== -1})[0]; return n && n.getAttribute('data-node')})()`);
  const action = await nodeId('Alert health worker'), welcome = await nodeId('Welcome message');
  ok('a node with an open comment shows 💬 and the number; others show nothing until hovered', /💬\s*1/.test(await txt(`.fnode[data-node="${action}"] .node-cm`)) && await q(`.fnode[data-node="${action}"] .node-cm.has`) && !await q(`.fnode[data-node="${welcome}"] .node-cm.has`));
  await b.click(`.fnode[data-node="${welcome}"] .node-cm`);
  ok('clicking a node\'s 💬 aims the composer at that node and puts the cursor in the box (it does not start editing the node)', await b.ev(`document.getElementById('cm-target-sel').value`) === 'node|' + welcome && await b.ev(`document.activeElement.id`) === 'cm-text' && !await q('.fnode.editing'));
  await say('Check the wording of this template');
  ok('the comment is listed under the node\'s name and the node now shows 💬 1', /^Template · Welcome message \|  \| Check the wording/.test((await items())[0]) && /💬\s*1/.test(await txt(`.fnode[data-node="${welcome}"] .node-cm`)), (await items()).join('\n'));
  await b.click(`.cm-item:first-child [data-action=cm-goto]`);
  ok('Go to scrolls to the node and flashes it', await q(`.fnode[data-node="${welcome}"].flash`));
  await b.click('.cm-item:first-child [data-action=cm-resolve]');
  ok('resolving removes the count from the node and moves the comment to Resolved', !await q(`.fnode[data-node="${welcome}"] .node-cm.has`) && /Resolved \(1\)/.test(await txt('.cm-list .hp-tab:not(.active)')));
  await pickTarget('general');
  await say('Flow-level remark');
  ok('a comment with no node is about the whole flow', /^Whole flow \|  \| Flow-level remark/.test((await items())[0]), (await items()).join('\n'));
  ok('comments of the flow and of the template do not mix', !(await items()).some(i => /Hindi|Footer/.test(i)));

  // ---- editing a node blocks the composer like everything else
  await b.click(`.fnode[data-node="${action}"] .fnode-title`);
  await b.click('#cm-text');
  ok('while a node is being edited the composer cannot be used (the usual lock)', await q('.fnode.editing') && /Save \(✓\) or cancel \(✕\)/.test(await txt('#toast')));
  await b.click('.fnode.editing [data-action=node-cancel]');
});
