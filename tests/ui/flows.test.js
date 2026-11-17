// Flows tab (content sidebar): the flow list, templates that are flows by themselves, the node canvas (template, logic,
// action and input nodes joined by edges), reordering flows, refer / duplicate / move to a campaign.
'use strict';
const { uiSuite } = require('../lib/harness');

uiSuite('flows: list, node canvas, edges, reordering, refer/duplicate/move', async ({ b, ok }) => {
  const q = s => b.ev(`!!document.querySelector(${JSON.stringify(s)})`);
  const cnt = s => b.ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
  const txt = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).textContent || ''`);
  const val = s => b.ev(`(document.querySelector(${JSON.stringify(s)})||{}).value`);
  const tab = n => b.click('[data-action=set-list-tab][data-tab=' + n + ']');
  const camp = id => b.click('[data-action=select-campaign][data-id="' + id + '"]');
  const flowNames = () => b.ev(`[].map.call(document.querySelectorAll('#content-list .flow-item .name'), function(e){return e.childNodes[0].textContent.trim()}).join(' | ')`);
  const meta = n => b.ev(`(function(){var r=[].filter.call(document.querySelectorAll('#content-list .flow-item'), function(e){return e.querySelector('.name').childNodes[0].textContent.trim()===${JSON.stringify(n)}})[0]; return r ? r.querySelector('.flow-meta').textContent.trim() : null})()`);
  const hasIndicator = n => b.ev(`(function(){var r=[].filter.call(document.querySelectorAll('#content-list .flow-item'), function(e){return e.querySelector('.name').childNodes[0].textContent.trim()===${JSON.stringify(n)}})[0]; return !!(r && r.querySelector('.flow-ind'))})()`);
  const flowOrder = () => b.ev(`Store.listFlows().map(function(f){return f.name}).join(' | ')`);
  const idOfFlow = n => b.ev(`Store.listFlows().filter(function(f){return f.name===${JSON.stringify(n)}})[0].id`);
  const idOfTpl = n => b.ev(`Store.list().filter(function(c){return c.name===${JSON.stringify(n)}})[0].id`);
  const flowItem = async n => '#content-list .flow-item[data-kind="flow"][data-id="' + await idOfFlow(n) + '"]';
  const tplItem = async n => '#content-list .flow-item[data-kind="template"][data-id="' + await idOfTpl(n) + '"]';
  const grip = sel => sel + ' .drag-handle';
  const opts = () => b.ev(`[].map.call(document.querySelectorAll('.dlg-opt'), function(o){return o.querySelector('strong').textContent + (o.disabled ? '(off)' : '')}).join(' | ')`);
  const optDesc = w => b.ev(`document.querySelector('[data-action=dialog-${w}] span').textContent`);
  const existing = () => b.ev(`[].map.call(document.querySelectorAll('.exists-list li'), function(l){return l.textContent.replace(/\\s+/g,' ').trim()}).join(' | ')`);

  // ---- the open flow's graph, read from the store (the canvas must agree with it: checked separately)
  const cur = `Store.getFlow(document.getElementById('canvas').dataset.flow)`;
  const titles = () => b.ev(`${cur}.nodes.map(Store.nodeTitle).join(' | ')`);
  const nid = t => b.ev(`(function(){var f=${cur}; var n=f.nodes.filter(function(n){return Store.nodeTitle(n)===${JSON.stringify(t)}})[0]; return n && n.id})()`);
  const node = async t => '.fnode[data-node="' + await nid(t) + '"]';
  const pos = t => b.ev(`(function(){var f=${cur}; var n=f.nodes.filter(function(n){return Store.nodeTitle(n)===${JSON.stringify(t)}})[0]; return n.x+','+n.y})()`);
  const outId = (t, label) => b.ev(`(function(){var f=${cur}; var n=f.nodes.filter(function(n){return Store.nodeTitle(n)===${JSON.stringify(t)}})[0]; return n.outs.filter(function(o){return o.label===${JSON.stringify(label)}})[0].id})()`);
  const edges = () => b.ev(`(function(){var S=Store,f=${cur},out=[]; f.nodes.forEach(function(n){var name=S.nodeTitle(n); if(n.type==='logic') n.outs.forEach(function(o){ if(o.to) out.push(name+' ['+o.label+'] -> '+S.nodeTitle(S.getNode(f,o.to))); }); else if(n.next) out.push(name+' -> '+S.nodeTitle(S.getNode(f,n.next))); }); return out.join(' | ')})()`);
  const outLabels = t => b.ev(`(function(){var f=${cur}; var n=f.nodes.filter(function(n){return Store.nodeTitle(n)===${JSON.stringify(t)}})[0]; return n.outs.map(function(o){return o.label}).join(' | ')})()`);
  const setTiming = async (boxSel, days, when, ref) => {
    if (days !== undefined) { await b.fill(boxSel + ' [data-t=days]', String(days)); await b.key('Enter', 'Enter', 13); }
    if (when !== undefined) { await b.ev(`(function(){var s=document.querySelector(${JSON.stringify(boxSel + ' [data-t=when]')}); s.value=${JSON.stringify(when)}; s.dispatchEvent(new Event('change',{bubbles:true})); return 1})()`); }
    if (ref !== undefined) { await b.fill(boxSel + ' [data-t=ref]', ref); await b.key('Enter', 'Enter', 13); }
  };
  const addNode = type => b.click('.flow-toolbar [data-action=add-node][data-type=' + type + ']');
  // searchable pickers: open with a click on the button, then click an option (or type to filter first)
  const choose = async (comboSel, id) => { await b.click(comboSel + ' .combo-btn'); await b.click(comboSel + ' .combo-opt[data-id="' + id + '"]'); };
  const comboOpts = comboSel => b.ev(`[].map.call(document.querySelectorAll(${JSON.stringify(comboSel + ' .combo-opt')}), function(o){return o.querySelector('.combo-name').textContent+(o.classList.contains('current')?'*':'')+(o.classList.contains('disabled')?'(off)':'')}).join('|')`);
  const shownOpts = comboSel => b.ev(`[].filter.call(document.querySelectorAll(${JSON.stringify(comboSel + ' .combo-opt')}), function(o){return o.style.display!=='none'}).map(function(o){return o.querySelector('.combo-name').textContent}).join('|')`);
  const addCombo = '.flow-toolbar [data-combo=add]', addFlowCombo = '.flow-toolbar [data-combo=addflow]';
  const addTemplateNode = async name => choose(addCombo, await idOfTpl(name));
  const addFlowNode = async name => choose(addFlowCombo, await idOfFlow(name));
  // editing a node: a click on it opens it; the checkmark saves, the cross cancels
  const editNode = async t => b.click((await node(t)) + ' .fnode-head');
  const saveEdit = () => b.click('.fnode.editing .node-save');
  const cancelEdit = () => b.click('.fnode.editing .node-cancel');
  const editing = () => cnt('.fnode.editing');
  const outField = i => '.fnode.editing [data-edit=out][data-i="' + i + '"]';
  const outPort = async (t, label) => (await node(t)) + ' .port.out' + (label ? '[data-out="' + await outId(t, label) + '"]' : '');
  const inPort = async t => (await node(t)) + ' .port.in';
  // the node's × only exists for the pointer while the node is hovered: hover the node, then click the cross where it is
  const removeNode = async title => {
    const sel = await node(title);
    await b.hover(sel);
    const p = await b.point(sel + ' .node-x', 0.5, 0.5, false);
    await b.clickAt(p[0], p[1]);
  };
  const toast = () => txt('#toast');
  const tab2 = () => b.key('Tab', 'Tab', 9);
  const historyText = () => b.ev(`document.getElementById('history-pane').innerText.replace(/\\s+/g,' ')`);

  // ================= the tab and what it lists =================
  ok('the content sidebar has Templates | Flows tabs, Templates first and selected', await b.ev(`[].map.call(document.querySelectorAll('.sidebar .list-tab'), function(t){return t.textContent.trim()+(t.classList.contains('active')?'*':'')}).join(' | ')`) === 'Templates* | Flows');
  await tab('flows');
  ok('Flows tab is selected and lists flows, not templates', await b.ev(`document.querySelector('.list-tab.active').textContent.trim()`) === 'Flows' && await cnt('#content-list .flow-item') === 2 && !await q('#content-list .content-item:not(.flow-item)'));
  ok('All content: the flow you created first, then the template that is a flow by itself', await flowNames() === 'Newborn first weeks | Appointment reminder', await flowNames());
  ok('only the template-as-flow carries the indicator, with its tooltip', await hasIndicator('Appointment reminder') && !await hasIndicator('Newborn first weeks') && await b.ev(`document.querySelector('#content-list .flow-ind').title`) === 'This template is itself a flow');
  ok('a flow\'s entry shows the flow\'s timing and what it holds; a template that is a flow by itself shows its own timing',
    await meta('Newborn first weeks') === '7 days before expected_date_of_delivery · 2 templates · 1 logic · 1 action · 1 input' && await meta('Appointment reminder') === '7 days before expected_date_of_delivery', await meta('Newborn first weeks'));
  await camp('k1');
  ok('Newborn care: just the flow - its two templates are inside it, so they are not listed alone', await flowNames() === 'Newborn first weeks', await flowNames());
  await camp('k2');
  ok('Postnatal check-ups: Appointment reminder is a flow by itself', await flowNames() === 'Appointment reminder');
  await camp('k3');
  ok('Immunisation: nothing yet', await flowNames() === '' && /No flows yet/.test(await txt('#content-list')));
  ok('the list heading follows the campaign', await txt('#list-title') === 'Immunisation');
  await b.click('[data-action=open-add]');
  ok('the + box says "New flow name" in this tab', await b.ev(`document.getElementById('new-name').placeholder`) === 'New flow name');
  await b.key('Escape', 'Escape', 27);
  await camp('');
  await tab('templates');
  ok('the Templates tab is untouched: it still lists the three templates', await cnt('#content-list .content-item') === 3 && !await q('#content-list .flow-ind'));
  await tab('flows');

  // ================= a template that is a flow by itself =================
  await b.click(await tplItem('Appointment reminder'));
  ok('it opens with a flow card (indicator + "Sent <timing>") above the normal template editor', await q('.flow-card .flow-ind') && /This template is itself a flow/.test(await txt('.flow-card')) && await txt('.content-head h2') === 'Appointment reminder' && await q('.panel.edit'));
  ok('the timing starts with the dummy values: 7 days before expected_date_of_delivery', await val('.flow-card [data-t=days]') === '7' && await val('.flow-card [data-t=when]') === 'before' && await val('.flow-card [data-t=ref]') === 'expected_date_of_delivery');
  await setTiming('.flow-card .timing', 3);
  ok('editing the days updates the card, the list and the saved template', await val('.flow-card [data-t=days]') === '3' && await meta('Appointment reminder') === '3 days before expected_date_of_delivery' && await b.ev(`Store.list()[1].timing.days`) === 3, await meta('Appointment reminder'));
  await setTiming('.flow-card .timing', undefined, 'after');
  ok('before / after can be switched', await meta('Appointment reminder') === '3 days after expected_date_of_delivery');
  await setTiming('.flow-card .timing', undefined, undefined, 'Date Of Birth');
  ok('the reference date is any name: spaces and capitals are tidied to date_of_birth', await val('.flow-card [data-t=ref]') === 'date_of_birth' && await meta('Appointment reminder') === '3 days after date_of_birth', await val('.flow-card [data-t=ref]'));
  await setTiming('.flow-card .timing', 0);
  ok('0 days reads "on <reference date>"', await meta('Appointment reminder') === 'on date_of_birth');
  await setTiming('.flow-card .timing', -2);
  ok('a negative number is refused with a message and the field goes back', /whole number from 0 to 999/.test(await toast()) && await val('.flow-card [data-t=days]') === '0');
  await setTiming('.flow-card .timing', 1000);
  ok('over 999 is refused too', /whole number from 0 to 999/.test(await toast()) && await val('.flow-card [data-t=days]') === '0');
  await setTiming('.flow-card .timing', undefined, undefined, '1st date');
  ok('a reference that is not a name is refused', /reference date is a name/.test(await toast()) && await val('.flow-card [data-t=ref]') === 'date_of_birth', await toast());
  await b.click('[data-action=toggle-history-pane]'); await b.click('.hp-tab[data-tab=other]');
  const other = await historyText();
  ok('each timing change is in the template\'s Other history (by the user, before -> after)', /Changed timing/.test(other) && /Demo user/.test(other) && /expected_date_of_delivery/.test(other) && /date_of_birth/.test(other), other.slice(0, 300));
  await b.click('[data-action=toggle-history-pane]');

  // ================= the seed flow on the canvas =================
  await camp('k1');
  await b.click(await flowItem('Newborn first weeks'));
  ok('the open flow is a canvas with one box per node: input, template, logic, template, action', await cnt('.fnode') === 5 && await cnt('.fnode-template') === 2 && await cnt('.fnode-logic') === 1 && await cnt('.fnode-action') === 1 && await cnt('.fnode-input') === 1);
  ok('every connection is drawn: 4 curves, each with a pill to disconnect it', await cnt('#edge-paths .edge') === 4 && await cnt('#edge-paths .edge-line') === 4 && await cnt('.edge-pill') === 4 && await cnt('.edge-pill [data-action=edge-remove]') === 4);
  ok('a logic node\'s edges show their condition on the pill; the others show only the disconnect button', await b.ev(`[].map.call(document.querySelectorAll('.edge-pill .edge-label'), function(e){return e.textContent}).sort().join(' | ')`) === 'No reply | Replied');
  ok('an edge ends at the target node\'s input port (the curve ends where that port is)', await b.ev(`(function(){var cv=document.getElementById('canvas'), cr=cv.getBoundingClientRect(); var p=document.querySelector('#edge-paths .edge-line'); var d=p.getAttribute('d').match(/-?[\\d.]+/g).map(Number); var end=[d[d.length-2], d[d.length-1]]; return [].some.call(document.querySelectorAll('.port.in'), function(port){var r=port.getBoundingClientRect(); return Math.abs(r.left+r.width/2-cr.left-end[0])<2 && Math.abs(r.top+r.height/2-cr.top-end[1])<2})})()`));
  ok('every node has a small × centred on the corner of its border (top right), and no "Remove" text link', await b.ev(`[].every.call(document.querySelectorAll('.fnode'), function(n){var x=n.querySelector('.node-x'); if(!x||x.textContent!=='×') return false; var r=n.getBoundingClientRect(), c=x.getBoundingClientRect(); return Math.abs(c.left+c.width/2-r.right)<3 && Math.abs(c.top+c.height/2-r.top)<3 && c.width<=24})`) && !/Remove/.test(await txt('.canvas')) && await cnt('.node-x') === 5);
  ok('the × is invisible (and cannot be clicked) until its node is hovered', await b.ev(`[].every.call(document.querySelectorAll('.node-x'), function(x){var s=getComputedStyle(x); return s.opacity==='0' && s.pointerEvents==='none'})`));
  await b.hover(await node('Welcome message'));
  ok('hovering a node shows its × (only that node\'s)', await b.ev(`(function(){var n=document.querySelector('${await node('Welcome message')}'); var vis=[].filter.call(document.querySelectorAll('.node-x'), function(x){return getComputedStyle(x).opacity==='1'}); return vis.length===1 && n.contains(vis[0]) && getComputedStyle(vis[0]).pointerEvents==='auto'})()`));
  await b.hover('.canvas-wrap', 0.5, 0.95);
  ok('moving away hides it again', await b.ev(`[].every.call(document.querySelectorAll('.node-x'), function(x){return getComputedStyle(x).opacity==='0'})`));
  await b.ev(`document.querySelector('${await node('Welcome message')} .node-x').focus(); 0`);
  await b.sleep(250);
  ok('it is also reachable with the keyboard: focusing it shows it', await b.ev(`getComputedStyle(document.querySelector('${await node('Welcome message')} .node-x')).opacity`) === '1');
  await b.ev(`document.activeElement.blur(); 0`);
  ok('every node has an input port (edges end there) and the node types with one outgoing edge have an output port; a logic node has one per condition', await cnt('.fnode .port.in') === 5 && await q('.fnode-input .port.in') && await cnt('.fnode:not(.fnode-logic) .port.out') === 4 && await cnt('.fnode-logic .port.out') === 2);
  ok('by default nodes are read-only: names, definition and conditions are text, with no input, select, textarea or save/cancel button',
    !await q('.fnode input, .fnode select, .fnode textarea, .fnode .node-save, .fnode .node-cancel, .fnode .combo') && await q('.fnode-template [data-action=open-template]') && await cnt('.fnode.editing') === 0 &&
    /Alert health worker/.test(await txt('.fnode-action')) && /notify/.test(await txt('.fnode-action')) && /Replied/.test(await txt('.fnode-logic')) && /No reply/.test(await txt('.fnode-logic')));
  ok('the template, action and logic nodes say "Click to edit"; the input node, which has nothing to edit, does not', await b.ev(`[].every.call(document.querySelectorAll('.fnode-template, .fnode-action, .fnode-logic'), function(n){return n.title==='Click to edit'})`) && await b.ev(`document.querySelector('.fnode-input').title`) === '');
  await b.click('.fnode-input .fnode-head');
  ok('clicking the input node does not start an edit', await editing() === 0);
  await b.hover(await node('Daily health tip'));
  ok('hovering a node outlines it (an outline, not a different box)', await b.ev(`(function(){var s=getComputedStyle(document.querySelector('${await node('Daily health tip')}')); return s.outlineStyle==='solid' && parseFloat(s.outlineWidth)>=2})()`));
  await b.hover('.canvas-wrap', 0.5, 0.97);
  ok('the outline is gone when the pointer leaves', await b.ev(`getComputedStyle(document.querySelector('${await node('Daily health tip')}')).outlineStyle`) === 'none');
  ok('edge crosses are hidden until the edge is hovered', await b.ev(`[].every.call(document.querySelectorAll('.edge-pill .pill-x'), function(x){return getComputedStyle(x).opacity==='0' && getComputedStyle(x).pointerEvents==='none'})`) && await b.ev(`getComputedStyle(document.querySelector('.edge-pill:not(.labeled)')).opacity`) === '0');
  const hotLine = () => b.ev(`[].map.call(document.querySelectorAll('.edge.hot .edge-line'), function(l){var s=getComputedStyle(l); return s.strokeWidth+' '+s.stroke}).join('|')`);
  ok('no edge is highlighted at rest: all lines are the thin 2px stroke', await b.ev(`[].every.call(document.querySelectorAll('.edge-line'), function(l){return getComputedStyle(l).strokeWidth==='2px'})`) && await hotLine() === '');
  await b.hover('.edge-pill.labeled .edge-label');
  const thick = await hotLine();
  ok('hovering an edge\'s pill highlights that edge only: thicker (4px) and in the accent colour; its cross appears', /^4px /.test(thick) && thick.split('|').length === 1 && await b.ev(`getComputedStyle(document.querySelector('.edge-pill.hot .pill-x')).opacity`) === '1' && await cnt('.edge-pill.hot') === 1, thick);
  const [hx, hy] = await b.ev(`(function(){var l=document.querySelector('.edge.hot .edge-hit'); var m=l.getPointAtLength(l.getTotalLength()*0.25), r=document.getElementById('canvas').getBoundingClientRect(); var sc=document.getElementById('canvas-wrap'); return [r.left+m.x, r.top+m.y]})()`);
  await b.hover('.canvas-wrap', 0.5, 0.97);
  ok('moving away un-highlights it again', await hotLine() === '' && await cnt('.edge-pill.hot') === 0);
  await b.clickAt(hx, hy);   // (a click on the bare line does nothing)
  ok('hovering the line itself (not only the pill) also highlights it, via a wide invisible hit area', await b.ev(`(function(){var l=document.querySelector('.edge-hit'); return getComputedStyle(l).pointerEvents==='stroke' && parseFloat(getComputedStyle(l).strokeWidth)>=12})()`));
  ok('an input node is a plain labelled box: its header shows "Input" and its number', /Input\s*Input 1/.test(await b.ev(`document.querySelector('.fnode-input .fnode-head').textContent.replace(/\\s+/g,' ')`)) || /Input 1/.test(await txt('.fnode-input')));

  // ================= the timing belongs to the flow =================
  ok('a flow has one timing, in a card above the canvas ("Sent <n> days before/after <reference date>"), starting with the dummy 7 days before expected_date_of_delivery',
    await cnt('.flow-card .timing') === 1 && await val('.flow-card [data-t=days]') === '7' && await val('.flow-card [data-t=when]') === 'before' && await val('.flow-card [data-t=ref]') === 'expected_date_of_delivery' && /Sent/.test(await txt('.flow-card')));
  ok('the nodes carry no timing of their own', !await q('.fnode .timing, .fnode [data-t]'));
  await setTiming('.flow-card .timing', 3, 'after', 'Date of Birth');
  ok('editing it changes the flow: days, before/after, and a tidied reference date; the list entry follows', await b.ev(`${cur}.timing.days`) === 3 && await b.ev(`${cur}.timing.when`) === 'after' && await val('.flow-card [data-t=ref]') === 'date_of_birth' && /^3 days after date_of_birth · 2 templates/.test(await meta('Newborn first weeks')), await meta('Newborn first weeks'));
  await setTiming('.flow-card .timing', 0);
  ok('0 days reads "on <reference date>"', /^on date_of_birth · /.test(await meta('Newborn first weeks')), await meta('Newborn first weeks'));
  await setTiming('.flow-card .timing', 1000);
  ok('over 999 is refused with a message and the field goes back', /whole number from 0 to 999/.test(await toast()) && await val('.flow-card [data-t=days]') === '0');
  await b.fill('.flow-card [data-t=ref]', '!!'); await b.key('Enter', 'Enter', 13);
  ok('a reference that is not a name is refused', /reference date is a name/.test(await toast()) && await val('.flow-card [data-t=ref]') === 'date_of_birth', await toast());
  await b.click('[data-action=toggle-history-pane]');
  const fh = await historyText();
  ok('each timing change is in the flow\'s history (before → after, by the user)', /Changed timing/.test(fh) && /Demo user/.test(fh) && /expected_date_of_delivery/.test(fh) && /date_of_birth/.test(fh), fh.slice(0, 300));
  await b.click('[data-action=toggle-history-pane]');
  await b.reload(); await tab('flows'); await b.click(await flowItem('Newborn first weeks'));
  ok('the timing survives a reload', await val('.flow-card [data-t=days]') === '0' && await val('.flow-card [data-t=ref]') === 'date_of_birth');

  // ================= create a flow and add nodes =================
  await camp('k2');
  await b.click('[data-action=open-add]'); await b.type('Appointment reminder'); await b.key('Enter', 'Enter', 13);
  ok('a flow cannot be named like a template (they are listed together)', /A template is already called/.test(await txt('#new-error')) && await q('#new-name'));
  await b.fill('#new-name', 'Postnatal reminders');
  await b.click('.add-confirm');
  ok('the new flow is created in the selected campaign, selected, empty; the box closes', await txt('.content-head h2') === 'Postnatal reminders' && /Flow · No nodes yet · Campaign: Postnatal check-ups/.test(await txt('.content-head')) && !await q('#new-name'), await txt('.content-head'));
  ok('it is listed before the single-template flows', await flowNames() === 'Postnatal reminders | Appointment reminder', await flowNames());
  ok('an empty flow shows an empty canvas with a hint, and the toolbar: + Template…, + Flow…, + Logic, + Action, + Input', /Empty flow/.test(await txt('.canvas')) && await b.ev(`[].map.call(document.querySelectorAll('.flow-toolbar > button, .flow-toolbar .combo-btn'), function(x){return x.textContent.trim()}).join('|')`) === '+ Template…|+ Flow…|+ Logic|+ Action|+ Input');
  ok('+ Template… lists every template; + Flow… lists the other flows (not this one)', await comboOpts(addCombo) === 'Welcome message|Appointment reminder|Daily health tip' && await comboOpts(addFlowCombo) === 'Newborn first weeks', await comboOpts(addCombo));
  await b.click(addCombo + ' .combo-btn');
  ok('opening the picker focuses its search box', await b.ev(`document.activeElement.className`) === 'field combo-search');
  await b.type('REMIND');
  ok('typing filters the templates (any capitalisation)', await shownOpts(addCombo) === 'Appointment reminder', await shownOpts(addCombo));
  await b.fill(addCombo + ' .combo-search', 'zzz');
  ok('no match shows "No template matches"', await shownOpts(addCombo) === '' && await b.ev(`getComputedStyle(document.querySelector('${addCombo} .combo-empty')).display`) !== 'none');
  await b.fill(addCombo + ' .combo-search', 'appoint');
  await b.key('ArrowDown', 'ArrowDown', 40);
  await b.key('Enter', 'Enter', 13);
  ok('arrow keys + Enter pick the highlighted match (a template node is added; the picker closes)', await titles() === 'Appointment reminder' && await cnt('.combo.open') === 0, await titles());
  await removeNode('Appointment reminder');
  await b.click(addCombo + ' .combo-btn'); await b.key('Escape', 'Escape', 27);
  ok('Escape closes the picker without adding anything', await cnt('.combo.open') === 0 && await titles() === '');
  await b.click(addCombo + ' .combo-btn'); await b.clickAt(5, 5);
  ok('clicking elsewhere closes it too', await cnt('.combo.open') === 0);
  await addTemplateNode('Appointment reminder');
  ok('adding a template makes a template node: just its name, no timing', await titles() === 'Appointment reminder' && !await q('.fnode-template .timing') && await editing() === 0);
  ok('it is in a flow now, so no longer listed by itself', await flowNames() === 'Postnatal reminders', await flowNames());
  ok('the picker still lists a template that is already in the flow, but disabled with the reason', await comboOpts(addCombo) === 'Welcome message|Appointment reminder(off)|Daily health tip', await comboOpts(addCombo));
  await addTemplateNode('Welcome message');
  ok('a second template is a second node; its campaigns are unchanged (Welcome message stays only in Newborn care)', await titles() === 'Appointment reminder | Welcome message' && await b.ev(`Store.list()[0].campaignIds.join()`) === 'k1');
  ok('the list entry counts the flow\'s templates', await meta('Postnatal reminders') === '7 days before expected_date_of_delivery · 2 templates', await meta('Postnatal reminders'));
  await b.click((await node('Welcome message')) + ' [data-action=open-template]');
  ok('the Open link of a template node opens that template in the Templates tab', await b.ev(`document.querySelector('.list-tab.active').textContent.trim()`) === 'Templates' && await txt('.content-head h2') === 'Welcome message');
  await tab('flows');
  ok('back in Flows the flow is still open', await txt('.content-head h2') === 'Postnatal reminders' && await titles() === 'Appointment reminder | Welcome message');

  // ================= choosing a different template for a node =================
  await editNode('Appointment reminder');
  ok('clicking a template node opens it for editing: a picker with the current template, ✓ and ✕, no Open link and no corner ×', await editing() === 1 && await q('.fnode.editing .combo') && await q('.fnode.editing .node-save') && await q('.fnode.editing .node-cancel') && !await q('.fnode.editing [data-action=open-template]') && !await q('.fnode.editing .node-x') && /Appointment reminder/.test(await txt('.fnode.editing .combo-btn')));
  ok('the ✓ and ✕ are at the extreme right of the node header', await b.ev(`(function(){var h=document.querySelector('.fnode.editing .fnode-head').getBoundingClientRect(), c=document.querySelector('.node-cancel').getBoundingClientRect(), s=document.querySelector('.node-save').getBoundingClientRect(); return h.right-c.right<14 && c.left>s.left && s.left>h.left+h.width/2})()`));
  ok('the picker lists every template; those used by other nodes of this flow are disabled', await comboOpts('.fnode.editing .combo') === 'Welcome message(off)|Appointment reminder*|Daily health tip', await comboOpts('.fnode.editing .combo'));
  await choose('.fnode.editing .combo', await idOfTpl('Daily health tip'));
  ok('choosing another template only stages it: still editing, nothing saved yet', await editing() === 1 && /Daily health tip/.test(await txt('.fnode.editing .combo-btn')) && await titles() === 'Appointment reminder | Welcome message');
  await cancelEdit();
  ok('✕ cancels: back to read-only with the old template', await editing() === 0 && await titles() === 'Appointment reminder | Welcome message' && !await q('.fnode input, .fnode .combo'));
  await editNode('Appointment reminder');
  await choose('.fnode.editing .combo', await idOfTpl('Daily health tip'));
  await saveEdit();
  ok('✓ saves: the node re-points (same node, new name), edit mode ends, and a toast says so', await editing() === 0 && await titles() === 'Daily health tip | Welcome message' && /Saved/.test(await toast()), await titles());
  ok('campaign membership is untouched: the new template did not join this campaign; the old one, in no flow of it any more, is a flow by itself there again', await b.ev(`Store.list()[2].campaignIds.indexOf('k2')===-1`) && /Appointment reminder/.test(await flowNames()) && await hasIndicator('Appointment reminder'), await flowNames());
  ok('the node\'s Open link follows the new template', await b.ev(`document.querySelector('${await node('Daily health tip')} [data-action=open-template]').getAttribute('data-id')`) === await idOfTpl('Daily health tip'));
  await editNode('Daily health tip');
  await b.click('.fnode.editing .combo-btn');
  await b.click('.fnode.editing .combo-opt[data-id="' + await idOfTpl('Welcome message') + '"]');
  ok('a template already used by another node cannot be picked (the disabled option does nothing)', await editing() === 1 && /Daily health tip/.test(await txt('.fnode.editing .combo-btn')));
  await b.key('Escape', 'Escape', 27);
  await b.key('Escape', 'Escape', 27);
  ok('Escape cancels the edit (first press closes a picker if one is open)', await editing() === 0 && await titles() === 'Daily health tip | Welcome message');
  await editNode('Daily health tip');
  await choose('.fnode.editing .combo', await idOfTpl('Appointment reminder'));
  await saveEdit();
  ok('and it can be switched back', await titles() === 'Appointment reminder | Welcome message', await titles());

  // ================= the edit lock: nothing else works until ✓ or ✕ =================
  await editNode('Welcome message');
  await b.click('.fnode.editing .combo-btn'); await b.key('Escape', 'Escape', 27);
  ok('Escape on an open picker closes only the picker; the node stays in edit mode', await editing() === 1 && await cnt('.combo.open') === 0);
  const startPos = await pos('Appointment reminder');
  await b.click((await node('Appointment reminder')) + ' .fnode-head');
  ok('while a node is edited, clicking another node does nothing but warn', await editing() === 1 && /Save \(✓\) or cancel \(✕\)/.test(await toast()) && await b.ev(`document.querySelector('.fnode.editing').dataset.node`) === await nid('Welcome message'), await toast());
  ok('the node being edited shakes to show where to look', await b.ev(`document.querySelector('.fnode.editing').classList.contains('attention')`));
  await b.pointerDrag((await node('Appointment reminder')) + ' .fnode-head', [60, 60], { fx: 0.02 });
  ok('other nodes cannot be dragged either', await pos('Appointment reminder') === startPos);
  await b.click('[data-action=add-node][data-type=logic]');
  ok('toolbar buttons are blocked: no node was added', await titles() === 'Appointment reminder | Welcome message');
  await b.click('.list-tab:not(.active)');
  ok('so is the rest of the page (the sidebar tabs do not switch)', await b.ev(`document.querySelector('.list-tab.active').textContent.trim()`) === 'Flows');
  await b.click('#content-list .flow-item');
  ok('...or the list: the open flow does not change', await txt('.content-head h2') === 'Postnatal reminders' && await editing() === 1);
  await b.click('.content-head');
  ok('even a click on the page header is swallowed (the node stays in edit mode)', await editing() === 1);
  await b.ev(`document.querySelector('.canvas-wrap').focus(); document.querySelector('[data-action=add-node]').focus(); 0`);
  ok('focus cannot leave the node: trying to focus something outside brings it back inside', await b.ev(`!!document.activeElement.closest('.fnode.editing')`));
  await b.ev(`document.querySelector('.fnode.editing .node-cancel').focus(); 0`);
  await tab2();
  ok('Tab wraps inside the node: from the last control it goes back to the first', await b.ev(`!!document.activeElement.closest('.fnode.editing')`) && await b.ev(`document.activeElement.hasAttribute('data-first')`));
  await b.click((await node('Welcome message')) + ' .node-cancel');
  ok('✕ ends the edit and everything works again', await editing() === 0);
  await b.click('[data-action=add-node][data-type=logic]');
  ok('(a node can be added once the edit is over)', await titles() === 'Appointment reminder | Welcome message | Logic 1');
  await removeNode('Logic 1');

  // ================= moving nodes =================
  const before = await pos('Welcome message');
  await b.pointerDrag((await node('Welcome message')) + ' .fnode-head', [120, 90], { fx: 0.02 });
  const [bx, by] = before.split(',').map(Number);
  ok('dragging a node by its header moves it, and the position is saved', await pos('Welcome message') === (bx + 120) + ',' + (by + 90) && await b.ev(`(function(){var n=document.querySelector('${await node('Welcome message')}'); return n.style.left+','+n.style.top})()`) === (bx + 120) + 'px,' + (by + 90) + 'px', await pos('Welcome message'));
  await b.pointerDrag((await node('Welcome message')) + ' .fnode-head', [-5000, -5000], { fx: 0.02 });
  ok('a node cannot be dragged off the top-left of the canvas', await pos('Welcome message') === '0,0');
  await b.pointerDrag((await node('Welcome message')) + ' .fnode-head', [420, 220], { fx: 0.02 });
  ok('(and can be dragged on from there)', await pos('Welcome message') === '420,220', await pos('Welcome message'));
  await b.pointerDrag((await node('Appointment reminder')) + ' .fnode-head', [2, 0], { fx: 0.02 });
  ok('moving a node is not a history event (it is only layout)', !/Moved/.test(await b.ev(`Store.historyForFlow(document.getElementById('canvas').dataset.flow).map(function(e){return e.action}).join()`)));
  await b.hover(await node('Welcome message'));
  await b.pointerDrag((await node('Welcome message')) + ' [data-action=node-remove]', [60, 60], { scroll: false });
  ok('pressing the × and letting go elsewhere neither moves the node nor removes it', await pos('Welcome message') === '420,220' && (await titles()) === 'Appointment reminder | Welcome message', await pos('Welcome message') + ' / ' + await titles());
  await b.reload(); await tab('flows'); await b.click(await flowItem('Postnatal reminders'));
  ok('positions survive a reload', await pos('Welcome message') === '420,220');

  // ================= logic node: a dynamic set of named outgoing edges =================
  await addNode('logic');
  ok('+ Logic adds a logic node, titled Logic 1, with two outgoing edges ready to name; read-only, one port per edge', await titles() === 'Appointment reminder | Welcome message | Logic 1' && await outLabels('Logic 1') === 'Condition 1 | Condition 2' && await cnt((await node('Logic 1')) + ' .out-row .port.out') === 2 && await cnt((await node('Logic 1')) + ' input') === 0);
  await editNode('Logic 1');
  ok('clicking it opens its edges as text boxes with a remove button each, and + Add outgoing edge', await editing() === 1 && await cnt('.fnode.editing [data-edit=out]') === 2 && await q('.fnode.editing [data-action=edit-out-add]') && await cnt('.fnode.editing [data-action=edit-out-remove]') === 2 && await b.ev(`document.activeElement.getAttribute('data-i')`) === '0');
  await b.click('.fnode.editing [data-action=edit-out-add]');
  ok('+ Add outgoing edge adds a third, named Condition 3, only in the draft (the store still has two)', await cnt('.fnode.editing [data-edit=out]') === 3 && await val(outField(2)) === 'Condition 3' && await outLabels('Logic 1') === 'Condition 1 | Condition 2');
  await b.fill(outField(0), 'Replied yes');
  await b.fill(outField(1), 'Asked for a call');
  ok('typing changes the draft and keeps focus in the field (no re-render per keystroke)', await val(outField(1)) === 'Asked for a call' && await b.ev(`document.activeElement.getAttribute('data-i')`) === '1' && await outLabels('Logic 1') === 'Condition 1 | Condition 2');
  await b.key('Enter', 'Enter', 13);
  ok('Enter saves the whole node: all edges are named by their condition', await editing() === 0 && await outLabels('Logic 1') === 'Replied yes | Asked for a call | Condition 3', await outLabels('Logic 1'));
  await editNode('Logic 1');
  await b.fill(outField(2), 'replied YES'); await saveEdit();
  ok('two edges of a node cannot share a name (any capitalisation): refused with a message, the node stays in edit mode with the typed value', /both called/.test(await toast()) && await editing() === 1 && await val(outField(2)) === 'replied YES' && await outLabels('Logic 1') === 'Replied yes | Asked for a call | Condition 3');
  await b.fill(outField(2), ''); await saveEdit();
  ok('an empty condition name is refused too', /Name the condition/.test(await toast()) && await editing() === 1);
  await b.click('.fnode.editing [data-action=edit-out-remove][data-i="2"]');
  await saveEdit();
  ok('an outgoing edge can be removed (saved with the ✓)', await outLabels('Logic 1') === 'Replied yes | Asked for a call' && await editing() === 0);
  await editNode('Logic 1');
  await b.click('.fnode.editing [data-action=edit-out-remove][data-i="1"]');
  ok('down to one edge the remove button is disabled and says why (a logic node needs at least one)', await b.ev(`(function(){var x=document.querySelector('.fnode.editing [data-action=edit-out-remove]'); return x.disabled && /at least one outgoing edge/.test(x.title)})()`) && await cnt('.fnode.editing [data-edit=out]') === 1);
  await cancelEdit();
  ok('✕ discards the removal: both edges are still there', await outLabels('Logic 1') === 'Replied yes | Asked for a call');
  await editNode('Logic 1');
  await b.click('.fnode.editing [data-action=edit-out-remove][data-i="1"]');
  await b.click('.fnode.editing [data-action=edit-out-add]');
  await b.fill(outField(1), 'No reply'); await saveEdit();
  ok('so the node ends with the edges "Replied yes" and "No reply"', await outLabels('Logic 1') === 'Replied yes | No reply');
  await editNode('Logic 1');
  await b.fill(outField(0), 'Maybe'); await b.key('Escape', 'Escape', 27);
  ok('Escape cancels a logic edit', await editing() === 0 && await outLabels('Logic 1') === 'Replied yes | No reply');

  // ================= connecting nodes with the pointer =================
  ok('nothing is connected yet', await edges() === '' && await cnt('#edge-paths .edge') === 0 && await cnt('.edge-pill') === 0);
  await b.pointerDrag(await outPort('Appointment reminder'), await node('Welcome message'));
  ok('dragging from a template node\'s port onto another node connects them (one curve, one pill)', await edges() === 'Appointment reminder -> Welcome message' && await cnt('#edge-paths .edge') === 1 && await cnt('.edge-pill') === 1, await edges());
  await b.pointerDrag(await outPort('Welcome message'), await node('Logic 1'));
  await b.pointerDrag(await outPort('Logic 1', 'Replied yes'), await node('Appointment reminder'));
  ok('a connection that would make a loop is refused with a message and not drawn', /That would make a loop/.test(await toast()) && await edges() === 'Appointment reminder -> Welcome message | Welcome message -> Logic 1', await toast() + ' // ' + await edges());
  await addNode('action');
  await addNode('input');
  ok('+ Action and + Input add an action node and an input node', await titles() === 'Appointment reminder | Welcome message | Logic 1 | Action 1 | Input 1');
  await b.pointerDrag(await outPort('Logic 1', 'Replied yes'), await node('Action 1'));
  await b.pointerDrag(await outPort('Logic 1', 'No reply'), await node('Action 1'));
  ok('each of a logic node\'s edges connects on its own; two edges may lead to the same node', await edges() === 'Appointment reminder -> Welcome message | Welcome message -> Logic 1 | Logic 1 [Replied yes] -> Action 1 | Logic 1 [No reply] -> Action 1', await edges());
  ok('a logic edge\'s pill carries its condition', await b.ev(`[].map.call(document.querySelectorAll('.edge-pill .edge-label'), function(e){return e.textContent}).sort().join(' | ')`) === 'No reply | Replied yes');
  ok('the pill\'s cross is clickable only once its edge is hovered', await (async () => { await b.hover('.edge-pill.labeled .edge-label'); return await b.ev(`getComputedStyle(document.querySelector('.edge-pill.hot .pill-x')).pointerEvents`) === 'auto'; })());
  await b.pointerDrag(await outPort('Input 1'), await node('Appointment reminder'));
  ok('an input node connects out like the others', /Input 1 -> Appointment reminder/.test(await edges()));
  await addNode('input');
  await b.pointerDrag(await outPort('Action 1'), await node('Input 2'));
  ok('and an edge can end at an input node too (it has an input port)', /Action 1 -> Input 2/.test(await edges()), await edges());
  await removeNode('Input 2');
  await b.pointerDrag(await outPort('Appointment reminder'), await node('Input 1'));
  ok('a loop through the input node is still refused with a message', /That would make a loop/.test(await toast()) && /Appointment reminder -> Welcome message/.test(await edges()) && !/Appointment reminder -> Input 1/.test(await edges()), await toast());
  await b.pointerDrag(await outPort('Welcome message'), '.canvas', { tx: 0.9, ty: 0.9 });
  ok('letting go on empty canvas connects nothing (and leaves no half-drawn line behind)', await cnt('#temp-edge') === 0 && /Welcome message -> Logic 1/.test(await edges()));
  await b.pointerDrag(await outPort('Welcome message'), await node('Action 1'));
  ok('connecting a node that is already connected replaces its edge (a template node has one)', /Welcome message -> Action 1/.test(await edges()) && !/Welcome message -> Logic 1/.test(await edges()));
  ok('during a drag a dashed line follows the pointer and the node under it is highlighted', await (async () => {
    let seen = null;
    await b.pointerDrag(await outPort('Welcome message'), await node('Logic 1'), { hold: async () => { seen = await b.ev(`!!document.getElementById('temp-edge') && !!document.querySelector('.fnode.connect-target')`); } });
    return seen;
  })());
  await b.hover('.edge-pill[data-edge="' + await nid('Logic 1') + ':' + await outId('Logic 1', 'No reply') + '"] .edge-label');
  await b.click('.edge-pill.hot [data-action=edge-remove]');
  ok('the × on a pill disconnects that edge; a logic node keeps the edge (its name stays, now open)', !/Logic 1 \[No reply\]/.test(await edges()) && /Replied yes/.test(await edges()) && await outLabels('Logic 1') === 'Replied yes | No reply');
  await editNode('Logic 1');
  await b.click('.fnode.editing [data-action=edit-out-remove][data-i="0"]'); await saveEdit();
  ok('removing an edge also removes its connection', !/Replied yes/.test(await edges()) && await outLabels('Logic 1') === 'No reply');
  await removeNode('Action 1');
  ok('removing a node leaves the edges that pointed at it open', !/Action 1/.test(await titles()) && !/Action 1/.test(await edges()) && await q((await node('Logic 1'))));

  // ================= action and input nodes =================
  await addNode('action');
  const act = (await titles()).split(' | ').filter(t => /^Action/.test(t))[0];
  ok('+ Action adds an action node, read-only: just its name; with no definition, no definition area is shown', await q((await node(act)) + '.fnode-action') && !await q((await node(act)) + ' input, ' + (await node(act)) + ' textarea') && !await q((await node(act)) + ' .view-def') && !/No definition/.test(await txt(await node(act))));
  await editNode(act);
  ok('clicking it opens a name field (focused) and a definition field', await val('.fnode.editing [data-edit=name]') === act && await q('.fnode.editing textarea[data-edit=definition]') && await b.ev(`document.activeElement.getAttribute('data-edit')`) === 'name');
  await b.fill('.fnode.editing [data-edit=name]', 'Alert health worker');
  await b.fill('.fnode.editing [data-edit=definition]', 'Notify the community health worker to call the family.');
  await b.key('Enter', 'Enter', 13);
  ok('Enter in the definition adds a line instead of saving (Ctrl+Enter saves)', await editing() === 1);
  await saveEdit();
  ok('once defined, the definition shows under the name', await q((await node('Alert health worker')) + ' .view-def'));
  ok('✓ saves both name and definition', await editing() === 0 && await titles() === (await titles()).replace(act, 'Alert health worker') && /^Notify the community health worker to call the family\./.test(await b.ev(`${cur}.nodes.filter(function(n){return n.name==='Alert health worker'})[0].definition`)));
  await addNode('action');
  const act2 = (await titles()).split(' | ').filter(t => /^Action/.test(t))[0];
  await editNode(act2);
  await b.fill('.fnode.editing [data-edit=name]', 'alert HEALTH worker'); await b.key('Enter', 'Enter', 13);
  ok('action names are unique within the flow (also against logic titles and template names): refused with a message, the node stays in edit mode', /already called/.test(await toast()) && await editing() === 1 && await val('.fnode.editing [data-edit=name]') === 'alert HEALTH worker');
  await b.key('Escape', 'Escape', 27);
  ok('Escape discards the refused name', await editing() === 0 && (await titles()).indexOf(act2) !== -1);
  await removeNode(act2);
  await addNode('input');
  ok('+ Input adds a plain node (Input 2): no input boxes, an input port and an output port', await titles() === (await titles()).split(' | ').filter(t => !/^Input 2$/.test(t)).concat(['Input 2']).join(' | ') && !await q((await node('Input 2')) + ' input, ' + (await node('Input 2')) + ' select, ' + (await node('Input 2')) + ' textarea') && await cnt((await node('Input 2')) + ' .port.in') === 1 && await cnt((await node('Input 2')) + ' .port.out') === 1);

  // ================= flow nodes: calling another flow =================
  await addFlowNode('Newborn first weeks');
  ok('+ Flow… adds a node that calls that flow, titled with its name, with an Open link', (await titles()).split(' | ').indexOf('Newborn first weeks') !== -1 && await q('.fnode-flow [data-action=open-flow]') && /Calls the flow/.test(await txt('.fnode-flow')));
  ok('the flow is no longer offered a second time (disabled, with the reason)', await comboOpts(addFlowCombo) === 'Newborn first weeks(off)');
  ok('the list entry counts the flow call', /1 flow/.test(await meta('Postnatal reminders')), await meta('Postnatal reminders'));
  await b.click('.fnode-flow [data-action=open-flow]');
  ok('the Open link opens the called flow', await txt('.content-head h2') === 'Newborn first weeks');
  ok('inside the called flow, + Flow… refuses to call back (it would loop): disabled with the reason', await comboOpts(addFlowCombo) === 'Postnatal reminders(off)' && await b.ev(`document.querySelector('${addFlowCombo} .combo-opt .muted').textContent`) === 'calls this flow', await comboOpts(addFlowCombo));
  await b.click(await flowItem('Postnatal reminders'));
  await editNode('Newborn first weeks');
  ok('editing a flow node shows a picker of flows; the current one is marked', await comboOpts('.fnode.editing .combo') === 'Newborn first weeks*', await comboOpts('.fnode.editing .combo'));
  await cancelEdit();
  await removeNode('Newborn first weeks');

  // ================= history of a flow, scroll, persistence =================
  await b.click('[data-action=toggle-history-pane]');
  const h = await historyText();
  ok('the flow\'s history records the graph edits: nodes added/removed, edges connected/disconnected, conditions added/renamed/removed, actions and inputs',
    ['Added a node', 'Removed a node', 'Connected', 'Disconnected', 'Added an outgoing edge', 'Renamed an edge', 'Removed an outgoing edge', 'Renamed an action', 'Changed an action', 'Changed a node\'s template'].every(x => new RegExp(x).test(h)), h.slice(0, 200));
  ok('an edge event reads like the edge: "Logic 1 [Replied yes] → Action 1"', /Logic 1 \[Replied yes\] → Action 1/.test(h));
  await b.click('[data-action=toggle-history-pane]');
  const snap = await b.ev(`(function(){var w=document.getElementById('canvas-wrap'); w.scrollLeft=120; w.scrollTop=40; return [w.scrollLeft,w.scrollTop].join()})()`);
  await b.click('[data-action=toggle-history-pane]');   // any re-render (the test driver scrolls what it clicks into view, so not something on the canvas)
  ok('re-rendering keeps the canvas scroll position', await b.ev(`(function(){var w=document.getElementById('canvas-wrap'); return [w.scrollLeft,w.scrollTop].join()})()`) === snap, snap + ' vs ' + await b.ev(`(function(){var w=document.getElementById('canvas-wrap'); return [w.scrollLeft,w.scrollTop].join()})()`));
  const graph = await b.ev(`JSON.stringify(${cur}.nodes.map(function(n){return Store.nodeTitle(n)+':'+n.type+'@'+n.x+','+n.y}))`);
  await b.reload(); await tab('flows'); await b.click(await flowItem('Postnatal reminders'));
  ok('the whole graph - nodes, positions, edges - survives a reload and is drawn again', await b.ev(`JSON.stringify(${cur}.nodes.map(function(n){return Store.nodeTitle(n)+':'+n.type+'@'+n.x+','+n.y}))`) === graph && await cnt('.fnode') === JSON.parse(graph).length && await cnt('#edge-paths .edge') === (await edges() ? (await edges()).split(' | ').length : 0));

  // ================= reorder the flows in the list =================
  await b.fresh();
  await tab('flows');
  await b.click('[data-action=open-add]'); await b.type('Flow A'); await b.key('Enter', 'Enter', 13);
  await b.click('[data-action=open-add]'); await b.type('Flow B'); await b.key('Enter', 'Enter', 13);
  ok('the flows you create are added in order, before the single-template flows', await flowNames() === 'Newborn first weeks | Flow A | Flow B | Appointment reminder', await flowNames());
  await b.drag(grip(await flowItem('Flow B')), await flowItem('Newborn first weeks'), { fy: 0.15 });
  ok('dragging Flow B onto the top half of the first flow puts it first', await flowNames() === 'Flow B | Newborn first weeks | Flow A | Appointment reminder' && await flowOrder() === 'Flow B | Newborn first weeks | Flow A', await flowNames());
  await b.drag(grip(await flowItem('Flow B')), await flowItem('Flow A'), { fy: 0.85 });
  ok('onto the bottom half puts it after', await flowOrder() === 'Newborn first weeks | Flow A | Flow B', await flowOrder());
  await b.drag(grip(await flowItem('Flow A')), await tplItem('Appointment reminder'));
  ok('a template that is a flow by itself is not a place to drop: nothing moves', await flowOrder() === 'Newborn first weeks | Flow A | Flow B');
  await b.drag(grip(await tplItem('Appointment reminder')), await flowItem('Flow A'), { fy: 0.2 });
  ok('and a template that is a flow by itself cannot be reordered (it always follows the flows you made)', await flowNames() === 'Newborn first weeks | Flow A | Flow B | Appointment reminder' && !await q('.modal'));
  await b.click('[data-action=toggle-history-pane]'); await b.click(await flowItem('Flow B'));
  ok('the reorder is in that flow\'s history', /Moved in the flow list/.test(await b.ev(`document.getElementById('history-pane').innerText`)));
  await b.click('[data-action=toggle-history-pane]');
  await b.reload(); await tab('flows');
  ok('the order survives a reload', await flowNames() === 'Newborn first weeks | Flow A | Flow B | Appointment reminder', await flowNames());

  // ================= refer / duplicate / move a flow to a campaign =================
  await b.fresh();
  await tab('flows');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  ok('dropping a flow on a campaign opens a dialog with four options: Refer same flow, Duplicate flow, Move flow, Cancel', await q('.modal[role=dialog]') && /Newborn first weeks.*→.*Immunisation/.test(await txt('#dlg-title')) && await opts() === 'Refer same flow | Duplicate flow | Move flow | Cancel', await opts());
  ok('it lists where the flow already is (read-only), above the options', await existing() === 'Newborn care' && await b.ev(`document.querySelector('.exists-list').getBoundingClientRect().bottom <= document.querySelector('.dlg-options').getBoundingClientRect().top`));
  ok('each option says what it does, including what happens to the templates inside',
    /The same flow also appears in Immunisation \(and stays in Newborn care\), so editing it changes it everywhere\. 2 templates will be added to Immunisation too/.test(await optDesc('refer')) &&
    /independent copy called “Newborn first weeks \(copy\)” in Immunisation; editing either one leaves the other alone\. The templates are shared, not duplicated\. 2 templates will be added to Immunisation too/.test(await optDesc('duplicate')) &&
    /Remove it from Newborn care and add it to Immunisation\. 2 templates move with it/.test(await optDesc('move')), await optDesc('refer') + ' // ' + await optDesc('duplicate') + ' // ' + await optDesc('move'));
  await b.click('[data-action=dialog-cancel]');
  ok('Cancel changes nothing', !await q('.modal') && await b.ev(`Store.listFlows()[0].campaignIds.join()`) === 'k1');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  await b.click('[data-action=dialog-refer]');
  ok('Refer same flow: the one flow is in both campaigns, its templates were added to Immunisation too', await b.ev(`Store.listFlows()[0].campaignIds.join()`) === 'k1,k3' && await b.ev(`Store.list().slice(0,3).filter(function(c){return c.campaignIds.indexOf('k3')!==-1}).map(function(c){return c.name}).join(' | ')`) === 'Welcome message | Daily health tip');
  ok('it is still one flow (no second flow appeared), and the toast says so', await b.ev(`Store.listFlows().length`) === 1 && /Flow “Newborn first weeks” is now also in Immunisation/.test(await toast()), await toast());
  await camp('k3');
  ok('Immunisation now lists the flow (its templates are inside it, so none alone)', await flowNames() === 'Newborn first weeks', await flowNames());
  await camp('');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k2]');
  ok('a flow in two campaigns cannot be moved: "Can\'t move" with the reason; Refer and Duplicate still work', await opts() === "Refer same flow | Duplicate flow | Can't move(off) | Cancel" && /2 campaigns \(Newborn care, Immunisation\)/.test(await optDesc('move')), await opts());
  await b.key('Escape', 'Escape', 27);
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  ok('dropping it on a campaign that already has it disables Refer (with the reason) but Duplicate stays available', /^Refer same flow\(off\) \| Duplicate flow \| Can't move\(off\)/.test(await opts()) && /Already in Immunisation/.test(await optDesc('refer')), await opts());
  await b.key('Escape', 'Escape', 27);

  // duplicate: an independent new flow with its own copy of the graph
  await b.fresh();
  await tab('flows');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  await b.click('[data-action=dialog-duplicate]');
  ok('Duplicate flow: a second flow appears, named "(copy)", right after the original', await flowOrder() === 'Newborn first weeks | Newborn first weeks (copy)' && /Duplicated flow “Newborn first weeks” to Immunisation as “Newborn first weeks \(copy\)”/.test(await toast()), await flowOrder() + ' / ' + await toast());
  ok('the copy is only in the target campaign; the original stays where it was', await b.ev(`Store.listFlows().map(function(f){return f.campaignIds.join()}).join(' | ')`) === 'k1 | k3');
  await camp('k3');
  ok('Immunisation lists just the copy', await flowNames() === 'Newborn first weeks (copy)', await flowNames());
  await b.click('#content-list .flow-item');
  ok('the copy has the same graph on its canvas: five nodes, four edges, the same layout', await cnt('.fnode') === 5 && await cnt('#edge-paths .edge') === 4 && await b.ev(`(function(){var a=Store.listFlows(); return JSON.stringify(a[0].nodes.map(function(n){return [n.x,n.y]}))===JSON.stringify(a[1].nodes.map(function(n){return [n.x,n.y]}))})()`));
  await editNode('Logic 1');
  await b.fill(outField(0), 'Answered'); await saveEdit();
  await b.pointerDrag((await node('Welcome message')) + ' .fnode-head', [0, 120], { fx: 0.02 });
  await removeNode('Daily health tip');
  ok('editing the copy (a condition name, a node position, removing a node) leaves the original alone', await b.ev(`(function(){var a=Store.listFlows()[0], c=Store.listFlows()[1]; var w=function(f){return f.nodes.filter(function(n){return n.type==='template'&&Store.nodeTitle(n)==='Welcome message'})[0]}; var l=function(f){return f.nodes.filter(function(n){return n.type==='logic'})[0].outs[0].label}; return l(a)==='Replied' && l(c)==='Answered' && a.nodes.length===5 && c.nodes.length===4 && w(a).y!==w(c).y})()`));
  await b.click('[data-action=toggle-history-pane]');
  ok('the copy\'s history starts with "Created flow ... Duplicate of Newborn first weeks"', /Created flow/.test(await txt('#history-pane')) && /Duplicate of Newborn first weeks/.test(await txt('#history-pane')), await txt('#history-pane'));
  await b.click('[data-action=toggle-history-pane]');
  await camp('');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k1]');
  ok('dropping a flow on its own campaign still offers Duplicate (Refer and Move are disabled: already there)', /^Refer same flow\(off\) \| Duplicate flow \| Move flow\(off\) \| Cancel$/.test(await opts()), await opts());
  await b.click('[data-action=dialog-duplicate]');
  ok('and names the next copy "(copy 2)"', await flowOrder() === 'Newborn first weeks | Newborn first weeks (copy 2) | Newborn first weeks (copy)', await flowOrder());

  // move: templates only this flow uses go with it; one that another flow in the source uses stays
  await b.fresh();
  await tab('flows');
  await camp('k1');
  await b.click('[data-action=open-add]'); await b.type('Welcome only'); await b.key('Enter', 'Enter', 13);
  await addTemplateNode('Welcome message');
  await b.drag(grip(await flowItem('Newborn first weeks')), '.camp-item[data-id=k3]');
  ok('the dialog explains the split: one template moves with the flow, one stays because another flow uses it', /1 template moves with it; 1 template stays in Newborn care because another flow there uses it \(also added to Immunisation\)/.test(await optDesc('move')), await optDesc('move'));
  await b.click('[data-action=dialog-move]');
  ok('Move: the flow is only in Immunisation; Daily health tip moved with it; Welcome message stays in Newborn care and is also in Immunisation',
    await b.ev(`Store.getFlow(Store.listFlows()[0].id).campaignIds.join()`) === 'k3' && await b.ev(`Store.list()[2].campaignIds.join()`) === 'k3' && await b.ev(`Store.list()[0].campaignIds.join()`) === 'k1,k3');
  await camp('k1');
  ok('Newborn care now has just the flow that still uses Welcome message', await flowNames() === 'Welcome only', await flowNames());
  ok('the toast says moved', /Moved flow “Newborn first weeks” to Immunisation/.test(await toast()), await toast());

  // a template that is a flow by itself behaves like dragging a normal template
  await b.fresh();
  await tab('flows');
  await b.drag(grip(await tplItem('Appointment reminder')), '.camp-item[data-id=k1]');
  ok('dragging a single-template flow opens the TEMPLATE dialog (same wording as dragging a template)', /Appointment reminder.*→.*Newborn care/.test(await txt('#dlg-title')) && await opts() === 'Copy | Move | Cancel' && /Keep it in Postnatal check-ups and add it to Newborn care/.test(await optDesc('copy')) && /Remove it from Postnatal check-ups and add it to Newborn care/.test(await optDesc('move')) && await existing() === 'Postnatal check-ups', await optDesc('copy'));
  ok('it has no "templates come along" note (it is a template)', !/template(s)? (will be|move|stay)/.test(await optDesc('copy') + await optDesc('move')));
  await b.click('[data-action=dialog-copy]');
  ok('Copy puts the template in both campaigns', await b.ev(`Store.list()[1].campaignIds.join()`) === 'k2,k1' && /Copied “Appointment reminder” to Newborn care/.test(await toast()), await toast());
  await camp('k1');
  ok('Newborn care lists it as a flow by itself (no flow of Newborn care includes it)', /Appointment reminder/.test(await flowNames()) && await hasIndicator('Appointment reminder'), await flowNames());
  await b.drag(grip(await tplItem('Appointment reminder')), '.camp-item[data-id=k3]');
  ok('with two owners the single-template flow shows "Can\'t move", like a template', await opts() === "Copy | Can't move(off) | Cancel");
  await b.key('Escape', 'Escape', 27);

  // ================= search =================
  await b.fresh();
  await tab('flows');
  await b.click('[data-action=open-search]'); await b.type('appoint');
  ok('search filters the flows list (templates that are flows too)', await flowNames() === 'Appointment reminder', await flowNames());
  await b.key('Escape', 'Escape', 27);
  ok('Escape clears it', await cnt('#content-list .flow-item') === 2);
  ok('no horizontal page overflow', await b.ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
});
