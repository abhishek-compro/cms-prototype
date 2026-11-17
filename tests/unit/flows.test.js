// Flows (prototype/store.js): a graph of template / logic / action / input nodes joined by edges, timing,
// templates that are flows by themselves, reordering, refer / duplicate / move to another campaign. No browser needed.
'use strict';
const { loadStore, test, assert } = require('../lib/harness');

const fresh = () => loadStore().S;
const tpl = (S, n) => S.list().find(c => c.name === n);
const flow = (S, n) => S.listFlows().find(f => f.name === n);
const listing = (S, k) => S.flowItems(k).map(i => (i.kind === 'flow' ? 'F:' + i.flow.name : 'T:' + i.content.name));
const node = (S, f, title) => f.nodes.find(n => S.nodeTitle(n) === title);
const templates = (S, f) => S.templateNodes(f).map(n => S.nodeTitle(n));
// the edges of a flow as "From [label] -> To" strings, in node order
function edges(S, f) {
  const out = [];
  f.nodes.forEach(n => {
    const name = S.nodeTitle(n);
    if (n.type === 'logic') n.outs.forEach(o => out.push(name + ' [' + o.label + '] -> ' + (o.to ? S.nodeTitle(S.getNode(f, o.to)) : '(open)')));
    else if (n.next) out.push(name + ' -> ' + S.nodeTitle(S.getNode(f, n.next)));
  });
  return out;
}
const last = (S, f) => S.historyForFlow(f.id)[0];

// ---------------------------------------------------------------- the seed graph and what the Flows tab lists
test('seed: one flow in Newborn care made of an input, two templates, a logic node and an action', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  assert.deepEqual(f.campaignIds, ['k1']);
  assert.deepEqual(f.nodes.map(n => n.type).sort(), ['action', 'input', 'logic', 'template', 'template']);
  assert.deepEqual(templates(S, f).sort(), ['Daily health tip', 'Welcome message']);
  assert.deepEqual(edges(S, f).sort(), [
    'Input 1 -> Welcome message',
    'Logic 1 [No reply] -> Alert health worker',
    'Logic 1 [Replied] -> Daily health tip',
    'Welcome message -> Logic 1'
  ]);
  const input = node(S, f, 'Input 1');
  assert.deepEqual([input.type, input.next !== null], ['input', true]);
  assert.deepEqual(Object.keys(input).sort(), ['id', 'next', 'title', 'type', 'x', 'y'], 'an input node has nothing to fill in: no name, type or description');
  assert.match(node(S, f, 'Alert health worker').definition, /community health worker/);
  assert.ok(f.nodes.every(n => !('timing' in n)), 'nodes carry no timing');
});

test('the Flows tab lists the flows you made, then templates that no flow of the campaign includes (flows by themselves)', () => {
  const S = fresh();
  assert.deepEqual(listing(S, 'k1'), ['F:Newborn first weeks'], 'both Newborn care templates are in the flow, so none is listed alone');
  assert.deepEqual(listing(S, 'k2'), ['T:Appointment reminder']);
  assert.deepEqual(listing(S, 'k3'), []);
  assert.deepEqual(listing(S, null), ['F:Newborn first weeks', 'T:Appointment reminder']);
});

test('a template is only "itself a flow" in the campaigns where no flow of that campaign includes it', () => {
  const S = fresh();
  const w = tpl(S, 'Welcome message');
  assert.equal(S.isImplicit(w, 'k1'), false);
  S.copyToCampaign(w.id, 'k3');
  assert.equal(S.isImplicit(w, 'k3'), true);
  assert.equal(S.isImplicit(w, 'k2'), false, 'not in Postnatal at all');
  assert.ok(listing(S, null).includes('T:Welcome message'));
});

test('an unassigned template is listed under All content as a flow of its own, until a flow includes it', () => {
  const S = fresh();
  const n = S.createContent('Loose').content;
  assert.ok(listing(S, null).includes('T:Loose'));
  const f = S.createFlow('Loose flow', null).flow;
  S.addTemplateNode(f.id, n.id);
  assert.ok(!listing(S, null).includes('T:Loose'));
});

test('adding a template node takes the template out of the single-template list; removing the node puts it back', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder');
  const f = S.createFlow('Check-up reminders', 'k2').flow;
  assert.deepEqual(listing(S, 'k2'), ['F:Check-up reminders', 'T:Appointment reminder']);
  const n = S.addTemplateNode(f.id, a.id).node;
  assert.deepEqual(listing(S, 'k2'), ['F:Check-up reminders']);
  assert.equal(S.removeNode(f.id, n.id).ok, true);
  assert.deepEqual(listing(S, 'k2'), ['F:Check-up reminders', 'T:Appointment reminder']);
});

// ---------------------------------------------------------------- creating and naming flows
test('createFlow: trimmed, in the chosen campaign (or none), an empty graph, logged', () => {
  const S = fresh();
  const f = S.createFlow('  Antenatal tips ', 'k3').flow;
  assert.deepEqual([f.name, f.campaignIds, f.nodes], ['Antenatal tips', ['k3'], []]);
  assert.deepEqual(S.createFlow('Loose flow', 'nope').flow.campaignIds, []);
  const ev = last(S, f);
  assert.deepEqual([ev.action, ev.after, ev.actor], ['flow_created', 'Antenatal tips', 'Demo user']);
});

test('flow names: required, unique, and never the name of a template (templates are listed as flows too)', () => {
  const S = fresh();
  assert.match(S.createFlow('  ').error, /required/);
  assert.match(S.createFlow('newborn FIRST weeks').error, /already exists/);
  assert.match(S.createFlow('welcome message').error, /A template is already called "Welcome message"/);
  const f = S.createFlow('Mine').flow;
  assert.match(S.renameFlow(f.id, 'Newborn first weeks').error, /already exists/);
  assert.equal(S.renameFlow(f.id, 'Mine').error, 'Name unchanged');
  assert.equal(S.renameFlow(f.id, 'Renamed').ok, true);
  assert.equal(last(S, f).action, 'flow_renamed');
});

// ---------------------------------------------------------------- adding nodes
test('addTemplateNode: a plain node for the template (no timing), once per flow, leaves the template\'s campaigns as they are, logged', () => {
  const S = fresh();
  const f = S.createFlow('Reminders', 'k3').flow, a = tpl(S, 'Appointment reminder');
  const n = S.addTemplateNode(f.id, a.id).node;
  assert.deepEqual([n.type, n.templateId, n.next], ['template', a.id, null]);
  assert.equal('timing' in n, false, 'template nodes carry no timing');
  assert.deepEqual(a.campaignIds, ['k2'], 'using a template in a flow does not put it in the flow\'s campaign');
  assert.ok(!S.historyFor(a.id, 'content').some(e => e.action === 'campaign_copied'));
  assert.equal(last(S, f).action, 'flow_node_added');
  assert.match(S.addTemplateNode(f.id, a.id).error, /already in this flow/);
  assert.match(S.addTemplateNode(f.id, 'nope').error, /not found/);
  assert.match(S.addTemplateNode('nope', a.id).error, /not found/);
  const ev = last(S, f);
  assert.deepEqual([ev.action, ev.after, ev.detail], ['flow_node_added', 'Appointment reminder', 'Template']);
});

test('new nodes fill a grid, never on top of each other', () => {
  const S = fresh();
  const f = S.createFlow('Grid').flow;
  for (let i = 0; i < 7; i++) S.addLogicNode(f.id);
  const spots = f.nodes.map(n => n.x + ',' + n.y);
  assert.equal(new Set(spots).size, 7);
  assert.deepEqual(spots.slice(0, 4), ['40,40', '380,40', '720,40', '40,300']);
});

test('a new node takes the first free slot: never on top of an existing node, even one that was moved', () => {
  const S = fresh();
  const f = S.createFlow('Slots').flow;
  const a = S.addLogicNode(f.id).node;                         // first slot (40,40)
  S.moveNode(f.id, a.id, 380, 40);                             // moved into the second slot
  const b = S.addLogicNode(f.id).node;
  assert.deepEqual([b.x, b.y], [40, 40], 'the first slot is free again');
  const c = S.addLogicNode(f.id).node;
  assert.deepEqual([c.x, c.y], [720, 40], 'the first two are taken');
  S.removeNode(f.id, b.id);
  assert.deepEqual([S.addLogicNode(f.id).node.x, 40].join(), '40,40', 'a freed slot is reused');
});

test('addLogicNode: titled Logic 1, Logic 2, ... and starts with two outgoing edges to name', () => {
  const S = fresh();
  const f = S.createFlow('Branches').flow;
  const a = S.addLogicNode(f.id).node, b = S.addLogicNode(f.id).node;
  assert.deepEqual([a.title, b.title], ['Logic 1', 'Logic 2']);
  assert.deepEqual(a.outs.map(o => [o.label, o.to]), [['Condition 1', null], ['Condition 2', null]]);
  assert.notEqual(a.outs[0].id, b.outs[0].id);
  assert.deepEqual([last(S, f).action, last(S, f).after, last(S, f).detail], ['flow_node_added', 'Logic 2', 'Logic node']);
});

test('addActionNode / addInputNode: action nodes are named Action 1.. (you rename them); input nodes are plain and numbered Input 1.. ', () => {
  const S = fresh();
  const f = S.createFlow('Actions').flow;
  const a1 = S.addActionNode(f.id).node, a2 = S.addActionNode(f.id).node, i1 = S.addInputNode(f.id).node;
  assert.deepEqual([a1.name, a2.name, i1.title], ['Action 1', 'Action 2', 'Input 1']);
  assert.deepEqual([a1.definition, a1.next, i1.title, Object.keys(i1).sort().join()], ['', null, 'Input 1', 'id,next,title,type,x,y']);
  assert.equal(S.addInputNode(f.id).node.title, 'Input 2');
  S.updateAction(f.id, a1.id, { name: 'Action 3' });
  assert.equal(S.addActionNode(f.id).node.name, 'Action 1', 'the first name nobody holds (Action 2 and 3 are taken)');
  assert.equal(S.addActionNode(f.id).node.name, 'Action 4', 'and then skips the taken ones');
  assert.match(S.addActionNode('nope').error, /not found/);
});

// ---------------------------------------------------------------- logic nodes: a dynamic set of named outgoing edges
const outs = (S, n) => n.outs.map(o => ({ id: o.id, label: o.label }));

test('a logic node\'s outgoing edges can be added, named by condition, and removed, all in one save', () => {
  const S = fresh();
  const f = S.createFlow('Logic').flow, l = S.addLogicNode(f.id).node;
  const [o1, o2] = l.outs;
  assert.equal(S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'Replied yes' }, { id: o2.id, label: 'Condition 2' }, { label: '  Asked for a call  ' }]).ok, true);
  assert.deepEqual(l.outs.map(o => o.label), ['Replied yes', 'Condition 2', 'Asked for a call']);
  assert.deepEqual([l.outs[0].id, l.outs[1].id], [o1.id, o2.id], 'existing edges keep their ids');
  assert.ok(l.outs[2].id && l.outs[2].to === null, 'a new edge starts open');
  const evs = S.historyForFlow(f.id).slice(0, 2).map(e => e.action + ':' + (e.after || e.before)).sort();
  assert.deepEqual(evs, ['flow_out_added:Asked for a call', 'flow_out_renamed:Replied yes']);
  assert.equal(S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'Replied yes' }, { id: l.outs[2].id, label: 'Asked for a call' }]).ok, true);
  assert.deepEqual(l.outs.map(o => o.label), ['Replied yes', 'Asked for a call'], 'the edge left out was removed');
  assert.deepEqual([last(S, f).action, last(S, f).before, last(S, f).detail], ['flow_out_removed', 'Condition 2', 'Logic 1']);
});

test('saving a logic node keeps the connections of the edges that stay, and an edge that is removed takes its connection with it', () => {
  const S = fresh();
  const f = S.createFlow('Keep').flow, l = S.addLogicNode(f.id).node, a = S.addActionNode(f.id).node, b = S.addActionNode(f.id).node;
  const [o1, o2] = l.outs;
  S.connect(f.id, l.id, o1.id, a.id); S.connect(f.id, l.id, o2.id, b.id);
  S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'Renamed' }, { id: o2.id, label: 'Condition 2' }]);
  assert.deepEqual(edges(S, f), ['Logic 1 [Renamed] -> Action 1', 'Logic 1 [Condition 2] -> Action 2']);
  S.updateLogic(f.id, l.id, [{ id: o2.id, label: 'Condition 2' }]);
  assert.deepEqual(edges(S, f), ['Logic 1 [Condition 2] -> Action 2']);
  assert.match(last(S, f).detail, /Logic 1 \(was → Action 1\)/, 'the removal says where the edge led');
});

test('edge names: required, at most 40 characters, unique within the node (any case); the whole save is refused if one is bad', () => {
  const S = fresh();
  const f = S.createFlow('Names').flow, l = S.addLogicNode(f.id).node;
  const [o1, o2] = l.outs;
  const before = JSON.stringify(l.outs), hist = S.historyForFlow(f.id).length;
  assert.equal(S.updateLogic(f.id, l.id, [{ id: o1.id, label: '   ' }, { id: o2.id, label: 'ok' }]).error, 'Name the condition of every outgoing edge');
  assert.match(S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'x'.repeat(41) }, { id: o2.id, label: 'ok' }]).error, /Keep each condition name to 40/);
  assert.match(S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'Same' }, { id: o2.id, label: 'SAME' }]).error, /both called "SAME"/);
  assert.match(S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'a' }, { label: 'A' }]).error, /both called/);
  assert.equal(S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'x'.repeat(40) }, { id: o2.id, label: 'ok' }]).ok, true, '40 is fine');
  assert.equal(JSON.stringify(l.outs) === before, false);
  assert.equal(S.historyForFlow(f.id).length, hist + 2, 'only the valid save wrote anything (its two renames)');
});

test('two edges can swap their names in one save (the names only have to be unique in the end)', () => {
  const S = fresh();
  const f = S.createFlow('Swap').flow, l = S.addLogicNode(f.id).node;
  const [o1, o2] = l.outs;
  assert.equal(S.updateLogic(f.id, l.id, [{ id: o1.id, label: 'Condition 2' }, { id: o2.id, label: 'Condition 1' }]).ok, true);
  assert.deepEqual(l.outs.map(o => [o.id, o.label]), [[o1.id, 'Condition 2'], [o2.id, 'Condition 1']]);
});

test('a logic node keeps at least one outgoing edge; nothing changed or an unknown edge is refused; only logic nodes have edges', () => {
  const S = fresh();
  const f = S.createFlow('Min').flow, l = S.addLogicNode(f.id).node;
  assert.equal(S.updateLogic(f.id, l.id, []).error, 'A logic node needs at least one outgoing edge');
  assert.equal(S.updateLogic(f.id, l.id, outs(S, l)).error, 'No change');
  assert.equal(S.updateLogic(f.id, l.id, [{ id: 'nope', label: 'x' }]).error, 'Edge not found');
  assert.equal(S.updateLogic(f.id, l.id, [{ id: l.outs[0].id, label: 'Only one' }]).ok, true, 'a single edge is fine');
  assert.equal(l.outs.length, 1);
  const a = S.addActionNode(f.id).node;
  assert.match(S.updateLogic(f.id, a.id, [{ label: 'x' }]).error, /Logic node not found/);
  assert.match(S.updateLogic('nope', l.id, [{ label: 'x' }]).error, /Logic node not found/);
});

// ---------------------------------------------------------------- connecting nodes
test('connect: a template/action/input node has one outgoing edge; replacing it is fine and remembers the old target', () => {
  const S = fresh();
  const f = S.createFlow('Chain').flow;
  const t = S.addTemplateNode(f.id, tpl(S, 'Welcome message').id).node, a = S.addActionNode(f.id).node, i = S.addInputNode(f.id).node;
  assert.equal(S.connect(f.id, i.id, null, t.id).ok, true);
  assert.equal(S.connect(f.id, t.id, null, a.id).ok, true);
  assert.deepEqual(edges(S, f), ['Welcome message -> Action 1', 'Input 1 -> Welcome message']);
  assert.deepEqual([last(S, f).action, last(S, f).detail], ['flow_edge_connected', 'Welcome message → Action 1']);
  const b = S.addActionNode(f.id).node;
  S.connect(f.id, t.id, null, b.id);
  assert.deepEqual([t.next, last(S, f).before, last(S, f).after], [b.id, 'Action 1', 'Action 2']);
  assert.equal(S.connect(f.id, t.id, null, b.id).error, 'No change');
});

test('connect: a logic node connects the edge you name; many edges may lead to the same node', () => {
  const S = fresh();
  const f = S.createFlow('Join').flow, l = S.addLogicNode(f.id).node, a = S.addActionNode(f.id).node;
  assert.match(S.connect(f.id, l.id, null, a.id).error, /Choose one of the node's outgoing edges/);
  assert.match(S.connect(f.id, l.id, 'nope', a.id).error, /Choose one of/);
  S.connect(f.id, l.id, l.outs[0].id, a.id);
  S.connect(f.id, l.id, l.outs[1].id, a.id);
  assert.deepEqual(edges(S, f), ['Logic 1 [Condition 1] -> Action 1', 'Logic 1 [Condition 2] -> Action 1']);
  assert.equal(last(S, f).detail, 'Logic 1 [Condition 2] → Action 1');
});

test('connect refuses: itself, a loop (directly or through other nodes), unknown nodes', () => {
  const S = fresh();
  const f = S.createFlow('Rules').flow;
  const a = S.addActionNode(f.id).node, b = S.addActionNode(f.id).node, c = S.addActionNode(f.id).node, l = S.addLogicNode(f.id).node;
  assert.equal(S.connect(f.id, a.id, null, a.id).error, 'A node cannot connect to itself');
  S.connect(f.id, a.id, null, b.id); S.connect(f.id, b.id, null, c.id);
  assert.equal(S.connect(f.id, c.id, null, a.id).error, 'That would make a loop');
  assert.equal(S.connect(f.id, b.id, null, a.id).error, 'That would make a loop');
  S.connect(f.id, c.id, null, l.id);
  assert.equal(S.connect(f.id, l.id, l.outs[0].id, a.id).error, 'That would make a loop', 'also through a logic node');
  assert.match(S.connect(f.id, a.id, null, 'nope').error, /not found/);
  assert.match(S.connect('nope', a.id, null, b.id).error, /not found/);
  assert.deepEqual(edges(S, f).filter(e => !e.endsWith('(open)')), ['Action 1 -> Action 2', 'Action 2 -> Action 3', 'Action 3 -> Logic 1'], 'nothing refused was saved');
});

test('an input node can be connected into as well as out of (like every other node); loops are still refused', () => {
  const S = fresh();
  const f = S.createFlow('Inputs').flow;
  const i = S.addInputNode(f.id).node, a = S.addActionNode(f.id).node, l = S.addLogicNode(f.id).node;
  assert.equal(S.connect(f.id, a.id, null, i.id).ok, true, 'an action node can lead into an input node');
  assert.equal(S.connect(f.id, l.id, l.outs[0].id, i.id).ok, true, 'and so can a logic edge');
  assert.equal(S.connect(f.id, i.id, null, a.id).error, 'That would make a loop', 'but not back around to where it came from');
  const j = S.addInputNode(f.id).node;
  assert.equal(S.connect(f.id, i.id, null, j.id).ok, true, 'input nodes can follow one another');
  assert.deepEqual(edges(S, f).filter(e => !e.endsWith('(open)')).sort(), ['Action 1 -> Input 1', 'Input 1 -> Input 2', 'Logic 1 [Condition 1] -> Input 1']);
});

test('disconnect keeps a logic node\'s edge (its name stays, open); a template/action node just loses its edge', () => {
  const S = fresh();
  const f = S.createFlow('Open').flow, l = S.addLogicNode(f.id).node, a = S.addActionNode(f.id).node;
  S.connect(f.id, l.id, l.outs[0].id, a.id);
  assert.equal(S.disconnect(f.id, l.id, l.outs[0].id).ok, true);
  assert.deepEqual(l.outs.map(o => [o.label, o.to]), [['Condition 1', null], ['Condition 2', null]]);
  assert.deepEqual([last(S, f).action, last(S, f).before], ['flow_edge_disconnected', 'Logic 1 [Condition 1] → Action 1']);
  assert.equal(S.disconnect(f.id, l.id, l.outs[0].id).error, 'Not connected');
  assert.match(S.disconnect(f.id, l.id, null).error, /Choose one of/);
  const b = S.addActionNode(f.id).node;
  S.connect(f.id, a.id, null, b.id);
  assert.equal(S.disconnect(f.id, a.id, null).ok, true);
  assert.equal(a.next, null);
});

test('removing a node leaves the edges that pointed at it open, and logs it', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  const daily = node(S, f, 'Daily health tip'), logic = node(S, f, 'Logic 1');
  assert.equal(S.removeNode(f.id, daily.id).ok, true);
  assert.deepEqual(logic.outs.map(o => [o.label, o.to !== null]), [['Replied', false], ['No reply', true]], 'the "Replied" edge stays, now open');
  assert.deepEqual([last(S, f).action, last(S, f).before, last(S, f).detail], ['flow_node_removed', 'Daily health tip', 'Template']);
  const welcome = node(S, f, 'Welcome message');
  S.removeNode(f.id, logic.id);
  assert.equal(welcome.next, null, 'a template node pointing at it is left open');
  assert.match(S.removeNode(f.id, 'nope').error, /not found/);
});

// ---------------------------------------------------------------- action and input nodes
test('updateAction: name and definition; names are unique among all nodes of the flow; limits; one event per change', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), a = node(S, f, 'Alert health worker');
  assert.equal(S.updateAction(f.id, a.id, { name: '  Call the family ' }).ok, true);
  assert.equal(a.name, 'Call the family');
  assert.deepEqual([last(S, f).action, last(S, f).before, last(S, f).after], ['flow_action_renamed', 'Alert health worker', 'Call the family']);
  assert.equal(S.updateAction(f.id, a.id, { definition: 'Phone them within 2 days.' }).ok, true);
  assert.deepEqual([last(S, f).action, last(S, f).detail, last(S, f).after], ['flow_action_defined', 'Call the family', 'Phone them within 2 days.']);
  assert.equal(S.updateAction(f.id, a.id, { name: 'Call the family', definition: 'Phone them within 2 days.' }).error, 'No change');
  assert.equal(S.updateAction(f.id, a.id, { name: ' ' }).error, 'Name the action');
  assert.match(S.updateAction(f.id, a.id, { name: 'x'.repeat(61) }).error, /60 characters/);
  assert.match(S.updateAction(f.id, a.id, { name: 'logic 1' }).error, /already called "logic 1"/);
  assert.match(S.updateAction(f.id, a.id, { name: 'welcome message' }).error, /already called/);
  assert.match(S.updateAction(f.id, a.id, { definition: 'y'.repeat(501) }).error, /500 characters/);
  assert.equal(S.updateAction(f.id, a.id, { definition: 'y'.repeat(500) }).ok, true);
  assert.match(S.updateAction(f.id, node(S, f, 'Logic 1').id, { name: 'x' }).error, /Action node not found/);
});

test('changeNodeTemplate: a template node can point at another template; edges stay; campaigns are left as they are; logged', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), a = tpl(S, 'Appointment reminder');
  const n = node(S, f, 'Welcome message');
  assert.equal(S.changeNodeTemplate(f.id, n.id, a.id).ok, true);
  assert.equal(n.templateId, a.id);
  assert.deepEqual(edges(S, f).sort(), ['Appointment reminder -> Logic 1', 'Input 1 -> Appointment reminder', 'Logic 1 [No reply] -> Alert health worker', 'Logic 1 [Replied] -> Daily health tip'], 'the node keeps its edges under its new name');
  assert.deepEqual(a.campaignIds, ['k2'], 'the new template keeps its own campaigns');
  assert.ok(!S.historyFor(a.id, 'content').some(e => e.action === 'campaign_copied'));
  assert.deepEqual([last(S, f).action, last(S, f).before, last(S, f).after], ['flow_node_changed', 'Welcome message', 'Appointment reminder']);
  assert.deepEqual(listing(S, 'k1'), ['F:Newborn first weeks', 'T:Welcome message'], 'Welcome message is still in Newborn care, now in no flow there: it is a flow by itself');
  assert.ok(w.campaignIds.includes('k1'));
});

test('changeNodeTemplate: the old template falls back to being a flow by itself where no flow of its campaign uses it', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), a = tpl(S, 'Appointment reminder');
  assert.equal(S.isImplicit(w, 'k1'), false);
  S.changeNodeTemplate(f.id, node(S, f, 'Welcome message').id, a.id);
  assert.equal(S.isImplicit(w, 'k1'), true);
  assert.deepEqual(listing(S, 'k1'), ['F:Newborn first weeks', 'T:Welcome message']);
  assert.equal(S.isImplicit(a, 'k1'), false, 'the new template is inside the flow in Newborn care');
});

test('changeNodeTemplate refuses: the same template, one already in the flow, unknown ids, and nodes that are not template nodes', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), n = node(S, f, 'Welcome message'), d = tpl(S, 'Daily health tip');
  assert.equal(S.changeNodeTemplate(f.id, n.id, n.templateId).error, 'No change');
  assert.match(S.changeNodeTemplate(f.id, n.id, d.id).error, /"Daily health tip" is already in this flow/);
  assert.match(S.changeNodeTemplate(f.id, n.id, 'nope').error, /Template not found/);
  assert.match(S.changeNodeTemplate(f.id, 'nope', d.id).error, /Template node not found/);
  assert.match(S.changeNodeTemplate(f.id, node(S, f, 'Logic 1').id, tpl(S, 'Appointment reminder').id).error, /Template node not found/);
  assert.match(S.changeNodeTemplate('nope', n.id, d.id).error, /Template node not found/);
  assert.equal(n.templateId, tpl(S, 'Welcome message').id, 'nothing refused was saved');
});

test('input nodes saved with a name, type and description become plain numbered nodes (the name becomes the title)', () => {
  const tr = [{ lang: 'en', text: 'x', waName: '', deployedText: null, footer: '', header: '', defaults: {}, buttons: [] }];
  const state = {
    nextId: 50, campaigns: [{ id: 'k1', name: 'A' }], history: [],
    contents: [{ id: 'c1', name: 'One', campaignIds: ['k1'], headerType: 'none', timing: { days: 7, when: 'before', ref: 'expected_date_of_delivery' }, blocked: false, deployCounter: 0, createdAt: 'x', translations: tr }],
    flows: [{ id: 'f1', name: 'Old', campaignIds: ['k1'], createdAt: 'x', nodes: [
      { id: 'n1', type: 'input', name: 'Expected date of delivery', inputType: 'date', description: 'From registration', next: 'n2', x: 40, y: 40 },
      { id: 'n2', type: 'template', templateId: 'c1', next: null, x: 380, y: 40 }] }]
  };
  const { S, mem } = loadStore({ 'cms-prototype-v1': JSON.stringify(state) });
  const input = S.listFlows()[0].nodes[0];
  assert.deepEqual(Object.keys(input).sort(), ['id', 'next', 'title', 'type', 'x', 'y']);
  assert.equal(S.nodeTitle(input), 'Expected date of delivery');
  assert.equal(input.next, 'n2', 'its edge is kept');
  assert.deepEqual(Object.keys(JSON.parse(mem['cms-prototype-v1']).flows[0].nodes[0]).sort(), ['id', 'next', 'title', 'type', 'x', 'y'], 'saved back plain');
});

test('moveNode saves the position (never negative) and is not a history event', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), n = node(S, f, 'Welcome message');
  const before = S.historyForFlow(f.id).length;
  assert.equal(S.moveNode(f.id, n.id, 123.6, -50).ok, true);
  assert.deepEqual([n.x, n.y], [124, 0]);
  assert.equal(S.historyForFlow(f.id).length, before);
  assert.match(S.moveNode(f.id, 'nope', 1, 1).error, /not found/);
});

test('timing text: "<n> days before/after <reference date>", "on" for 0, singular for 1', () => {
  const S = fresh();
  assert.equal(S.timingText({ days: 14, when: 'before', ref: 'expected_date_of_delivery' }), '14 days before expected_date_of_delivery');
  assert.equal(S.timingText({ days: 1, when: 'after', ref: 'date_of_birth' }), '1 day after date_of_birth');
  assert.equal(S.timingText({ days: 0, when: 'after', ref: 'date_of_birth' }), 'on date_of_birth');
});

test('timing is validated: whole days 0-999, before/after, a lowercase reference name', () => {
  const S = fresh();
  const ok = { days: 5, when: 'before', ref: 'expected_date_of_delivery' };
  assert.equal(S.checkTiming(ok), null);
  for (const days of [-1, 1000, 1.5, NaN]) assert.match(S.checkTiming(Object.assign({}, ok, { days })), /whole number from 0 to 999/, String(days));
  assert.match(S.checkTiming(Object.assign({}, ok, { when: 'during' })), /before or after/);
  for (const ref of ['', 'Expected Date', '1st_date', 'a-b', 'with space']) assert.match(S.checkTiming(Object.assign({}, ok, { ref })), /reference date/, JSON.stringify(ref));
  assert.equal(S.checkTiming(Object.assign({}, ok, { days: 0, ref: 'x' })), null);
});

test('every template has a timing (dummy by default) that is edited on the template when it is a flow by itself', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder');
  assert.deepEqual(a.timing, S.DEFAULT_TIMING);
  assert.deepEqual(S.createContent('Brand new').content.timing, S.DEFAULT_TIMING);
  assert.notEqual(S.createContent('Another').content.timing, S.DEFAULT_TIMING, 'each template gets its own copy');
  assert.equal(S.setTemplateTiming(a.id, { days: 2, when: 'after', ref: 'date_of_birth' }).ok, true);
  assert.equal(S.setTemplateTiming(a.id, { days: 2, when: 'after', ref: 'date_of_birth' }).error, 'No change');
  assert.match(S.setTemplateTiming(a.id, { days: 2, when: 'after', ref: 'Bad Ref' }).error, /reference date/);
  const ev = S.historyFor(a.id, 'content')[0];
  assert.deepEqual([ev.action, ev.before, ev.after], ['timing_edited', '7 days before expected_date_of_delivery', '2 days after date_of_birth']);
});

// ---------------------------------------------------------------- reordering flows in the list
test('reorderFlow: before / after another flow; the list is one global order seen through each campaign', () => {
  const S = fresh();
  const a = flow(S, 'Newborn first weeks');
  const b = S.createFlow('Second', 'k1').flow, c = S.createFlow('Third', 'k1').flow, other = S.createFlow('Elsewhere', 'k2').flow;
  const names = k => S.flowsIn(k).map(f => f.name);
  assert.deepEqual(names('k1'), ['Newborn first weeks', 'Second', 'Third']);
  assert.equal(S.reorderFlow(c.id, a.id, 'before').ok, true);
  assert.deepEqual(names('k1'), ['Third', 'Newborn first weeks', 'Second']);
  assert.equal(S.reorderFlow(a.id, b.id, 'after').ok, true);
  assert.deepEqual(names('k1'), ['Third', 'Second', 'Newborn first weeks']);
  assert.deepEqual(names('k2'), ['Elsewhere']);
  assert.equal(S.reorderFlow(c.id, b.id, 'before').error, 'No change', 'Third is already right before Second');
  assert.equal(S.reorderFlow(c.id, c.id, 'after').error, 'No change');
  assert.match(S.reorderFlow('nope', a.id, 'after').error, /not found/);
  assert.equal(last(S, a).detail, 'after Second');
  assert.ok(other);
});

test('the flows you created stay in your order; single-template flows always follow them', () => {
  const S = fresh();
  const mine = S.createFlow('Mine', null).flow;
  S.reorderFlow(mine.id, flow(S, 'Newborn first weeks').id, 'before');
  assert.deepEqual(listing(S, null), ['F:Mine', 'F:Newborn first weeks', 'T:Appointment reminder']);
});

// ---------------------------------------------------------------- refer / duplicate / move a flow to a campaign
test('planFlowDrop: refer adds the target (same flow), duplicate makes a new one, both bring the templates; move takes the flow out of its one campaign', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  const p = S.planFlowDrop(f.id, 'k3');
  assert.deepEqual(p.existsIn, ['k1']);
  assert.equal(p.templates, 2);
  assert.deepEqual([p.refer.ok, p.refer.result, p.refer.addTemplates], [true, ['k1', 'k3'], [w.id, d.id]]);
  assert.deepEqual([p.duplicate.ok, p.duplicate.name, p.duplicate.addTemplates], [true, 'Newborn first weeks (copy)', [w.id, d.id]]);
  assert.deepEqual([p.move.ok, p.move.from, p.move.result, p.move.leave, p.move.stay], [true, ['k1'], ['k3'], [w.id, d.id], []]);
});

test('planFlowDrop: dropped on a campaign that has it -> refer and move are disabled, duplicate works; several owners -> "Can\'t move"', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  const same = S.planFlowDrop(f.id, 'k1');
  assert.deepEqual([same.refer.ok, same.move.ok, same.refer.reason, same.move.reason], [false, false, 'Already in Newborn care', 'Already in Newborn care']);
  assert.equal(same.duplicate.ok, true);
  S.referFlow(f.id, 'k3');
  const p = S.planFlowDrop(f.id, 'k2');
  assert.equal(p.move.ok, false);
  assert.equal(p.move.label, "Can't move");
  assert.match(p.move.reason, /2 campaigns \(Newborn care, Immunisation\)/);
  assert.deepEqual([p.refer.ok, p.duplicate.ok], [true, true]);
  assert.equal(S.moveFlow(f.id, 'k2').ok, false);
});

test('referFlow: the SAME flow is in both campaigns; its templates are added to the target and stay in the source', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  assert.equal(S.referFlow(f.id, 'k3').ok, true);
  assert.deepEqual(f.campaignIds, ['k1', 'k3']);
  assert.equal(S.listFlows().length, 1, 'still one flow');
  assert.deepEqual([w.campaignIds, d.campaignIds], [['k1', 'k3'], ['k1', 'k3']]);
  assert.deepEqual(listing(S, 'k3'), ['F:Newborn first weeks']);
  assert.equal(last(S, f).action, 'flow_referred');
  assert.equal(S.historyFor(w.id, 'content')[0].action, 'campaign_copied');
  assert.equal(S.referFlow(f.id, 'k3').error, 'Already in Immunisation');
  S.updateAction(f.id, node(S, f, 'Alert health worker').id, { name: 'Phone the family' });
  assert.ok(S.flowsIn('k3')[0].nodes.some(n => n.type === 'action' && n.name === 'Phone the family'), 'an edit is seen from both campaigns');
});

test('duplicateFlow: a new independent flow with its own copy of the whole graph, placed after the original', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  const other = S.createFlow('Zzz', 'k1').flow;
  const copy = S.duplicateFlow(f.id, 'k3').flow;
  assert.deepEqual([copy.name, copy.campaignIds], ['Newborn first weeks (copy)', ['k3']]);
  assert.deepEqual(S.listFlows().map(x => x.name), ['Newborn first weeks', 'Newborn first weeks (copy)', 'Zzz']);
  assert.deepEqual(f.campaignIds, ['k1']);
  assert.deepEqual(edges(S, copy).sort(), edges(S, f).sort(), 'the same nodes and edges (by name)');
  assert.deepEqual(copy.nodes.map(n => n.type).sort(), f.nodes.map(n => n.type).sort());
  assert.deepEqual(Object.keys(copy.nodes.find(n => n.type === 'input')).sort(), ['id', 'next', 'title', 'type', 'x', 'y'], 'the copy of an input node is plain too');
  const ids = new Set(f.nodes.map(n => n.id).concat(f.nodes.filter(n => n.type === 'logic').flatMap(n => n.outs.map(o => o.id))));
  assert.ok(copy.nodes.every(n => !ids.has(n.id)), 'new node ids');
  assert.ok(copy.nodes.filter(n => n.type === 'logic').every(n => n.outs.every(o => !ids.has(o.id))), 'new edge ids');
  assert.deepEqual(copy.nodes.map(n => [n.x, n.y]), f.nodes.map(n => [n.x, n.y]), 'same layout');
  assert.deepEqual([w.campaignIds, d.campaignIds], [['k1', 'k3'], ['k1', 'k3']], 'templates are shared and added to the target');
  assert.equal(S.list().length, 3, 'no template was duplicated');
  // independence
  S.moveNode(copy.id, node(S, copy, 'Welcome message').id, 700, 500);
  S.updateLogic(copy.id, node(S, copy, 'Logic 1').id, [{ id: node(S, copy, 'Logic 1').outs[0].id, label: 'Answered' }, { id: node(S, copy, 'Logic 1').outs[1].id, label: 'No reply' }]);
  S.updateAction(copy.id, node(S, copy, 'Alert health worker').id, { definition: 'Different' });
  S.removeNode(copy.id, node(S, copy, 'Daily health tip').id);
  assert.notEqual(node(S, f, 'Welcome message').y, 500, 'moving a node in the copy does not move it in the original');
  assert.equal(node(S, f, 'Logic 1').outs[0].label, 'Replied');
  assert.match(node(S, f, 'Alert health worker').definition, /community health worker/);
  assert.ok(node(S, f, 'Daily health tip'));
  assert.ok(other);
});

test('duplicateFlow: unique names, works inside the same campaign, empty flows, logged on both flows', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  const a = S.duplicateFlow(f.id, 'k1').flow, b = S.duplicateFlow(f.id, 'k1').flow;
  assert.deepEqual([a.name, b.name], ['Newborn first weeks (copy)', 'Newborn first weeks (copy 2)']);
  assert.deepEqual(S.flowsIn('k1').map(x => x.name), ['Newborn first weeks', 'Newborn first weeks (copy 2)', 'Newborn first weeks (copy)']);
  const e = S.createFlow('Empty', 'k2').flow;
  assert.deepEqual(S.duplicateFlow(e.id, 'k3').flow.nodes, []);
  const created = last(S, a);
  assert.deepEqual([created.action, created.after, created.detail], ['flow_created', 'Newborn first weeks (copy)', 'Duplicate of Newborn first weeks']);
  const logged = S.historyForFlow(f.id).find(x => x.action === 'flow_duplicated');
  assert.deepEqual([logged.after, logged.detail], ['Newborn first weeks (copy 2)', 'Newborn care']);
  assert.match(S.duplicateFlow('nope', 'k1').error, /not found/);
  assert.match(S.duplicateFlow(f.id, 'nope').error, /not found/);
});

test('moveFlow: templates only this flow uses move with it; templates another flow of the source still uses stay', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  const g = S.createFlow('Welcome only', 'k1').flow;
  S.addTemplateNode(g.id, w.id);
  const p = S.planFlowDrop(f.id, 'k3');
  assert.deepEqual([p.move.leave, p.move.stay], [[d.id], [w.id]]);
  assert.equal(S.moveFlow(f.id, 'k3').ok, true);
  assert.deepEqual(f.campaignIds, ['k3']);
  assert.deepEqual(d.campaignIds, ['k3']);
  assert.deepEqual(w.campaignIds, ['k1', 'k3']);
  assert.deepEqual(listing(S, 'k1'), ['F:Welcome only']);
  assert.equal(last(S, f).action, 'flow_moved');
  assert.equal(S.historyFor(d.id, 'content')[0].action, 'campaign_moved');
  assert.equal(S.historyFor(w.id, 'content')[0].action, 'campaign_copied');
});

test('moveFlow with no other flow in between leaves nothing behind in the source; an empty flow can be moved', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  S.moveFlow(f.id, 'k2');
  assert.deepEqual(S.contentsIn('k1').map(c => c.name), []);
  assert.deepEqual(listing(S, 'k1'), []);
  assert.deepEqual(listing(S, 'k2'), ['F:Newborn first weeks', 'T:Appointment reminder']);
  const e = S.createFlow('Empty', 'k1').flow;
  assert.equal(S.planFlowDrop(e.id, 'k2').templates, 0);
  assert.equal(S.moveFlow(e.id, 'k2').ok, true);
  assert.deepEqual(e.campaignIds, ['k2']);
});

// ---------------------------------------------------------------- history and saved data
test('flow events are kept apart from template history, newest first, all by the single user', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks'), w = tpl(S, 'Welcome message');
  S.updateAction(f.id, node(S, f, 'Alert health worker').id, { definition: 'Phone them.' });
  const evs = S.historyForFlow(f.id);
  assert.ok(evs.length >= 10 && evs.every(e => e.actor === 'Demo user' && e.flowId === f.id));
  assert.ok(evs.every((e, i) => i === 0 || evs[i - 1].ts >= e.ts));
  assert.ok(S.historyFor(w.id).every(e => e.flowId === undefined));
  assert.ok(['flow_created', 'flow_node_added', 'flow_edge_connected', 'flow_out_renamed', 'flow_action_renamed', 'flow_action_defined'].every(a => evs.some(e => e.action === a)), 'the seed built the graph through the same operations');
});

test('saved data from before flows: flows start empty and every template gets the dummy timing', () => {
  const tr = [{ lang: 'en', text: 'x', waName: '', deployedText: null, footer: '', header: '', defaults: {}, buttons: [] }];
  const state = { nextId: 9, campaigns: [{ id: 'k1', name: 'A' }], contents: [{ id: 'c1', name: 'One', campaignIds: ['k1'], headerType: 'none', blocked: false, deployCounter: 0, createdAt: 'x', translations: tr }], history: [] };
  const { S, mem } = loadStore({ 'cms-prototype-v1': JSON.stringify(state) });
  assert.deepEqual(S.listFlows(), []);
  assert.deepEqual(S.list()[0].timing, S.DEFAULT_TIMING);
  assert.deepEqual(S.flowItems('k1').map(i => i.kind), ['template']);
  assert.deepEqual(JSON.parse(mem['cms-prototype-v1']).flows, []);
});

test('flows saved as an ordered list of steps become a chain of connected template nodes', () => {
  const tr = [{ lang: 'en', text: 'x', waName: '', deployedText: null, footer: '', header: '', defaults: {}, buttons: [] }];
  const content = (id, name) => ({ id, name, campaignIds: ['k1'], headerType: 'none', timing: { days: 7, when: 'before', ref: 'expected_date_of_delivery' }, blocked: false, deployCounter: 0, createdAt: 'x', translations: JSON.parse(JSON.stringify(tr)) });
  const t1 = { days: 14, when: 'before', ref: 'expected_date_of_delivery' }, t2 = { days: 3, when: 'after', ref: 'date_of_birth' }, t3 = { days: 0, when: 'after', ref: 'date_of_birth' };
  const state = {
    nextId: 50, campaigns: [{ id: 'k1', name: 'A' }], history: [],
    contents: [content('c1', 'One'), content('c2', 'Two'), content('c3', 'Three')],
    flows: [{ id: 'f1', name: 'Old flow', campaignIds: ['k1'], createdAt: 'x', steps: [{ templateId: 'c1', timing: t1 }, { templateId: 'c2', timing: t2 }, { templateId: 'c3', timing: t3 }] }]
  };
  const { S, mem } = loadStore({ 'cms-prototype-v1': JSON.stringify(state) });
  const f = S.listFlows()[0];
  assert.equal('steps' in f, false);
  assert.deepEqual(f.nodes.map(n => n.type), ['template', 'template', 'template']);
  assert.deepEqual(edges(S, f), ['One -> Two', 'Two -> Three']);
  assert.ok(f.nodes.every(n => !('timing' in n)), 'template nodes carry no timing, so the old step timing is dropped');
  assert.equal(new Set(f.nodes.map(n => n.id)).size, 3);
  assert.deepEqual(f.nodes.map(n => [n.x, n.y]), [[40, 40], [380, 40], [720, 40]]);
  assert.equal('steps' in JSON.parse(mem['cms-prototype-v1']).flows[0], false, 'saved back in the new shape');
});

test('flows saved with a timing on their template nodes lose it on load (nodes no longer have one)', () => {
  const tr = [{ lang: 'en', text: 'x', waName: '', deployedText: null, footer: '', header: '', defaults: {}, buttons: [] }];
  const t = { days: 14, when: 'before', ref: 'expected_date_of_delivery' };
  const state = {
    nextId: 50, campaigns: [{ id: 'k1', name: 'A' }], history: [],
    contents: [{ id: 'c1', name: 'One', campaignIds: ['k1'], headerType: 'none', timing: t, blocked: false, deployCounter: 0, createdAt: 'x', translations: tr }],
    flows: [{ id: 'f1', name: 'Graph flow', campaignIds: ['k1'], createdAt: 'x', nodes: [{ id: 'n1', type: 'template', templateId: 'c1', timing: t, next: null, x: 40, y: 40 }] }]
  };
  const { S, mem } = loadStore({ 'cms-prototype-v1': JSON.stringify(state) });
  assert.equal('timing' in S.listFlows()[0].nodes[0], false);
  assert.deepEqual(S.list()[0].timing, t, 'the template\'s own timing (used when it is a flow by itself) is untouched');
  assert.equal('timing' in JSON.parse(mem['cms-prototype-v1']).flows[0].nodes[0], false, 'saved back without it');
});


// ---------------------------------------------------------------- flow nodes: a flow calling another flow
test('a flow node calls another flow: titled with the called flow, positioned on the grid, logged', () => {
  const S = fresh();
  const a = S.createFlow('Caller', 'k2').flow;
  const r = S.addFlowNode(a.id, flow(S, 'Newborn first weeks').id);
  assert.ok(r.ok);
  assert.equal(r.node.type, 'flow');
  assert.equal(S.nodeTitle(r.node), 'Newborn first weeks');
  assert.equal(last(S, a).action, 'flow_node_added');
  assert.deepEqual(S.getFlow(a.id).campaignIds, ['k2'], 'calling a flow does not move or copy it into this campaign');
  assert.deepEqual(flow(S, 'Newborn first weeks').campaignIds, ['k1']);
});

test('a flow cannot call itself, call the same flow twice, or call a flow that already calls it (loops, also through other flows)', () => {
  const S = fresh();
  const a = S.createFlow('A', null).flow, b = S.createFlow('B', null).flow, c = S.createFlow('C', null).flow;
  assert.equal(S.callProblem(a.id, a.id).code, 'self');
  assert.ok(!S.addFlowNode(a.id, a.id).ok);
  assert.ok(S.addFlowNode(a.id, b.id).ok);
  assert.equal(S.callProblem(a.id, b.id).code, 'dup');
  assert.match(S.addFlowNode(a.id, b.id).error, /already called/);
  assert.equal(S.callProblem(b.id, a.id).code, 'loop');
  assert.match(S.addFlowNode(b.id, a.id).error, /loop/);
  assert.ok(S.addFlowNode(b.id, c.id).ok);
  assert.equal(S.callProblem(c.id, a.id).code, 'loop', 'A calls B calls C: C may not call A');
  assert.equal(S.callProblem(a.id, 'nope').code, 'missing');
});

test('changeNodeFlow re-points the node, keeps its edges, refuses loops and duplicates, and "no change"', () => {
  const S = fresh();
  const a = S.createFlow('A', null).flow, b = S.createFlow('B', null).flow, c = S.createFlow('C', null).flow;
  const n = S.addFlowNode(a.id, b.id).node, m = S.addFlowNode(a.id, c.id).node;
  const t = S.addTemplateNode(a.id, tpl(S, 'Welcome message').id).node;
  assert.ok(S.connect(a.id, n.id, null, t.id).ok);
  assert.equal(S.changeNodeFlow(a.id, n.id, b.id).error, 'No change');
  assert.match(S.changeNodeFlow(a.id, n.id, c.id).error, /already called/, 'another node of this flow calls C');
  const d = S.createFlow('D', null).flow;
  assert.ok(S.changeNodeFlow(a.id, n.id, d.id).ok);
  assert.equal(S.nodeTitle(S.getNode(S.getFlow(a.id), n.id)), 'D');
  assert.equal(S.getNode(S.getFlow(a.id), n.id).next, t.id, 'the edge stays');
  assert.equal(last(S, S.getFlow(a.id)).action, 'flow_call_changed');
  assert.ok(S.addFlowNode(d.id, S.createFlow('E', null).flow.id).ok);
  assert.match(S.changeNodeFlow(a.id, m.id, d.id).error, /already called/);
  assert.ok(!S.changeNodeFlow(d.id, S.getFlow(d.id).nodes[0].id, a.id).ok, 'D calls E; pointing that node at A would make A and D call each other');
  assert.ok(!S.changeNodeFlow(a.id, t.id, d.id).ok, 'not a flow node');
});

test('duplicating a flow keeps its flow-call nodes (they still call the same flows)', () => {
  const S = fresh();
  const a = S.createFlow('A', 'k1').flow, b = S.createFlow('B', 'k1').flow;
  const n = S.addFlowNode(a.id, b.id).node, t = S.addTemplateNode(a.id, tpl(S, 'Welcome message').id).node;
  S.connect(a.id, n.id, null, t.id);
  const copy = S.duplicateFlow(a.id, 'k3').flow;
  assert.deepEqual(edges(S, copy), ['B -> Welcome message']);
  assert.equal(copy.nodes.find(x => x.type === 'flow').flowId, b.id);
  assert.notEqual(copy.nodes[0].id, a.nodes[0].id, 'new node ids');
});

// ---------------------------------------------------------------- the timing is the flow's
test('a flow has one timing (dummy default); nodes carry none; setFlowTiming validates, ignores no-ops and logs', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  assert.deepEqual(f.timing, S.DEFAULT_TIMING);
  assert.ok(f.nodes.every(n => !('timing' in n)));
  assert.deepEqual(S.createFlow('New', null).flow.timing, { days: 7, when: 'before', ref: 'expected_date_of_delivery' });
  assert.equal(S.setFlowTiming(f.id, { days: 2, when: 'after', ref: 'date_of_birth' }).ok, true);
  assert.equal(S.timingText(f.timing), '2 days after date_of_birth');
  assert.deepEqual([last(S, f).action, last(S, f).before, last(S, f).after], ['flow_timing_edited', '7 days before expected_date_of_delivery', '2 days after date_of_birth']);
  assert.equal(S.setFlowTiming(f.id, { days: 2, when: 'after', ref: 'date_of_birth' }).error, 'No change');
  assert.match(S.setFlowTiming(f.id, { days: -1, when: 'after', ref: 'x' }).error, /0 to 999/);
  assert.match(S.setFlowTiming(f.id, { days: 1, when: 'later', ref: 'x' }).error, /before or after/i);
  assert.match(S.setFlowTiming(f.id, { days: 1, when: 'after', ref: 'not a name' }).error, /reference date is a name/);
  assert.equal(S.setFlowTiming('nope', S.DEFAULT_TIMING).error, 'Flow not found');
  assert.equal(S.timingText(f.timing), '2 days after date_of_birth', 'refused edits change nothing');
});

test('duplicating a flow copies its timing (independent afterwards); flows saved without a timing get the default', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  S.setFlowTiming(f.id, { days: 5, when: 'after', ref: 'date_of_birth' });
  const copy = S.duplicateFlow(f.id, 'k3').flow;
  assert.equal(S.timingText(copy.timing), '5 days after date_of_birth');
  S.setFlowTiming(copy.id, { days: 9, when: 'before', ref: 'x_date' });
  assert.equal(S.timingText(f.timing), '5 days after date_of_birth');
  const { S: S2 } = loadStore({ 'cms-prototype-v1': JSON.stringify({ nextId: 9, campaigns: [{ id: 'k1', name: 'A' }], contents: [], flows: [{ id: 'f1', name: 'Old', campaignIds: [], createdAt: 'x', nodes: [] }] }) });
  assert.deepEqual(S2.getFlow('f1').timing, { days: 7, when: 'before', ref: 'expected_date_of_delivery' });
});

// ---------------------------------------------------------------- placeholder values of a template node (per flow)
test('placeholderNames: the union over all languages (one name used in several languages is one value); nodeValues shows the template default as the fallback', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder'), w = tpl(S, 'Welcome message'), d = tpl(S, 'Daily health tip');
  assert.deepEqual(S.placeholderNames(a.id), ['date', 'time']);
  assert.deepEqual(S.placeholderNames(w.id), ['name']);
  assert.deepEqual(S.placeholderNames(d.id), []);
  const f = S.createFlow('Vals', null).flow, n = S.addTemplateNode(f.id, a.id).node;
  assert.deepEqual(S.nodeValues(n), [
    { name: 'date', value: '', def: 'Monday 12 December', overridden: false },
    { name: 'time', value: '', def: '10:30 AM', overridden: false }]);
});

test('updateTemplateNode saves values for this node only (the template and other flows keep the defaults); blank = default; logged', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder');
  const f = S.createFlow('One', null).flow, g = S.createFlow('Two', null).flow;
  const n = S.addTemplateNode(f.id, a.id).node, m = S.addTemplateNode(g.id, a.id).node;
  const before = JSON.stringify(a.translations);
  assert.equal(S.updateTemplateNode(f.id, n.id, { values: { date: ' Friday 3 March ', time: '' } }).ok, true);
  assert.deepEqual(n.values, { date: 'Friday 3 March' }, 'trimmed; blank is not stored');
  assert.deepEqual(S.nodeValues(n).map(v => [v.name, v.value, v.overridden]), [['date', 'Friday 3 March', true], ['time', '', false]]);
  assert.deepEqual(m.values, {}, 'another flow using the same template is unaffected');
  assert.equal(JSON.stringify(a.translations), before, 'the template itself is unchanged');
  assert.deepEqual([last(S, f).action, last(S, f).detail, last(S, f).before, last(S, f).after], ['flow_values_edited', 'Appointment reminder', '(template defaults)', 'date = Friday 3 March']);
  assert.equal(S.updateTemplateNode(f.id, n.id, { values: { date: 'Friday 3 March' } }).error, 'No change');
  assert.equal(S.updateTemplateNode(f.id, n.id, { values: {} }).ok, true, 'clearing goes back to the defaults');
  assert.deepEqual(n.values, {});
});

test('updateTemplateNode validates before changing anything: length, unknown names are ignored, one template per flow', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder'), w = tpl(S, 'Welcome message');
  const f = S.createFlow('One', null).flow, n = S.addTemplateNode(f.id, a.id).node;
  S.addTemplateNode(f.id, w.id);
  assert.match(S.updateTemplateNode(f.id, n.id, { values: { date: 'x'.repeat(201) } }).error, /200 characters/);
  assert.deepEqual(n.values, {});
  assert.equal(S.updateTemplateNode(f.id, n.id, { values: { date: 'x'.repeat(200), bogus: 'y' } }).ok, true);
  assert.deepEqual(Object.keys(n.values), ['date'], 'a name the template does not have is dropped');
  assert.match(S.updateTemplateNode(f.id, n.id, { templateId: w.id }).error, /already in this flow/);
  assert.equal(n.templateId, a.id);
  assert.match(S.updateTemplateNode(f.id, n.id, { templateId: 'nope' }).error, /not found/);
});

test('changing the template of a node (with values) saves both together; the old values do not carry over; duplicating a flow copies the values', () => {
  const S = fresh();
  const a = tpl(S, 'Appointment reminder'), w = tpl(S, 'Welcome message');
  const f = S.createFlow('One', 'k1').flow, n = S.addTemplateNode(f.id, a.id).node;
  S.updateTemplateNode(f.id, n.id, { values: { date: 'Friday' } });
  const copy = S.duplicateFlow(f.id, 'k3').flow;
  assert.deepEqual(copy.nodes[0].values, { date: 'Friday' });
  copy.nodes[0].values.date = 'changed';
  assert.deepEqual(n.values, { date: 'Friday' }, 'the copy is independent');
  assert.equal(S.updateTemplateNode(f.id, n.id, { templateId: w.id, values: { name: 'Asha' } }).ok, true);
  assert.deepEqual([n.templateId, n.values], [w.id, { name: 'Asha' }]);
  assert.equal(S.updateTemplateNode(f.id, n.id, { templateId: a.id }).ok, true);
  assert.deepEqual(n.values, {}, 'switching template alone starts with no values');
});

// ---------------------------------------------------------------- direction: left to right or top down
test('setFlowDirection: lr by default; switching swaps in that direction\'s own layout (auto layered the first time), and back restores the original', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  const pos = () => Object.fromEntries(f.nodes.map(n => [S.nodeTitle(n), [n.x, n.y]]));
  const lr = pos();
  assert.equal(S.flowDirection(f), 'lr');
  assert.equal(S.setFlowDirection(f.id, 'lr').error, 'No change');
  assert.match(S.setFlowDirection(f.id, 'diagonal').error, /left to right or top down/);
  assert.equal(S.setFlowDirection('nope', 'td').error, 'Flow not found');
  assert.equal(S.setFlowDirection(f.id, 'td').ok, true);
  const td = pos();
  assert.deepEqual([td['Input 1'], td['Welcome message'], td['Logic 1']], [[40, 40], [40, 260], [40, 480]], 'ranks follow the edges, top to bottom, in one column');
  assert.equal(td['Daily health tip'][1], 700);
  assert.equal(td['Alert health worker'][1], 700);
  assert.notEqual(td['Daily health tip'][0], td['Alert health worker'][0], 'siblings sit side by side');
  const moved = f.nodes[0];
  S.moveNode(f.id, moved.id, 500, 500);
  assert.equal(S.setFlowDirection(f.id, 'lr').ok, true);
  assert.deepEqual(pos(), lr, 'the left-to-right layout is exactly as it was');
  S.setFlowDirection(f.id, 'td');
  assert.deepEqual([moved.x, moved.y], [500, 500], 'and the top-down layout keeps what was moved in it');
  assert.equal(S.historyForFlow(f.id).filter(e => /direction/i.test(e.action)).length, 0, 'layout only: not a history event');
});

test('a duplicate keeps the direction and both layouts; new nodes in a top-down flow land on the grid', () => {
  const S = fresh();
  const f = flow(S, 'Newborn first weeks');
  S.setFlowDirection(f.id, 'td');
  const copy = S.duplicateFlow(f.id, 'k3').flow;
  assert.equal(S.flowDirection(copy), 'td');
  assert.deepEqual(copy.nodes.map(n => [n.x, n.y]), f.nodes.map(n => [n.x, n.y]));
  S.setFlowDirection(copy.id, 'lr');
  assert.deepEqual(copy.nodes.map(n => [n.x, n.y]).sort(), [[40, 40], [380, 40], [720, 40], [1100, 40], [1100, 260]].sort());
  const g = S.createFlow('New', null).flow;
  S.setFlowDirection(g.id, 'td');
  const n = S.addLogicNode(g.id).node;
  assert.deepEqual([n.x, n.y], [40, 40]);
});
