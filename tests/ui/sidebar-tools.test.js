// Left bar tools: the search and + (new content) icon buttons open a text box that closes when it loses focus.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('left bar tools: search and new-content text boxes', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const items = () => b.ev(`document.querySelectorAll('.content-item').length`);
  const active = () => b.ev(`document.activeElement && (document.activeElement.id || document.activeElement.className)`);
  const heading = () => b.ev(`document.querySelector('.content-item.active .name').firstChild.textContent.trim()`);
  const BLANK = [100, 1000];   // empty area of the campaigns column: a click there moves focus away

  ok('closed state: a search icon and a + icon, no text boxes', await q('[data-action=open-search] svg') && await q('[data-action=open-add] svg') && !await q('#search') && !await q('#new-name'));

  // ---- search
  await b.click('[data-action=open-search]');
  ok('clicking the search icon opens a focused text box that keeps the icon', await q('#search') && await active() === 'search' && await q('.tool-box > svg'));
  await b.type('appo');
  ok('typing filters the list, and the box stays open and focused while typing', await items() === 1 && await q('#search') && await active() === 'search' && await b.ev(`document.getElementById('search').value`) === 'appo' && await q('.tool-box .clear-btn'));
  await b.type('i');
  ok('typing can continue character by character', await b.ev(`document.getElementById('search').value`) === 'appoi');
  for (let i = 0; i < 5; i++) await b.key('Backspace', 'Backspace', 8);
  ok('emptying the text removes the clear button; the box stays open', await q('#search') && !await q('.tool-box .clear-btn'));
  await b.type('appo');
  await b.clickAt(...BLANK);
  ok('unfocusing hides the search box', !await q('#search') && await q('[data-action=open-search]'));
  ok('the filter stays applied and is indicated (active icon + chip)', await items() === 1 && await q('.icon-btn.active') && await q('.filter-chip'));
  await b.click('.filter-chip [data-action=clear-search]');
  ok('the chip\'s x clears the filter', await items() === 3 && !await q('.filter-chip'));

  await b.click('[data-action=open-search]'); await b.type('daily');
  await b.click('.content-item');
  ok('clicking a list item while the box is open: the box closes AND the click lands', !await q('#search') && await heading() === 'Daily health tip');
  await b.click('.filter-chip [data-action=clear-search]');

  await b.click('[data-action=open-search]'); await b.type('zzz');
  ok('no match -> "No content found"', await items() === 0 && /No content found/.test(await b.ev(`document.getElementById('content-list').textContent`)));
  await b.key('Escape', 'Escape', 27);
  ok('Escape clears the filter and hides the box', !await q('#search') && await items() === 3 && !await q('.icon-btn.active'));

  await b.click('[data-action=open-search]'); await b.type('abc');
  await b.click('.tool-box .clear-btn');
  ok('the x inside the open box clears the text and keeps the box open and focused', await q('#search') && await b.ev(`document.getElementById('search').value`) === '' && await active() === 'search' && await items() === 3);
  await b.key('Escape', 'Escape', 27);

  // ---- new content
  await b.click('[data-action=open-add]');
  ok('clicking + opens a focused box with the + icon and an Add button', await q('#new-name') && await active() === 'new-name' && await q('.add-confirm') && await q('.tool-box > svg'));
  await b.type('Vaccine schedule');
  await b.click('.add-confirm');   // real click: the field blurs on mousedown, the click must still land
  ok('clicking Add (the field blurs first) still creates the content, selects it and closes the box', await heading() === 'Vaccine schedule' && !await q('#new-name') && await items() === 4);

  await b.click('[data-action=open-add]'); await b.type('Welcome-Message'); await b.key('Enter', 'Enter', 13);
  ok('Enter with a clashing name shows the error and keeps the box open', await q('#new-name') && /already maps/.test(await b.ev(`document.getElementById('new-error').textContent`)));
  await b.clickAt(...BLANK);
  ok('unfocusing hides the new-content box', !await q('#new-name'));
  await b.click('[data-action=open-add]');
  ok('reopened, the box is empty with no stale error', await b.ev(`document.getElementById('new-name').value`) === '' && await b.ev(`document.getElementById('new-error').textContent`) === '');
  await b.key('Escape', 'Escape', 27);
  ok('Escape closes the new-content box', !await q('#new-name'));

  await b.click('[data-action=open-add]'); await b.key('Tab', 'Tab', 9);
  ok('Tab from the field to Add keeps the box open', await q('#new-name') && await active() === 'btn primary add-confirm');
  await b.key('Tab', 'Tab', 9);
  ok('Tab out of the Add button closes the box', !await q('#new-name'));

});
