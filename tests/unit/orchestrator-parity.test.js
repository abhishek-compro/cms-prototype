// Checks the prototype against the orchestrator's OWN code (campaign/models.py), not against our reading of it:
//  - every extra_content the prototype exports must pass the orchestrator's real validate_extra_content
//  - placeholder positions must match its get_body_params_map (known, documented differences are listed explicitly)
// Needs python3 and a checkout of the orchestrator:  ORCHESTRATOR_REPO=/path/to/sms-ivr-orchestrator  (default ~/repos/sms-ivr-orchestrator)
'use strict';
const { loadStore, test, assert } = require('../lib/harness');
const orchestrator = require('../lib/orchestrator');

const skip = orchestrator.skipReason();
const runHelper = orchestrator.run;

function exportsToValidate() {
  const { S } = loadStore();
  const out = {};
  S.list().forEach(c => { out['seed: ' + c.name] = S.toExtraContent(c.id); });
  let n = 0;
  const scenario = (label, build) => {
    const c = S.createContent(label + ' ' + (++n)).content;
    build(c);
    out['scenario: ' + label] = S.toExtraContent(c.id);
  };
  const put = (c, lang, p) => {
    if (!c.translations.find(t => t.lang === lang)) S.addTranslation(c.id, lang, '');
    const cur = S.cloneParts(S.partsOf(c.translations.find(t => t.lang === lang)));
    S.saveParts(c.id, lang, Object.assign(cur, p));
  };
  scenario('repeated placeholders in three languages', c => {
    put(c, 'en', { text: 'Hi {{name}}, your {{item}} is ready, {{name}}. Bye {{name}}', defaults: { name: 'Ram', item: 'kit' } });
    put(c, 'hi', { text: 'नमस्ते {{name}}', defaults: { name: 'राम' } });
    put(c, 'kn', { text: 'ಹಲೋ {{name}} {{item}}', defaults: { name: 'ರಾಮ', item: 'ಕಿಟ್' } });
  });
  scenario('video header, two URL variables, mixed buttons, footer', c => {
    S.setHeaderType(c.id, 'video');
    put(c, 'en', {
      text: 'Watch this', header: 'https://cdn.example.org/media/abc-123.mp4', footer: 'Footer text',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Yes', default_payload: 'y' },
        { type: 'URL', text: 'Open', url: 'https://x.org/{{a}}/{{b}}', default_parameters: { a: '1', b: '2' } },
        { type: 'URL', text: 'Static', url: 'https://example.org/page', default_parameters: {} }
      ]
    });
  });
  scenario('plain text, no header, one language still empty', c => { put(c, 'en', { text: 'Plain text' }); S.addTranslation(c.id, 'ta', ''); });
  scenario('placeholder removed after a save (stale default pruned)', c => {
    put(c, 'en', { text: '{{a}} {{b}}', defaults: { a: 'A', b: 'B' } });
    put(c, 'en', { text: '{{a}}' });
  });
  scenario('the most buttons the prototype allows: 3 quick replies and 1 URL', c => put(c, 'en', {
    text: 'x',
    buttons: [
      { type: 'QUICK_REPLY', text: 'One', default_payload: 'p1' }, { type: 'QUICK_REPLY', text: 'Two', default_payload: 'p2' },
      { type: 'QUICK_REPLY', text: 'Three', default_payload: 'p3' }, { type: 'URL', text: 'Open', url: 'https://x.org/{{id}}', default_parameters: { id: '1' } }
    ]
  }));
  return out;
}

test('every extra_content the prototype exports passes the orchestrator\'s real validate_extra_content', { skip }, () => {
  const results = runHelper('validate', exportsToValidate());
  assert.ok(Object.keys(results).length >= 8);
  for (const [label, res] of Object.entries(results)) assert.equal(res, 'OK', `${label}: ${res}`);
});

test('the same validator rejects broken exports (so the check above is real)', { skip }, () => {
  const broken = {
    'missing key': { header: {}, body_param_defaults: {}, buttons: {} },
    'languages differ': { header: {}, body_param_defaults: { en: {} }, body_param_positions: {}, buttons: {} },
    'placeholder without default': { header: {}, body_param_defaults: { en: {} }, body_param_positions: { en: { name: [1] } }, buttons: {} },
    'unknown language': { header: { xx: '' }, body_param_defaults: {}, body_param_positions: {}, buttons: {} },
    'button text missing': { header: {}, body_param_defaults: {}, body_param_positions: {}, buttons: { en: [{ type: 'QUICK_REPLY', default_payload: 'p' }] } }
  };
  const results = runHelper('validate', broken);
  for (const [label, res] of Object.entries(results)) assert.notEqual(res, 'OK', label);
  assert.match(results['missing key'], /body_param_positions' not found/);
  assert.match(results['placeholder without default'], /body_param_defaults is missing/);
});

const SAME = [
  'abcd', '{{abcd}} {{asd}} {{abcd}}', 'Hi {{name}}, your {{item}} for {{name}}', '{{Name_1}}', '{{1}} {{2}}',
  '{{item0}} and {{day10}}', '{{first name}}', '{{ name }}', '{{}}', '{{{name}}}', 'x {{a}} y {{b}} z {{a}} {{c}}'
];
const KNOWN_DIFFERENT = ['{{a}}{{b}}', 'x {{a}}{{b}}{{c}} y {{a}}'];

test('placeholder positions match the orchestrator\'s get_body_params_map', { skip }, () => {
  const { S } = loadStore();
  const repo = runHelper('parity', SAME);
  for (const r of repo) assert.deepEqual(S.positionsOf(r.text), r.map, JSON.stringify(r.text));
});

test('known difference: adjacent placeholders {{a}}{{b}} - the orchestrator drops all but the last of a run, the prototype keeps each', { skip }, () => {
  const { S } = loadStore();
  const repo = runHelper('parity', KNOWN_DIFFERENT);
  assert.deepEqual(repo[0].map, { b: [1] }, 'orchestrator behaviour (if this fails the orchestrator was fixed: delete this test and the note in AGENTS.md)');
  assert.deepEqual(S.positionsOf(KNOWN_DIFFERENT[0]), { a: [1], b: [2] });
  assert.deepEqual(S.positionsOf(KNOWN_DIFFERENT[1]), { a: [1, 4], b: [2], c: [3] });
  assert.notDeepEqual(repo[1].map, S.positionsOf(KNOWN_DIFFERENT[1]));
});
