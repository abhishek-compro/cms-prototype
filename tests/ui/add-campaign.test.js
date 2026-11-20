// The + button in the campaigns sidebar: text box with an Add button that closes when it loses focus, validation, ids, persistence.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('adding a campaign: + button, text box, validation, focus behaviour', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const camps = () => b.ev(`[].map.call(document.querySelectorAll('.camp-item'), e => e.textContent.trim()).join(' | ')`);
  const names = () => b.ev(`[].map.call(document.querySelectorAll('.content-item .name'), e => e.childNodes[0].textContent.trim()).join(', ')`);
  const active = () => b.ev(`document.activeElement && (document.activeElement.id || document.activeElement.className)`);
  const reload = async () => { await b.ev(`location.reload(); 0`); await b.sleep(900); };
  const stored = () => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('cms-prototype-v1')).campaigns)`);

  await b.ev(`localStorage.clear(); 0`); await reload();
  ok('closed: header with title and a + button, no text box', await q('.camp-head .side-title') && await q('[data-action=open-add-campaign] svg') && !await q('#new-campaign'));

  await b.click('[data-action=open-add-campaign]');
  ok('click + opens the text box: focused, keeps the + icon, has the Add button', await q('#new-campaign') && await active() === 'new-campaign' && await q('.campaigns .tool-box > svg') && await q('.camp-add-confirm'));
  const w = await b.ev(`Math.round(document.getElementById('new-campaign').getBoundingClientRect().width)`);
  ok('text field is wide enough to type in (' + w + 'px)', w >= 70, w);
  ok('the content list box is unaffected', !await q('#new-name') && !await q('#search'));

  await b.type('Maternal health');
  await b.click('.camp-add-confirm');   // real click: the field must not blur-close the box before the click lands
  ok('Add (real click) creates the campaign, closes the box, appends it to the list', await camps() === 'All content | Newborn care | Postnatal check-ups | Immunisation | Maternal health' && !await q('#new-campaign'), await camps());
  ok('the new campaign is selected (active, list title) and empty', await b.ev(`document.querySelector('.camp-item.active').textContent`) === 'Maternal health' && await b.ev(`document.getElementById('list-title').textContent`) === 'Maternal health' && await names() === '', await names());
  ok('toast confirms', /Created campaign "Maternal health"/.test(await b.ev(`document.getElementById('toast').textContent`)));
  const st = JSON.parse(await stored()).pop();
  ok('persisted with id, who and when (' + JSON.stringify(st) + ')', st.name === 'Maternal health' && /^k\d+$/.test(st.id) && st.createdBy === 'Demo user' && !!st.createdAt);

  // content added now goes into the new campaign
  await b.click('[data-action=open-add]'); await b.type('Antenatal visit tips'); await b.click('.add-confirm');
  ok('content added now is filed under the new campaign', await names() === 'Antenatal visit tips', await names());

  // validation: duplicate (case-insensitive), empty
  await b.click('[data-action=open-add-campaign]'); await b.type('newborn CARE'); await b.key('Enter', 'Enter', 13);
  ok('duplicate name (case-insensitive) shows an error and keeps the box open', await q('#new-campaign') && /already exists/.test(await b.ev(`document.getElementById('camp-error').textContent`)), await b.ev(`document.getElementById('camp-error').textContent`));
  ok('no campaign was added', (await camps()).split(' | ').length === 5, await camps());
  await b.ev(`document.getElementById('new-campaign').value=''; 0`); await b.key('Enter', 'Enter', 13);
  ok('empty name shows an error', /required/.test(await b.ev(`document.getElementById('camp-error').textContent`)));
  await b.clickAt(700, 600);
  ok('unfocus hides the box and drops the text/error', !await q('#new-campaign') && await q('[data-action=open-add-campaign]'));
  await b.click('[data-action=open-add-campaign]');
  ok('reopened box is empty with no stale error', await b.ev(`document.getElementById('new-campaign').value`) === '' && await b.ev(`document.getElementById('camp-error').textContent`) === '');
  await b.key('Escape', 'Escape', 27);
  ok('Escape closes the box', !await q('#new-campaign'));

  // Enter creates; Tab flow
  await b.click('[data-action=open-add-campaign]'); await b.type('Nutrition'); await b.key('Enter', 'Enter', 13);
  ok('Enter creates a campaign (second one gets a different id)', (await camps()).endsWith('Nutrition') && new Set(JSON.parse(await stored()).map(k => k.id)).size === 5, await camps());
  await b.click('[data-action=open-add-campaign]'); await b.key('Tab', 'Tab', 9);
  ok('Tab from the field to Add keeps the box open', await q('#new-campaign') && await active() === 'btn primary camp-add-confirm', await active());
  await b.key('Tab', 'Tab', 9);
  ok('Tab out of Add closes the box', !await q('#new-campaign'));

  // whitespace trimmed + long name wraps without overflow
  await b.click('[data-action=open-add-campaign]'); await b.type('   Very long campaign name for the antenatal and postnatal home visit programme   '); await b.key('Enter', 'Enter', 13);
  ok('name is trimmed', (await camps()).endsWith('Very long campaign name for the antenatal and postnatal home visit programme'));
  ok('long name does not overflow the page or the sidebar', await b.ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.querySelector('.campaigns').scrollWidth <= document.querySelector('.campaigns').clientWidth`));

  // survives reload; old saved data without createdBy still fine
  await reload();
  ok('campaigns survive a reload', (await camps()).includes('Maternal health') && (await camps()).includes('Nutrition'), await camps());
  await b.click('[data-action=select-campaign][data-id=k1]');
  ok('older campaigns without createdAt/createdBy still work', await names() === 'Welcome message, Daily health tip', await names());

  // box open while another box opens: only one at a time
  await b.click('[data-action=open-add-campaign]');
  await b.click('[data-action=open-search]');
  ok('opening the content search closes the campaign box', !await q('#new-campaign') && await q('#search'));
  await b.key('Escape', 'Escape', 27);

  // screenshot of the open box, light + dark
  await b.click('[data-action=open-add-campaign]'); await b.type('Immunisation drive');
  await b.ev(`document.querySelector('[data-theme=dark]').click(); 0`); await b.sleep(200);

});
