// Real mouse drags: only the grip handle starts a drag; the dialog lists where the template already is, then Copy / Move / Cancel.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('drag a template onto a campaign: copy / move / cancel dialog', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const names = () => b.ev(`[].map.call(document.querySelectorAll('.content-item .name'), e => e.childNodes[0].textContent.trim()).join(', ')`);
  const title = () => b.ev(`document.getElementById('list-title').textContent`);
  const reload = async () => { await b.ev(`location.reload(); 0`); await b.sleep(900); };
  const store = () => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('cms-prototype-v1')).contents.map(c => [c.name, c.campaignIds]))`);
  const item = name => `.content-item[data-id="${name}"]`;
  const idOf = n => b.ev(`(function(){var c=Store.list().filter(function(x){return x.name===${JSON.stringify(n)}})[0]; return c && c.id;})()`);
  const grip = id => item(id) + ' .drag-handle';
  const camp = id => `.camp-item[data-id="${id}"]`;
  const opts = () => b.ev(`[].map.call(document.querySelectorAll('.dlg-opt'), function(o){return o.querySelector('strong').textContent + (o.disabled ? '(off)' : '')}).join(' | ')`);
  const optDesc = which => b.ev(`document.querySelector('[data-action=dialog-${which}] span').textContent`);
  const existing = () => b.ev(`[].map.call(document.querySelectorAll('.exists-list li'), function(l){return l.textContent.replace(/\\s+/g,' ').trim()}).join(' | ')`);

  await b.ev(`localStorage.clear(); 0`); await reload();
  const W = await idOf('Welcome message'), A = await idOf('Appointment reminder'), D = await idOf('Daily health tip');

  ok('each item has a drag handle on its left; the item itself is not draggable', await b.ev(`[].every.call(document.querySelectorAll('.content-item'), function(li){var h=li.querySelector('.drag-handle'); return h && h.draggable && !li.draggable && h.getBoundingClientRect().right <= li.querySelector('.name').getBoundingClientRect().left + 1})`));
  let bodyDragStarted = true;
  try { await b.drag(item(W) + ' .name', camp('k3')); } catch (e) { bodyDragStarted = !/not intercepted/.test(e.message); }
  ok('dragging the item body (not the handle) does NOT start a drag or open a dialog', !bodyDragStarted && !await q('.modal'));
  await b.click(item(D) + ' .drag-handle');
  ok('click on a handle selects that item', await b.ev(`document.querySelector('.content-item.active .name').firstChild.textContent.trim()`) === 'Daily health tip');
  await b.click(item(W) + ' .name');
  ok('click on the item body selects it', await b.ev(`document.querySelector('.content-item.active .name').firstChild.textContent.trim()`) === 'Welcome message');

  // ---- drag from All content onto Immunisation (template is only in Newborn care)
  let marked = false;
  await b.drag(grip(W), camp('k3'), { hold: async () => { marked = await b.ev(`document.querySelector('.camp-item[data-id=k3]').classList.contains('drop-over') && document.querySelector('.content-item.dragging') !== null`); } });
  ok('while dragging over a campaign it is highlighted and the dragged item is dimmed', marked);
  ok('dropping opens the dialog (role=dialog, aria-modal) titled with template -> campaign', await q('.modal[role=dialog][aria-modal=true]') && /Welcome message.*→.*Immunisation/.test(await txt('#dlg-title')), await txt('#dlg-title'));
  ok('options are Copy, Move, Cancel (in that order)', await opts() === 'Copy | Move | Cancel', await opts());
  ok('"Already in" lists the campaigns where it exists (only Newborn care), read-only', await existing() === 'Newborn care' && !await q('.exists-list input, .exists-list button, .exists-list a') && (await txt('.dlg-label')).trim() === 'Already in', await existing());
  ok('the list sits above the options', await b.ev(`document.querySelector('.exists-list').getBoundingClientRect().bottom <= document.querySelector('.dlg-options').getBoundingClientRect().top`));
  ok('Copy/Move descriptions say what will happen', /Keep it in Newborn care and add it to Immunisation/.test(await optDesc('copy')) && /Remove it from Newborn care and add it to Immunisation/.test(await optDesc('move')), await optDesc('copy') + ' / ' + await optDesc('move'));
  ok('focus starts on the first option', await b.ev(`document.activeElement.getAttribute('data-action')`) === 'dialog-copy');

  // cancel paths change nothing
  await b.click('[data-action=dialog-cancel]');
  ok('Cancel closes the dialog and changes nothing', !await q('.modal') && JSON.parse(await store()).find(x => x[0] === 'Welcome message')[1].join() === 'k1');
  await b.drag(grip(W), camp('k3')); await b.key('Escape', 'Escape', 27);
  ok('Escape cancels', !await q('.modal'));
  await b.drag(grip(W), camp('k3')); await b.clickAt(5, 400);
  ok('clicking the backdrop cancels', !await q('.modal'));
  await b.drag(grip(W), camp('k3'), { cancel: true });
  ok('a cancelled drag (dropped nowhere) opens nothing', !await q('.modal'));
  await b.drag(grip(W), '.main');
  ok('dropping on something that is not a campaign opens nothing', !await q('.modal'));
  await b.drag(grip(W), camp(''));
  ok('"All content" is not a drop target', !await q('.modal'));
  ok('nothing was written by any of the cancels', JSON.parse(await store()).find(x => x[0] === 'Welcome message')[1].join() === 'k1' && !/Copied|Moved/.test(await b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('cms-prototype-v1')).history.map(h=>h.action))`)));

  // ---- Tab trap
  await b.drag(grip(W), camp('k3'));
  await b.key('Tab', 'Tab', 9); await b.key('Tab', 'Tab', 9); await b.key('Tab', 'Tab', 9);
  ok('Tab stays inside the dialog (wraps)', await b.ev(`document.querySelector('.modal').contains(document.activeElement)`));
  await b.click('[data-action=dialog-copy]');   // ---- COPY
  ok('Copy: dialog closes, toast confirms', !await q('.modal') && /Copied “Welcome message” to Immunisation/.test(await txt('#toast')), await txt('#toast'));
  ok('Copy: template now in Newborn care AND Immunisation (stored)', JSON.parse(await store()).find(x => x[0] === 'Welcome message')[1].sort().join() === 'k1,k3');
  ok('Copy: the template is now in both campaigns', await b.ev(`(function(){var s=JSON.parse(localStorage.getItem('cms-prototype-v1')); var n=function(id){return s.campaigns.filter(function(c){return c.id===id})[0].name}; var c=s.contents.filter(function(c){return c.name==='Welcome message'})[0]; return c.campaignIds.map(n).join(', ')})()`) === 'Newborn care, Immunisation');
  await b.click(camp('k3'));
  ok('Copy: it shows under Immunisation', await names() === 'Welcome message', await names());
  await b.click(camp('k1'));
  ok('Copy: and still under Newborn care', (await names()).includes('Welcome message'));

  // ---- Copy onto a campaign it is already in: disabled with reason
  await b.drag(grip(W), camp('k3'));
  ok('already in target: Copy disabled (shows why), "Already in" marks the target', (await opts()).startsWith('Copy(off)') && /Already in Immunisation/.test(await optDesc('copy')) && /Immunisation \(this campaign\)/.test(await existing()), await opts() + ' / ' + await existing());
  await b.key('Escape', 'Escape', 27);

  // ---- Several owners: Move is replaced by a disabled "Can't move", from ANY view
  await b.click(camp(''));
  await b.drag(grip(W), camp('k2'));
  ok('2 owners (from All content): lists both, Move shows as disabled "Can\'t move", Copy still enabled', await existing() === 'Newborn care | Immunisation' && (await opts()) === "Copy | Can't move(off) | Cancel", await existing() + ' / ' + await opts());
  ok('"Can\'t move" explains why (names the owners, suggests Copy)', /2 campaigns \(Newborn care, Immunisation\)/.test(await optDesc('move')) && /Copy it instead/.test(await optDesc('move')), await optDesc('move'));
  ok('clicking the disabled "Can\'t move" does nothing', await b.ev(`document.querySelector('[data-action=dialog-move]').disabled`));
  await b.key('Escape', 'Escape', 27);
  await b.click(camp('k1'));
  await b.drag(grip(W), camp('k2'));
  ok('2 owners (viewing one of them): still "Can\'t move"', (await opts()) === "Copy | Can't move(off) | Cancel", await opts());
  await b.click('[data-action=dialog-copy]');
  ok('Copy still works with several owners (now 3 campaigns)', JSON.parse(await store()).find(x => x[0] === 'Welcome message')[1].sort().join() === 'k1,k2,k3');
  await b.drag(grip(W), camp('k3'));
  ok('3 owners: reason says 3 campaigns', /3 campaigns/.test(await optDesc('move')) && (await opts()) === "Copy(off) | Can't move(off) | Cancel", await opts() + ' / ' + await optDesc('move'));
  await b.key('Escape', 'Escape', 27);
  ok('refused move wrote nothing', JSON.parse(await store()).find(x => x[0] === 'Welcome message')[1].sort().join() === 'k1,k2,k3');

  // ---- MOVE: a template owned by exactly one campaign (Appointment reminder is only in Postnatal check-ups)
  await b.click(camp('k2'));
  await b.drag(grip(A), camp('k1'));
  ok('1 owner: Move is enabled, labelled "Move", names the source', (await opts()) === 'Copy | Move | Cancel' && /Remove it from Postnatal check-ups and add it to Newborn care/.test(await optDesc('move')), await opts() + ' / ' + await optDesc('move'));
  await b.click('[data-action=dialog-move]');
  ok('Move: now only in Newborn care (stored)', JSON.parse(await store()).find(x => x[0] === 'Appointment reminder')[1].join() === 'k1');
  ok('Move: it leaves the campaign being viewed', !(await names()).includes('Appointment reminder'), await names());
  ok('Move: toast', /Moved “Appointment reminder” to Newborn care/.test(await txt('#toast')));

  // ---- drag onto the campaign it is already in (single owner)
  await b.click(camp('k1'));
  await b.drag(grip(A), camp('k1'));
  ok('1 owner dropped on its own campaign: Copy and Move both disabled with a reason (Move keeps the plain label)', (await opts()) === 'Copy(off) | Move(off) | Cancel' && /Already in Newborn care/.test(await optDesc('move')), await opts());
  await b.key('Escape', 'Escape', 27);

  // ---- unassigned content
  await b.click(camp(''));
  await b.click('[data-action=open-add]'); await b.type('Loose note'); await b.click('.add-confirm');
  await b.drag(grip(await idOf('Loose note')), camp('k1'));
  ok('unassigned template: "Not in any campaign yet", Copy and Move enabled', /Not in any campaign yet/.test(await existing()) && (await opts()) === 'Copy | Move | Cancel', await existing() + ' / ' + await opts());
  await b.click('[data-action=dialog-move]');
  ok('unassigned + Move assigns it to the target only', JSON.parse(await store()).find(x => x[0] === 'Loose note')[1].join() === 'k1');

  // ---- history records who did it
  await b.click(camp('k1')); await b.click(item(A));
  await b.click('[data-action=toggle-history-pane]'); await b.click('.hp-tab[data-tab=other]');
  const hist = await b.ev(`document.getElementById('history-pane').innerText.replace(/\\s+/g,' ')`);
  ok('Other tab records the move (by Demo user)', /Moved to campaign/.test(hist) && /Postnatal check-ups → Newborn care/.test(hist) && /Demo user/.test(hist), hist);
  await b.click('.hp-tab[data-tab=content]');
  await b.click('[data-action=toggle-history-pane]');

  // ---- persistence + CSV + migration
  await reload();
  ok('memberships survive a reload', JSON.parse(await store()).find(x => x[0] === 'Welcome message')[1].sort().join() === 'k1,k2,k3' && JSON.parse(await store()).find(x => x[0] === 'Appointment reminder')[1].join() === 'k1');
  ok('CSV unchanged (still name,language,wa_template_name,text)', await b.ev(`Store.toCsv().split('\\r\\n')[0]`) === 'name,language,wa_template_name,text');
  await b.ev(`(function(){var s=JSON.parse(localStorage.getItem('cms-prototype-v1')); s.contents.forEach(function(c){ c.campaignId = c.campaignIds[0] || null; delete c.campaignIds; }); localStorage.setItem('cms-prototype-v1', JSON.stringify(s)); return 1})()`);
  await reload();
  ok('data saved with the old single-campaign shape is migrated to campaignIds', JSON.parse(await store()).every(x => Array.isArray(x[1])) && await b.ev(`Store.list().every(function(c){return !('campaignId' in c)})`));
  await b.click(camp('k1'));
  ok('migrated memberships still filter correctly', (await names()).length > 0, await names());

  // ---- layout + screenshots
  await b.click(camp(''));
  await b.drag(grip(D), camp('k3'));
  await b.ev(`document.querySelector('[data-theme=dark]').click(); 0`); await b.sleep(200);

});
