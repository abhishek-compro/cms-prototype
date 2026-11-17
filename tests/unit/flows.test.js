// Flows (prototype/store.js): ordered templates with timing, templates that are flows by themselves, reordering,
// copy/move of a flow to another campaign. No browser needed.
'use strict';
const { loadStore, test, assert } = require('../lib/harness');

const fresh = () => loadStore().S;
const tpl = (S, n) => S.list().find(c => c.name === n);
const flow = (S, n) => S.listFlows().find(f => f.name === n);
const listing = (S, k) => S.flowItems(k).map(i => (i.kind === 'flow' ? 'F:' + i.flow.name : 'T:' + i.content.name));
const stepNames = (S, f) => f.steps.map(s => S.get(s.templateId).name);

// ---------------------------------------------------------------- what the Flows tab lists
test('seed: one flow in Newborn care; templates that no flow of a campaign includes are flows by themselves', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  assert.deepEqual(f.campaignIds, ['k1']);
  assert.deepEqual(stepNames(S, f), ['Welcome message', 'Daily health tip']);
  assert.deepEqual(listing(S, 'k1'), ['F:Newborn first weeks'], 'both Newborn care templates are inside the flow, so none is listed alone');
  assert.deepEqual(listing(S, 'k2'), ['T:Appointment reminder'], 'a template with no flow is itself a flow');
  assert.deepEqual(listing(S, 'k3'), []);
  assert.deepEqual(listing(S, null), ['F:Newborn first weeks', 'T:Appointment reminder'], 'All content: flows first (in order), then single-template flows');
});

test('a template is only "itself a flow" in the campaigns where no flow of that campaign includes it', () => {
  const S = fresh();
  const w = tpl(S, 'Welcome message');
  assert.equal(S.isImplicit(w, 'k1'), false);
  S.copyToCampaign(w.id, 'k3');
  assert.equal(S.isImplicit(w, 'k3'), true, 'in Immunisation no flow includes it');
  assert.equal(S.isImplicit(w, 'k2'), false, 'it is not in Postnatal at all');
  assert.deepEqual(listing(S, 'k3'), ['T:Welcome message']);
  assert.ok(listing(S, null).includes('T:Welcome message'), 'All content lists it because it is alone in one of its campaigns');
});

test('an unassigned template is listed under All content as a flow of its own, until a flow includes it', () => {
  const S = fresh();
  const n = S.createContent('Loose').content;
  assert.ok(listing(S, null).includes('T:Loose'));
  assert.equal(S.isImplicit(n, 'k1'), false, 'it is not in the campaign');
  const f = S.createFlow('Loose flow', null).flow;
  S.addStep(f.id, n.id);
  assert.ok(!listing(S, null).includes('T:Loose'));
});

test('adding a template to a flow takes it out of the single-template list; removing it puts it back', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder');
  const f = S.createFlow('Check-up reminders', 'k2').flow;
  assert.deepEqual(listing(S, 'k2'), ['F:Check-up reminders', 'T:Appointment reminder']);
  assert.equal(S.addStep(f.id, a.id).ok, true);
  assert.deepEqual(listing(S, 'k2'), ['F:Check-up reminders']);
  assert.equal(S.removeStep(f.id, 0).ok, true);
  assert.deepEqual(listing(S, 'k2'), ['F:Check-up reminders', 'T:Appointment reminder']);
});

// ---------------------------------------------------------------- creating and naming
test('createFlow: trimmed, in the chosen campaign (or none), empty, logged', () => {
  const S = fresh();
  const f = S.createFlow('  Antenatal tips ', 'k3').flow;
  assert.deepEqual([f.name, f.campaignIds, f.steps], ['Antenatal tips', ['k3'], []]);
  assert.deepEqual(S.createFlow('Loose flow', 'nope').flow.campaignIds, [], 'an unknown campaign is ignored');
  const ev = S.historyForFlow(f.id)[0];
  assert.deepEqual([ev.action, ev.after, ev.actor], ['flow_created', 'Antenatal tips', 'Demo user']);
});

test('flow names: required, unique, and never the name of a template (templates are listed as flows too)', () => {
  const S = fresh();
  assert.match(S.createFlow('  ').error, /required/);
  assert.match(S.createFlow('newborn FIRST weeks').error, /already exists/);
  assert.match(S.createFlow('welcome message').error, /A template is already called "Welcome message"/);
  const f = S.createFlow('Mine').flow;
  assert.match(S.renameFlow(f.id, 'Newborn first weeks').error, /already exists/);
  assert.equal(S.renameFlow(f.id, 'Mine').error, 'Name unchanged');
  assert.equal(S.renameFlow(f.id, 'Renamed').ok, true);
  assert.deepEqual(S.historyForFlow(f.id)[0].action, 'flow_renamed');
});

// ---------------------------------------------------------------- steps
test('addStep: the step starts with the template\'s own (dummy) timing, a template appears once, the flow\'s campaigns gain it', () => {
  const S = fresh();
  const f = S.createFlow('Reminders', 'k3').flow, a = tpl(S, 'Appointment reminder');
  assert.deepEqual(a.campaignIds, ['k2']);
  assert.equal(S.addStep(f.id, a.id).ok, true);
  assert.deepEqual(f.steps[0].timing, { days: 7, when: 'before', ref: 'expected_date_of_delivery' });
  assert.deepEqual(a.campaignIds, ['k2', 'k3'], 'now also in the flow\'s campaign, so Immunisation holds what its flow uses');
  assert.equal(S.historyFor(a.id, 'content')[0].action, 'campaign_copied');
  assert.match(S.addStep(f.id, a.id).error, /already in this flow/);
  assert.match(S.addStep(f.id, 'nope').error, /not found/);
  assert.match(S.addStep('nope', a.id).error, /not found/);
  a.timing = { days: 3, when: 'after', ref: 'date_of_birth' };
  const g = S.createFlow('Other').flow;
  S.addStep(g.id, a.id);
  assert.deepEqual(g.steps[0].timing, { days: 3, when: 'after', ref: 'date_of_birth' }, 'the step copies the template\'s timing at that moment');
});

test('moveStep reorders (final index), is logged with before and after, and refuses no-ops and bad indexes', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  assert.equal(S.moveStep(f.id, 0, 0).error, 'No change');
  assert.match(S.moveStep(f.id, 0, 5).error, /not found/);
  assert.equal(S.moveStep(f.id, 1, 0).ok, true);
  assert.deepEqual(stepNames(S, f), ['Daily health tip', 'Welcome message']);
  const ev = S.historyForFlow(f.id)[0];
  assert.deepEqual([ev.action, ev.before, ev.after], ['flow_steps_reordered', '1. Welcome message\n2. Daily health tip', '1. Daily health tip\n2. Welcome message']);
});

// ---------------------------------------------------------------- timing
test('timing text: "<n> days before/after <reference date>", "on" for 0, singular for 1', () => {
  const S = fresh();
  assert.equal(S.timingText({ days: 14, when: 'before', ref: 'expected_date_of_delivery' }), '14 days before expected_date_of_delivery');
  assert.equal(S.timingText({ days: 1, when: 'after', ref: 'date_of_birth' }), '1 day after date_of_birth');
  assert.equal(S.timingText({ days: 0, when: 'after', ref: 'date_of_birth' }), 'on date_of_birth');
});

test('timing is validated: whole days 0-999, before/after, a lowercase reference name', () => {
  const S = fresh();
  const ok = { days: 5, when: 'before', ref: 'expected_date_of_delivery' };
  assert.equal(S.checkTiming(ok), null);
  assert.match(S.checkTiming(Object.assign({}, ok, { days: -1 })), /whole number from 0 to 999/);
  assert.match(S.checkTiming(Object.assign({}, ok, { days: 1000 })), /whole number from 0 to 999/);
  assert.match(S.checkTiming(Object.assign({}, ok, { days: 1.5 })), /whole number/);
  assert.match(S.checkTiming(Object.assign({}, ok, { days: NaN })), /whole number/);
  assert.match(S.checkTiming(Object.assign({}, ok, { when: 'during' })), /before or after/);
  for (const ref of ['', 'Expected Date', '1st_date', 'a-b', 'with space']) assert.match(S.checkTiming(Object.assign({}, ok, { ref })), /reference date/, JSON.stringify(ref));
  assert.equal(S.checkTiming(Object.assign({}, ok, { days: 0, ref: 'x' })), null);
});

test('setStepTiming: validates, refuses no-ops, logs the template and a before/after text', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  assert.match(S.setStepTiming(f.id, 0, { days: -3, when: 'before', ref: 'x' }).error, /whole number/);
  assert.equal(S.setStepTiming(f.id, 0, { days: 14, when: 'before', ref: 'expected_date_of_delivery' }).error, 'No change');
  assert.equal(S.setStepTiming(f.id, 0, { days: 10, when: 'after', ref: 'date_of_birth' }).ok, true);
  assert.deepEqual(f.steps[0].timing, { days: 10, when: 'after', ref: 'date_of_birth' });
  const ev = S.historyForFlow(f.id)[0];
  assert.deepEqual([ev.action, ev.detail, ev.before, ev.after], ['flow_timing_edited', 'Welcome message', '14 days before expected_date_of_delivery', '10 days after date_of_birth']);
  assert.match(S.setStepTiming(f.id, 9, { days: 1, when: 'after', ref: 'x' }).error, /not found/);
});

test('every template has a timing (dummy by default) that is edited on the template when it is a flow by itself', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder');
  assert.deepEqual(a.timing, S.DEFAULT_TIMING);
  assert.deepEqual(S.createContent('Brand new').content.timing, S.DEFAULT_TIMING);
  assert.notEqual(S.createContent('Another').content.timing, S.DEFAULT_TIMING, 'each template gets its own copy');
  assert.equal(S.setTemplateTiming(a.id, { days: 2, when: 'after', ref: 'date_of_birth' }).ok, true);
  assert.equal(S.setTemplateTiming(a.id, { days: 2, when: 'after', ref: 'date_of_birth' }).error, 'No change');
  assert.match(S.setTemplateTiming(a.id, { days: 2, when: 'after', ref: 'Bad Ref' }).error, /reference date/);
  const ev = S.historyFor(a.id, 'content')[0];
  assert.deepEqual([ev.action, ev.before, ev.after], ['timing_edited', '7 days before expected_date_of_delivery', '2 days after date_of_birth']);
});

// ---------------------------------------------------------------- reordering flows
test('reorderFlow: before / after another flow; the list is one global order seen through each campaign', () => {
  const S = fresh();
  const a = flow(S, 'Newborn first weeks');
  const b = S.createFlow('Second', 'k1').flow, c = S.createFlow('Third', 'k1').flow, other = S.createFlow('Elsewhere', 'k2').flow;
  const names = k => S.flowsIn(k).map(f => f.name);
  assert.deepEqual(names('k1'), ['Newborn first weeks', 'Second', 'Third']);
  assert.equal(S.reorderFlow(c.id, a.id, 'before').ok, true);
  assert.deepEqual(names('k1'), ['Third', 'Newborn first weeks', 'Second']);
  assert.equal(S.reorderFlow(a.id, b.id, 'after').ok, true);
  assert.deepEqual(names('k1'), ['Third', 'Second', 'Newborn first weeks']);
  assert.deepEqual(names('k2'), ['Elsewhere'], 'other campaigns are untouched');
  assert.equal(S.reorderFlow(c.id, b.id, 'before').error, 'No change', 'Third is already right before Second');
  assert.equal(S.reorderFlow(c.id, c.id, 'after').error, 'No change');
  assert.match(S.reorderFlow('nope', a.id, 'after').error, /not found/);
  assert.equal(S.historyForFlow(a.id)[0].detail, 'after Second');
  assert.ok(other);
});

test('the flows you created stay in your order; single-template flows always follow them', () => {
  const S = fresh();
  const mine = S.createFlow('Mine', null).flow;
  S.reorderFlow(mine.id, flow(S, 'Newborn first weeks').id, 'before');
  assert.deepEqual(listing(S, null), ['F:Mine', 'F:Newborn first weeks', 'T:Appointment reminder']);
});

// ---------------------------------------------------------------- copy / move a flow to a campaign
test('planFlowDrop: copy adds the target and brings the templates; move takes the flow out of its one campaign', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  const p = S.planFlowDrop(f.id, 'k3');
  assert.deepEqual(p.existsIn, ['k1']);
  assert.equal(p.templates, 2);
  assert.deepEqual([p.copy.ok, p.copy.result, p.copy.addTemplates], [true, ['k1', 'k3'], [w.id, d.id]]);
  assert.deepEqual([p.move.ok, p.move.from, p.move.result, p.move.leave, p.move.stay], [true, ['k1'], ['k3'], [w.id, d.id], []]);
});

test('planFlowDrop: dropped on a campaign that has it -> both disabled; several owners -> "Can\'t move"', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  const same = S.planFlowDrop(f.id, 'k1');
  assert.deepEqual([same.copy.ok, same.move.ok, same.copy.reason, same.move.reason], [false, false, 'Already in Newborn care', 'Already in Newborn care']);
  S.copyFlow(f.id, 'k3');
  const p = S.planFlowDrop(f.id, 'k2');
  assert.equal(p.move.ok, false);
  assert.equal(p.move.label, "Can't move");
  assert.match(p.move.reason, /2 campaigns \(Newborn care, Immunisation\)/);
  assert.equal(p.copy.ok, true);
  assert.equal(S.moveFlow(f.id, 'k2').ok, false, 'and applying it is refused too');
});

test('copyFlow: the flow is in both campaigns, its templates are added to the target and stay in the source', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  assert.equal(S.copyFlow(f.id, 'k3').ok, true);
  assert.deepEqual(f.campaignIds, ['k1', 'k3']);
  assert.deepEqual([w.campaignIds, d.campaignIds], [['k1', 'k3'], ['k1', 'k3']]);
  assert.deepEqual(listing(S, 'k3'), ['F:Newborn first weeks'], 'in the target the templates belong to the flow, so none is listed alone');
  assert.equal(S.historyForFlow(f.id)[0].action, 'flow_copied');
  assert.equal(S.historyFor(w.id, 'content')[0].action, 'campaign_copied', 'each template records that it was added');
  assert.equal(S.copyFlow(f.id, 'k3').error, 'Already in Immunisation');
});

test('moveFlow: templates only this flow uses move with it; templates another flow of the source still uses stay', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  const g = S.createFlow('Welcome only', 'k1').flow;
  S.addStep(g.id, w.id);                              // another flow in Newborn care uses Welcome message
  const p = S.planFlowDrop(f.id, 'k3');
  assert.deepEqual([p.move.leave, p.move.stay], [[d.id], [w.id]]);
  assert.equal(S.moveFlow(f.id, 'k3').ok, true);
  assert.deepEqual(f.campaignIds, ['k3']);
  assert.deepEqual(d.campaignIds, ['k3'], 'Daily health tip moved with the flow');
  assert.deepEqual(w.campaignIds, ['k1', 'k3'], 'Welcome message stays (the other flow uses it) and is also added to the target');
  assert.deepEqual(listing(S, 'k1'), ['F:Welcome only']);
  assert.equal(S.historyForFlow(f.id)[0].action, 'flow_moved');
  assert.equal(S.historyFor(d.id, 'content')[0].action, 'campaign_moved');
  assert.equal(S.historyFor(w.id, 'content')[0].action, 'campaign_copied');
});

test('moveFlow with no other flow in between: a plain move leaves nothing behind in the source', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  S.moveFlow(f.id, 'k2');
  assert.deepEqual(S.contentsIn('k1').map(c => c.name), [], 'both templates left Newborn care');
  assert.deepEqual(listing(S, 'k1'), []);
  assert.deepEqual(listing(S, 'k2'), ['F:Newborn first weeks', 'T:Appointment reminder']);
});

test('an empty flow can be copied or moved (nothing to carry)', () => {
  const S = fresh();
  const f = S.createFlow('Empty', 'k1').flow;
  assert.equal(S.planFlowDrop(f.id, 'k2').templates, 0);
  assert.equal(S.moveFlow(f.id, 'k2').ok, true);
  assert.deepEqual(f.campaignIds, ['k2']);
});

// ---------------------------------------------------------------- history and saved data
test('flow events are kept apart from template history, newest first, all by the single user', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message');
  S.setStepTiming(f.id, 0, { days: 1, when: 'after', ref: 'date_of_birth' });
  const evs = S.historyForFlow(f.id);
  assert.ok(evs.length >= 4 && evs.every(e => e.actor === 'Demo user' && e.flowId === f.id));
  assert.ok(evs.every((e, i) => i === 0 || evs[i - 1].ts >= e.ts));
  assert.ok(S.historyFor(w.id).every(e => e.flowId === undefined), 'a template\'s history has no flow events');
});

test('saved data from before flows: flows start empty and every template gets the dummy timing', () => {
  const tr = [{ lang: 'en', text: 'x', waName: '', deployedText: null, footer: '', header: '', defaults: {}, buttons: [] }];
  const state = { nextId: 9, campaigns: [{ id: 'k1', name: 'A' }], contents: [{ id: 'c1', name: 'One', campaignIds: ['k1'], headerType: 'none', blocked: false, deployCounter: 0, createdAt: 'x', translations: tr }], history: [] };
  const { S, mem } = loadStore({ 'cms-prototype-v1': JSON.stringify(state) });
  assert.deepEqual(S.listFlows(), []);
  assert.deepEqual(S.list()[0].timing, S.DEFAULT_TIMING);
  assert.deepEqual(S.flowItems('k1').map(i => i.kind), ['template']);
  assert.deepEqual(JSON.parse(mem['cms-prototype-v1']).flows, []);
});
