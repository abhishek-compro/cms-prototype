// Core editor behaviour: themes, language rows, side by side, history sidebar, block/publish, downloads, rename, reset.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('core: layout, themes, languages, history, publishing, downloads', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const bg = () => b.ev(`getComputedStyle(document.body).backgroundColor`);
  const theme = () => b.ev(`document.documentElement.getAttribute('data-theme')`);
  const checkedTheme = () => b.ev(`[].filter.call(document.querySelectorAll('.theme-btn'), function(x){return x.getAttribute('aria-checked')==='true'}).map(function(x){return x.dataset.theme}).join()`);
  const editLang = () => b.ev(`document.querySelector('.panel.edit').dataset.lang`);
  const badge = lang => b.ev(`(function(){var r=document.querySelector('tr.clickable[data-lang=${lang}]'); return r ? r.cells[2].textContent.replace(/\\s+/g,' ').trim() : null})()`);
  const waName = lang => b.ev(`(function(){var r=document.querySelector('tr.clickable[data-lang=${lang}]'); return r ? r.cells[1].textContent.trim() : null})()`);
  const tabs = () => b.ev(`[].map.call(document.querySelectorAll('#history-pane .hp-tab'), function(t){return t.dataset.tab + ':' + t.textContent.trim()}).join(' | ')`);
  const events = () => cnt('#history-pane .event');
  const idOf = n => b.ev(`Store.list().filter(function(c){return c.name===${JSON.stringify(n)}})[0].id`);
  const item = async n => '.content-item[data-id="' + await idOf(n) + '"]';
  const capture = () => b.ev(`(function(){window.__dl=[]; var o=URL.createObjectURL; URL.createObjectURL=function(bl){window.__blob=bl; return o.call(URL,bl)}; HTMLAnchorElement.prototype.click=function(){window.__dl.push(this.download)}; return 1})()`);

  // ================= first look =================
  ok('four columns: campaigns | content names | editor, history hidden by default', await q('.campaigns') && await q('.sidebar') && await q('.main') && !await q('#history-pane') && await q('.layout.hist-off'));
  ok('side by side is off by default: one editing panel, no reference panel', await cnt('.panel') === 1 && !await q('.panel.ref'));
  ok('the first content opens, with no name heading above the editor', await txt('.content-item.active .name') === 'Welcome message' && !await q('.content-head h2'));
  ok('"Publish all" is the only publish action (no per-language Deploy/Publish button)', await cnt('[data-action=deploy-all]') === 1 && !await q('[data-action=deploy]'));
  ok('the UI says Publish, never Deploy', !/deploy/i.test(await b.ev(`document.getElementById('app').innerText`)));

  // ================= theme =================
  ok('theme switch: Light, System, Dark - System is selected by default', await b.ev(`[].map.call(document.querySelectorAll('.theme-btn'), function(x){return x.textContent.trim()}).join('|')`) === 'Light|System|Dark' && await checkedTheme() === 'system' && await theme() === null);
  const lightBg = await bg();
  await b.click('[data-theme=dark]');
  ok('Dark: data-theme=dark, a dark page, and the choice is shown', await theme() === 'dark' && await checkedTheme() === 'dark' && await bg() !== lightBg);
  await b.reload();
  ok('the choice survives a reload (applied before the first paint)', await theme() === 'dark' && await checkedTheme() === 'dark');
  await b.click('[data-theme=system]');
  ok('System: no data-theme attribute again (and nothing saved)', await theme() === null && await b.ev(`localStorage.getItem('cms-prototype-theme')`) === null);
  await b.setScheme('dark'); await b.sleep(150);
  const sysDark = await bg();
  ok('System follows the device: dark device -> dark page', sysDark !== lightBg && await theme() === null);
  await b.click('[data-theme=light]');
  ok('Light overrides a dark device', await bg() === lightBg);
  await b.setScheme('light'); await b.click('[data-theme=system]');
  ok('System on a light device -> light page', await bg() === lightBg);
  const draftText = 'typed before switching theme';
  await b.fill('.panel.edit [data-input=footer]', draftText);
  await b.click('[data-theme=dark]');
  ok('switching theme does not re-render the page (unsaved text stays)', await b.ev(`document.querySelector('.panel.edit [data-input=footer]').value`) === draftText);
  await b.click('[data-theme=system]');
  await b.click('.panel.edit .revert');

  // ================= language rows =================
  ok('the table lists every language; the one being edited is selected', await cnt('tr.clickable') === 2 && await b.ev(`document.querySelector('tr.clickable.selected').dataset.lang`) === 'en');
  ok('there are no language tabs', !await q('.lang-tabs') && !await q('.lang-tab'));
  await b.click('tr.clickable[data-lang=hi]');
  ok('clicking a row edits that language', await editLang() === 'hi' && await b.ev(`document.querySelector('tr.clickable.selected').dataset.lang`) === 'hi' && /Hindi/.test(await txt('.panel.edit .panel-head')));
  await b.fill('.panel.edit [data-input=footer]', 'अस्थायी');
  await b.click('tr.clickable[data-lang=en]');
  ok('switching away keeps the unsaved edit, marked with a dot on its row', await editLang() === 'en' && await q('tr.clickable[data-lang=hi] .dot'));
  await b.click('tr.clickable[data-lang=hi]');
  ok('coming back restores the unsaved text', await b.ev(`document.querySelector('.panel.edit [data-input=footer]').value`) === 'अस्थायी');
  await b.click('.panel.edit .revert');
  await b.ev(`document.querySelector('tr.clickable[data-lang=en]').focus(); 0`); await b.key('Enter', 'Enter', 13);
  ok('a focused row can be chosen with the keyboard (Enter)', await editLang() === 'en');

  // ================= add a language (control in the table header) =================
  ok('the "+ Add language" dropdown is in the table header, not in the toolbar', await q('.table-head [data-change=add-lang]') && !await q('.toolbar [data-change=add-lang]'));
  ok('it only offers languages the name does not have yet', !await q('.table-head [data-change=add-lang] option[value=en]') && await q('.table-head [data-change=add-lang] option[value=ta]'));
  await b.ev(`(function(){var s=document.querySelector('[data-change=add-lang]'); s.value='ta'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('adding Tamil adds a row and opens it for editing, empty and not published', await cnt('tr.clickable') === 3 && await editLang() === 'ta' && /^Not published/.test(await badge('ta')));

  // ================= side by side =================
  await b.click('[data-change=toggle-side]');
  ok('side by side: reference on the left, editing on the right', await cnt('.panel') === 2 && await b.ev(`document.querySelector('.panels .panel:first-child').classList.contains('ref') && document.querySelector('.panels .panel:last-child').classList.contains('edit')`));
  ok('the reference panel is read-only', !await q('.panel.ref input') && !await q('.panel.ref textarea') && /read-only/i.test(await txt('.panel.ref .panel-head')));
  await b.ev(`(function(){var s=document.querySelector('[data-change=set-edit]'); s.value='hi'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('choosing the editing language changes the editor', await editLang() === 'hi');
  const ref = await b.ev(`document.querySelector('.panel.ref').dataset.lang`);
  await b.ev(`(function(){var s=document.querySelector('[data-change=set-edit]'); s.value='${ref}'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('choosing the reference language for editing swaps the reference to another one', await editLang() === ref && await b.ev(`document.querySelector('.panel.ref').dataset.lang`) !== ref);
  await b.click('[data-change=toggle-side]');

  // ================= history sidebar =================
  await b.click('[data-action=toggle-history-pane]');
  ok('"Show history" opens the sidebar with exactly two tabs: Content | Other (no language tabs, no Tree tab)', await q('#history-pane') && await tabs() === 'content:Content | other:Other' && await cnt('#history-pane .hp-tab') === 2, await tabs());
  ok('Content is the tab shown first, and it is the tree: one line per content step with who and when', await b.ev(`document.querySelector('#history-pane .hp-tab.active').dataset.tab`) === 'content' && await q('#history-pane .tree') && await cnt('#history-pane .tree-row') > 5 && /Created/.test(await txt('#history-pane')) && !/Published as/.test(await txt('#history-pane')));
  ok('there is no language filter dropdown and no History page tab', !await q('[data-change=history-lang]') && !await q('.tab[data-mode]'));
  await b.click('.hp-tab[data-tab=other]');
  ok('the Other tab is a plain list of the activity that is not a content change (published, …), with the language, and no tree', /Published as template/.test(await txt('#history-pane')) && !/Created content|Edited text/.test(await txt('#history-pane')) && await events() >= 1 && await q('#history-pane .event .chip') && !await q('#history-pane .tree'));
  await b.click('tr.clickable[data-lang=en]');
  ok('choosing a language row does not change the tabs: the same two, Other still selected', await tabs() === 'content:Content | other:Other' && await b.ev(`document.querySelector('#history-pane .hp-tab.active').dataset.tab`) === 'other');
  await b.click('.hp-tab[data-tab=content]');
  const before = await cnt('#history-pane .tree-row');
  await b.fill('.panel.edit [data-input=footer]', 'Noora Health Team');
  await b.click('.panel.edit .save');
  ok('saving adds a line to the Content tree live: the language and part, who and when', await cnt('#history-pane .tree-row') === before + 1 && /^English · footer/.test(await txt('#history-pane .tree-item:first-child .tree-what')) && /Demo user/.test(await txt('#history-pane .tree-item:first-child .tree-meta')));
  await b.click('[data-change=toggle-side]');
  ok('side by side: still just Content | Other, and the languages are named on the lines', await tabs() === 'content:Content | other:Other' && /Hindi · /.test(await txt('#history-pane')) && /English · /.test(await txt('#history-pane')) && !await q('.panel.subject'));
  await b.click('[data-change=toggle-side]');
  await b.click('[data-change=toggle-side]');
  await b.click('[data-action=toggle-history-pane]');
  ok('"Hide" closes the sidebar', !await q('#history-pane'));

  // ================= block template approval =================
  await b.click(await item('Appointment reminder'));
  ok('not published yet: the block checkbox is offered', await q('[data-change=toggle-block]') && await b.ev(`!document.querySelector('[data-change=toggle-block]').checked`));
  await b.click('[data-change=toggle-block]');
  ok('blocking: a banner appears, Publish all is disabled, the list shows "no template"', await q('.banner') && await b.ev(`document.querySelector('[data-action=deploy-all]').disabled`) && /no template/.test(await txt('.content-item.active')));
  await b.click('[data-change=toggle-block]');
  ok('unblocking restores publishing', !await q('.banner') && await b.ev(`!document.querySelector('[data-action=deploy-all]').disabled`));

  // ================= publishing =================
  ok('before publishing, wa_template_name is empty for every language', await waName('en') === '—' && await waName('hi') === '—' && /empty until published/.test(await txt('.panel.edit .wa-name')));
  await b.click('[data-action=deploy-all]');
  ok('Publish all gives each non-empty language the same fake name, suffixed _v1', await waName('en') === 'appointment_reminder_v1' && await waName('hi') === 'appointment_reminder_v1' && await waName('kn') === '—', await waName('en') + ' / ' + await waName('kn'));
  ok('they are marked Published, the empty one is not; toast says what happened', /^Published/.test(await badge('en')) && /^Not published/.test(await badge('kn')) && /Published 2 translations as appointment_reminder_v1/.test(await txt('#toast')));
  ok('once published, the block checkbox is gone (removed, not disabled)', !await q('[data-change=toggle-block]') && !await q('.block-switch'));
  await b.fill('.panel.edit [data-input=text]', 'Reminder: see you on {{date}} at {{time}}.');
  await b.click('.panel.edit .save');
  ok('editing a published translation marks it "Edited since publish"', /Edited since publish/.test(await badge('en')));
  await b.click('[data-action=deploy-all]');
  ok('publishing again assigns the next version, only to what changed', await waName('en') === 'appointment_reminder_v2' && await waName('hi') === 'appointment_reminder_v1', await waName('en') + ' / ' + await waName('hi'));

  // ================= downloads =================
  await capture();
  await b.click('[data-action=csv-one]');
  const one = await b.ev(`window.__dl[0]`), oneCsv = await b.ev(`window.__blob.text()`);
  ok('"CSV" on a name downloads <slug>-<date>.csv with the four columns and only that name', /^appointment_reminder-\d{4}-\d{2}-\d{2}\.csv$/.test(one) && /^name,language,wa_template_name,text\r\n/.test(oneCsv) && !/Welcome message/.test(oneCsv) && /appointment_reminder_v2/.test(oneCsv), one);
  await b.click('[data-action=csv-all]');
  const all = await b.ev(`window.__dl[1]`), allCsv = await b.ev(`window.__blob.text()`);
  ok('the top-bar CSV downloads everything', /^content-\d{4}-\d{2}-\d{2}\.csv$/.test(all) && /Welcome message/.test(allCsv) && /Daily health tip/.test(allCsv), all);
  const bom = await b.ev(`window.__blob.arrayBuffer().then(function(x){return Array.prototype.slice.call(new Uint8Array(x).slice(0,3))})`);
  ok('the CSV file starts with a UTF-8 BOM (EF BB BF) so Excel reads Hindi correctly', JSON.stringify(bom) === '[239,187,191]' && /नमस्ते/.test(allCsv), JSON.stringify(bom));

  // ================= rename =================
  ok('Rename is a pencil on the list item (no Rename button in the header)', await q('.content-item.active .ci-edit svg') && !/Rename/.test(await txt('.content-head')) && await b.ev(`document.querySelector('.content-item.active .ci-edit').getAttribute('aria-label')`) !== '');
  await b.click('.content-item.active [data-action=rename-start]');
  ok('clicking it turns the name into a text box inside the list item, focused', await b.ev(`document.activeElement.id`) === 'rename-input' && await q('.content-item.active .ci-rename'));
  await b.fill('#rename-input', 'Visit reminder'); await b.key('Enter', 'Enter', 13);
  ok('renaming updates the name in the list', await txt('.content-item.active .name') === 'Visit reminder');
  ok('renaming is logged under Other', (await b.ev(`Store.historyFor(Store.list()[1].id,'content')[0].action`)) === 'renamed');
  await b.click('.content-item.active [data-action=rename-start]');
  await b.fill('#rename-input', 'welcome message'); await b.key('Enter', 'Enter', 13);
  ok('renaming to a clashing name is refused with a message', /already maps/.test(await txt('#toast')) && await q('#rename-input'));
  await b.key('Escape', 'Escape', 27);
  ok('Escape cancels the rename', !await q('#rename-input') && await txt('.content-item.active .name') === 'Visit reminder');

  // ================= reset =================
  await b.ev(`window.confirm = function(){ return true }; 0`);
  await b.click('[data-action=reset]');
  ok('Reset demo data brings back the sample content and All content', await txt('#list-title') === 'All content' && await cnt('.content-item') === 3 && await txt('.content-item.active .name') === 'Welcome message');
});
