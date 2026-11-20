// The editing panel IS the WhatsApp phone: the message is edited in place; there is no Preview button or dialog.
// Placeholders, button payloads / URLs, the header media id and the problems sit below the phone.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('phone editor: the editing panel looks like the WhatsApp message, details below it', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const val = s => b.ev(`document.querySelector(${JSON.stringify(s)}).value`);
  const E = s => '.panel.edit[data-lang=en] ' + s;
  const rect = s => b.ev(`(function(){var r=document.querySelector(${JSON.stringify(s)}).getBoundingClientRect(); return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,h:r.height}})()`);

  // ---- there is no separate render
  ok('there is no Preview button and no preview dialog anywhere', !await q('[data-action=preview]') && !await q('.preview-btn') && !await q('.modal'));
  ok('the editing panel has the phone: sender header, a chat area, one message bubble', await q(E('.phone.editable')) && /Noora Health/.test(await txt(E('.wa-contact'))) && await q(E('.wa-chat')) && await cnt(E('.wa-bubble')) === 1);

  // ---- what is in the phone: header media, body, footer, time; the buttons under the bubble
  ok('the bubble holds the header picture, the body text (editable), the footer (editable) and a time', await q(E('.wa-bubble .wa-media-image')) && await q(E('.wa-bubble textarea[data-input=text]')) && await q(E('.wa-bubble input[data-input=footer]')) && /\d:\d\d/.test(await txt(E('.wa-bubble .wa-time'))));
  ok('the body shows the authored text with its {{placeholder}}', /^Hello {{name}}, welcome to Noora Health\./.test(await val(E('[data-input=text]'))));
  ok('the buttons are under the bubble, as WhatsApp shows them, and their text is typed on the button', await cnt(E('.wa-chat > .wa-btns .wa-btn-edit')) === 2 && !await q(E('.wa-bubble .wa-btn-edit')) && await b.ev(`[].map.call(document.querySelectorAll('.panel.edit[data-lang=en] .wa-btn-in'), function(i){return i.value}).join('|')`) === 'Tell me more|Visit website');
  ok('the + Add dropdown is below the phone, not inside it', await q(E('[data-change=add-part]')) && !await q(E('.phone [data-change=add-part]')) && await b.ev(`document.querySelector('.panel.edit[data-lang=en] [data-change=add-part]').getBoundingClientRect().top >= document.querySelector('.panel.edit[data-lang=en] .phone').getBoundingClientRect().bottom - 1`));
  ok('the buttons sit close to the bubble and to each other (a few pixels, like WhatsApp)', await b.ev(`(function(){var bub=document.querySelector('.panel.edit[data-lang=en] .wa-bubble').getBoundingClientRect(), bs=document.querySelectorAll('.panel.edit[data-lang=en] .wa-btn-edit'), a=bs[0].getBoundingClientRect(), c=bs[1].getBoundingClientRect(); return a.top - bub.bottom <= 4 && c.top - a.bottom <= 4})()`));
  ok('there are no section labels (Body, Footer, Buttons…) inside the phone', !await q(E('.wa-chat .sec-label')) && !await q(E('.wa-chat .bcard-head')));

  // ---- what is NOT in the phone sits below it
  const phone = await rect(E('.phone'));
  const below = async s => (await rect(E(s))).top >= phone.bottom - 1;
  ok('the placeholders table is below the phone', await q(E('[data-sec=placeholders]')) && await below('[data-sec=placeholders]'));
  ok('the table is titled "Body placeholders" (the URL button variables have their own table)', /^Body placeholders/.test((await txt(E('[data-sec=placeholders] .sec-label'))).trim()));
  ok('the table columns are Name | Position | Default (short headings)', await b.ev(`[].map.call(document.querySelectorAll('.panel.edit[data-lang=en] [data-sec=placeholders] th'), function(h){return h.textContent}).join('|')`) === 'Name|Position|Default' && await b.ev(`[].map.call(document.querySelectorAll('.panel.edit[data-lang=en] [data-params] th'), function(h){return h.textContent}).join('|')`) === 'URL placeholder|Position|Default');
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

  // ---- every language is its own phone; another template with no header, footer or buttons
  ok('Hindi is a phone of its own next to English, with its own text (all languages are editable at once)', /^नमस्ते {{name}}/.test(await val('.panel.edit[data-lang=hi] [data-input=text]')) && await cnt('.panel.edit .phone') === 2);
  await b.click('.content-item:nth-child(3)');
  ok('a template with no header, footer or buttons shows only the body in the bubble (and + Add below the phone)', !await q(E('.wa-media')) && !await q(E('[data-input=footer]')) && !await q(E('.wa-btn-edit')) && await q(E('[data-change=add-part]')) && /Tip of the day/.test(await val(E('[data-input=text]'))));
  await b.click('.content-item:nth-child(1)');

  // ---- the editing panel is as wide as its phone plus a bit (50-100 px), including everything below the phone
  const wOf = s => b.ev(`Math.round(document.querySelector(${JSON.stringify(s)}).getBoundingClientRect().width)`);
  const pw = await wOf(E('.phone'));
  const panelW = await wOf('.panel.edit[data-lang=en]');
  ok('the editing panel is 50-100 px wider than its phone', panelW - pw >= 50 && panelW - pw <= 100, panelW + ' vs phone ' + pw);
  ok('nothing below the phone is wider than the panel (no horizontal scroll inside it)', await b.ev(`(function(){var p=document.querySelector('.panel.edit[data-lang=en]'); return p.scrollWidth <= p.clientWidth + 1 && [].every.call(p.querySelectorAll('input, select, table, textarea'), function(e){ return e.getBoundingClientRect().right <= p.getBoundingClientRect().right + 1 })})()`));
  ok('every language panel has that width, and every phone is as wide as the editing one', await wOf('.panel.edit[data-lang=hi]') === panelW && await wOf('.panel.edit[data-lang=hi] .phone') === pw);
  ok('the panels are in one horizontal strip: English left, Hindi right, same top', await b.ev(`(function(){var a=document.querySelector('.panel.edit[data-lang=en]').getBoundingClientRect(), h=document.querySelector('.panel.edit[data-lang=hi]').getBoundingClientRect(); return a.right <= h.left && Math.abs(a.top - h.top) < 2})()`));

  // ---- the row of language panels is centred when there is room to spare
  const room = () => b.ev(`(function(){var m=document.querySelector('.panels').getBoundingClientRect(), a=document.querySelector('.panels > .panel:first-child').getBoundingClientRect(), z=document.querySelector('.panels > .panel:last-child').getBoundingClientRect(); var inner = document.querySelector('.panels'); return {left: Math.round(a.left - m.left), right: Math.round(m.left + inner.clientWidth - z.right), over: document.querySelector('.panels').scrollWidth > document.querySelector('.panels').clientWidth + 1}})()`);
  const r2 = await room();
  ok('two panels are narrower than the editor, so the row is centred: equal room at the left and right, and it is real room', !r2.over && r2.left > 20 && Math.abs(r2.left - r2.right) <= 2, JSON.stringify(r2));
  ok('the panels still touch each other as one block in the middle', await b.ev(`(function(){var a=document.querySelector('.panel.edit[data-lang=en]').getBoundingClientRect(), h=document.querySelector('.panel.edit[data-lang=hi]').getBoundingClientRect(); return Math.abs(h.left - a.right) <= 1})()`));
  await b.click('[data-action=toggle-history-pane]');
  const r3 = await room();
  ok('when the editor gets too narrow for them (history open) the row starts at the left edge and scrolls: nothing is cut off at the left', r3.over && r3.left === 0, JSON.stringify(r3));
  await b.click('[data-action=toggle-history-pane]');
  const r4 = await room();
  ok('and it is centred again when the room comes back', !r4.over && Math.abs(r4.left - r4.right) <= 2 && r4.left > 20, JSON.stringify(r4));

  // ---- the phone has a constant height, a bit shorter than an average phone; a long message scrolls inside the chat
  const phoneH = () => b.ev(`Math.round(document.querySelector('.panel.edit[data-lang=en] .phone').getBoundingClientRect().height)`);
  const h0 = await phoneH();
  ok('the phone is a constant, shortish height (shorter than an average phone, about 580 px)', h0 >= 540 && h0 <= 620, h0);
  await b.fill(E('[data-input=text]'), 'line\n'.repeat(60));
  ok('a very long message does not stretch the phone: it keeps its height and the chat scrolls inside it', await phoneH() === h0 && await b.ev(`(function(){var c=document.querySelector('.panel.edit[data-lang=en] .wa-chat'); return c.scrollHeight > c.clientHeight && getComputedStyle(c).overflowY === 'auto'})()`), await phoneH());
  await b.fill(E('[data-input=text]'), 'Hi');
  ok('and a very short one does not shrink it', await phoneH() === h0);
  await b.click(E('.revert'));
  await b.click('.content-item:nth-child(3)');
  ok('another template, with no header or buttons, has the same height', await phoneH() === h0);
  await b.click('.content-item:nth-child(1)');

  // ---- Hindi's phone fills the defaults? No: every phone is an editor, so it shows {{name}} like English; the defaults are in its table
  ok('Hindi\'s placeholders table and button payloads are below its own phone', await q('.panel.edit[data-lang=hi] [data-sec=placeholders]') && await b.ev(`document.querySelector('.panel.edit[data-lang=hi] [data-input=btn-payload]').value`) === 'welcome_more' && await b.ev(`document.querySelector('.panel.edit[data-lang=hi] [data-input=btn-payload]').getBoundingClientRect().top >= document.querySelector('.panel.edit[data-lang=hi] .phone').getBoundingClientRect().bottom - 1`));
  ok('there is no table of languages below the editors and no reference panel', !await q('table.overview') && !await q('.panel.ref') && !await q('tr.clickable'));

  // ---- themes: the phone follows the colour scheme (no hard-coded colours)
  const chat = () => b.ev(`getComputedStyle(document.querySelector('.panel.edit[data-lang=en] .wa-chat')).backgroundColor`);
  await b.setScheme('light'); const light = await chat();
  await b.setScheme('dark'); const dark = await chat();
  await b.setScheme('light');
  ok('the phone has light and dark colours', light !== dark, light + ' / ' + dark);
});
