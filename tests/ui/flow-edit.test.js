// The name and the timing of a flow (or a single-template flow) are edited with the pencil of its row in the Flows list: a form with visible
// fields, dropdowns and Save / Cancel buttons. They are not shown in the flow's own section any more.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('Flows list: the pencil edits the name and the timing', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const val = s => b.ev(`document.querySelector(${JSON.stringify(s)}).value`);
  const rows = () => b.ev(`[].map.call(document.querySelectorAll('#content-list .flow-item:not(.flow-edit-row)'), function(li){return li.textContent.replace(/\\s+/g, ' ').trim()})`);
  const row = n => `#content-list .flow-item:nth-child(${n})`;
  const setSel = (sel, v) => b.ev(`(function(){var s=document.querySelector(${JSON.stringify(sel)}); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  const toast = () => txt('#toast');

  await b.click('[data-action=set-list-tab][data-tab=flows]');
  await b.click('.camp-item:first-child');                                   // All content: the flow, Appointment reminder, the ten ANC messages

  // ---- the flow's own section does not repeat them
  await b.click(row(1));
  ok('the flow\'s section shows neither its name nor its timing (just the toolbar and the canvas)', !await q('.flow-head') && !await q('.flow-card') && !await q('.timing-line') && !await q('.main h2') && !/Newborn first weeks|days before/.test(await txt('.main > .toolbar')) && await q('.canvas'));
  await b.click(row(2));
  ok('a single-template flow shows the template editor without a name or timing line above it', await q('.panel.edit') && !await q('.flow-card') && !await q('.timing-line'));

  // ---- the pencil
  ok('every row of the Flows list has a pencil in its own column (hidden until you hover the row or focus it, reachable from the keyboard)', await b.ev(`[].every.call(document.querySelectorAll('#content-list .flow-item'), function(li){var p=li.querySelector('.fi-edit .ci-edit'); return !!p && p.querySelector('svg') && p.getAttribute('aria-label') && p.tabIndex === 0})`) && await b.ev(`getComputedStyle(document.querySelector('#content-list .flow-item .ci-edit')).opacity`) === '0');
  await b.hover(row(1));
  ok('hovering a row shows its pencil', await b.ev(`getComputedStyle(document.querySelector('#content-list .flow-item:nth-child(1) .ci-edit')).opacity`) === '1');
  await b.click(row(1) + ' .ci-edit');
  ok('clicking it turns that row into a form: a name box, days, before / after and reference-date dropdowns, and visible Save and Cancel buttons', await q('.flow-edit-row') && await val('#fe-name') === 'Newborn first weeks' && await val('.flow-edit-row [data-fe=days]') === '7' && await val('.flow-edit-row [data-fe=when]') === 'before' && await val('.flow-edit-row [data-fe=ref]') === 'expected_date_of_delivery' && await q('.flow-edit-row [data-action=fl-save]') && await q('.flow-edit-row [data-action=fl-cancel]') && await cntSel('.flow-edit-row select') === 2);
  ok('the fields are real fields with borders and the dropdowns are real dropdowns (not plain text)', await b.ev(`(function(){var f=document.querySelector('.flow-edit-row'); return [].every.call(f.querySelectorAll('input, select'), function(e){return getComputedStyle(e).borderTopWidth !== '0px' && getComputedStyle(e).appearance !== 'none'}) && f.querySelector('select[data-fe=ref]').options.length >= 6})()`));
  ok('the name box has the focus, ready to type', await b.ev(`document.activeElement.id`) === 'fe-name');
  ok('the other rows are still the table (the form takes just its own row)', (await rows()).length === 11 && await b.ev(`document.querySelector('.flow-edit-row').getBoundingClientRect().width >= document.getElementById('content-list').clientWidth - 4`));

  // ---- change and save
  await b.fill('#fe-name', 'First weeks at home');
  await b.fill('.flow-edit-row [data-fe=days]', '14');
  await setSel('.flow-edit-row [data-fe=when]', 'after');
  await setSel('.flow-edit-row [data-fe=ref]', 'baby_dob');
  ok('typing changes nothing yet (Save has not been pressed)', await b.ev(`Store.listFlows()[0].name`) === 'Newborn first weeks' && await b.ev(`Store.listFlows()[0].timing.days`) === 7);
  await b.click('.flow-edit-row [data-action=fl-save]');
  ok('Save applies both: the row reads "14 days after baby_dob First weeks at home" and the form is gone', !await q('.flow-edit-row') && (await rows())[0] === '14 days after baby_dob First weeks at home', (await rows())[0]);
  ok('it is saved in the flow: its name and timing, and the toast says so', await b.ev(`JSON.stringify([Store.listFlows()[0].name, Store.listFlows()[0].timing])`) === JSON.stringify(['First weeks at home', { days: 14, when: 'after', ref: 'baby_dob' }]) && /Saved/.test(await toast()));
  ok('the changes are in the flow\'s history (renamed, timing edited)', await b.ev(`Store.historyForFlow(Store.listFlows()[0].id).map(function(e){return e.action}).join()`).then(s => /flow_renamed/.test(s) && /flow_timing_edited/.test(s)));
  ok('editing does not change which entry is selected (the single-template flow chosen before is still the open one)', await q('.panel.edit') && await b.ev(`document.querySelector('#content-list .flow-item.active .name').textContent`) === 'Appointment reminder');

  // ---- cancel, Escape, Enter
  await b.click(row(1) + ' .ci-edit');
  await b.fill('#fe-name', 'Never saved');
  await b.click('.flow-edit-row [data-action=fl-cancel]');
  ok('Cancel throws the changes away', !await q('.flow-edit-row') && (await rows())[0] === '14 days after baby_dob First weeks at home');
  await b.click(row(1) + ' .ci-edit');
  await b.fill('#fe-name', 'Escaped');
  await b.key('Escape', 'Escape', 27);
  ok('Escape cancels too', !await q('.flow-edit-row') && (await rows())[0] === '14 days after baby_dob First weeks at home');
  await b.click(row(1) + ' .ci-edit');
  await b.fill('#fe-name', 'By Enter'); await b.key('Enter', 'Enter', 13);
  ok('Enter in a field saves', (await rows())[0] === '14 days after baby_dob By Enter');

  // ---- refused values
  await b.click(row(1) + ' .ci-edit');
  await b.fill('.flow-edit-row [data-fe=days]', '1000');
  await b.click('.flow-edit-row [data-action=fl-save]');
  ok('1000 days is refused with a message; the form stays open and nothing was changed', /whole number from 0 to 999/.test(await toast()) && await q('.flow-edit-row') && await b.ev(`Store.listFlows()[0].timing.days`) === 14);
  await b.fill('.flow-edit-row [data-fe=days]', '3');
  await b.fill('#fe-name', '   ');
  await b.click('.flow-edit-row [data-action=fl-save]');
  ok('an empty name is refused too, and then the days are not saved either (both or nothing)', await q('.flow-edit-row') && await b.ev(`Store.listFlows()[0].timing.days`) === 14 && await b.ev(`Store.listFlows()[0].name`) === 'By Enter');
  await b.fill('#fe-name', 'Appointment reminder');
  await b.click('.flow-edit-row [data-action=fl-save]');
  ok('a name that is already taken (here by a template) is refused with the reason, and the days are not saved', await q('.flow-edit-row') && /already|same|exists|template/i.test(await toast()) && await b.ev(`Store.listFlows()[0].timing.days`) === 14);
  await b.click('.flow-edit-row [data-action=fl-cancel]');

  // ---- a single-template flow: the template's name and its timing
  await b.click(row(2) + ' .ci-edit');
  ok('the pencil of a single-template flow edits the template (its name and its timing)', await val('#fe-name') === 'Appointment reminder' && await val('.flow-edit-row [data-fe=days]') === '7');
  await b.fill('#fe-name', 'Visit reminder'); await b.fill('.flow-edit-row [data-fe=days]', '2'); await b.click('.flow-edit-row [data-action=fl-save]');
  ok('saved: the row, the template\'s name and its timing follow', (await rows())[1] === '2 days before expected_date_of_delivery Visit reminder' && await b.ev(`Store.list().filter(function(c){return c.name==='Visit reminder'})[0].timing.days`) === 2);
  await b.click('[data-action=set-list-tab][data-tab=templates]');
  ok('and the template is renamed in the Templates list as well', /Visit reminder/.test(await txt('#content-list')));
  await b.click('[data-action=set-list-tab][data-tab=flows]');

  // ---- zero days
  await b.click(row(1) + ' .ci-edit'); await b.fill('.flow-edit-row [data-fe=days]', '0'); await b.click('.flow-edit-row [data-fe=when]').catch(() => {}); await b.click('.flow-edit-row [data-action=fl-save]');
  ok('0 days reads "on <date>" in the row', /^on baby_dob By Enter$/.test((await rows())[0]), (await rows())[0]);

  // ---- survives, and the theme
  await b.reload();
  ok('after a reload the edited details are still there', /^on baby_dob By Enter$/.test((await (async () => { await b.click('[data-action=set-list-tab][data-tab=flows]'); await b.click('.camp-item:first-child'); return (await rows())[0]; })())));
  await b.click(row(1) + ' .ci-edit');
  const bg = () => b.ev(`getComputedStyle(document.querySelector('.flow-edit-row')).backgroundColor`);
  await b.setScheme('light'); const light = await bg();
  await b.setScheme('dark'); const dark = await bg();
  await b.setScheme('light');
  ok('the form follows the theme', light !== dark, light + ' / ' + dark);

  async function cntSel(s) { return b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`); }
});
