// Flows tab (content sidebar): templates that are flows by themselves, creating flows, steps with timing,
// reordering by dragging, copying/moving a flow to a campaign.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flows: list, single-template flows, steps and timing, reordering, copy/move', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const val = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).value`);
  const tab = n => b.click('[data-action=set-list-tab][data-tab=' + n + ']');
  const camp = id => b.click('[data-action=select-campaign][data-id="' + id + '"]');
  const flowNames = () => b.ev(`[].map.call(document.querySelectorAll('#content-list .flow-item .name'), function(e){return e.childNodes[0].textContent.trim()}).join(' | ')`);
  const meta = n => b.ev(`(function(){var r=[].filter.call(document.querySelectorAll('#content-list .flow-item'), function(e){return e.querySelector('.name').childNodes[0].textContent.trim()===${JSON.stringify(n)}})[0]; return r ? r.querySelector('.flow-meta').textContent.trim() : null})()`);
  const hasIndicator = n => b.ev(`(function(){var r=[].filter.call(document.querySelectorAll('#content-list .flow-item'), function(e){return e.querySelector('.name').childNodes[0].textContent.trim()===${JSON.stringify(n)}})[0]; return !!(r && r.querySelector('.flow-ind'))})()`);
  const steps = () => b.ev(`[].map.call(document.querySelectorAll('.step-row .step-name'), function(e){return e.textContent.trim()}).join(' | ')`);
  const stepTiming = i => b.ev(`(function(){var t=document.querySelector('.step-row[data-idx="${i}"] .timing'); return t.querySelector('[data-t=days]').value+' '+t.querySelector('[data-t=when]').value+' '+t.querySelector('[data-t=ref]').value})()`);
  const flowOrder = () => b.ev(`Store.listFlows().map(function(f){return f.name}).join(' | ')`);
  const idOfFlow = n => b.ev(`Store.listFlows().filter(function(f){return f.name===${JSON.stringify(n)}})[0].id`);
  const idOfTpl = n => b.ev(`Store.list().filter(function(c){return c.name===${JSON.stringify(n)}})[0].id`);
  const flowItem = async n => '#content-list .flow-item[data-kind="flow"][data-id="' + await idOfFlow(n) + '"]';
  const tplItem = async n => '#content-list .flow-item[data-kind="template"][data-id="' + await idOfTpl(n) + '"]';
  const grip = sel => sel + ' .drag-handle';
  const opts = () => b.ev(`[].map.call(document.querySelectorAll('.dlg-opt'), function(o){return o.querySelector('strong').textContent + (o.disabled ? '(off)' : '')}).join(' | ')`);
  const optDesc = w => b.ev(`document.querySelector('[data-action=dialog-${w}] span').textContent`);
  const existing = () => b.ev(`[].map.call(document.querySelectorAll('.exists-list li'), function(l){return l.textContent.replace(/\\s+/g,' ').trim()}).join(' | ')`);
  const setTiming = async (boxSel, days, when, ref) => {       // edit the three fields of a timing row, committing each like a user would
    if (days !== undefined) { await b.fill(boxSel + ' [data-t=days]', String(days)); await b.key('Enter', 'Enter', 13); }
    if (when !== undefined) { await b.ev(`(function(){var s=document.querySelector(${JSON.stringify(boxSel + ' [data-t=when]')}); s.value=${JSON.stringify(when)}; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`); }
    if (ref !== undefined) { await b.fill(boxSel + ' [data-t=ref]', ref); await b.key('Enter', 'Enter', 13); }
  };

  // ================= the tab and what it lists =================
  ok('the content sidebar has Templates | Flows tabs, Templates first and selected', await b.ev(`[].map.call(document.querySelectorAll('.sidebar .list-tab'), function(t){return t.textContent.trim()+(t.classList.contains('active')?'*':'')}).join(' | ')`) === 'Templates* | Flows');
  await tab('flows');
  ok('Flows tab is selected and lists flows, not templates', await b.ev(`document.querySelector('.list-tab.active').textContent.trim()`) === 'Flows' && await cnt('#content-list .flow-item') === 2 && !await q('#content-list .content-item:not(.flow-item)'));
  ok('All content: the flow you created first, then the template that is a flow by itself', await flowNames() === 'Newborn first weeks | Appointment reminder', await flowNames());
  ok('only the template-as-flow carries the indicator, with its tooltip', await hasIndicator('Appointment reminder') && !await hasIndicator('Newborn first weeks') && await b.ev(`document.querySelector('#content-list .flow-ind').title`) === 'This template is itself a flow');
  ok('every item mentions its timing: a flow gives first -> last, a template its own', await meta('Newborn first weeks') === '2 templates · 14 days before expected_date_of_delivery → 7 days after expected_date_of_delivery' && await meta('Appointment reminder') === '7 days before expected_date_of_delivery', await meta('Newborn first weeks') + ' // ' + await meta('Appointment reminder'));
  await camp('k1');
  ok('Newborn care: just the flow - its two templates are inside it, so they are not listed alone', await flowNames() === 'Newborn first weeks', await flowNames());
  await camp('k2');
  ok('Postnatal check-ups: Appointment reminder is a flow by itself', await flowNames() === 'Appointment reminder');
  await camp('k3');
  ok('Immunisation: nothing yet', await flowNames() === '' && /No flows yet/.test(await txt('#content-list')));
  ok('the list heading follows the campaign', await txt('#list-title') === 'Immunisation');
  await b.click('[data-action=open-add]');
  ok('the + box says "New flow name" in this tab', await b.ev(`document.getElementById('new-name').placeholder`) === 'New flow name');
  await b.key('Escape', 'Escape', 27);
  await camp('');
  await tab('templates');
  ok('the Templates tab is untouched: it still lists the three templates', await cnt('#content-list .content-item') === 3 && !await q('#content-list .flow-ind'));
  await tab('flows');

  // ================= a template that is a flow by itself =================
  await b.click(await tplItem('Appointment reminder'));
  ok('it opens with a flow card (indicator + "Sent <timing>") above the normal template editor', await q('.flow-card .flow-ind') && /This template is itself a flow/.test(await txt('.flow-card')) && await txt('.content-head h2') === 'Appointment reminder' && await q('.panel.edit'));
  ok('the timing starts with the dummy values: 7 days before expected_date_of_delivery', await val('.flow-card [data-t=days]') === '7' && await val('.flow-card [data-t=when]') === 'before' && await val('.flow-card [data-t=ref]') === 'expected_date_of_delivery');
  await setTiming('.flow-card .timing', 3);
  ok('editing the days updates the card, the list and the saved template', await val('.flow-card [data-t=days]') === '3' && await meta('Appointment reminder') === '3 days before expected_date_of_delivery' && await b.ev(`Store.list()[1].timing.days`) === 3, await meta('Appointment reminder'));
  await setTiming('.flow-card .timing', undefined, 'after');
  ok('before / after can be switched', await meta('Appointment reminder') === '3 days after expected_date_of_delivery');
  await setTiming('.flow-card .timing', undefined, undefined, 'Date Of Birth');
  ok('the reference date is any name: spaces and capitals are tidied to date_of_birth', await val('.flow-card [data-t=ref]') === 'date_of_birth' && await meta('Appointment reminder') === '3 days after date_of_birth', await val('.flow-card [data-t=ref]'));
  await setTiming('.flow-card .timing', 0);
  ok('0 days reads "on <reference date>"', await meta('Appointment reminder') === 'on date_of_birth');
  await setTiming('.flow-card .timing', -2);
  ok('a negative number is refused with a message and the field goes back', /whole number from 0 to 999/.test(await txt('#toast')) && await val('.flow-card [data-t=days]') === '0');
  await setTiming('.flow-card .timing', 1000);
  ok('over 999 is refused too', /whole number from 0 to 999/.test(await txt('#toast')) && await val('.flow-card [data-t=days]') === '0');
  await setTiming('.flow-card .timing', undefined, undefined, '1st date');
  ok('a reference that is not a name is refused', /reference date is a name/.test(await txt('#toast')) && await val('.flow-card [data-t=ref]') === 'date_of_birth', await txt('#toast'));
  await b.click('[data-action=toggle-history-pane]'); await b.click('.hp-tab[data-tab=other]');
  const other = await b.ev(`document.getElementById('history-pane').innerText.replace(/\\s+/g,' ')`);
  ok('each timing change is in the template\'s Other history (by the user, before -> after)', /Changed timing/.test(other) && /Demo user/.test(other) && /expected_date_of_delivery/.test(other) && /date_of_birth/.test(other), other.slice(0, 300));
  await b.click('[data-action=toggle-history-pane]');

  // ================= create a flow, add templates, timing per step =================
  await camp('k2');
  await b.click('[data-action=open-add]'); await b.type('Appointment reminder'); await b.key('Enter', 'Enter', 13);
  ok('a flow cannot be named like a template (they are listed together)', /A template is already called/.test(await txt('#new-error')) && await q('#new-name'));
  await b.fill('#new-name', 'Postnatal reminders');
  await b.click('.add-confirm');
  ok('the new flow is created in the selected campaign, selected, empty; the box closes', await txt('.content-head h2') === 'Postnatal reminders' && /Flow · 0 templates · Campaign: Postnatal check-ups/.test(await txt('.content-head')) && !await q('#new-name'));
  ok('it is listed before the single-template flows', await flowNames() === 'Postnatal reminders | Appointment reminder', await flowNames());
  ok('an empty flow says so and offers the templates in the dropdown', /No templates in this flow yet/.test(await txt('.main')) && await b.ev(`document.querySelectorAll('[data-change=add-step] option').length`) === 4);
  const sel = (v) => b.ev(`(function(){var s=document.querySelector('[data-change=add-step]'); s.value=${JSON.stringify(v)}; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  await sel(await idOfTpl('Appointment reminder'));
  ok('adding a template makes a step that starts with that template\'s timing as it is now (0 days after date_of_birth, not the original dummy)', await steps() === 'Appointment reminder' && await stepTiming(0) === '0 after date_of_birth', await stepTiming(0));
  ok('now it is in a flow, so it is no longer listed by itself: the list only has the flow', await flowNames() === 'Postnatal reminders', await flowNames());
  ok('the dropdown no longer offers a template that is already in the flow', await b.ev(`document.querySelectorAll('[data-change=add-step] option').length`) === 3);
  await sel(await idOfTpl('Welcome message'));
  ok('a second template is step 2; adding it also put it in this flow\'s campaign', await steps() === 'Appointment reminder | Welcome message' && await b.ev(`Store.list()[0].campaignIds.join()`) === 'k1,k2');
  await setTiming('.step-row[data-idx="1"] .timing', 5, 'before', 'expected_date_of_delivery');
  ok('each step has its own timing, and the list shows first -> last', await stepTiming(1) === '5 before expected_date_of_delivery' && await stepTiming(0) === '0 after date_of_birth' && await meta('Postnatal reminders') === '2 templates · on date_of_birth → 5 days before expected_date_of_delivery', await meta('Postnatal reminders'));
  await b.click('.step-row[data-idx="1"] [data-action=open-template]');
  ok('clicking a step\'s name opens that template in the Templates tab', await b.ev(`document.querySelector('.list-tab.active').textContent.trim()`) === 'Templates' && await txt('.content-head h2') === 'Welcome message');
  await tab('flows');
  ok('back in Flows the flow is still selected', await txt('.content-head h2') === 'Postnatal reminders' && await steps() === 'Appointment reminder | Welcome message');

  // ================= reorder the steps by dragging =================
  await b.drag('.step-row[data-idx="1"] .drag-handle', '.step-row[data-idx="0"]', { fy: 0.2 });
  ok('dragging step 2 onto the top half of step 1 puts it first, and its timing goes with it', await steps() === 'Welcome message | Appointment reminder' && await stepTiming(0) === '5 before expected_date_of_delivery' && await stepTiming(1) === '0 after date_of_birth', await steps());
  await b.drag('.step-row[data-idx="0"] .drag-handle', '.step-row[data-idx="1"]', { fy: 0.8 });
  ok('dropping on the bottom half puts it after', await steps() === 'Appointment reminder | Welcome message', await steps());
  await b.drag('.step-row[data-idx="0"] .drag-handle', '.step-row[data-idx="0"]');
  ok('dropping a step on itself changes nothing', await steps() === 'Appointment reminder | Welcome message');
  let started = true;
  try { await b.drag('.step-row[data-idx="0"] .step-name', '.step-row[data-idx="1"]'); } catch (e) { started = !/not intercepted/.test(e.message); }
  ok('only the handle starts a drag: pressing on the step\'s name does not', !started && await steps() === 'Appointment reminder | Welcome message');
  await b.click('[data-action=toggle-history-pane]');
  const fh = await b.ev(`document.getElementById('history-pane').innerText.replace(/\\s+/g,' ')`);
  ok('a flow has its own history: one "Flow" tab with created, added, reordered, timing events', await cnt('#history-pane .hp-tab') === 1 && /Created flow/.test(fh) && /Added a template/.test(fh) && /Reordered the templates/.test(fh) && /Changed timing/.test(fh) && /Demo user/.test(fh), fh.slice(0, 300));
  await b.click('[data-action=toggle-history-pane]');
  await b.click('.step-row[data-idx="1"] [data-action=step-remove]');
  ok('Remove takes a template out of the flow', await steps() === 'Appointment reminder');
  ok('Welcome message is in no flow of Postnatal check-ups now, so it is listed there as a flow by itself', await flowNames() === 'Postnatal reminders | Welcome message', await flowNames());
  await camp('k1');
  ok('in Newborn care it is still inside the Newborn flow, so it is not listed alone there', await flowNames() === 'Newborn first weeks', await flowNames());
  await camp('k2');
  await b.click('.step-row[data-idx="0"] [data-action=step-remove]');
  ok('removing the last step leaves the flow empty and both templates are flows by themselves again', await flowNames() === 'Postnatal reminders | Welcome message | Appointment reminder' && /No templates in this flow yet/.test(await txt('.main')), await flowNames());

  // ================= reorder the flows in the list =================
  await b.fresh();
  await tab('flows');
  await b.click('[data-action=open-add]'); await b.type('Flow A'); await b.key('Enter', 'Enter', 13);
  await b.click('[data-action=open-add]'); await b.type('Flow B'); await b.key('Enter', 'Enter', 13);
  ok('the flows you create are added in order, before the single-template flows', await flowNames() === 'Newborn first weeks | Flow A | Flow B | Appointment reminder', await flowNames());
  await b.drag(grip(await flowItem('Flow B')), await flowItem('Newborn first weeks'), { fy: 0.15 });
  ok('dragging Flow B onto the top half of the first flow puts it first', await flowNames() === 'Flow B | Newborn first weeks | Flow A | Appointment reminder' && await flowOrder() === 'Flow B | Newborn first weeks | Flow A', await flowNames());
  await b.drag(grip(await flowItem('Flow B')), await flowItem('Flow A'), { fy: 0.85 });
  ok('onto the bottom half puts it after', await flowOrder() === 'Newborn first weeks | Flow A | Flow B', await flowOrder());
  await b.drag(grip(await flowItem('Flow A')), await tplItem('Appointment reminder'));
  ok('a template that is a flow by itself is not a place to drop: nothing moves', await flowOrder() === 'Newborn first weeks | Flow A | Flow B');
  await b.drag(grip(await tplItem('Appointment reminder')), await flowItem('Flow A'), { fy: 0.2 });
  ok('and a template that is a flow by itself cannot be reordered (it always follows the flows you made)', await flowNames() === 'Newborn first weeks | Flow A | Flow B | Appointment reminder' && !await q('.modal'));
  await b.click('[data-action=toggle-history-pane]'); await b.click(await flowItem('Flow B'));
  ok('the reorder is in that flow\'s history', /Moved in the flow list/.test(await b.ev(`document.getElementById('history-pane').innerText`)));
  await b.click('[data-action=toggle-history-pane]');
  await b.reload(); await tab('flows');
  ok('the order survives a reload', await flowNames() === 'Newborn first weeks | Flow A | Flow B | Appointment reminder', await flowNames());
  ok('and so do a flow\'s steps and their timing', await b.ev(`Store.listFlows()[0].steps.map(function(s){return s.timing.days+' '+s.timing.when}).join(' | ')`) === '14 before | 7 after');

  // ================= refer / duplicate / move a flow to a campaign =================
  await b.fresh();
  await tab('flows');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  ok('dropping a flow on a campaign opens a dialog with four options: Refer same flow, Duplicate flow, Move flow, Cancel', await q('.modal[role=dialog]') && /Newborn first weeks.*→.*Immunisation/.test(await txt('#dlg-title')) && await opts() === 'Refer same flow | Duplicate flow | Move flow | Cancel', await opts());
  ok('it lists where the flow already is (read-only), above the options', await existing() === 'Newborn care' && await b.ev(`document.querySelector('.exists-list').getBoundingClientRect().bottom <= document.querySelector('.dlg-options').getBoundingClientRect().top`));
  ok('each option says what it does, including what happens to the templates inside',
    /The same flow also appears in Immunisation \(and stays in Newborn care\), so editing it changes it everywhere\. 2 templates will be added to Immunisation too/.test(await optDesc('refer')) &&
    /independent copy called “Newborn first weeks \(copy\)” in Immunisation; editing either one leaves the other alone\. The templates are shared, not duplicated\. 2 templates will be added to Immunisation too/.test(await optDesc('duplicate')) &&
    /Remove it from Newborn care and add it to Immunisation\. 2 templates move with it/.test(await optDesc('move')), await optDesc('refer') + ' // ' + await optDesc('duplicate') + ' // ' + await optDesc('move'));
  await b.click('[data-action=dialog-cancel]');
  ok('Cancel changes nothing', !await q('.modal') && await b.ev(`Store.listFlows()[0].campaignIds.join()`) === 'k1');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  await b.click('[data-action=dialog-refer]');
  ok('Refer same flow: the one flow is in both campaigns, its templates were added to Immunisation too', await b.ev(`Store.listFlows()[0].campaignIds.join()`) === 'k1,k3' && await b.ev(`Store.list().slice(0,3).filter(function(c){return c.campaignIds.indexOf('k3')!==-1}).map(function(c){return c.name}).join(' | ')`) === 'Welcome message | Daily health tip', await b.ev(`Store.listFlows()[0].campaignIds.join()`));
  ok('it is still one flow (no second flow appeared), and the toast says so', await b.ev(`Store.listFlows().length`) === 1 && /Flow “Newborn first weeks” is now also in Immunisation/.test(await txt('#toast')), await txt('#toast'));
  await camp('k3');
  ok('Immunisation now lists the flow (its templates are inside it, so none alone)', await flowNames() === 'Newborn first weeks', await flowNames());
  await camp('');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k2]');
  ok('a flow in two campaigns cannot be moved: "Can\'t move" with the reason; Refer and Duplicate still work', await opts() === "Refer same flow | Duplicate flow | Can't move(off) | Cancel" && /2 campaigns \(Newborn care, Immunisation\)/.test(await optDesc('move')), await opts());
  await b.key('Escape', 'Escape', 27);
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  ok('dropping it on a campaign that already has it disables Refer (with the reason) but Duplicate stays available', /^Refer same flow\(off\) \| Duplicate flow \| Can't move\(off\)/.test(await opts()) && /Already in Immunisation/.test(await optDesc('refer')), await opts());
  await b.key('Escape', 'Escape', 27);

  // duplicate: an independent new flow
  await b.fresh();
  await tab('flows');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  await b.click('[data-action=dialog-duplicate]');
  ok('Duplicate flow: a second flow appears, named "(copy)", right after the original', await flowOrder() === 'Newborn first weeks | Newborn first weeks (copy)' && /Duplicated flow “Newborn first weeks” to Immunisation as “Newborn first weeks \(copy\)”/.test(await txt('#toast')), await flowOrder() + ' / ' + await txt('#toast'));
  ok('the copy is only in the target campaign; the original stays where it was', await b.ev(`Store.listFlows().map(function(f){return f.campaignIds.join()}).join(' | ')`) === 'k1 | k3');
  await camp('k3');
  ok('Immunisation lists just the copy', await flowNames() === 'Newborn first weeks (copy)', await flowNames());
  await b.click('#content-list .flow-item');
  ok('the copy has the same steps and timing', await steps() === 'Welcome message | Daily health tip' && await stepTiming(0) === '14 before expected_date_of_delivery' && await stepTiming(1) === '7 after expected_date_of_delivery', await steps());
  await setTiming('.step-row[data-idx="0"] .timing', 30);
  ok('editing the copy leaves the original alone (they are independent)', await b.ev(`Store.listFlows().map(function(f){return f.steps[0].timing.days}).join(' | ')`) === '14 | 30');
  await b.click('.step-row[data-idx="1"] [data-action=step-remove]');
  ok('so does removing a template from it', await b.ev(`Store.listFlows().map(function(f){return f.steps.length}).join(' | ')`) === '2 | 1');
  await b.click('[data-action=toggle-history-pane]');
  ok('the copy\'s history starts with "Created flow ... Duplicate of Newborn first weeks"', /Created flow/.test(await txt('#history-pane')) && /Duplicate of Newborn first weeks/.test(await txt('#history-pane')), await txt('#history-pane'));
  await b.click('[data-action=toggle-history-pane]');
  await camp('');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k1]');
  ok('dropping a flow on its own campaign still offers Duplicate (Refer and Move are disabled: already there)', /^Refer same flow\(off\) \| Duplicate flow \| Move flow\(off\) \| Cancel$/.test(await opts()), await opts());
  await b.click('[data-action=dialog-duplicate]');
  ok('and names the next copy "(copy 2)"', await flowOrder() === 'Newborn first weeks | Newborn first weeks (copy 2) | Newborn first weeks (copy)', await flowOrder());

  // move: templates only this flow uses go with it; one that another flow in the source uses stays
  await b.fresh();
  await tab('flows');
  await camp('k1');
  await b.click('[data-action=open-add]'); await b.type('Welcome only'); await b.key('Enter', 'Enter', 13);
  await b.ev(`(function(){var s=document.querySelector('[data-change=add-step]'); s.value=Store.list()[0].id; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  ok('the dialog explains the split: one template moves with the flow, one stays because another flow uses it', /1 template moves with it; 1 template stays in Newborn care because another flow there uses it \(also added to Immunisation\)/.test(await optDesc('move')), await optDesc('move'));
  await b.click('[data-action=dialog-move]');
  ok('Move: the flow is only in Immunisation; Daily health tip moved with it; Welcome message stays in Newborn care and is also in Immunisation',
    await b.ev(`Store.getFlow(Store.listFlows()[0].id).campaignIds.join()`) === 'k3' && await b.ev(`Store.list()[2].campaignIds.join()`) === 'k3' && await b.ev(`Store.list()[0].campaignIds.join()`) === 'k1,k3');
  await camp('k1');
  ok('Newborn care now has just the flow that still uses Welcome message', await flowNames() === 'Welcome only', await flowNames());
  ok('the toast says moved', /Moved flow “Newborn first weeks” to Immunisation/.test(await txt('#toast')), await txt('#toast'));

  // a template that is a flow by itself behaves like dragging a normal template
  await b.fresh();
  await tab('flows');
  await b.drag(grip(await tplItem('Appointment reminder')), '.camp-item[data-id=k1]');
  ok('dragging a single-template flow opens the TEMPLATE dialog (same wording as dragging a template)', /Appointment reminder.*→.*Newborn care/.test(await txt('#dlg-title')) && await opts() === 'Copy | Move | Cancel' && /Keep it in Postnatal check-ups and add it to Newborn care/.test(await optDesc('copy')) && /Remove it from Postnatal check-ups and add it to Newborn care/.test(await optDesc('move')) && await existing() === 'Postnatal check-ups', await optDesc('copy'));
  ok('it has no "templates come along" note (it is a template)', !/template(s)? (will be|move|stay)/.test(await optDesc('copy') + await optDesc('move')));
  await b.click('[data-action=dialog-copy]');
  ok('Copy puts the template in both campaigns; in Newborn care it is a flow by itself too', await b.ev(`Store.list()[1].campaignIds.join()`) === 'k2,k1' && /Copied “Appointment reminder” to Newborn care/.test(await txt('#toast')), await txt('#toast'));
  await camp('k1');
  ok('Newborn care lists it as a flow by itself (no flow of Newborn care includes it)', /Appointment reminder/.test(await flowNames()) && await hasIndicator('Appointment reminder'), await flowNames());
  await b.drag(grip(await tplItem('Appointment reminder')), '.camp-item[data-id=k3]');
  ok('with two owners the single-template flow shows "Can\'t move", like a template', await opts() === "Copy | Can't move(off) | Cancel");
  await b.key('Escape', 'Escape', 27);

  // ================= search =================
  await b.fresh();
  await tab('flows');
  await b.click('[data-action=open-search]'); await b.type('appoint');
  ok('search filters the flows list (templates that are flows too)', await flowNames() === 'Appointment reminder', await flowNames());
  await b.key('Escape', 'Escape', 27);
  ok('Escape clears it', await cnt('#content-list .flow-item') === 2);
  ok('no horizontal page overflow', await b.ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
});
