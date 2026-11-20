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
  patch(S, a, 'hi', { text: tr(a, 'hi').text + ' धन्यवाद।' });
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
  assert.deepEqual(x.header, { en: 'https://cdn.noorahealth.org/templates/welcome-en.png', hi: 'https://cdn.noorahealth.org/templates/welcome-hi.png' }, 'every language gets a header value (empty = none yet)');
  S.addTranslation(w.id, 'kn', 'ಹಲೋ');
  assert.equal(S.toExtraContent(w.id).header.kn, '', 'a language without a header gets an empty value');
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
  const state = { nextId: 9, campaigns: [{ id: 'k1', name: 'A' }], flows: [], contents: [content0('One', { campaignIds: ['k1'], headerType: 'image', timing, head: null })], history: [] };
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

// ---------------------------------------------------------------- consistency between languages
test('consistency: the seed templates are consistent; empty and single languages are ignored', () => {
  const S = fresh();
  ['Welcome message', 'Appointment reminder', 'Daily health tip'].forEach(n => {
    const r = S.consistency(byName(S, n));
    assert.deepEqual([r.errors, r.warnings], [[], []], n);
  });
  const a = byName(S, 'Appointment reminder');
  patch(S, a, 'kn', { footer: 'only here' });                           // kn has no text: not compared, not published
  assert.deepEqual(S.consistency(a).errors, []);
});

test('consistency: the number of buttons, then the type of buttons, must match in every language (errors, saving still works)', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const hi = S.partsOf(tr(w, 'hi')).buttons;
  assert.equal(patch(S, w, 'hi', { buttons: hi.slice(0, 1) }).ok, true, 'saving is never blocked');
  let e = S.consistency(w).errors;
  assert.equal(e.length, 1);
  assert.match(e[0].message, /number of buttons differs between languages: English 2, Hindi 1/);
  assert.equal(e[0].part, 'Buttons');
  patch(S, w, 'hi', { buttons: [hi[1], hi[0]] });                       // same count, swapped order: types differ
  e = S.consistency(w).errors;
  assert.equal(e.length, 1);
  assert.match(e[0].message, /type of buttons differs between languages \(button 1: English quick reply, Hindi URL; button 2: English URL, Hindi quick reply\)/);
  patch(S, w, 'hi', { buttons: hi });
  assert.deepEqual(S.consistency(w).errors, []);
});

test('consistency: a header media or a footer set in one language must be set in all; the header is only compared when the name has a header', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  patch(S, w, 'hi', { header: '', footer: '' });
  const msgs = S.consistency(w).errors.map(e => e.part + ': ' + e.message);
  assert.deepEqual(msgs, ['Header: The header media is set in English but missing in Hindi', 'Footer: The footer is set in English but missing in Hindi']);
  patch(S, w, 'en', { footer: '' });
  assert.deepEqual(S.consistency(w).errors.map(e => e.part), ['Header'], 'a footer in none is fine');
  S.setHeaderType(w.id, 'none');
  assert.deepEqual(S.consistency(w).errors, [], 'no header at all: nothing to compare');
});

test('consistency: placeholders are only a warning (names used in some languages and not in others); defaults are not compared', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  patch(S, w, 'hi', { text: 'नमस्ते, नूरा हेल्थ में आपका स्वागत है।', defaults: {} });
  const r = S.consistency(w);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings.map(x => x.message), ['{{name}} is used in English but not in Hindi']);
  assert.equal(S.canDeploy(w, tr(w, 'hi')), null, 'a warning does not block publishing');
  patch(S, w, 'hi', { text: 'नमस्ते {{naam}}', defaults: { naam: 'x' } });
  assert.deepEqual(S.consistency(w).warnings.map(x => x.message).sort(), ['{{naam}} is used in Hindi but not in English', '{{name}} is used in English but not in Hindi']);
});

test('consistency errors block publishing of every language (saving stays possible); fixing them unblocks', () => {
  const S = fresh();
  const a = byName(S, 'Appointment reminder');
  patch(S, a, 'hi', { buttons: S.partsOf(tr(a, 'hi')).buttons.slice(0, 1) });
  assert.match(S.canDeploy(a, tr(a, 'en')), /1 mismatch between languages to fix before publishing/);
  assert.match(S.canDeploy(a, tr(a, 'hi')), /mismatch/);
  assert.match(S.deployAll(a.id).error, /Nothing to publish.*mismatches between languages/);
  assert.equal(tr(a, 'en').waName, '', 'nothing was published');
  patch(S, a, 'hi', { buttons: S.partsOf(tr(a, 'en')).buttons });
  assert.equal(S.deployAll(a.id).ok, true);
});

test('consistency: the editor can pass unsaved drafts', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const draft = S.cloneParts(S.partsOf(tr(w, 'hi')));
  draft.buttons = [];
  assert.deepEqual(S.consistency(w).errors, []);
  assert.match(S.consistency(w, { hi: draft }).errors[0].message, /English 2, Hindi 0/);
});

// ---------------------------------------------------------------- header media: a link to the static CDN
test('header link: must be an https link; the extension, when there is one, must fit the header type', () => {
  const S = fresh();
  assert.equal(S.checkMediaUrl('image', ''), null, 'empty is not judged here');
  assert.equal(S.checkMediaUrl('image', 'https://cdn.noorahealth.org/a/b/pic.png'), null);
  assert.equal(S.checkMediaUrl('image', 'http://cdn.example.org/PIC.JPG?v=2#x'), null, 'query and fragment are ignored; case does not matter');
  assert.equal(S.checkMediaUrl('image', 'https://cdn.example.org/media/abc123'), null, 'a link with no extension says nothing about the kind');
  assert.match(S.checkMediaUrl('image', '3f2b8c1e-9a47-4d6b-8c3e-1f5a7b9d2e40'), /link to the file on the CDN, starting with https/);
  assert.match(S.checkMediaUrl('image', 'cdn.example.org/pic.png'), /https/);
  assert.match(S.checkMediaUrl('image', 'https://cdn example.org/pic.png'), /https/, 'no spaces');
  assert.match(S.checkMediaUrl('image', 'ftp://x.org/pic.png'), /https/);
  assert.match(S.checkMediaUrl('image', 'https://cdn.example.org/guide.pdf'), /a document \(guide\.pdf\), but the header type is image/);
  assert.match(S.checkMediaUrl('video', 'https://cdn.example.org/pic.png'), /an image \(pic\.png\), but the header type is video/);
  assert.equal(S.checkMediaUrl('video', 'https://cdn.example.org/clip.mp4'), null);
  assert.equal(S.checkMediaUrl('video', 'https://cdn.example.org/clip.3gp'), null);
  assert.equal(S.checkMediaUrl('document', 'https://cdn.example.org/g/guide.pdf'), null);
  assert.match(S.checkMediaUrl('document', 'https://cdn.example.org/clip.mp4'), /a video/);
  assert.match(S.checkMediaUrl('image', 'https://x.org/' + 'a'.repeat(2000) + '.png'), /https/, 'a link over 2000 characters is refused');
  assert.equal(S.headerHint('video'), 'MP4 or 3GPP, up to 16 MB');
  assert.equal(S.headerHint('image'), 'JPEG or PNG, up to 5 MB');
  assert.equal(S.mediaFileName('https://cdn.example.org/a/b/My%20file.png?x=1'), 'My file.png');
  assert.equal(S.kindOfUrl('https://x.org/a.PDF'), 'document');
  assert.equal(S.kindOfUrl('https://x.org/a'), null);
});

test('header link: a bad link is a problem (saving is allowed), the sample links are fine, and there is no upload any more', () => {
  const { S, mem } = loadStore();
  const w = byName(S, 'Welcome message');
  assert.match(tr(w, 'en').header, /^https:\/\/cdn\.noorahealth\.org\//, 'the sample header is a CDN link');
  assert.deepEqual(problems(S, w, 'en'), []);
  assert.ok(patch(S, w, 'en', { header: 'not a link' }).ok, 'saving is allowed');
  assert.deepEqual(problems(S, w, 'en'), ['The header must be a link to the file on the CDN, starting with https://']);
  assert.ok(patch(S, w, 'en', { header: 'https://cdn.example.org/clip.mp4' }).ok);
  assert.deepEqual(problems(S, w, 'en'), ['The header link is a video (clip.mp4), but the header type is image']);
  assert.ok(patch(S, w, 'en', { header: 'https://cdn.example.org/pic.png' }).ok);
  assert.deepEqual(problems(S, w, 'en'), []);
  assert.equal(S.problems({ headerType: 'none' }, { text: 'x', header: 'not a link' }).length, 0, 'no header type, no check');
  S.reset();
  assert.equal(mem['cms-prototype-media'], undefined, 'an old uploaded-files key is cleaned up');
});

test('header upload: WhatsApp rules per header type (type, size, empty)', () => {
  const S = fresh();
  assert.equal(S.checkFile('image', { name: 'a.png', type: 'image/png', size: 100 }), null);
  assert.equal(S.checkFile('image', { name: 'a.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 }), null);
  assert.match(S.checkFile('image', { name: 'a.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  assert.match(S.checkFile('image', { name: 'a.gif', type: 'image/gif', size: 100 }), /not allowed.*JPEG or PNG/);
  assert.match(S.checkFile('image', { name: 'a.pdf', type: 'application/pdf', size: 100 }), /not allowed/);
  assert.equal(S.checkFile('video', { name: 'a.mp4', type: 'video/mp4', size: 16 * 1024 * 1024 }), null);
  assert.equal(S.checkFile('video', { name: 'a.3gp', type: 'video/3gpp', size: 10 }), null);
  assert.match(S.checkFile('video', { name: 'a.mp4', type: 'video/mp4', size: 16 * 1024 * 1024 + 1 }), /16 MB/);
  assert.match(S.checkFile('video', { name: 'a.mov', type: 'video/quicktime', size: 10 }), /MP4 or 3GPP/);
  assert.equal(S.checkFile('document', { name: 'a.pdf', type: 'application/pdf', size: 99 * 1024 * 1024 }), null);
  assert.match(S.checkFile('document', { name: 'a.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 }), /PDF/);
  assert.match(S.checkFile('image', { name: 'a.png', type: 'image/png', size: 0 }), /empty/);
  assert.match(S.checkFile('none', { name: 'a.png', type: 'image/png', size: 1 }), /header type/);
  assert.equal(S.checkFile('image', { name: 'PHOTO.PNG', type: '', size: 10 }), null, 'a browser that gives no mime type: the extension decides');
  assert.match(S.checkFile('image', { name: 'x.exe', type: '', size: 10 }), /not allowed/);
  assert.match(S.mediaAccept('video'), /video\/mp4.*\.mp4/);
});

test('header upload: a file gets a random link on the dummy CDN that keeps its extension, and is remembered under it', () => {
  const { S, mem } = loadStore();
  const r = S.addMedia('image', { name: 'baby.png', type: 'image/png', size: 10 });
  assert.ok(r.ok);
  assert.match(r.url, /^https:\/\/cdn\.noorahealth\.org\/templates\/[0-9a-f]{16}\.png$/);
  assert.equal(S.checkMediaUrl('image', r.url), null, 'the link it gets is a valid header link for that type');
  assert.equal(S.getMedia(r.url).name, 'baby.png');
  assert.equal(S.getMedia(r.url).kind, 'image');
  assert.equal(S.getMedia(r.url).size, 10);
  const r2 = S.addMedia('image', { name: 'baby.png', type: 'image/png', size: 10 });
  assert.notEqual(r2.url, r.url, 'every upload gets its own random link, even for the same file');
  assert.match(S.addMedia('video', { name: 'clip', type: 'video/mp4', size: 5 }).url, /\.mp4$/, 'no extension in the name: the mime type decides');
  assert.match(S.addMedia('image', { name: 'p.JPEG', type: 'image/jpeg', size: 5 }).url, /\.jpeg$/);
  assert.equal(S.addMedia('image', { name: 'a.pdf', type: 'application/pdf', size: 1 }).ok, false, 'a refused file registers nothing');
  assert.equal(S.getMedia('https://cdn.noorahealth.org/templates/nope.png'), null);
  assert.ok(!JSON.stringify(JSON.parse(mem['cms-prototype-v1'])).includes('base64'), 'only metadata is in the main saved state; the data lives in IndexedDB');
  assert.equal(loadStore(mem).S.getMedia(r.url).name, 'baby.png', 'the metadata survives a reload');
});

// ---------------------------------------------------------------- rewinding: the undo tree
const evOf = (S, c) => S.historyFor(c.id, 'all').slice().sort((a, b) => a.id - b.id);
const textOf = (c, lang) => tr(c, lang).text;
function lastEventId(S, c) { return evOf(S, c).pop().id; }

test('rewind: every content event is a node with a parent and a snapshot; the current marker is the last one', () => {
  const S = fresh();
  for (const c of S.list()) {
    const evs = evOf(S, c);
    assert.ok(evs.length > 0);
    assert.equal(c.head, evs[evs.length - 1].id, c.name + ': current = newest');
    evs.forEach((e, i) => { assert.equal(e.parent, i ? evs[i - 1].id : null); assert.ok(e.snap, 'snapshot'); });
  }
});

test('rewind: back to an earlier step restores it, is logged as a new step under it, and nothing is lost', () => {
  const S = fresh();
  const c = S.createContent('Tree test', 'en').content;
  patch(S, c, 'en', { text: 'one' });
  const one = lastEventId(S, c);
  patch(S, c, 'en', { text: 'two' });
  const two = lastEventId(S, c);
  patch(S, c, 'en', { text: 'three' });
  const before = S.historyFor(c.id, 'all').length;
  assert.ok(S.rewind(c.id, one).ok);
  assert.equal(textOf(c, 'en'), 'one');
  const evs = evOf(S, c);
  assert.equal(evs.length, before + 1, 'one new step; nothing removed');
  const r = evs[evs.length - 1];
  assert.equal(r.action, 'rewound');
  assert.equal(r.parent, one, 'it hangs under the step we went back to');
  assert.equal(r.to, one);
  assert.equal(r.from, evs[evs.length - 2].id, 'remembers where we came from');
  assert.equal(c.head, r.id, 'the current marker is on it');
  assert.equal(S.eventOf(two).parent, one, 'the old branch is still there');
  // editing now grows a new branch from the rewind step
  patch(S, c, 'en', { text: 'four' });
  const four = evs.length ? lastEventId(S, c) : 0;
  assert.equal(S.eventOf(four).parent, r.id);
  // and the abandoned branch can still be restored
  assert.ok(S.rewind(c.id, two).ok);
  assert.equal(textOf(c, 'en'), 'two');
});

test('rewind: one save with several changed parts makes one step per part, each restorable on its own', () => {
  const S = fresh();
  const c = S.createContent('Parts test', 'en').content;
  patch(S, c, 'en', { text: 'Hello' });
  patch(S, c, 'en', { text: 'Hello again', footer: 'Foot' });
  const evs = evOf(S, c), textStep = evs[evs.length - 2], footerStep = evs[evs.length - 1];
  assert.equal(textStep.action, 'text_edited');
  assert.equal(footerStep.detail, 'Footer');
  assert.equal(footerStep.parent, textStep.id);
  assert.equal(textStep.snap.tr.en.footer, '', 'after the text part only: no footer yet');
  assert.equal(textStep.snap.tr.en.text, 'Hello again');
  assert.equal(footerStep.snap.tr.en.footer, 'Foot');
  assert.ok(S.rewind(c.id, textStep.id).ok);
  assert.equal(textOf(c, 'en'), 'Hello again');
  assert.equal(tr(c, 'en').footer, '');
});

test('rewind: restores the header type, every language\'s parts, and empties a language added later', () => {
  const S = fresh();
  const c = S.createContent('Langs test', 'en').content;
  patch(S, c, 'en', { text: 'Hi {{name}}', defaults: { name: 'Friend' }, buttons: [S.newButton('QUICK_REPLY')] });
  const start = lastEventId(S, c);
  S.setHeaderType(c.id, 'video');
  S.addTranslation(c.id, 'hi', 'नमस्ते');
  patch(S, c, 'en', { text: 'Changed', defaults: {}, buttons: [] });
  assert.ok(S.rewind(c.id, start).ok);
  assert.equal(c.headerType, 'none');
  assert.equal(textOf(c, 'en'), 'Hi {{name}}');
  assert.deepEqual(tr(c, 'en').defaults, { name: 'Friend' });
  assert.equal(tr(c, 'en').buttons.length, 1);
  assert.equal(textOf(c, 'hi'), '', 'Hindi did not exist at that step: it stays as an empty language');
  assert.ok(S.rewind(c.id, S.historyFor(c.id, 'hi')[0].id).ok, 'rewinding to the step that added Hindi brings its text back');
  assert.equal(textOf(c, 'hi'), 'नमस्ते');
  assert.equal(c.headerType, 'video');
});

test('rewind: does not touch name, campaigns, timing, approval block or publish bookkeeping; status follows the usual rule', () => {
  const S = fresh();
  const c = S.createContent('Keep test', 'en').content;
  patch(S, c, 'en', { text: 'v1' });
  const published = lastEventId(S, c);        // the content step the publish was made from
  S.deployAll(c.id);
  patch(S, c, 'en', { text: 'v2' });
  S.renameContent(c.id, 'Kept name');
  assert.equal(S.statusOf(tr(c, 'en'), c), 'modified');
  assert.ok(S.rewind(c.id, published).ok);
  assert.equal(c.name, 'Kept name');
  assert.equal(tr(c, 'en').waName, 'keep_test_v1', 'publish bookkeeping is left alone');
  assert.equal(S.statusOf(tr(c, 'en'), c), 'deployed', 'it equals what was published again');
});

test('rewind: refused when nothing would change, for another template\'s step, or for a step without a snapshot', () => {
  const S = fresh();
  const c = S.createContent('Refuse test', 'en').content, d = S.createContent('Other one', 'en').content;
  patch(S, c, 'en', { text: 'a' });
  const a = lastEventId(S, c);
  assert.match(S.rewind(c.id, a).error, /already looks like this/, 'the current step');
  patch(S, c, 'en', { text: 'b' });
  assert.ok(S.rewind(c.id, a).ok);
  assert.match(S.rewindProblem(c.id, lastEventId(S, c)) || '', /already looks like this/, 'the rewind step itself');
  assert.match(S.rewind(c.id, lastEventId(S, d)).error, /not in this template/);
  assert.match(S.rewind(c.id, 99999).error, /not in this template/);
  S.eventOf(a).snap = undefined;
  patch(S, c, 'en', { text: 'c' });
  assert.match(S.rewind(c.id, a).error, /before rewinding existed/);
});

test('rewind: saved, so the current marker and the tree survive a reload', () => {
  const { S, mem } = loadStore();
  const c = S.createContent('Persist test', 'en').content;
  patch(S, c, 'en', { text: 'x' });
  const x = lastEventId(S, c);
  patch(S, c, 'en', { text: 'y' });
  S.rewind(c.id, x);
  const S2 = loadStore(mem).S, c2 = S2.list().find(k => k.name === 'Persist test');
  assert.equal(textOf(c2, 'en'), 'x');
  assert.equal(c2.head, c.head);
  assert.equal(S2.historyTree(c2.id).rows.filter(r => r.isHead).length, 1);
});

test('historyTree: a straight history is one lane; a branch opens a second lane that joins at the step it left from', () => {
  const S = fresh();
  const c = S.createContent('Lanes test', 'en').content;
  patch(S, c, 'en', { text: 'a' });
  const lin = S.historyTree(c.id);
  assert.equal(lin.width, 1);
  assert.ok(lin.rows.every(r => r.lane === 0));
  assert.deepEqual(lin.rows.map(r => r.event.id), lin.rows.map(r => r.event.id).slice().sort((p, q) => q - p), 'newest first');
  assert.equal(lin.rows[0].isHead, true);
  const a = lastEventId(S, c);
  patch(S, c, 'en', { text: 'b' });                 // branch 1: b
  S.rewind(c.id, a);                                  // rewind step under a
  patch(S, c, 'en', { text: 'c' });                 // branch 2 continues from the rewind step
  const t = S.historyTree(c.id);
  assert.equal(t.width, 2, 'two lines are alive at the same time');
  const atA = t.rows.find(r => r.event.id === a);
  assert.deepEqual(atA.merge.length, 1, 'both lines join at the step they left from');
  assert.equal(t.rows.filter(r => r.isHead).length, 1);
  assert.equal(t.rows[0].event.action, 'text_edited');
  assert.equal(t.rows.find(r => r.event.action === 'rewound').event.parent, a);
  // every row's lane is a valid column and each step's parent comes later in the list (so lines only go downwards)
  const index = {}; t.rows.forEach((r, i) => { index[r.event.id] = i; });
  t.rows.forEach((r, i) => { assert.ok(r.lane < t.width); if (r.event.parent != null) assert.ok(index[r.event.parent] > i); });
});

test('migration: history from before rewinding is chained, the newest step becomes current and is the only one with a snapshot', () => {
  const ev = (id, action) => ({ id, ts: '2026-01-0' + id + 'T00:00:00Z', actor: 'Demo user', contentId: 'c1', contentName: 'One', lang: null, action, before: null, after: null, detail: null });
  const state = { nextId: 9, campaigns: [{ id: 'k1', name: 'A' }], flows: [], contents: [content0('One', { id: 'c1', campaignIds: ['k1'] })], history: [ev(1, 'content_created'), ev(2, 'renamed'), ev(3, 'renamed')] };
  const { S } = load(state);
  const c = S.list()[0];
  assert.equal(c.head, 3);
  assert.deepEqual([1, 2, 3].map(i => S.eventOf(i).parent), [null, 1, 2]);
  assert.deepEqual([1, 2, 3].map(i => !!S.eventOf(i).snap), [false, false, true]);
  assert.match(S.rewindProblem(c.id, 1), /before rewinding existed/);
});

test('rewind: only content changes can be rewound to (publish, rename, approval, campaign and timing steps cannot)', () => {
  const S = fresh();
  const c = S.createContent('Content only', 'en').content;
  patch(S, c, 'en', { text: 'one' });
  const content = lastEventId(S, c);
  S.deployAll(c.id);
  S.renameContent(c.id, 'Content only 2');
  S.setTemplateTiming(c.id, { days: 2, when: 'after', ref: 'baby_dob' });
  patch(S, c, 'en', { text: 'two' });
  const activity = S.historyFor(c.id, 'activity');
  assert.deepEqual(activity.map(e => e.action).sort(), ['deployed', 'renamed', 'timing_edited']);
  for (const e of activity) {
    assert.equal(S.isContentStep(e), false, e.action);
    assert.match(S.rewindProblem(c.id, e.id), /Only content changes/, e.action);
    assert.match(S.rewind(c.id, e.id).error, /Only content changes/, e.action);
  }
  assert.equal(S.rewindProblem(c.id, content), null);
  const n = S.historyTree(c.id).rows.length;
  assert.ok(S.rewind(c.id, content).ok);
  assert.equal(S.historyTree(c.id).rows.length, n + 1);
  assert.equal(S.historyTree(c.id).rows[0].event.action, 'rewound', 'a Rewound step is a content step you can go back to');
});

test('historyTree: shows only content steps (the rest is the linear "activity" list); a publish or rename in between is skipped', () => {
  const S = fresh();
  const c = S.createContent('Skip test', 'en').content;
  patch(S, c, 'en', { text: 'a' });
  const a = lastEventId(S, c);
  S.deployAll(c.id);
  S.renameContent(c.id, 'Skip test 2');
  const afterMeta = c.head;
  assert.ok(S.eventOf(afterMeta).action === 'renamed', 'the current node is a non-content step');
  patch(S, c, 'en', { text: 'b' });
  const b = lastEventId(S, c);
  const t = S.historyTree(c.id);
  assert.ok(t.rows.every(r => S.isContentStep(r.event)));
  assert.equal(t.rows.length + S.historyFor(c.id, 'activity').length, S.historyFor(c.id, 'all').length, 'tree + activity = everything, nothing twice');
  assert.equal(t.width, 1, 'still one straight line: b hangs under a in the tree');
  assert.equal(t.head, b);
  assert.equal(t.rows.filter(r => r.isHead).length, 1);
  // go back to a, publish, then check the marker sits on the Rewound step (nearest content step above the publish)
  S.rewind(c.id, a);
  S.setTemplateTiming(c.id, { days: 5, when: 'before', ref: 'baby_dob' });
  const t2 = S.historyTree(c.id);
  assert.equal(S.eventOf(c.head).action, 'timing_edited');
  assert.equal(t2.rows.find(r => r.isHead).event.action, 'rewound', 'current marker = nearest content step at or above the head');
  patch(S, c, 'en', { text: 'c' });
  const lanes = S.historyTree(c.id);
  assert.equal(lanes.width, 2, 'b and c are on separate branches even though a timing step sits between');
});

// ---------------------------------------------------------------- comments
const flowOf = S => S.listFlows()[0];
const nodeNamed = (S, f, title) => f.nodes.find(n => S.nodeTitle(n) === title);

test('comments: the sample has open and resolved comments on a template and a flow node, separately per template / flow', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message'), f = flowOf(S);
  assert.equal(S.commentsFor({ contentId: w.id }, 'open').length, 1);
  assert.equal(S.commentsFor({ contentId: w.id }, 'resolved').length, 1);
  assert.equal(S.commentsFor({ contentId: w.id }, 'all').length, 2);
  assert.equal(S.commentsFor({ contentId: byName(S, 'Appointment reminder').id }, 'all').length, 0, 'other templates have none');
  assert.equal(S.commentsFor({ flowId: f.id }).length, 1, 'open is the default');
  assert.equal(S.commentsFor({ flowId: f.id })[0].nodeId, nodeNamed(S, f, 'Alert health worker').id);
});

test('comments: adding to a part of a template (whole part, or a selected piece of text)', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const body = tr(w, 'en').text, q = 'newborn', at = body.indexOf(q);
  let r = S.addComment({ contentId: w.id, lang: 'en', part: 'body', start: at, end: at + q.length, quote: q }, '  Say baby instead?  ');
  assert.ok(r.ok);
  const m = r.comment;
  assert.equal(m.text, 'Say baby instead?', 'trimmed');
  assert.equal(m.author, 'Demo user');
  assert.equal(m.resolved, false);
  assert.ok(m.createdAt);
  assert.deepEqual([m.lang, m.part, m.start, m.end, m.quote], ['en', 'body', at, at + q.length, q]);
  assert.ok(S.addComment({ contentId: w.id }, 'About the whole template').ok, 'no part = the whole template');
  assert.ok(S.addComment({ contentId: w.id, lang: 'hi', part: 'footer' }, 'Footer as a whole').ok);
  assert.ok(S.addComment({ contentId: w.id, lang: 'en', part: 'header' }, 'Header image').ok);
  const b = S.addComment({ contentId: w.id, lang: 'en', part: 'button', idx: 1, start: 0, end: 5, quote: 'Visit' }, 'Button text');
  assert.ok(b.ok); assert.equal(b.comment.idx, 1);
  assert.equal(S.commentsFor({ contentId: w.id }).length, 6);
});

test('comments: refused when empty, too long, or pointing at something that does not exist', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message'), a = byName(S, 'Appointment reminder'), n0 = S.commentsFor({ contentId: w.id }, 'all').length;
  assert.match(S.addComment({ contentId: w.id }, '   ').error, /Write a comment/);
  assert.match(S.addComment({ contentId: w.id }, 'x'.repeat(1001)).error, /at most 1000/);
  assert.ok(S.addComment({ contentId: w.id }, 'x'.repeat(1000)).ok);
  assert.match(S.addComment({ contentId: 'nope' }, 'hi').error, /Content not found/);
  assert.match(S.addComment({ contentId: w.id, lang: 'fr', part: 'body' }, 'hi').error, /Translation not found/);
  assert.match(S.addComment({ contentId: w.id, lang: 'en', part: 'sidebar' }, 'hi').error, /Unknown part/);
  assert.match(S.addComment({ contentId: a.id, lang: 'en', part: 'header' }, 'hi').error, /no header/, 'a template without a header has nothing to comment on');
  assert.match(S.addComment({ contentId: w.id, lang: 'en', part: 'header', start: 0, end: 3, quote: 'abc' }, 'hi').error, /header can only be commented on as a whole/);
  assert.match(S.addComment({ contentId: w.id, lang: 'en', part: 'button' }, 'hi').error, /Which button/);
  assert.match(S.addComment({ contentId: w.id, lang: 'en', part: 'body', start: 5, end: 5, quote: 'x' }, 'hi').error, /Bad selection/);
  assert.match(S.addComment({ contentId: w.id, lang: 'en', part: 'body', start: 0, end: 600, quote: 'x'.repeat(501) }, 'hi').error, /at most 500/);
  assert.match(S.addComment({ flowId: 'nope' }, 'hi').error, /Flow not found/);
  assert.match(S.addComment({ flowId: flowOf(S).id, nodeId: 'zzz' }, 'hi').error, /Node not found/);
  assert.equal(S.commentsFor({ contentId: w.id }, 'all').length, n0 + 1, 'refusals write nothing');
});

test('comments: on a flow, or on a node of a flow (the node\'s name is remembered)', () => {
  const S = fresh();
  const f = flowOf(S), a = nodeNamed(S, f, 'Alert health worker');
  const whole = S.addComment({ flowId: f.id }, 'About the flow').comment;
  const onNode = S.addComment({ flowId: f.id, nodeId: a.id }, 'About this action').comment;
  assert.equal(whole.nodeId, undefined);
  assert.equal(onNode.nodeId, a.id);
  assert.equal(onNode.nodeLabel, 'Alert health worker');
  S.removeNode(f.id, a.id);
  assert.equal(S.getComment(onNode.id).nodeLabel, 'Alert health worker', 'the comment outlives the node and still says which it was about');
});

test('comments: resolving moves a comment to the Resolved list (and out of Open); it can be reopened', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const open = S.commentsFor({ contentId: w.id })[0];
  assert.ok(S.setCommentResolved(open.id, true).ok);
  assert.equal(S.commentsFor({ contentId: w.id }).length, 0, 'hidden from the default (open) list');
  const done = S.commentsFor({ contentId: w.id }, 'resolved');
  assert.equal(done.length, 2);
  assert.equal(done[0].id, open.id, 'resolved list: most recently resolved first');
  assert.equal(done[0].resolvedBy, 'Demo user');
  assert.ok(done[0].resolvedAt);
  assert.match(S.setCommentResolved(open.id, true).error, /Already resolved/);
  assert.ok(S.setCommentResolved(open.id, false).ok);
  const back = S.getComment(open.id);
  assert.deepEqual([back.resolved, back.resolvedBy, back.resolvedAt], [false, null, null]);
  assert.equal(S.commentsFor({ contentId: w.id }).length, 1);
  assert.match(S.setCommentResolved(open.id, false).error, /Already open/);
  assert.match(S.setCommentResolved('nope', true).error, /not found/);
});

test('comments: open list is newest first', () => {
  const S = fresh();
  const w = byName(S, 'Welcome message');
  const x = S.addComment({ contentId: w.id }, 'first one').comment, y = S.addComment({ contentId: w.id }, 'second one').comment;
  const list = S.commentsFor({ contentId: w.id });
  assert.deepEqual(list.slice(0, 2).map(m => m.text), ['second one', 'first one']);
});

test('comments: where is the quote now? still there / moved / gone / no quote', () => {
  const S = fresh();
  const m = { quote: 'welcome to', start: 7, end: 17 };
  assert.deepEqual(S.locateComment(m, 'Hello, welcome to Noora'), { state: 'ok', start: 7, end: 17 });
  assert.deepEqual(S.locateComment(m, 'Hi there. Hello, welcome to Noora'), { state: 'moved', start: 17, end: 27 });
  assert.deepEqual(S.locateComment(m, 'Hello there'), { state: 'gone' });
  assert.deepEqual(S.locateComment({}, 'anything'), { state: 'whole' });
});

test('comments: saved, survive a reload, are not history steps, and a rewind leaves them alone', () => {
  const { S, mem } = loadStore();
  const c = S.createContent('Comment keep', 'en').content;
  patch(S, c, 'en', { text: 'one two' });
  const one = lastEventId(S, c);
  const historyBefore = S.historyFor(c.id, 'all').length;
  const m = S.addComment({ contentId: c.id, lang: 'en', part: 'body', start: 0, end: 3, quote: 'one' }, 'Keep this').comment;
  S.setCommentResolved(m.id, true);
  assert.equal(S.historyFor(c.id, 'all').length, historyBefore, 'commenting and resolving write no history');
  patch(S, c, 'en', { text: 'changed' });
  S.rewind(c.id, one);
  assert.equal(S.getComment(m.id).resolved, true, 'rewinding does not touch comments');
  const S2 = loadStore(mem).S;
  assert.equal(S2.getComment(m.id).text, 'Keep this');
  assert.equal(S2.commentsFor({ contentId: c.id }, 'resolved').length, 1);
});

test('migration: data saved before comments gets an empty list', () => {
  const { S } = load({ nextId: 9, campaigns: [{ id: 'k1', name: 'A' }], flows: [], contents: [content0('One', { id: 'c1', campaignIds: [] })], history: [] });
  assert.deepEqual(S.commentsFor({ contentId: 'c1' }, 'all'), []);
  assert.ok(S.addComment({ contentId: 'c1' }, 'works').ok);
});

// ---------------------------------------------------------------- history: one language at a time
test('historyTree(lang): a language\'s steps plus the steps for every language; links skip the steps left out; the current marker follows', () => {
  const S = fresh();
  const c = S.createContent('One lang at a time', 'en').content;
  S.addTranslation(c.id, 'hi', '');
  patch(S, c, 'en', { text: 'en one' });
  const enOne = lastEventId(S, c);
  patch(S, c, 'hi', { text: 'hi one' });
  const hiOne = lastEventId(S, c);
  patch(S, c, 'en', { text: 'en two' });
  const all = S.historyTree(c.id);
  const en = S.historyTree(c.id, 'en'), hi = S.historyTree(c.id, 'hi');
  const ids = t => t.rows.map(r => r.event.id);
  assert.ok(ids(all).includes(hiOne) && ids(all).includes(enOne), 'no language: every step, as before');
  assert.ok(ids(en).includes(enOne) && !ids(en).includes(hiOne), 'English: its own steps, not Hindi\'s');
  assert.ok(ids(hi).includes(hiOne) && !ids(hi).includes(enOne), 'Hindi: its own steps, not English\'s');
  const created = all.rows.find(r => r.event.action === 'content_created').event.id;
  assert.ok(ids(en).includes(created) && ids(hi).includes(created), 'steps that are not about one language (created) are in every language');
  assert.ok(en.rows.every(r => r.event.lang == null || r.event.lang === 'en') && hi.rows.every(r => r.event.lang == null || r.event.lang === 'hi'));
  // the head is the newest step overall (an English one): English marks it, Hindi marks the nearest of its own steps below it
  assert.equal(en.head, lastEventId(S, c));
  assert.equal(hi.head, hiOne, 'for Hindi the current marker sits on the nearest Hindi (or every-language) step at or above the current step');
  // a straight history of one language is one lane, with the links skipping the other language's steps
  assert.equal(en.width, 1);
  assert.equal(hi.width, 1);
  const enTwo = en.rows[0];
  assert.equal(enTwo.after[enTwo.lane], enOne, 'English two links to English one although a Hindi step is in between');
  // a rewind is for every language: it shows in both
  S.rewind(c.id, enOne);
  const rw = S.historyFor(c.id, 'all').find(e => e.action === 'rewound').id;
  assert.ok(ids(S.historyTree(c.id, 'en')).includes(rw) && ids(S.historyTree(c.id, 'hi')).includes(rw));
  assert.equal(S.historyTree(c.id, 'hi').head, rw);
});
