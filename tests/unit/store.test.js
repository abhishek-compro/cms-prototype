// Data-layer rules (prototype/store.js). No browser needed.
'use strict';
const { loadStore, test, assert } = require('../lib/harness');

const byName = (S, n) => S.list().find(c => c.name === n);
const tr = (c, lang) => c.translations.find(t => t.lang === lang);
const fresh = () => loadStore().S;
// edit one translation through the same path the editor uses
function patch(S, c, lang, changes) {
  const cur = S.cloneParts(S.partsOf(tr(c, lang)));
  Object.assign(cur, changes);
  return S.saveParts(c.id, lang, cur);
}
const problems = (S, c, lang) => S.problems(c, S.partsOf(tr(c, lang))).map(p => p.message);

// ---------------------------------------------------------------- seed
test('seed: sample campaigns, content, and a realistic mix of statuses', () => {
  const S = fresh();
  assert.deepEqual(S.listCampaigns().map(k => k.name), ['Newborn care', 'Postnatal check-ups', 'Immunisation']);
  assert.deepEqual(S.list().map(c => c.name), ['Welcome message', 'Appointment reminder', 'Daily health tip']);
  const w = byName(S, 'Welcome message');
  assert.equal(S.statusOf(tr(w, 'en'), w), 'modified', 'english was edited after it was published');
  assert.equal(S.statusOf(tr(w, 'hi'), w), 'deployed');
  assert.equal(tr(w, 'en').waName, 'welcome_message_v1');
  assert.equal(w.headerType, 'image');
  assert.equal(byName(S, 'Daily health tip').blocked, true);
  assert.equal(S.statusOf(tr(byName(S, 'Appointment reminder'), 'en'), byName(S, 'Appointment reminder')), 'draft');
});

test('seed: all sample content with text is valid (so it can be published)', () => {
  const S = fresh();
  for (const c of S.list()) for (const t of c.translations) {
    if (t.text) assert.deepEqual(problems(S, c, t.lang), [], `${c.name}/${t.lang}`);
  }
});

// ---------------------------------------------------------------- names
test('content names: required, need a letter or digit, unique by template name, trimmed', () => {
  const S = fresh();
  assert.match(S.createContent('   ').error, /required/);
  assert.match(S.createContent('हिंदी').error, /at least one letter/);
  assert.match(S.createContent('welcome-MESSAGE').error, /already maps to the template name "welcome_message"/);
  const r = S.createContent('  Polio drops  ');
  assert.equal(r.content.name, 'Polio drops');
  assert.equal(S.slugOf(r.content), 'polio_drops');
  assert.equal(r.content.headerType, 'none');
  assert.deepEqual(r.content.campaignIds, []);
  assert.equal(r.content.translations[0].lang, 'en');
});

test('renaming keeps names unique and is logged', () => {
  const S = fresh();
  const c = byName(S, 'Daily health tip');
  assert.match(S.renameContent(c.id, 'Welcome Message').error, /already maps/);
  assert.equal(S.renameContent(c.id, 'Daily tip').ok, true);
  assert.equal(S.renameContent(c.id, 'Daily tip').error, 'Name unchanged');
  assert.equal(S.historyFor(c.id, 'content')[0].action, 'renamed');
});

// ---------------------------------------------------------------- campaigns
test('createCampaign: trimmed, required, unique case-insensitively, ids never collide, who/when recorded', () => {
  const S = fresh();
  assert.match(S.createCampaign('  ').error, /required/);
  assert.match(S.createCampaign('newborn CARE').error, /already exists/);
  const a = S.createCampaign('  Maternal health ').campaign, b = S.createCampaign('Nutrition').campaign;
  assert.equal(a.name, 'Maternal health');
  assert.deepEqual([a.id, b.id], ['k4', 'k5']);
  assert.equal(a.createdBy, S.CURRENT_USER);
  assert.ok(a.createdAt);
  assert.equal(new Set(S.listCampaigns().map(k => k.id)).size, 5);
});

test('contentsIn: a campaign lists only its content; null lists everything; new content joins a campaign', () => {
  const S = fresh();
  assert.deepEqual(S.contentsIn('k1').map(c => c.name), ['Welcome message', 'Daily health tip']);
  assert.deepEqual(S.contentsIn('k3'), []);
  assert.equal(S.contentsIn(null).length, 3);
  const n = S.createContent('Polio drops', 'en', 'k3').content;
  assert.deepEqual(n.campaignIds, ['k3']);
  assert.deepEqual(S.createContent('Other', 'en', 'nope').content.campaignIds, [], 'unknown campaign is ignored');
});

// ---------------------------------------------------------------- copy / move
test('planDrop: one owner dropped on another campaign -> copy and move both allowed', () => {
  const S = fresh();
  const p = S.planDrop(byName(S, 'Welcome message').id, 'k3');
  assert.deepEqual(p.existsIn, ['k1']);
  assert.equal(p.copy.ok, true);
  assert.deepEqual(p.copy.result, ['k1', 'k3']);
  assert.equal(p.move.ok, true);
  assert.deepEqual(p.move.from, ['k1']);
  assert.deepEqual(p.move.result, ['k3']);
});

test('planDrop: dropped on the campaign that owns it -> both disabled with the reason', () => {
  const S = fresh();
  const p = S.planDrop(byName(S, 'Welcome message').id, 'k1');
  assert.deepEqual([p.copy.ok, p.move.ok], [false, false]);
  assert.equal(p.copy.reason, 'Already in Newborn care');
  assert.equal(p.move.reason, 'Already in Newborn care');
  assert.equal(p.move.label, undefined, 'plain "Move" label here, "Can\'t move" is only for several owners');
});

test('planDrop: more than one owner -> Move becomes "Can\'t move", whatever the target', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  S.copyToCampaign(w.id, 'k3');
  for (const target of ['k2', 'k3', 'k1']) {
    const p = S.planDrop(w.id, target);
    assert.equal(p.move.ok, false, target);
    assert.equal(p.move.label, "Can't move", target);
    assert.match(p.move.reason, /2 campaigns \(Newborn care, Immunisation\).*Copy it instead/);
  }
  assert.equal(S.planDrop(w.id, 'k2').copy.ok, true, 'copy still works');
  assert.equal(S.planDrop(w.id, 'k3').copy.ok, false, 'but not into a campaign that already has it');
  S.copyToCampaign(w.id, 'k2');
  assert.match(S.planDrop(w.id, 'k1').move.reason, /3 campaigns/);
});

test('planDrop: unassigned content can be copied or moved (both just assign it)', () => {
  const S = fresh();
  const n = S.createContent('Loose').content;
  const p = S.planDrop(n.id, 'k2');
  assert.deepEqual(p.existsIn, []);
  assert.equal(p.copy.ok && p.move.ok, true);
  assert.deepEqual(p.move.from, []);
});

test('copyToCampaign / moveToCampaign: change membership, log who and what, refuse bad requests without writing', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder'), w = byName(S, 'Welcome message');
  assert.equal(S.copyToCampaign(w.id, 'k3').ok, true);
  assert.deepEqual(w.campaignIds, ['k1', 'k3']);
  assert.equal(S.historyFor(w.id, 'content')[0].action, 'campaign_copied');

  const before = S.historyFor(w.id).length;
  assert.equal(S.moveToCampaign(w.id, 'k2').ok, false, "can't move: two owners");
  assert.equal(S.copyToCampaign(w.id, 'k3').ok, false, 'already there');
  assert.equal(S.historyFor(w.id).length, before, 'refusals write nothing');
  assert.deepEqual(w.campaignIds, ['k1', 'k3']);

  assert.equal(S.moveToCampaign(a.id, 'k1').ok, true);
  assert.deepEqual(a.campaignIds, ['k1']);
  const ev = S.historyFor(a.id, 'content')[0];
  assert.deepEqual([ev.action, ev.before, ev.after, ev.actor], ['campaign_moved', 'Postnatal check-ups', 'Newborn care', 'Demo user']);
  assert.match(S.copyToCampaign('nope', 'k1').error, /not found/);
});

// ---------------------------------------------------------------- block template approval
test('blocking template approval: refused once any language is published, unblocking always allowed', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message'), a = byName(S, 'Appointment reminder'), d = byName(S, 'Daily health tip');
  assert.match(S.blockProblem(w), /already published/);
  assert.match(S.setBlocked(w.id, true).error, /already published/);
  assert.equal(S.blockProblem(a), null);
  assert.equal(S.setBlocked(a.id, true).ok, true);
  assert.equal(S.setBlocked(a.id, true).error, 'No change');
  assert.match(S.deployAll(a.id).error, /blocked/, 'a blocked name cannot be published');
  assert.equal(S.setBlocked(d.id, false).ok, true);
  assert.equal(d.blocked, false);
  assert.equal(S.setBlocked(a.id, false).ok, true);
  assert.equal(S.deployAll(a.id).ok, true);
  assert.match(S.setBlocked(a.id, true).error, /already published/, 'once published it can no longer be blocked');
  assert.equal(S.historyFor(a.id, 'content').filter(e => e.action === 'blocked' || e.action === 'unblocked').length, 2);
});

// ---------------------------------------------------------------- publishing
test('publish all: one shared template name per click, counter goes up, only publishable languages are included', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  const r = S.deployAll(a.id);
  assert.deepEqual([r.ok, r.waName, r.count], [true, 'appointment_reminder_v1', 2], 'kn is empty so it is skipped');
  assert.equal(tr(a, 'en').waName, 'appointment_reminder_v1');
  assert.equal(tr(a, 'hi').waName, 'appointment_reminder_v1');
  assert.equal(tr(a, 'kn').waName, '');
  assert.match(S.deployAll(a.id).error, /Nothing to publish/);
  patch(S, a, 'hi', { footer: 'new footer' });
  const r2 = S.deployAll(a.id);
  assert.deepEqual([r2.waName, r2.count], ['appointment_reminder_v2', 1], 'only the edited language is republished, under the next version');
  assert.equal(tr(a, 'en').waName, 'appointment_reminder_v1', 'the untouched language keeps its name');
  assert.equal(S.historyFor(a.id, 'hi')[0].action, 'deployed');
});

test('canDeploy reasons come in a fixed order: blocked, empty, problems, already published', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder'), d = byName(S, 'Daily health tip'), w = byName(S, 'Welcome message');
  assert.match(S.canDeploy(d, tr(d, 'en')), /blocked/);
  assert.equal(S.canDeploy(a, tr(a, 'kn')), 'Text is empty');
  patch(S, a, 'en', { text: 'Hi {{who}}' });                     // placeholder without a default
  assert.match(S.canDeploy(a, tr(a, 'en')), /1 problem to fix before publishing/);
  assert.match(S.canDeploy(w, tr(w, 'hi')), /Already published/);
  assert.equal(S.canDeploy(a, tr(a, 'hi')), null);
});

test('publishing is refused for a translation with problems, even through deployAll', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  patch(S, a, 'en', { text: 'Hi {{who}}' });
  const r = S.deployAll(a.id);
  assert.equal(r.count, 1);
  assert.equal(tr(a, 'en').waName, '');
});

// ---------------------------------------------------------------- placeholders (the layer on top of WhatsApp's numbering)
test('positionsOf: names map to WhatsApp positions, one per occurrence, in order', () => {
  const S = fresh();
  assert.deepEqual(S.positionsOf('abcd'), {});
  assert.deepEqual(S.positionsOf('{{abcd}} {{asd}} {{abcd}}'), { abcd: [1, 3], asd: [2] });
  assert.deepEqual(S.positionsOf('Hi {{name}}, your {{item}} for {{name}}'), { name: [1, 3], item: [2] });
  assert.deepEqual(S.positionsOf('{{Name_1}} {{1}} {{2}}'), { Name_1: [1], 1: [2], 2: [3] });
});

test('positionsOf: adjacent placeholders each count (the orchestrator\'s helper drops one; see orchestrator-parity)', () => {
  const S = fresh();
  assert.deepEqual(S.positionsOf('{{a}}{{b}}'), { a: [1], b: [2] });
  assert.deepEqual(S.positionsOf('x {{a}}{{b}}{{c}} y {{a}}'), { a: [1, 4], b: [2], c: [3] });
});

test('placeholder names use the orchestrator\'s character set: letters, digits 1-9, underscore (no 0, no spaces)', () => {
  const S = fresh();
  assert.deepEqual(S.positionsOf('{{item0}} {{day10}} {{first name}} {{ name }} {{}}'), {});
  assert.deepEqual(S.invalidPlaceholders('{{item0}} {{ok}} {{first name}} {{item0}}'), ['{{item0}}', '{{first name}}'], 'reported once each');
  assert.deepEqual(S.invalidPlaceholders('{{{name}}}'), []);
});

test('whatsappBody: every occurrence gets the next number; no placeholders = unchanged', () => {
  const S = fresh();
  assert.equal(S.whatsappBody('Hi {{first}}, {{first}} is {{age}}'), 'Hi {{1}}, {{2}} is {{3}}');
  assert.equal(S.whatsappBody('no placeholders'), 'no placeholders');
  assert.equal(S.whatsappBody('{{a}}{{b}}'), '{{1}}{{2}}');
});

// ---------------------------------------------------------------- renaming placeholders
test('renamePlaceholder: rewrites every occurrence and carries the default to the new name', () => {
  const S = fresh();
  const r = S.renamePlaceholder('Hi {{first}}, {{first}} is {{age}}', { first: 'Asha', age: '2' }, 'first', 'name');
  assert.deepEqual([r.ok, r.changed, r.merged], [true, true, false]);
  assert.equal(r.text, 'Hi {{name}}, {{name}} is {{age}}');
  assert.deepEqual(r.defaults, { name: 'Asha', age: '2' });
  assert.deepEqual(S.positionsOf(r.text), { name: [1, 2], age: [3] }, 'the WhatsApp positions do not move');
});

test('renamePlaceholder: renaming to an existing name merges them - one name fills several numbers', () => {
  const S = fresh();
  const r = S.renamePlaceholder('Hi {{first}} {{nick}} {{first}}', { first: 'Asha', nick: 'Ash' }, 'nick', 'first');
  assert.equal(r.merged, true);
  assert.equal(r.text, 'Hi {{first}} {{first}} {{first}}');
  assert.deepEqual(S.positionsOf(r.text), { first: [1, 2, 3] });
  assert.deepEqual(r.defaults, { first: 'Asha' }, 'the existing default wins');
  const r2 = S.renamePlaceholder('{{a}} {{b}}', { a: '', b: 'B' }, 'b', 'a');
  assert.deepEqual(r2.defaults, { a: 'B' }, 'unless it is empty: then the renamed one is carried over');
});

test('renamePlaceholder: only whole placeholders change; invalid ones are left alone', () => {
  const S = fresh();
  const r = S.renamePlaceholder('{{name}} {{names}} {{first name}} name', { name: 'n', names: 'ns' }, 'name', 'x');
  assert.equal(r.text, '{{x}} {{names}} {{first name}} name');
  assert.deepEqual(r.defaults, { x: 'n', names: 'ns' });
});

test('renamePlaceholder: refuses invalid names and unknown placeholders; the same name is a no-op', () => {
  const S = fresh();
  for (const bad of ['my name', 'item0', '', '{{x}}', 'a-b', 'é']) {
    assert.match(S.renamePlaceholder('Hi {{a}}', { a: 'x' }, 'a', bad).error, /letters, digits 1-9 and _ only/, JSON.stringify(bad));
  }
  assert.match(S.renamePlaceholder('Hi {{a}}', {}, 'zzz', 'b').error, /\{\{zzz\}\} is not in the text/);
  const same = S.renamePlaceholder('Hi {{a}}', { a: 'x' }, 'a', '  a ');
  assert.deepEqual([same.ok, same.changed, same.text], [true, false, 'Hi {{a}}']);
});

test('renamePlaceholder: works on a button URL the same way (and its default parameters)', () => {
  const S = fresh();
  const r = S.renamePlaceholder('https://x.org/{{page}}/{{id}}', { page: 'about', id: '7' }, 'page', 'section');
  assert.equal(r.text, 'https://x.org/{{section}}/{{id}}');
  assert.deepEqual(r.defaults, { section: 'about', id: '7' });
});

test('problems: an empty body is flagged with code "empty" (the editor hides it for a brand-new translation)', () => {
  const S = fresh();
  const p = S.problems({ headerType: 'none' }, { text: '', footer: '', header: '', defaults: {}, buttons: [] });
  assert.deepEqual(p.map(x => [x.part, x.code]), [['Body', 'empty']]);
});

// ---------------------------------------------------------------- validation
function parts(over) { return Object.assign({ text: 'Hello {{name}}', footer: '', header: '', defaults: { name: 'Friend' }, buttons: [] }, over); }
const content = () => ({ headerType: 'none' });
const msgs = p => fresh().problems(content(), p).map(x => x.message);

test('problems: a valid translation has none', () => {
  assert.deepEqual(msgs(parts()), []);
  assert.deepEqual(msgs(parts({ text: 'No placeholders', defaults: {} })), []);
});

test('problems: body required, 1024 limit, invalid names, more than 5 uses', () => {
  assert.deepEqual(msgs(parts({ text: '  ', defaults: {} })), ['Body is required']);
  assert.match(msgs(parts({ text: 'x'.repeat(1025), defaults: {} }))[0], /1025 characters; WhatsApp allows 1024/);
  assert.deepEqual(msgs(parts({ text: 'x'.repeat(1024), defaults: {} })), []);
  assert.match(msgs(parts({ text: '{{item0}}', defaults: {} }))[0], /\{\{item0\}\} is not a valid placeholder/);
  assert.match(msgs(parts({ text: '{{x}} '.repeat(6), defaults: { x: 'v' } }))[0], /used 6 times; the maximum is 5/);
  assert.deepEqual(msgs(parts({ text: '{{x}} '.repeat(5), defaults: { x: 'v' } })), []);
});

test('problems: every placeholder needs a default of 1-200 characters', () => {
  assert.match(msgs(parts({ defaults: {} }))[0], /\{\{name\}\} needs a default value/);
  assert.match(msgs(parts({ defaults: { name: '' } }))[0], /needs a default value/);
  assert.match(msgs(parts({ defaults: { name: 'x'.repeat(201) } }))[0], /default is 201 characters; the maximum is 200/);
  assert.deepEqual(msgs(parts({ defaults: { name: 'x'.repeat(200) } })), []);
});

test('problems: footer is at most 60 characters and cannot hold placeholders', () => {
  assert.match(msgs(parts({ footer: 'f'.repeat(61) }))[0], /61 characters; WhatsApp allows 60/);
  assert.deepEqual(msgs(parts({ footer: 'f'.repeat(60) })), []);
  assert.deepEqual(msgs(parts({ footer: 'Hi {{name}}' })), ['Footer cannot contain placeholders']);
});

test('problems: buttons - text 1-25, quick reply payload 1-800', () => {
  const qr = (text, payload) => ({ type: 'QUICK_REPLY', text, default_payload: payload });
  assert.deepEqual(msgs(parts({ buttons: [qr('Yes', 'y')] })), []);
  assert.deepEqual(msgs(parts({ buttons: [qr('', '')] })), ['Button 1 needs text', 'Button 1 needs a default payload']);
  assert.match(msgs(parts({ buttons: [qr('x'.repeat(26), 'p')] }))[0], /26 characters; the maximum is 25/);
  assert.deepEqual(msgs(parts({ buttons: [qr('x'.repeat(25), 'p')] })), []);
  assert.match(msgs(parts({ buttons: [qr('ok', 'p'.repeat(801))] }))[0], /801 characters; the maximum is 800/);
});

test('problems: at most 3 quick replies and 1 URL button', () => {
  const qr = i => ({ type: 'QUICK_REPLY', text: 'Q' + i, default_payload: 'p' });
  const url = i => ({ type: 'URL', text: 'U' + i, url: 'https://x.org/' + i, default_parameters: {} });
  assert.deepEqual(msgs(parts({ buttons: [qr(1), qr(2), qr(3), url(1)] })), [], 'the maximum is allowed');
  assert.deepEqual(msgs(parts({ buttons: [qr(1), qr(2), qr(3), qr(4)] })), ['At most 3 quick reply buttons (there are 4)']);
  assert.deepEqual(msgs(parts({ buttons: [url(1), url(2)] })), ['At most 1 URL button (there are 2)']);
  assert.equal(msgs(parts({ buttons: [qr(1), qr(2), qr(3), qr(4), url(1), url(2)] })).length, 2, 'both limits are reported');
});

test('buttonCounts / canAddButton: per-type limits drive the editor\'s Add buttons', () => {
  const S = fresh();
  const qr = { type: 'QUICK_REPLY' }, url = { type: 'URL' };
  assert.deepEqual(S.buttonCounts([qr, url, qr]), { quickReply: 2, url: 1 });
  assert.deepEqual([S.canAddButton([], 'QUICK_REPLY'), S.canAddButton([], 'URL')], [true, true]);
  assert.deepEqual([S.canAddButton([qr, qr], 'QUICK_REPLY'), S.canAddButton([qr, qr, qr], 'QUICK_REPLY')], [true, false]);
  assert.deepEqual([S.canAddButton([url], 'URL'), S.canAddButton([url], 'QUICK_REPLY')], [false, true]);
  assert.deepEqual([S.LIMITS.quickReplies, S.LIMITS.urlButtons], [3, 1]);
});

test('problems: URL buttons - required, 10-1000 chars, http(s), placeholders need defaults', () => {
  const url = (u, d = {}) => ({ type: 'URL', text: 'Open', url: u, default_parameters: d });
  assert.deepEqual(msgs(parts({ buttons: [url('https://x.org/a')] })), []);
  assert.deepEqual(msgs(parts({ buttons: [url('')] })), ['Button 1 needs a URL']);
  assert.ok(msgs(parts({ buttons: [url('http://a')] })).some(m => /URL must be 10-1000 characters/.test(m)));
  assert.ok(msgs(parts({ buttons: [url('ftp://x.org/file')] })).some(m => /valid http:\/\/ or https:\/\/ address/.test(m)));
  assert.ok(msgs(parts({ buttons: [url('https://x.org/' + 'a'.repeat(1000))] })).some(m => /10-1000/.test(m)));
  assert.deepEqual(msgs(parts({ buttons: [url('https://x.org/{{id}}', { id: '42' })] })), []);
  assert.match(msgs(parts({ buttons: [url('https://x.org/{{id}}')] }))[0], /\{\{id\}\} needs a default value/);
  assert.match(msgs(parts({ buttons: [url('https://x.org/{{item0}}')] }))[0], /invalid placeholder \{\{item0\}\}/);
  assert.match(msgs(parts({ buttons: [url('https://x.org/' + '{{i}}'.repeat(6), { i: 'v' })] }))[0], /used 6 times/);
});

// ---------------------------------------------------------------- saving parts
test('saveParts: drops defaults of placeholders that left the body, and URL parameters that left the URL', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  patch(S, a, 'en', { text: 'Only {{date}}' });
  assert.deepEqual(tr(a, 'en').defaults, { date: 'Monday 12 December' });
  patch(S, a, 'en', { buttons: [{ type: 'URL', text: 'Open', url: 'https://x.org/{{id}}', default_parameters: { id: '1', stale: 'x' } }] });
  assert.deepEqual(tr(a, 'en').buttons[0].default_parameters, { id: '1' });
});

test('saveParts: nothing changed is refused; each changed part is its own history event with before/after', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  assert.equal(patch(S, a, 'en', {}).error, 'No changes to save');
  const n0 = S.historyFor(a.id, 'en').length;
  patch(S, a, 'en', { footer: 'Bye', header: 'media-1', text: 'Hi {{date}}', buttons: [] });
  const events = S.historyFor(a.id, 'en').slice(0, S.historyFor(a.id, 'en').length - n0);
  assert.deepEqual(events.map(e => e.action + (e.detail ? ':' + e.detail : '')).sort(),
    ['part_edited:Buttons', 'part_edited:Footer', 'part_edited:Header', 'part_edited:Placeholders', 'text_edited']);
  const footer = events.find(e => e.detail === 'Footer');
  assert.deepEqual([footer.before, footer.after, footer.actor], ['', 'Bye', 'Demo user']);
  const ph = events.find(e => e.detail === 'Placeholders');
  assert.deepEqual([ph.before, ph.after], ['date = Monday 12 December\ntime = 10:30 AM', 'date = Monday 12 December']);
  assert.match(events.find(e => e.action === 'text_edited').before, /^Reminder: your appointment/);
  assert.match(events.find(e => e.detail === 'Buttons').before, /1\. Quick reply "Confirm" → appt_confirm/);
});

test('saveParts: only the parts that changed are logged', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  const before = S.historyFor(a.id, 'en').length;
  patch(S, a, 'en', { footer: 'Just a footer' });
  const added = S.historyFor(a.id, 'en').length - before;
  assert.equal(added, 1);
  assert.equal(S.historyFor(a.id, 'en')[0].detail, 'Footer');
});

// ---------------------------------------------------------------- status compares every part
test('status: any template part edited after publishing marks it modified; restoring the value restores the status', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const st = () => S.statusOf(tr(w, 'hi'), w);
  assert.equal(st(), 'deployed');
  patch(S, w, 'hi', { footer: 'नूरा हेल्थ टीम' });
  assert.equal(st(), 'modified');
  patch(S, w, 'hi', { footer: 'नूरा हेल्थ' });
  assert.equal(st(), 'deployed', 'back to the published value');
  patch(S, w, 'hi', { defaults: { name: 'मित्र' } });
  assert.equal(st(), 'modified', 'a default value is part of the template');
  patch(S, w, 'hi', { defaults: { name: 'दोस्त' } });
  assert.equal(st(), 'deployed');
  const b = S.cloneParts(S.partsOf(tr(w, 'hi'))).buttons;
  b[0].text = 'कुछ और';
  patch(S, w, 'hi', { buttons: b });
  assert.equal(st(), 'modified', 'button text');
  patch(S, w, 'hi', { header: 'new-media' });
  assert.equal(S.setHeaderType(w.id, 'video').ok, true);
  assert.equal(S.statusOf(tr(w, 'en'), w), 'modified');
});

test('status: data published before template parts existed is compared by text only', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const t = tr(w, 'hi');
  delete t.deployedSig;
  assert.equal(S.statusOf(t, w), 'deployed');
  t.footer = 'something else';
  assert.equal(S.statusOf(t, w), 'deployed', 'cannot see footer edits without a signature');
  t.text = 'changed';
  assert.equal(S.statusOf(t, w), 'modified');
});

test('setHeaderType: one per name; unknown types and no-ops are refused; logged on the name, not a language', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  assert.equal(a.headerType, 'none');
  assert.equal(S.setHeaderType(a.id, 'video').ok, true);
  assert.equal(S.setHeaderType(a.id, 'video').error, 'No change');
  assert.equal(S.setHeaderType(a.id, 'audio').error, 'Unknown header type');
  const ev = S.historyFor(a.id, 'content')[0];
  assert.deepEqual([ev.action, ev.before, ev.after, ev.lang], ['header_type_changed', 'None', 'Video', null]);
});

// ---------------------------------------------------------------- export
test('toExtraContent: the orchestrator shape - every key per language, positions derived, stale defaults gone', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const x = S.toExtraContent(w.id);
  assert.deepEqual(Object.keys(x).sort(), ['body_param_defaults', 'body_param_positions', 'buttons', 'footer', 'header']);
  assert.deepEqual(x.body_param_defaults.en, { name: 'Friend' });
  assert.deepEqual(x.body_param_positions.en, { name: [1] });
  assert.deepEqual(x.header, { en: '3f2b8c1e-9a47-4d6b-8c3e-1f5a7b9d2e40', hi: '' }, 'every language gets a header value (empty = none yet)');
  assert.deepEqual(x.buttons.en[0], { type: 'QUICK_REPLY', text: 'Tell me more', default_payload: 'welcome_more' });
  assert.deepEqual(x.buttons.en[1], { type: 'URL', text: 'Visit website', url: 'https://www.noorahealth.org/{{page}}', default_parameters: { page: 'about' }, parameter_positions: { page: [1] } });
  assert.deepEqual(x.footer, { en: 'Noora Health', hi: 'नूरा हेल्थ' });
});

test('toExtraContent: header is {} when the type is None; footer key only when some language has one', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  const x = S.toExtraContent(a.id);
  assert.deepEqual(x.header, {});
  assert.equal('footer' in x, false);
  assert.deepEqual(Object.keys(x.body_param_positions).sort(), ['en', 'hi', 'kn']);
  assert.deepEqual(x.body_param_positions.kn, {});
  assert.deepEqual(x.body_param_positions.en, { date: [1], time: [2] });
  assert.equal(S.toExtraContent('nope'), null);
});

test('toExtraContent: repeated placeholders list every position', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  patch(S, a, 'en', { text: '{{date}} / {{time}} / {{date}}' });
  assert.deepEqual(S.toExtraContent(a.id).body_param_positions.en, { date: [1, 3], time: [2] });
});

test('CSV: exact columns, one row per name x language, quotes/commas/newlines escaped, the authored (named) body', () => {
  const S = fresh();
  const lines = S.toCsv().split('\r\n');
  assert.equal(lines[0], 'name,language,wa_template_name,text');
  assert.ok(lines.includes('Appointment reminder,kn,,'), 'unpublished + empty text -> empty cells');
  assert.ok(S.toCsv().includes('"Hello {{name}}, welcome to Noora Health.'), 'text with a comma is quoted, placeholders stay named');
  const a = byName(S, 'Appointment reminder');
  patch(S, a, 'en', { text: 'say "hi",\nthen go {{date}}' });
  assert.ok(S.toCsv([a.id]).includes('"say ""hi"",\nthen go {{date}}"'));
  assert.equal(S.toCsv([a.id]).split('\r\n').filter(Boolean).length, 4, 'header + 3 languages');
  assert.equal(S.toCsv().startsWith('﻿'), false, 'the BOM is added at download time, not in the data');
});

// ---------------------------------------------------------------- history
test('history: newest first; name-level events are separate from a language\'s events', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const all = S.historyFor(w.id);
  assert.ok(all.every((e, i) => i === 0 || all[i - 1].ts >= e.ts), 'sorted newest first');
  assert.ok(S.historyFor(w.id, 'content').every(e => e.lang === null));
  assert.ok(S.historyFor(w.id, 'en').every(e => e.lang === 'en'));
  assert.equal(S.historyFor(w.id, 'content').length + S.historyFor(w.id, 'en').length + S.historyFor(w.id, 'hi').length, all.length);
  assert.ok(all.every(e => e.actor === 'Demo user'), 'single user');
});

test('diffWords: word-level add/remove with punctuation separate', () => {
  const S = fresh();
  assert.deepEqual(S.diffWords('care for your newborn.', 'care for your newborn baby.'),
    [{ type: 'eq', text: 'care for your newborn' }, { type: 'add', text: ' baby' }, { type: 'eq', text: '.' }]);
  assert.deepEqual(S.diffWords('a b c d', 'a x c d e').map(d => d.type), ['eq', 'del', 'add', 'eq', 'add']);
  assert.deepEqual(S.diffWords('', 'new'), [{ type: 'add', text: 'new' }]);
});

// ---------------------------------------------------------------- saved data from older versions
const tmpl = [{ lang: 'en', text: 'x', waName: '', deployedText: null }];
const content0 = (name, extra) => Object.assign({ id: 'c' + name.length, name, blocked: false, deployCounter: 0, createdAt: 'x', translations: JSON.parse(JSON.stringify(tmpl)) }, extra);
const load = state => { const { S, mem } = loadStore({ 'cms-prototype-v1': JSON.stringify(state) }); return { S, saved: JSON.parse(mem['cms-prototype-v1']) }; };

test('migration: data from before campaigns -> sample campaigns, sample content filed, your own content unassigned', () => {
  const { S, saved } = load({ nextId: 9, contents: [content0('Welcome message'), content0('Appointment reminder'), content0('My own')], history: [] });
  assert.deepEqual(S.listCampaigns().map(k => k.id), ['k1', 'k2', 'k3']);
  assert.deepEqual(S.list().map(c => c.campaignIds), [['k1'], ['k2'], []]);
  assert.ok(saved.contents.every(c => Array.isArray(c.campaignIds) && !('campaignId' in c)), 'saved back in the new shape');
});

test('migration: single campaignId -> campaignIds array', () => {
  const { S } = load({ nextId: 9, campaigns: [{ id: 'k1', name: 'A' }, { id: 'k2', name: 'B' }], contents: [content0('One', { campaignId: 'k2' }), content0('Two', { campaignId: null })], history: [] });
  assert.deepEqual(S.list().map(c => c.campaignIds), [['k2'], []]);
});

test('migration: data from before template parts -> empty header/footer/defaults/buttons, header type None', () => {
  const { S } = load({ nextId: 9, campaigns: [], contents: [content0('One', { campaignIds: [] })], history: [] });
  const c = S.list()[0], t = c.translations[0];
  assert.equal(c.headerType, 'none');
  assert.deepEqual([t.footer, t.header, t.defaults, t.buttons], ['', '', {}, []]);
});

test('migration: current-shape data is left exactly as it is', () => {
  const timing = { days: 3, when: 'after', ref: 'date_of_birth' };
  const state = { nextId: 9, campaigns: [{ id: 'k1', name: 'A' }], flows: [], contents: [content0('One', { campaignIds: ['k1'], headerType: 'image', timing })], history: [] };
  state.contents[0].translations[0] = Object.assign({ footer: 'f', header: 'h', defaults: { a: 'b' }, buttons: [] }, state.contents[0].translations[0]);
  const { S, saved } = load(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(JSON.parse(JSON.stringify({ campaigns: S.listCampaigns(), flows: S.listFlows(), contents: S.list() })), { campaigns: state.campaigns, flows: [], contents: state.contents });
  assert.deepEqual(saved.contents, state.contents);
});

test('reset: discards saved changes and reloads the sample data', () => {
  const { S, mem } = loadStore();
  S.createContent('Temporary');
  assert.equal(S.list().length, 4);
  S.reset();
  assert.equal(S.list().length, 3);
  assert.equal(JSON.parse(mem['cms-prototype-v1']).contents.length, 3);
});
