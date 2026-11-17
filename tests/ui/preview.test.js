// The phone preview: a dialog that renders a template as a WhatsApp message, only when the Preview button is clicked.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('preview: the template as a WhatsApp message on a phone, in a dialog', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const html = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).innerHTML || ''`);
  const open = () => b.click('.panel.edit [data-action=preview]');
  const active = () => b.ev(`document.activeElement.className + '|' + (document.activeElement.getAttribute('data-action')||'')`);
  const bubble = () => txt('.wa-bubble [data-x], .wa-bubble .wa-text');

  ok('nothing is rendered until Preview is clicked: no dialog, no phone', !await q('.modal') && !await q('.phone'));
  ok('each editing panel has a Preview button', await cnt('.panel.edit [data-action=preview]') === 1);
  await b.click('.panel.edit [data-action=preview]');
  ok('clicking it opens a modal dialog titled with the language, containing a phone', await q('.modal[role=dialog]') && await q('.phone') && /Preview · English/.test(await txt('#dlg-title')));
  ok('the phone looks like WhatsApp: header with the sender, a chat area, one message bubble', await q('.wa-head') && /Noora Health/.test(await txt('.wa-contact')) && await cnt('.wa-bubble') === 1 && await q('.wa-chat'));
  ok('the body has its placeholder filled with the default value, highlighted', /^Hello Friend, welcome to Noora Health\./.test((await txt('.wa-text')).trim()) && await txt('.wa-var') === 'Friend' && !/\{\{/.test(await txt('.wa-text')));
  ok('the header media shows as an image box, the footer under the body, a time at the bottom', await q('.wa-media-image') && (await txt('.wa-foot')).trim() === 'Noora Health' && /\d:\d\d/.test(await txt('.wa-time')));
  ok('the buttons are shown under the bubble: Tell me more (quick reply), Visit website (URL)', await b.ev(`[].map.call(document.querySelectorAll('.wa-btn'), function(x){return x.textContent.replace(/[↩↗]/g,'').trim()}).join('|')`) === 'Tell me more|Visit website');
  ok('focus moves into the dialog', /dlg-close/.test(await active()));
  await b.key('Tab', 'Tab', 9);
  ok('Tab stays inside the dialog (only the Close button to cycle through)', /dlg-close/.test(await active()));
  await b.key('Escape', 'Escape', 27);
  ok('Escape closes it and puts focus back on the Preview button', !await q('.modal') && /preview-btn/.test(await active()));
  await open();
  await b.click('.wa-chat');
  ok('clicking inside the dialog does not close it', await q('.modal'));
  await b.clickAt(5, 5);
  ok('clicking the backdrop closes it', !await q('.modal'));
  await open(); await b.click('.dlg-close');
  ok('the Close button closes it', !await q('.modal'));

  // ---- unsaved edits are included, but only when Preview is clicked (the dialog is a snapshot, not live)
  await b.fill('.panel.edit [data-input=text]', 'Hi {{first}}, *welcome* to _Noora_ and {{name}}.\nSecond line');
  ok('typing in the editor renders nothing by itself', !await q('.modal') && !await q('.phone'));
  await open();
  const t = await html('.wa-text');
  ok('the unsaved text is shown: *bold*, _italic_ and a line break are rendered; a placeholder without a default is marked', /<strong>welcome<\/strong>/.test(t) && /<em>Noora<\/em>/.test(t) && /<br>/.test(t) && await q('.wa-var.missing') && await txt('.wa-var.missing') === '{{first}}', t);
  ok('the placeholder that has a default (name) is still filled in', /<span class="wa-var"[^>]*>Friend<\/span>/.test(t));
  await b.key('Escape', 'Escape', 27);
  ok('the editor still has the unsaved text (the preview changed nothing)', await b.ev(`document.querySelector('.panel.edit [data-input=text]').value`) === 'Hi {{first}}, *welcome* to _Noora_ and {{name}}.\nSecond line' && !await b.ev(`document.querySelector('.panel.edit .save').disabled`));
  await b.click('.panel.edit [data-action=revert]');

  // ---- another language, another template without header / footer / buttons
  await b.click('tr.clickable[data-lang=hi]');
  await open();
  ok('the preview follows the language picked in the table (Hindi text, its own default)', /Preview · Hindi/.test(await txt('#dlg-title')) && /नमस्ते दोस्त/.test(await txt('.wa-text')));
  await b.key('Escape', 'Escape', 27);
  await b.click('.content-item:nth-child(3)');
  await open();
  ok('a template with no header, footer or buttons shows only the body', !await q('.wa-media') && !await q('.wa-foot') && !await q('.wa-btn') && /Tip of the day/.test(await txt('.wa-text')));
  await b.key('Escape', 'Escape', 27);
  await b.click('.content-item:nth-child(1)');
  await b.click('tr.clickable[data-lang=en]');

  // ---- the reference panel (side by side) previews its saved text
  await b.click('[data-change=toggle-side]');
  await b.fill('.panel.edit [data-input=text]', 'Edited but not saved {{name}}');
  await b.click('.panel.ref [data-action=preview]');
  ok('a reference panel has its own Preview, of the saved text (not the unsaved edit in the other panel)', await q('.modal') && /नमस्ते दोस्त/.test(await txt('.wa-text')) && !/Edited but not saved/.test(await txt('.wa-text')) && /saved reference/.test(await txt('.phone-note')));
  await b.key('Escape', 'Escape', 27);
  await b.click('[data-change=toggle-side]');
  await b.click('.panel.edit [data-action=revert]');

  // ---- themes: the dialog follows the colour scheme (no hard-coded colours)
  await open();
  const light = await b.ev(`getComputedStyle(document.querySelector('.wa-chat')).backgroundColor`);
  await b.setScheme('dark'); await b.sleep(200);
  const dark = await b.ev(`getComputedStyle(document.querySelector('.wa-chat')).backgroundColor`);
  await b.setScheme('light');
  ok('the phone has light and dark colours', light !== dark, light + ' / ' + dark);
});
