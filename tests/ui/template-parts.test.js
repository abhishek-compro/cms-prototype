// Placeholders, header, buttons and footer per language (the orchestrator's extra_content): live editing, validation, status, export.
'use strict';
const { uiSuite } = require('../lib/harness');
const orchestrator = require('../lib/orchestrator');

uiSuite('template parts: header, body placeholders, buttons, footer', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const val = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).value`);
  const reload = async () => { await b.ev(`location.reload(); 0`); await b.sleep(900); };
  const fresh = async () => { await b.ev(`localStorage.clear(); 0`); await reload(); };
  const fill = async (sel, text) => {            // select all, then type (Backspace for empty)
    await b.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select(); return 1})()`);
    if (text === '') await b.key('Backspace', 'Backspace', 8); else await b.type(text);
  };
  const E = s => '.panel.edit ' + s, R = s => '.panel.ref ' + s;
  const probs = () => b.ev(`[].map.call(document.querySelectorAll('.panel.edit .probs li'), function(l){return l.textContent.replace(/\\s+/g,' ').trim()}).join(' | ')`);
  // pick something from the "+ Add…" dropdown of the editing panel
  const addPart = v => b.ev(`(function(){var s=document.querySelector('.panel.edit [data-change=add-part]'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  const optionState = v => b.ev(`(function(){var o=document.querySelector('.panel.edit [data-change=add-part] option[value="${v}"]'); return o ? (o.disabled ? 'disabled' : 'enabled') : 'absent'})()`);
  const visibleSecs = () => b.ev(`[].filter.call(document.querySelectorAll('.panel.edit [data-sec]'), function(e){return e.classList.contains('sec')}).map(function(e){return e.dataset.sec}).join()`);
  const phNames = () => b.ev(`[].map.call(document.querySelectorAll('.panel.edit [data-sec=placeholders] tbody tr'), function(r){return r.cells[0].querySelector('input').value+':'+r.cells[1].textContent.replace(/\\s+/g,'')}).join(' ')`);
  const rename = async (sel, name) => { await fill(sel, name); await b.key('Enter', 'Enter', 13); };
  const stored = () => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('cms-prototype-v1')))`).then(JSON.parse);
  const trOf = async (name, lang) => { const st = await stored(); const c = st.contents.find(x => x.name === name); return Object.assign({ _c: c }, c.translations.find(t => t.lang === lang)); };
  const rowBadge = lang => b.ev(`(function(){var r=document.querySelector('tr.clickable[data-lang=${lang}]'); return r ? r.cells[2].textContent.replace(/\\s+/g,' ').trim() : null})()`);
  // the Content tab with the Details of the newest steps opened (the lines alone are one-liners)
  const histDetails = async (n = 4) => { const t = await hist('content'); for (let i = 1; i <= n; i++) await b.click('.tree-item:nth-child(' + i + ') .tree-details'); return b.ev(`document.getElementById('history-pane').innerText.replace(/\\s+/g,' ')`); };
  const hist = async tab => { if (!await q('#history-pane')) await b.click('[data-action=toggle-history-pane]'); await b.click('.hp-tab[data-tab=' + tab + ']'); return b.ev(`document.getElementById('history-pane').innerText.replace(/\\s+/g,' ')`); };

  // ================= structure =================
  await fresh();
  ok('edit panel has the sections in order: header, body, placeholders, buttons, footer, problems',
    await b.ev(`[].map.call(document.querySelectorAll('.panel.edit [data-sec]'), function(e){return e.dataset.sec}).join()`) === 'header,body,placeholders,buttons,footer,add,problems');
  ok('body has a counter against the 1024 limit', /106 \/ 1024/.test(await txt(E('[data-sec=body] .sec-label'))), await txt(E('[data-sec=body] .sec-label')));
  ok('placeholders: named {{name}} -> WhatsApp position {{1}}, with its default', await phNames() === 'name:{{1}}' && await val(E('[data-input=default][data-name=name]')) === 'Friend');
  ok('no read-only copy of the body under Placeholders (the phone preview replaced it); numbering is in the table', !await q(E('.wa-body')) && !await q(E('.wa-body-text')));
  ok('buttons: 2 cards (Quick reply, URL) with the schema fields and the per-type counters', await cnt(E('.bcard')) === 2 && await q(E('[data-input=btn-payload]')) && await q(E('[data-input=btn-url]')) && /quick replies 1 \/ 3 · URL 1 \/ 1/.test(await txt(E('[data-sec=buttons] .sec-label'))));
  ok('URL button shows its own placeholder table ({{page}} -> {{1}}, default about)', await val(E('[data-input=btn-param][data-name=page]')) === 'about');
  ok('footer has its counter against 60', /12 \/ 60/.test(await txt(E('[data-sec=footer] .sec-label'))));
  ok('no problems for the seed: the problems box is not shown at all', !await q(E('.probs')));

  await b.click('[data-change=toggle-side]');
  ok('reference panel is read-only: no inputs or textareas, but shows header, body, placeholders, buttons, footer',
    !await q(R('input')) && !await q(R('textarea')) && await b.ev(`[].map.call(document.querySelectorAll('.panel.ref [data-sec]'), function(e){return e.dataset.sec}).join()`) === 'header,body,placeholders,buttons,footer');
  ok('reference shows the other language\'s button texts and footer', /और जानें/.test(await txt(R('[data-sec=buttons]'))) && /नूरा हेल्थ/.test(await txt(R('[data-sec=footer]'))));
  await b.click('[data-change=toggle-side]');

  // ================= header (one type per template, added from the dropdown) =================
  await b.click('[data-action=remove-header]');
  ok('Remove header takes the header section away in every language and offers it in the dropdown again', !await q('[data-sec=header]') && await optionState('header:image') === 'enabled' && await optionState('header:video') === 'enabled');
  await addPart('header:video');
  ok('adding "Header · Video" shows the section (focused) with type Video, and removes the header options from the dropdown', await q('[data-sec=header]') && await b.ev(`document.querySelector('.panel.edit [data-change=set-header-type]').value`) === 'video' && await b.ev(`document.activeElement.getAttribute('data-input')`) === 'header' && await optionState('header:image') === 'absent');
  ok('the header type belongs to the template, so it applies to every language', await b.ev(`Store.list()[0].headerType`) === 'video');
  await b.ev(`(function(){var s=document.querySelector('.panel.edit [data-change=set-header-type]'); s.value='document'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('the type can be changed inside the section', await b.ev(`document.querySelector('.panel.edit [data-change=set-header-type]').value`) === 'document' && await b.ev(`Store.list()[0].headerType`) === 'document');
  ok('changing the header after publishing marks published languages as edited', /Edited since publish/.test(await rowBadge('hi')), await rowBadge('hi'));
  const tree = await hist('content');
  ok('header type changes are content steps: they are in the Tree tab', /Header type: Image → None/.test(tree) && /Header type: None → Video/.test(tree) && /Header type: Video → Document/.test(tree), tree);
  await b.click('[data-action=toggle-history-pane]');

  // ================= only the body by default; everything else comes from the dropdown =================
  await fresh();
  await b.click('[data-action=open-add]'); await b.type('Brand new'); await b.click('.add-confirm');
  ok('a new template shows only the body (plus the + Add dropdown): no header, placeholders, buttons, footer, problems', await visibleSecs() === 'body,add', await visibleSecs());
  ok('an empty new translation does not show a "Body is required" problem box', !await q(E('.probs')));
  ok('the dropdown offers header types, footer, and both button kinds', await optionState('header:image') === 'enabled' && await optionState('header:video') === 'enabled' && await optionState('header:document') === 'enabled' && await optionState('footer') === 'enabled' && await optionState('button:QUICK_REPLY') === 'enabled' && await optionState('button:URL') === 'enabled');
  await addPart('footer');
  ok('Footer: the section appears empty and focused, and leaves the dropdown', await visibleSecs() === 'body,footer,add' && await b.ev(`document.activeElement.getAttribute('data-input')`) === 'footer' && await optionState('footer') === 'absent', await visibleSecs());
  ok('an added-but-empty footer is not an unsaved change (Save and Revert stay disabled)', await b.ev(`document.querySelector('.panel.edit .save').disabled && document.querySelector('.panel.edit .revert').disabled`));
  await b.click('[data-action=remove-footer]');
  ok('Remove footer hides it again and offers it in the dropdown', await visibleSecs() === 'body,add' && await optionState('footer') === 'enabled');
  await addPart('footer'); await b.type('Thanks!');
  await b.click(E('.revert'));
  ok('typing in a new footer and then choosing Revert drops it (and forgets the added section)', await visibleSecs() === 'body,add');
  await addPart('button:QUICK_REPLY');
  ok('adding a button shows the Buttons section with one focused card (and what it still needs)', await visibleSecs() === 'body,buttons,add,problems' && await cnt(E('.bcard')) === 1 && await b.ev(`document.activeElement.getAttribute('data-input')`) === 'btn-text');
  await b.click(E('[data-action=btn-remove][data-idx="0"]'));
  ok('removing the last button hides the Buttons section again', await visibleSecs() === 'body,add');
  await addPart('header:image');
  ok('a header goes above the body', await visibleSecs() === 'header,body,add');
  await b.click('[data-action=remove-header]');
  ok('Remove header takes it away', await visibleSecs() === 'body,add');
  await b.click(E('.revert'));

  // ================= the placeholder layer, live =================
  await fresh();
  await b.click(E('[data-input=text]'));
  await fill(E('[data-input=text]'), 'Hi {{first}}, {{first}} is {{age}}');
  ok('typing in the body keeps focus and the text', await b.ev(`document.activeElement.getAttribute('data-input')`) === 'text' && await val(E('[data-input=text]')) === 'Hi {{first}}, {{first}} is {{age}}');
  ok('placeholders table follows the body live: first -> {{1}} {{2}}, age -> {{3}}', await phNames() === 'first:{{1}}{{2}} age:{{3}}', await phNames());
  ok('new placeholders start without a default and are reported as problems', /\{\{first\}\} needs a default value/.test(await probs()) && /\{\{age\}\} needs a default value/.test(await probs()), await probs());
  ok('Save is enabled, dirty note shown', !await b.ev(`document.querySelector('.panel.edit .save').disabled`) && /Unsaved/.test(await txt(E('.dirty-note'))));
  await fill(E('[data-input=default][data-name=first]'), 'Asha');
  await fill(E('[data-input=default][data-name=age]'), '2 weeks');
  ok('filling defaults clears the problems (the box disappears)', !await q(E('.probs')), await probs());
  ok('the body textarea kept its text while defaults were typed', await val(E('[data-input=text]')) === 'Hi {{first}}, {{first}} is {{age}}');
  await b.click(E('.save'));
  let tr = await trOf('Welcome message', 'en');
  ok('Save stores the body and its defaults', tr.text === 'Hi {{first}}, {{first}} is {{age}}' && JSON.stringify(tr.defaults) === '{"first":"Asha","age":"2 weeks"}', JSON.stringify(tr.defaults));
  let h = await histDetails(2);
  ok('history (Content tab) has a line for the text and one for the placeholders; Details show the change', /English · text → “Hi \{\{first\}\}/.test(h) && /English · edited the placeholders/.test(h) && /age = 2 weeks/.test(h), h.slice(0, 400));
  await b.click('[data-action=toggle-history-pane]');

  // renaming drops stale defaults
  await fill(E('[data-input=text]'), 'Only {{age}} now');
  await b.click(E('.save'));
  tr = await trOf('Welcome message', 'en');
  ok('defaults of placeholders that left the body are dropped on save', JSON.stringify(tr.defaults) === '{"age":"2 weeks"}', JSON.stringify(tr.defaults));

  // invalid names / too many uses
  await fill(E('[data-input=text]'), 'a {{item0}} b {{first name}} c {{x}}{{x}}{{x}}{{x}}{{x}}{{x}}');
  const pr = await probs();
  ok('invalid placeholder names are reported (digit 0 and spaces)', /\{\{item0\}\} is not a valid placeholder/.test(pr) && /\{\{first name\}\} is not a valid placeholder/.test(pr), pr);
  ok('a placeholder used more than 5 times is reported', /\{\{x\}\} is used 6 times; the maximum is 5/.test(pr), pr);
  await fill(E('[data-input=text]'), 'x'.repeat(1030));
  ok('body over 1024 characters: counter turns red and a problem appears', await q(E('[data-count=text].over')) && /1030 characters; WhatsApp allows 1024/.test(await probs()));
  await b.click(E('.revert'));
  ok('Revert restores the saved parts', (await val(E('[data-input=text]'))) === 'Only {{age}} now' && await b.ev(`document.querySelector('.panel.edit .save').disabled`));

  // ================= buttons: at most 3 quick replies and 1 URL button, added from the dropdown =================
  await fresh();
  ok('the seed already has a URL button: the URL option is disabled, quick reply is available', await optionState('button:URL') === 'disabled' && await optionState('button:QUICK_REPLY') === 'enabled');
  await addPart('button:QUICK_REPLY');
  ok('adding a quick reply adds a card, focuses its Text field and updates the counter', await cnt(E('.bcard')) === 3 && await b.ev(`document.activeElement.getAttribute('data-input')`) === 'btn-text' && /quick replies 2 \/ 3 · URL 1 \/ 1/.test(await txt(E('[data-sec=buttons] .sec-label'))));
  ok('the dropdown shows how many quick replies are used', /2 of 3 used/.test(await b.ev(`document.querySelector('.panel.edit option[value="button:QUICK_REPLY"]').textContent`)));
  ok('empty new button is reported (text and payload)', /Button 3 needs text/.test(await probs()) && /Button 3 needs a default payload/.test(await probs()), await probs());
  await b.type('A text that is far too long for a button');
  ok('button text over 25: counter red + problem', await q(E('[data-count=btn-text-2].over')) && /Button 3 text is 40 characters; the maximum is 25/.test(await probs()), await probs());
  await fill(E('[data-input=btn-text][data-idx="2"]'), 'Call me');
  await fill(E('[data-input=btn-payload][data-idx="2"]'), 'call_me');
  ok('valid quick reply clears its problems', !/Button 3/.test(await probs()), await probs());

  // the URL button (Button 2): its variables follow the URL live
  await fill(E('[data-input=btn-url][data-idx="1"]'), 'ftp://x.org/{{id}}');
  ok('typing a URL keeps focus in the URL field', await b.ev(`document.activeElement.getAttribute('data-input')`) === 'btn-url' && await val(E('[data-input=btn-url][data-idx="1"]')) === 'ftp://x.org/{{id}}');
  ok('the URL variable appears live in the button\'s own table (the old one is gone); a non-http URL is a problem; the default is required',
    await q(E('[data-params="1"] [data-name=id]')) && !await q(E('[data-params="1"] [data-name=page]')) && /Button 2 URL must be a valid http/.test(await probs()) && /Button 2 \{\{id\}\} needs a default value/.test(await probs()), await probs());
  await fill(E('[data-input=btn-url][data-idx="1"]'), 'https://x.org/{{id}}/{{id}}');
  await fill(E('[data-input=btn-param][data-idx="1"][data-name=id]'), '42');
  ok('a URL variable used twice gets positions {{1}} {{2}}', (await b.ev(`document.querySelector('.panel.edit [data-params="1"] tbody tr').cells[1].textContent.replace(/\\s+/g,'')`)) === '{{1}}{{2}}');
  ok('button 2 is valid now', !/Button 2/.test(await probs()), await probs());
  await b.click(E('.save'));
  tr = await trOf('Welcome message', 'en');
  ok('Save stores the buttons in the schema shape (default_payload / url + default_parameters)',
    tr.buttons.length === 3 && tr.buttons[2].default_payload === 'call_me' && tr.buttons[1].url === 'https://x.org/{{id}}/{{id}}' && JSON.stringify(tr.buttons[1].default_parameters) === '{"id":"42"}', JSON.stringify(tr.buttons.slice(1)));
  h = await histDetails(1);
  ok('history shows a line for the buttons; its Details have the new button lines', /English · edited the buttons/.test(h) && /Quick reply "Call me" → call_me/.test(h), h.slice(0, 400));
  await b.click('[data-action=toggle-history-pane]');

  // the limits
  await addPart('button:QUICK_REPLY');
  ok('three quick replies: the dropdown option is disabled and says all are used; the counter shows 3 / 3', await optionState('button:QUICK_REPLY') === 'disabled' && /all 3 used|3 of 3 used/.test(await b.ev(`document.querySelector('.panel.edit option[value="button:QUICK_REPLY"]').textContent`)) && /quick replies 3 \/ 3/.test(await txt(E('[data-sec=buttons] .sec-label'))));
  await addPart('button:QUICK_REPLY');
  ok('choosing a disabled option adds nothing', await cnt(E('.bcard')) === 4);
  ok('the URL option is disabled too (one URL button already) and says so', await optionState('button:URL') === 'disabled' && /already added/.test(await b.ev(`document.querySelector('.panel.edit option[value="button:URL"]').textContent`)));
  await b.click(E('[data-action=btn-remove][data-idx="1"]'));
  ok('removing the URL button frees the URL slot (the dropdown updates; quick replies stay at 3 / 3)', await optionState('button:URL') === 'enabled' && await optionState('button:QUICK_REPLY') === 'disabled' && /quick replies 3 \/ 3 · URL 0 \/ 1/.test(await txt(E('[data-sec=buttons] .sec-label'))) && await cnt(E('.bcard')) === 3);
  await addPart('button:URL');
  ok('adding a URL button puts it back at 1 / 1 and disables the URL option again', await optionState('button:URL') === 'disabled' && /URL 1 \/ 1/.test(await txt(E('[data-sec=buttons] .sec-label'))));
  await b.click(E('.revert'));

  // ================= rename a placeholder; one name can fill several WhatsApp numbers =================
  await fresh();
  ok('names are editable fields (shown as {{ name }}), and a hint explains renaming and sharing a name', await q(E('[data-change=ph-rename][data-name=name]')) && /rename it everywhere/.test(await txt(E('.ph-help'))));
  await rename(E('[data-change=ph-rename][data-name=name]'), 'friend');
  ok('renaming rewrites the body and keeps the default', await val(E('[data-input=text]')) === 'Hello {{friend}}, welcome to Noora Health. We will share simple tips to help you care for your newborn baby.' && await phNames() === 'friend:{{1}}' && await val(E('[data-input=default][data-name=friend]')) === 'Friend');
  ok('a rename is an unsaved edit: Save enabled, body counter updated', !await b.ev(`document.querySelector('.panel.edit .save').disabled`) && await q(E('[data-count=text]')));
  await b.click(E('.save'));
  tr = await trOf('Welcome message', 'en');
  ok('Save stores the new name in the body and in the defaults (the old name is gone)', /\{\{friend\}\}/.test(tr.text) && !/\{\{name\}\}/.test(tr.text) && JSON.stringify(tr.defaults) === '{"friend":"Friend"}', JSON.stringify(tr.defaults));
  ok('the extra_content positions follow the new name', await b.ev(`JSON.stringify(Store.toExtraContent(Store.list()[0].id).body_param_positions.en)`) === '{"friend":[1]}');

  await fill(E('[data-input=text]'), 'Hi {{first}}, aka {{nick}} ({{first}}) in {{city}}');
  await fill(E('[data-input=default][data-name=first]'), 'Asha');
  await fill(E('[data-input=default][data-name=nick]'), 'Ash');
  await fill(E('[data-input=default][data-name=city]'), 'Pune');
  ok('before merging: three names, positions 1+3, 2, 4', await phNames() === 'first:{{1}}{{3}} nick:{{2}} city:{{4}}', await phNames());
  await rename(E('[data-change=ph-rename][data-name=nick]'), 'first');
  ok('renaming to an existing name MERGES them: that one name now targets several numbers (1, 2, 3)', await phNames() === 'first:{{1}}{{2}}{{3}} city:{{4}}', await phNames());
  ok('the existing default wins in a merge', await val(E('[data-input=default][data-name=first]')) === 'Asha');
  ok('the body was rewritten and a toast explains the merge', await val(E('[data-input=text]')) === 'Hi {{first}}, aka {{first}} ({{first}}) in {{city}}' && /one value fills several WhatsApp positions/.test(await txt('#toast')));
  ok('the schema\'s limit of 5 uses per name still applies to a merged name', await b.ev(`JSON.stringify(Store.positionsOf(document.querySelector('.panel.edit [data-input=text]').value).first)`) === '[1,2,3]');
  await fill(E('[data-input=text]'), 'a {{x}} b {{y}} c {{y}} d {{y}} e {{y}} f {{y}}');
  await fill(E('[data-input=default][data-name=x]'), 'X'); await fill(E('[data-input=default][data-name=y]'), 'Y');
  await rename(E('[data-change=ph-rename][data-name=x]'), 'y');
  ok('merging into six uses is allowed while editing but reported as a problem', /\{\{y\}\} is used 6 times; the maximum is 5/.test(await probs()), await probs());

  // rejected names
  await fill(E('[data-input=text]'), 'Hi {{a}} {{b}}');
  await fill(E('[data-input=default][data-name=a]'), 'A'); await fill(E('[data-input=default][data-name=b]'), 'B');
  await rename(E('[data-change=ph-rename][data-name=a]'), 'my name');
  ok('an invalid name is refused with a message and the field goes back', /letters, digits 1-9 and _ only/.test(await txt('#toast')) && await val(E('[data-input=text]')) === 'Hi {{a}} {{b}}' && await phNames() === 'a:{{1}} b:{{2}}', await phNames());
  await rename(E('[data-change=ph-rename][data-name=a]'), 'item0');
  ok('a name with the digit 0 is refused too (the orchestrator\'s pattern has no 0)', await val(E('[data-input=text]')) === 'Hi {{a}} {{b}}');
  await rename(E('[data-change=ph-rename][data-name=a]'), '  a  ');
  ok('the same name (spaces trimmed) changes nothing', await val(E('[data-input=text]')) === 'Hi {{a}} {{b}}' && await phNames() === 'a:{{1}} b:{{2}}');
  await b.click(E('.revert'));

  // URL button placeholders can be renamed the same way
  await rename(E('[data-change=btn-ph-rename][data-idx="1"][data-name=page]'), 'section');
  ok('a URL variable is renamed in the URL and keeps its default', await val(E('[data-input=btn-url][data-idx="1"]')) === 'https://www.noorahealth.org/{{section}}' && await val(E('[data-input=btn-param][data-idx="1"][data-name=section]')) === 'about');
  await b.click(E('.save'));
  tr = await trOf('Welcome message', 'en');
  ok('Save stores the renamed URL variable', tr.buttons[1].url.endsWith('{{section}}') && JSON.stringify(tr.buttons[1].default_parameters) === '{"section":"about"}', JSON.stringify(tr.buttons[1]));
  ok('the reference panel shows names read-only (no rename fields)', await (async () => { await b.click('[data-change=toggle-side]'); const r = !await q(R('[data-change=ph-rename]')) && /\{\{name\}\}|\{\{friend\}\}/.test(await txt(R('[data-sec=placeholders]'))); await b.click('[data-change=toggle-side]'); return r; })());

  // ================= footer =================
  await fresh();
  await fill(E('[data-input=footer]'), 'f'.repeat(61));
  ok('footer over 60: counter red + problem', await q(E('[data-count=footer].over')) && /Footer is 61 characters; WhatsApp allows 60/.test(await probs()), await probs());
  await fill(E('[data-input=footer]'), 'Hello {{name}}');
  ok('placeholders in the footer are rejected', /Footer cannot contain placeholders/.test(await probs()));
  await b.click(E('.revert'));

  // ================= status, publishing and gating =================
  await fresh();
  ok('Hindi starts Published', /^Published/.test(await rowBadge('hi')), await rowBadge('hi'));
  await b.click('tr.clickable[data-lang=hi]');
  await fill(E('[data-input=footer]'), 'नूरा हेल्थ टीम');
  await b.click(E('.save'));
  ok('editing only the footer after publishing marks it "Edited since publish"', /Edited since publish/.test(await rowBadge('hi')), await rowBadge('hi'));
  await fill(E('[data-input=footer]'), 'नूरा हेल्थ');
  await b.click(E('.save'));
  ok('restoring the published footer makes it Published again (status compares all parts)', /^Published/.test(await rowBadge('hi')), await rowBadge('hi'));
  await fill(E('[data-input=default][data-name=name]'), 'मित्र');
  await b.click(E('.save'));
  ok('editing only a placeholder default also counts as an edit', /Edited since publish/.test(await rowBadge('hi')));

  // gating: Appointment reminder en gets a placeholder without a default
  await b.click('.content-item[data-id="' + await b.ev(`Store.list()[1].id`) + '"]');
  await fill(E('[data-input=text]'), 'Visit on {{date}} at {{time}} with {{doctor}}');
  await b.click(E('.save'));
  ok('overview flags the language with problems', /1 problem/.test(await rowBadge('en')), await rowBadge('en'));
  await b.click('[data-action=deploy-all]');
  ok('Publish all skips the translation with problems, publishes the valid one, and says so', /Published 1 translation/.test(await txt('#toast')) && /1 skipped: has problems/.test(await txt('#toast')), await txt('#toast'));
  ok('the skipped one stays unpublished', /^Not published/.test(await rowBadge('en')) && /^Published/.test(await rowBadge('hi')));
  ok('"Publish all" is disabled when nothing publishable is left', await b.ev(`document.querySelector('[data-action=deploy-all]').disabled`));

  // ================= export =================
  await fresh();
  await b.ev(`(function(){window.__dl=[]; var o=URL.createObjectURL; URL.createObjectURL=function(bl){window.__blob=bl; return o.call(URL,bl)}; HTMLAnchorElement.prototype.click=function(){window.__dl.push(this.download)}; return 1})()`);
  ok('there is no JSON download in the UI (only CSV)', !await q('[data-action=json-one]') && !await b.ev(`/JSON/.test(document.querySelector('.toolbar').textContent)`));
  await b.click('[data-action=csv-one]');
  const csv = await b.ev(`window.__blob.text()`);
  ok('CSV columns unchanged; text column carries the named-placeholder body', /^﻿?name,language,wa_template_name,text\r\n/.test(csv) && /Hello {{name}}, welcome/.test(csv), csv.slice(0, 200));

  // ================= persistence and legacy data =================
  await b.ev(`(function(){var s=JSON.parse(localStorage.getItem('cms-prototype-v1')); s.contents.forEach(function(c){ delete c.headerType; c.translations.forEach(function(t){ delete t.footer; delete t.header; delete t.defaults; delete t.buttons; delete t.deployedSig; t.text = t.text.replace(/\\{\\{name\\}\\}/g,'{{1}}'); }); }); localStorage.setItem('cms-prototype-v1', JSON.stringify(s)); return 1})()`);
  await reload();
  const st = await stored();
  ok('legacy data (no parts, {{1}} placeholders, no deployedSig) loads and is migrated', st.contents.every(c => c.headerType === 'none' && c.translations.every(t => t.footer === '' && t.header === '' && typeof t.defaults === 'object' && Array.isArray(t.buttons))));
  ok('legacy published translations keep their status (compared by text)', /^(Published|Edited since publish)/.test(await rowBadge('hi')), await rowBadge('hi'));
  ok('legacy {{1}} is just a placeholder named "1" that needs a default', /\{\{1\}\} needs a default value/.test(await probs()), await probs());

  // ================= theme + layout + console =================
  await fresh();
  await b.click('[data-change=toggle-side]');
  await b.ev(`document.querySelector('[data-theme=dark]').click(); 0`); await b.sleep(200);

});
