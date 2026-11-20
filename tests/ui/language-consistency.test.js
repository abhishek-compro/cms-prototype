// Mismatches between the languages of one template: errors (block publishing, saving still works) and warnings.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('languages must match: buttons, header, footer (errors) and placeholders (warning)', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const cur = { lang: 'en' };               // the language panel the steps below work in (all languages are editable panels now)
  const L = () => cur.lang;
  const E = s => '.panel.edit[data-lang=' + cur.lang + '] ' + s;
  const publishBtn = () => b.ev(`(function(){var x=document.querySelector('[data-action=deploy-all]'); return x.textContent.trim()+(x.disabled?' (disabled)':'')})()`);
  const badge = lang => b.ev(`(function(){var r=document.querySelectorAll('.panel.edit[data-lang=${lang}] .panel-head .badge'); return r.length > 1 ? r[1].textContent.replace(/\\s+/g,' ').trim() : ''})()`);   // the "n problems" badge of a panel (empty when none)
  const probs = () => txt(E('[data-sec=problems] .probs'));
  const warns = () => txt(E('[data-sec=problems] .warns'));

  ok('the sample template is consistent: no problems, no warnings, Publish all available', !await q(E('[data-sec=problems] .probs')) && !await q(E('[data-sec=problems] .warns')) && /^Publish all$/.test(await publishBtn()));

  // ---- number of buttons
  cur.lang = 'hi';
  await b.click(E('[data-action=btn-remove][data-idx="1"]'));
  ok('removing a button in one language shows an error about the number of buttons (live, before saving)', /Problems \(1\)/.test(await probs()) && /number of buttons differs between languages: English 2, Hindi 1/.test(await probs()), await probs());
  ok('the error says it blocks publishing but saving still works', /block publishing, saving still works/.test(await probs()));
  await b.click(E('.save'));
  ok('saving is allowed: the change is saved (Save is disabled again, no unsaved dot) although the template has a mismatch', await b.ev(`document.querySelector('.panel.edit[data-lang=${L()}] .save').disabled`) && await b.ev(`Store.consistency(Store.list()[0]).errors.length`) === 1 && await b.ev(`Store.partsOf(Store.list()[0].translations[1]).buttons.length`) === 1);
  ok('both panels show the problem badge in their head', /1 problem/.test(await badge('hi')) && /1 problem/.test(await badge('en')), await badge('en'));
  ok('Publish all is disabled while there is a mismatch', /disabled/.test(await publishBtn()), await publishBtn());
  cur.lang = 'en';
  ok('the same error shows when editing the other language', /number of buttons differs/.test(await probs()));
  cur.lang = 'hi';
  await b.ev(`(function(){var s=document.querySelector('.panel.edit[data-lang=${L()}] [data-change=add-part]'); s.value='button:URL'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('adding a URL button back: the number matches again', !/number of buttons/.test(await probs()), await probs());

  // ---- type of buttons
  ok('(the new URL button has no text or URL yet: its own problems show, but the types match)', !/type of buttons/.test(await probs()) && /needs text/.test(await probs()), await probs());
  await b.fill(E('[data-input=btn-text]:not([data-idx="0"])'), 'वेबसाइट देखें');
  await b.fill(E('[data-input=btn-url]'), 'https://www.noorahealth.org/{{page}}');
  await b.fill(E('[data-input=btn-param]'), 'about');
  ok('with the URL button complete the language has no problems at all', !await q(E('[data-sec=problems] .probs')), await probs());
  await b.click(E('.save'));
  ok('saved: Publish all is available again', /^Publish all$/.test(await publishBtn()), await publishBtn());

  // swap the order of types: change the first button to a URL button is not possible in the UI, so remove + re-add in the other order
  await b.click(E('[data-action=btn-remove][data-idx="0"]'));
  await b.ev(`(function(){var s=document.querySelector('.panel.edit[data-lang=${L()}] [data-change=add-part]'); s.value='button:QUICK_REPLY'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`);
  ok('the same buttons in a different order (URL then quick reply here) is a type mismatch', /type of buttons differs between languages \(button 1: English quick reply, Hindi URL; button 2: English URL, Hindi quick reply\)/.test(await probs()), await probs());
  await b.click(E('.revert'));
  ok('Revert drops the draft: back to no problems', !await q(E('[data-sec=problems] .probs')));

  // ---- header and footer
  await b.click(E('[data-action=remove-footer]'));
  ok('a footer removed in one language only is an error (footer set in English but missing in Hindi)', /The footer is set in English but missing in Hindi/.test(await probs()), await probs());
  await b.click(E('.revert'));
  await b.fill(E('[data-input=header]'), '');
  ok('a header media missing in one language only is an error', /The header media is set in English but missing in Hindi/.test(await probs()), await probs());
  await b.click(E('.revert'));

  // ---- placeholders: a warning only
  await b.fill(E('[data-input=text]'), 'नमस्ते, नूरा हेल्थ में आपका स्वागत है।');
  ok('a placeholder name used in one language and not in another is only a warning', await q(E('[data-sec=problems] .warns')) && !await q(E('[data-sec=problems] .probs')) && /Warnings \(1\)/.test(await warns()) && /\{\{name\}\} is used in English but not in Hindi/.test(await warns()), await warns());
  ok('the warning says it does not block publishing', /do not block publishing/.test(await warns()));
  await b.click(E('.save'));
  ok('saved with the warning: no problem badge, Publish all still available', !/problem/.test(await badge('hi')) && !/disabled/.test(await publishBtn()), await badge('hi') + ' / ' + await publishBtn());
  cur.lang = 'en';
  ok('the warning also shows in the other language\'s editor', /\{\{name\}\} is used in English but not in Hindi/.test(await warns()));
  await b.click('[data-action=deploy-all]');
  ok('publishing goes ahead despite the warning', /Published/.test(await txt('#toast')), await txt('#toast'));

  // ---- the full-block message
  cur.lang = 'hi';
  await b.click(E('[data-action=remove-footer]')); await b.click(E('.save'));
  cur.lang = 'en';
  await b.fill(E('[data-input=text]'), 'Hello {{name}}, we changed this text.'); await b.click(E('.save'));
  ok('with a mismatch nothing can be published, even the edited language (Publish all disabled)', /disabled/.test(await publishBtn()), await publishBtn());
});
