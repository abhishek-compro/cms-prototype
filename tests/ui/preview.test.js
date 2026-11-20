// The editing panel IS the WhatsApp phone: the message is edited in place; there is no Preview button or dialog.
// Placeholders, button payloads / URLs, the header media id and the problems sit below the phone.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('phone editor: the editing panel looks like the WhatsApp message, details below it', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const val = s => b.ev(`document.querySelector(${JSON.stringify(s)}).value`);
  const E = s => '.panel.edit ' + s;
  const rect = s => b.ev(`(function(){var r=document.querySelector(${JSON.stringify(s)}).getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,h:r.height}})()`);

  // ---- there is no separate render
  ok('there is no Preview button and no preview dialog anywhere', !await q('[data-action=preview]') && !await q('.preview-btn') && !await q('.modal'));
  ok('the editing panel has the phone: sender header, a chat area, one message bubble', await q(E('.phone.editable')) && /Noora Health/.test(await txt(E('.wa-contact'))) && await q(E('.wa-chat')) && await cnt(E('.wa-bubble')) === 1);

  // ---- what is in the phone: header media, body, footer, time; the buttons under the bubble
  ok('the bubble holds the header picture, the body text (editable), the footer (editable) and a time', await q(E('.wa-bubble .wa-media-image')) && await q(E('.wa-bubble textarea[data-input=text]')) && await q(E('.wa-bubble input[data-input=footer]')) && /\d:\d\d/.test(await txt(E('.wa-bubble .wa-time'))));
  ok('the body shows the authored text with its {{placeholder}}', /^Hello {{name}}, welcome to Noora Health\./.test(await val(E('[data-input=text]'))));
  ok('the buttons are under the bubble, as WhatsApp shows them, and their text is typed on the button', await cnt(E('.wa-chat > .wa-btns .wa-btn-edit')) === 2 && !await q(E('.wa-bubble .wa-btn-edit')) && await b.ev(`[].map.call(document.querySelectorAll('.panel.edit .wa-btn-in'), function(i){return i.value}).join('|')`) === 'Tell me more|Visit website');
  ok('the + Add dropdown is below the phone, not inside it', await q(E('[data-change=add-part]')) && !await q(E('.phone [data-change=add-part]')) && await b.ev(`document.querySelector('.panel.edit [data-change=add-part]').getBoundingClientRect().top >= document.querySelector('.panel.edit .phone').getBoundingClientRect().bottom - 1`));
  ok('the buttons sit close to the bubble and to each other (a few pixels, like WhatsApp)', await b.ev(`(function(){var bub=document.querySelector('.panel.edit .wa-bubble').getBoundingClientRect(), bs=document.querySelectorAll('.panel.edit .wa-btn-edit'), a=bs[0].getBoundingClientRect(), c=bs[1].getBoundingClientRect(); return a.top - bub.bottom <= 4 && c.top - a.bottom <= 4})()`));
  ok('there are no section labels (Body, Footer, Buttons…) inside the phone', !await q(E('.wa-chat .sec-label')) && !await q(E('.wa-chat .bcard-head')));

  // ---- what is NOT in the phone sits below it
  const phone = await rect(E('.phone'));
  const below = async s => (await rect(E(s))).top >= phone.bottom - 1;
  ok('the placeholders table is below the phone', await q(E('[data-sec=placeholders]')) && await below('[data-sec=placeholders]'));
  ok('the buttons\' payloads and URLs are below the phone, with the URL variables', await below('[data-input=btn-payload]') && await below('[data-input=btn-url]') && await below('[data-input=btn-param]'));
  ok('the header media id is below the phone', await below('[data-input=header]'));
  ok('none of those fields is inside the phone', !await q(E('.phone [data-input=btn-payload]')) && !await q(E('.phone [data-input=btn-url]')) && !await q(E('.phone [data-input=default]')) && !await q(E('.phone [data-input=header]')));

  // ---- typing in the phone
  await b.fill(E('[data-input=text]'), 'Hi {{first}}, *welcome*');
  ok('typing in the bubble keeps focus, updates the counter, and the new placeholder appears below the phone', await b.ev(`document.activeElement.getAttribute('data-input')`) === 'text' && await txt(E('[data-count=text]')) === '23' && await q(E('[data-sec=placeholders] [data-name=first]')));
  const h1 = (await rect(E('[data-input=text]'))).h;
  await b.fill(E('[data-input=text]'), 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight');
  ok('the body grows with its text, like the bubble does', (await rect(E('[data-input=text]'))).h > h1 + 40, h1 + ' -> ' + (await rect(E('[data-input=text]'))).h);
  await b.click(E('.revert'));

  // ---- another language, another template with no header, footer or buttons
  await b.click('tr.clickable[data-lang=hi]');
  ok('picking another language row puts that language in the phone', /^नमस्ते {{name}}/.test(await val(E('[data-input=text]'))));
  await b.click('.content-item:nth-child(3)');
  ok('a template with no header, footer or buttons shows only the body in the bubble (and + Add below the phone)', !await q(E('.wa-media')) && !await q(E('[data-input=footer]')) && !await q(E('.wa-btn-edit')) && await q(E('[data-change=add-part]')) && /Tip of the day/.test(await val(E('[data-input=text]'))));
  await b.click('.content-item:nth-child(1)');
  await b.click('tr.clickable[data-lang=en]');

  // ---- the phone has a constant height, a bit shorter than an average phone; a long message scrolls inside the chat
  const phoneH = () => b.ev(`Math.round(document.querySelector('.panel.edit .phone').getBoundingClientRect().height)`);
  const h0 = await phoneH();
  ok('the phone is a constant, shortish height (shorter than an average phone, about 520 px)', h0 >= 450 && h0 <= 600, h0);
  await b.fill(E('[data-input=text]'), 'line\n'.repeat(60));
  ok('a very long message does not stretch the phone: it keeps its height and the chat scrolls inside it', await phoneH() === h0 && await b.ev(`(function(){var c=document.querySelector('.panel.edit .wa-chat'); return c.scrollHeight > c.clientHeight && getComputedStyle(c).overflowY === 'auto'})()`), await phoneH());
  await b.fill(E('[data-input=text]'), 'Hi');
  ok('and a very short one does not shrink it', await phoneH() === h0);
  await b.click(E('.revert'));
  await b.click('.content-item:nth-child(3)');
  ok('another template, with no header or buttons, has the same height', await phoneH() === h0);
  await b.click('.content-item:nth-child(1)');

  // ---- the reference panel is the same phone, read-only, with the defaults filled in
  await b.click('[data-change=toggle-side]');
  ok('the reference panel shows the saved message as a read-only phone, placeholders filled with their defaults', await q('.panel.ref .phone') && !await q('.panel.ref input, .panel.ref textarea') && /दोस्त/.test(await txt('.panel.ref .wa-var')) && !/\{\{/.test(await txt('.panel.ref .wa-text')));
  ok('the reference details (placeholders, button payloads) are below its phone, read-only', await q('.panel.ref [data-sec=placeholders]') && /welcome_more/.test(await txt('.panel.ref [data-sec=button-details]')));
  await b.click('[data-change=toggle-side]');

  // ---- themes: the phone follows the colour scheme (no hard-coded colours)
  const chat = () => b.ev(`getComputedStyle(document.querySelector('.panel.edit .wa-chat')).backgroundColor`);
  await b.setScheme('light'); const light = await chat();
  await b.setScheme('dark'); const dark = await chat();
  await b.setScheme('light');
  ok('the phone has light and dark colours', light !== dark, light + ' / ' + dark);
});
