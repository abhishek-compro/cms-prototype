/*
 * store.js: data + rules. No DOM code here, so it can be tested in Node.
 * The UI (app.js) only reads state through Store.* and mutates it through Store.* operations.
 */
(function (root) {
  'use strict';

  // ---- Config ----------------------------------------------------------------
  var CURRENT_USER = 'Demo user'; // single user: every action in the history is recorded as this user
  var STORAGE_KEY = 'cms-prototype-v1';

  // Codes follow Turn.io / WhatsApp template language codes (see TURNIO_MESSAGES_API.md, Appendix B)
  var LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'kn', name: 'Kannada' },
    { code: 'mr', name: 'Marathi' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'bn', name: 'Bengali' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'pa', name: 'Punjabi' }
  ];

  var ACTION_LABELS = {
    content_created: 'Created content',
    renamed: 'Renamed content',
    language_added: 'Added translation',
    text_edited: 'Edited text',
    deployed: 'Published as template',
    blocked: 'Blocked template approval',
    unblocked: 'Allowed template approval',
    part_edited: 'Edited',
    header_type_changed: 'Changed header type',
    campaign_copied: 'Copied to campaign',
    campaign_moved: 'Moved to campaign',
    timing_edited: 'Changed timing',
    flow_created: 'Created flow',
    flow_renamed: 'Renamed flow',
    flow_step_added: 'Added a template',                 // older events (flows were a list before they were a graph)
    flow_step_removed: 'Removed a template',
    flow_steps_reordered: 'Reordered the templates',
    flow_node_added: 'Added a node',
    flow_node_removed: 'Removed a node',
    flow_node_changed: 'Changed a node\'s template',
    flow_call_changed: 'Changed the flow a node calls',
    flow_values_edited: 'Changed placeholder values',
    flow_edge_connected: 'Connected',
    flow_edge_disconnected: 'Disconnected',
    flow_out_added: 'Added an outgoing edge',
    flow_out_removed: 'Removed an outgoing edge',
    flow_out_renamed: 'Renamed an edge',
    flow_action_renamed: 'Renamed an action',
    flow_input_renamed: 'Renamed an input',
    flow_action_defined: 'Changed an action\'s definition',
    flow_timing_edited: 'Changed timing',
    flow_reordered: 'Moved in the flow list',
    flow_list_moved: 'Moved in the flow list',
    flow_copied: 'Copied to campaign',          // older events; now flow_referred
    flow_referred: 'Shared with campaign',
    flow_duplicated: 'Duplicated to campaign',
    flow_moved: 'Moved to campaign'
  };

  // ---- State -----------------------------------------------------------------
  // state = { nextId, campaigns: [Campaign], contents: [Content], flows: [Flow], history: [Event] }
  // Flow = { id, name, campaignIds, createdAt, nodes: [Node] }   a graph of nodes joined by edges
  //   Node = { id, type: 'template', templateId, next: nodeId|null, x, y }   one outgoing edge
  //        | { id, type: 'logic', title, outs: [{ id, label, to: nodeId|null }], x, y }   any number of outgoing edges, each named by its condition
  //        | { id, type: 'action', name, definition, next: nodeId|null, x, y }   a named action you define in words; one outgoing edge
  //        | { id, type: 'flow', flowId, next: nodeId|null, x, y }   calls another flow (enters it, then continues along its own edge); never itself, never a loop of calls
  //        | { id, type: 'input', title, next: nodeId|null, x, y }   a plain numbered node with nothing to fill in; edges can end at it and leave it like any other
  //   A template that is in no flow of a campaign is itself a flow there (implicit, not stored); its own timing is Content.timing: { days, when: 'before'|'after', ref }.
  // Campaign = { id, name, createdAt?, createdBy? }   (a content name can be in several campaigns via Content.campaignIds)
  // Content = { id, name, campaignIds: [campaignId], timing, headerType: 'none'|'image'|'video'|'document', blocked, deployCounter, createdAt, translations: [Translation] }
  // Translation = { lang, text, waName, deployedText, deployedSig, footer, header, defaults, buttons }
  //   text      = the body as authored, with NAMED placeholders {{name}}. This is a layer on top of WhatsApp's
  //               numbered placeholders: the WhatsApp body ({{1}} {{2}} ...) and the name -> positions map are derived.
  //   defaults  = { name: default value }            (extra_content.body_param_defaults[lang])
  //   header    = media id (TurnMedia uuid), only used when Content.headerType != 'none'   (extra_content.header[lang])
  //   buttons   = [{type:'QUICK_REPLY', text, default_payload} | {type:'URL', text, url, default_parameters}]
  //   footer    = plain text, no placeholders      (read by the orchestrator as extra_content.footer[lang])
  //   waName '' until published
  // Event = { id, ts, actor, contentId, contentName, lang|null, action, before, after, detail }
  var state = null;
  var clock = function () { return new Date(); };

  function fail(error) { return { ok: false, error: error }; }
  function langName(code) {
    for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].code === code) return LANGUAGES[i].name;
    return code;
  }

  // WhatsApp template names: lowercase letters, digits and underscores only
  function slugify(name) {
    return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // ---- Persistence (localStorage is optional; everything works in memory without it) -----
  function save() {
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      if (raw) { state = JSON.parse(raw); migrate(); return; }
    } catch (e) { /* ignore */ }
    seed();
  }

  // Data saved before campaigns existed: add the sample campaigns and file the sample content under them.
  // Anything else (e.g. content you created) stays without a campaign and shows under "All content" only.
  var SAMPLE_CAMPAIGNS = [
    { id: 'k1', name: 'Newborn care' },
    { id: 'k2', name: 'Postnatal check-ups' },
    { id: 'k3', name: 'Immunisation' }
  ];
  var SAMPLE_FILING = { 'Welcome message': 'k1', 'Daily health tip': 'k1', 'Appointment reminder': 'k2' };
  function migrate() {
    var changed = false;
    if (!state.campaigns) {
      state.campaigns = SAMPLE_CAMPAIGNS.map(function (c) { return { id: c.id, name: c.name }; });
      state.contents.forEach(function (c) {
        if (c.campaignIds === undefined && c.campaignId === undefined) c.campaignId = SAMPLE_FILING[c.name] || null;
      });
      changed = true;
    }
    // Older shape: a single `campaignId`. Now a content name can be in several campaigns: `campaignIds`.
    state.contents.forEach(function (c) {
      if (!Array.isArray(c.campaignIds)) { c.campaignIds = c.campaignId ? [c.campaignId] : []; changed = true; }
      if ('campaignId' in c) { delete c.campaignId; changed = true; }
    });
    if (!state.flows) { state.flows = []; changed = true; }
    state.flows.forEach(function (f) {          // flows used to be an ordered list of steps: now a chain of connected template nodes
      if (f.nodes) return;
      var steps = f.steps || [], ids = steps.map(function () { return 'n' + state.nextId++; });
      f.nodes = steps.map(function (st, i) {
        return { id: ids[i], type: 'template', templateId: st.templateId, next: ids[i + 1] || null, x: 40 + (i % 3) * 340, y: 40 + Math.floor(i / 3) * 260 };
      });
      delete f.steps;
      changed = true;
    });
    state.flows.forEach(function (f) {          // the timing is the flow's (dummy default); template nodes carry none; input nodes are plain
      if (!f.timing) { f.timing = cloneTiming(DEFAULT_TIMING); changed = true; }
      f.nodes.forEach(function (n) {
        if ('timing' in n) { delete n.timing; changed = true; }
        if (n.type === 'input' && ('name' in n || 'inputType' in n || 'description' in n)) {
          n.title = n.name || n.title || 'Input';
          delete n.name; delete n.inputType; delete n.description;
          changed = true;
        }
      });
    });
    state.contents.forEach(function (c) {
      if (!c.timing) { c.timing = cloneTiming(DEFAULT_TIMING); changed = true; }
      if (!c.headerType) { c.headerType = 'none'; changed = true; }
      c.translations.forEach(function (t) {
        if (t.footer === undefined) { t.footer = ''; changed = true; }
        if (t.header === undefined) { t.header = ''; changed = true; }
        if (!t.defaults) { t.defaults = {}; changed = true; }
        if (!t.buttons) { t.buttons = []; changed = true; }
      });
    });
    if (changed) save();
  }
  function reset() {
    try { root.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    seed();
  }

  // ---- Lookups ---------------------------------------------------------------
  function get(id) {
    for (var i = 0; i < state.contents.length; i++) if (state.contents[i].id === id) return state.contents[i];
    return null;
  }
  function getTr(content, lang) {
    for (var i = 0; i < content.translations.length; i++) if (content.translations[i].lang === lang) return content.translations[i];
    return null;
  }
  function list() { return state.contents; }
  function listCampaigns() { return state.campaigns; }
  function getCampaign(id) {
    for (var i = 0; i < state.campaigns.length; i++) if (state.campaigns[i].id === id) return state.campaigns[i];
    return null;
  }
  // campaignId null/undefined = everything; otherwise every content name that is in that campaign
  // Campaign names only need to be unique (case-insensitive); unlike content they do not become template names
  function createCampaign(name) {
    name = String(name || '').trim();
    if (!name) return fail('Campaign name is required');
    var lower = name.toLowerCase();
    for (var i = 0; i < state.campaigns.length; i++) {
      if (state.campaigns[i].name.toLowerCase() === lower) return fail('A campaign named "' + state.campaigns[i].name + '" already exists');
    }
    var max = 0;   // ids are k<number>; pick the next free one (sample campaigns already use k1..k3)
    state.campaigns.forEach(function (k) { var n = parseInt(String(k.id).slice(1), 10); if (n > max) max = n; });
    var k = { id: 'k' + (max + 1), name: name, createdAt: clock().toISOString(), createdBy: CURRENT_USER };
    state.campaigns.push(k);
    save();
    return { ok: true, campaign: k };
  }
  function contentsIn(campaignId) {
    return campaignId ? state.contents.filter(function (c) { return c.campaignIds.indexOf(campaignId) !== -1; }) : state.contents;
  }
  function slugOf(content) { return slugify(content.name); }

  // draft = never published | deployed = published and nothing changed | modified = body, header, footer, placeholders or buttons edited after last publish
  // NOTE: the UI says "Publish"; internal names (deploy*, deployed*) are kept because they are saved in localStorage
  function statusOf(tr, content) {
    if (!tr.waName) return 'draft';
    if (tr.deployedSig) return sigOf(content, tr) === tr.deployedSig ? 'deployed' : 'modified';
    return tr.text === tr.deployedText ? 'deployed' : 'modified';   // published before template parts existed
  }

  // ---- WhatsApp template parts: placeholders, header, buttons, footer -----------------
  // Mirrors the orchestrator's campaign/models.py (extra_content_schema, get_body_params_map,
  // validate_extra_content). Limits are the schema's; footer/body limits are WhatsApp's.
  var LIMITS = { body: 1024, footer: 60, buttonText: 25, payload: 800, urlMin: 10, urlMax: 1000, value: 200, quickReplies: 3, urlButtons: 1, uses: 5 };
  var HEADER_TYPES = [
    { id: 'none', label: 'None' }, { id: 'image', label: 'Image' }, { id: 'video', label: 'Video' }, { id: 'document', label: 'Document' }
  ];
  // Button limits are a product rule (stricter than the orchestrator's schema, which allows 10 buttons):
  // at most 3 quick replies and 1 URL button per translation.
  function buttonCounts(buttons) {
    var out = { quickReply: 0, url: 0 };
    (buttons || []).forEach(function (b) { if (b.type === 'URL') out.url++; else out.quickReply++; });
    return out;
  }
  function canAddButton(buttons, type) {
    var n = buttonCounts(buttons);
    return type === 'URL' ? n.url < LIMITS.urlButtons : n.quickReply < LIMITS.quickReplies;
  }

  // Same character set as the orchestrator's VARS_EXTRACT = [a-zA-Z1-9_] (note: no digit 0)
  var NAME_RE = '[a-zA-Z1-9_]+';
  function phRegex() { return new RegExp('\\{\\{(' + NAME_RE + ')\\}\\}', 'g'); }

  function occurrences(text) {                       // placeholder names in order, one entry per occurrence
    var re = phRegex(), out = [], m;
    while ((m = re.exec(text || ''))) out.push(m[1]);
    return out;
  }
  function positionsOf(text) {                       // { name: [1-based positions] }  == get_body_params_map
    var map = {};
    occurrences(text).forEach(function (n, i) { (map[n] = map[n] || []).push(i + 1); });
    return map;
  }
  function whatsappBody(text) {                      // {{name}} -> {{1}}, {{2}}, ... (every occurrence gets the next number)
    var i = 0;
    return String(text || '').replace(phRegex(), function () { i++; return '{{' + i + '}}'; });
  }
  function invalidPlaceholders(text) {               // {{...}} that the pattern above does not accept
    var re = /\{\{([^{}]*)\}\}/g, ok = new RegExp('^' + NAME_RE + '$'), out = [], m;
    while ((m = re.exec(text || ''))) if (!ok.test(m[1]) && out.indexOf(m[0]) === -1) out.push(m[0]);
    return out;
  }

  // Rename a placeholder everywhere it is used in `text` (a body or a button URL) and carry its default over.
  // Renaming to a name that is already used MERGES them: that one name then fills several WhatsApp positions
  // (the existing default wins, unless it is empty). Only whole placeholders are touched ({{name}}, not {{names}}).
  function renamePlaceholder(text, defaults, from, to) {
    to = String(to == null ? '' : to).trim();
    var names = positionsOf(text);
    if (!(from in names)) return { ok: false, error: '{{' + from + '}} is not in the text' };
    if (!new RegExp('^' + NAME_RE + '$').test(to)) return { ok: false, error: 'A name can use letters, digits 1-9 and _ only' };
    if (to === from) return { ok: true, changed: false, merged: false, text: text, defaults: normDefaults(text, defaults) };
    var merged = to in names;
    var next = String(text).replace(phRegex(), function (m, n) { return n === from ? '{{' + to + '}}' : m; });
    var d = normDefaults(text, defaults), carried = d[from];
    delete d[from];
    if (merged) { if (!d[to]) d[to] = carried; } else d[to] = carried;
    return { ok: true, changed: true, merged: merged, text: next, defaults: normDefaults(next, d) };
  }

  function newButton(type) {
    return type === 'URL'
      ? { type: 'URL', text: '', url: '', default_parameters: {} }
      : { type: 'QUICK_REPLY', text: '', default_payload: '' };
  }
  function partsOf(tr) {                             // a read-only view of what the editor edits (shares references)
    return { text: tr.text, footer: tr.footer || '', header: tr.header || '', defaults: tr.defaults || {}, buttons: tr.buttons || [] };
  }
  function cloneParts(p) { return JSON.parse(JSON.stringify(p)); }

  function normDefaults(text, defaults) {            // { name: value } for exactly the names used in text, in order
    var out = {};
    Object.keys(positionsOf(text)).forEach(function (n) { out[n] = (defaults && defaults[n]) || ''; });
    return out;
  }
  function normButtons(buttons) {                    // the extra_content.buttons[lang] entries
    return (buttons || []).map(function (b) {
      if (b.type === 'URL') {
        return { type: 'URL', text: b.text || '', url: b.url || '', default_parameters: normDefaults(b.url, b.default_parameters), parameter_positions: positionsOf(b.url) };
      }
      return { type: 'QUICK_REPLY', text: b.text || '', default_payload: b.default_payload || '' };
    });
  }
  function partsSig(p) {                             // equal signatures = equal template content
    return JSON.stringify([p.text, p.footer || '', p.header || '', normDefaults(p.text, p.defaults), normButtons(p.buttons)]);
  }
  function sigOf(content, tr) { return JSON.stringify([content.headerType, partsSig(partsOf(tr))]); }

  function describeDefaults(p) {
    var d = normDefaults(p.text, p.defaults);
    return Object.keys(d).map(function (n) { return n + ' = ' + d[n]; }).join('\n');
  }
  function describeButtons(p) {
    return normButtons(p.buttons).map(function (b, i) {
      return (i + 1) + '. ' + (b.type === 'URL' ? 'URL' : 'Quick reply') + ' "' + b.text + '" → ' + (b.type === 'URL' ? b.url : b.default_payload) +
        (b.type === 'URL' && Object.keys(b.default_parameters).length ? ' (' + Object.keys(b.default_parameters).map(function (n) { return n + ' = ' + b.default_parameters[n]; }).join(', ') + ')' : '');
    }).join('\n');
  }

  function isUrl(url) {
    try { var u = new URL(url.replace(/\{\{[^{}]*\}\}/g, 'x')); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; }
  }

  // Everything wrong with a translation's template parts, as [{part, message}] (empty = valid).
  function problems(content, parts) {
    var out = [];
    function add(part, message, code) { out.push({ part: part, message: message, code: code }); }
    var text = parts.text || '';

    if (!text.trim()) add('Body', 'Body is required', 'empty');   // the editor does not nag about an empty new translation
    if (text.length > LIMITS.body) add('Body', 'Body is ' + text.length + ' characters; WhatsApp allows ' + LIMITS.body);
    invalidPlaceholders(text).forEach(function (p) { add('Body', p + ' is not a valid placeholder (use letters, digits 1-9 and _)'); });

    var pos = positionsOf(text);
    Object.keys(pos).forEach(function (n) {
      var d = (parts.defaults || {})[n] || '';
      if (pos[n].length > LIMITS.uses) add('Placeholders', '{{' + n + '}} is used ' + pos[n].length + ' times; the maximum is ' + LIMITS.uses);
      if (!d.length) add('Placeholders', '{{' + n + '}} needs a default value');
      else if (d.length > LIMITS.value) add('Placeholders', '{{' + n + '}} default is ' + d.length + ' characters; the maximum is ' + LIMITS.value);
    });

    var footer = parts.footer || '';
    if (footer.length > LIMITS.footer) add('Footer', 'Footer is ' + footer.length + ' characters; WhatsApp allows ' + LIMITS.footer);
    if (footer.indexOf('{{') !== -1) add('Footer', 'Footer cannot contain placeholders');

    var buttons = parts.buttons || [];
    var counts = buttonCounts(buttons);
    if (counts.quickReply > LIMITS.quickReplies) add('Buttons', 'At most ' + LIMITS.quickReplies + ' quick reply buttons (there are ' + counts.quickReply + ')');
    if (counts.url > LIMITS.urlButtons) add('Buttons', 'At most ' + LIMITS.urlButtons + ' URL button (there are ' + counts.url + ')');
    buttons.forEach(function (b, i) {
      var who = 'Button ' + (i + 1);
      var t = b.text || '';
      if (!t.length) add('Buttons', who + ' needs text');
      else if (t.length > LIMITS.buttonText) add('Buttons', who + ' text is ' + t.length + ' characters; the maximum is ' + LIMITS.buttonText);
      if (b.type === 'URL') {
        var url = b.url || '';
        if (!url.length) add('Buttons', who + ' needs a URL');
        else {
          if (url.length < LIMITS.urlMin || url.length > LIMITS.urlMax) add('Buttons', who + ' URL must be ' + LIMITS.urlMin + '-' + LIMITS.urlMax + ' characters');
          if (!isUrl(url)) add('Buttons', who + ' URL must be a valid http:// or https:// address');
        }
        invalidPlaceholders(url).forEach(function (p) { add('Buttons', who + ' URL has an invalid placeholder ' + p); });
        var upos = positionsOf(url);
        Object.keys(upos).forEach(function (n) {
          var d = (b.default_parameters || {})[n] || '';
          if (upos[n].length > LIMITS.uses) add('Buttons', who + ' {{' + n + '}} is used ' + upos[n].length + ' times; the maximum is ' + LIMITS.uses);
          if (!d.length) add('Buttons', who + ' {{' + n + '}} needs a default value');
          else if (d.length > LIMITS.value) add('Buttons', who + ' {{' + n + '}} default is over ' + LIMITS.value + ' characters');
        });
      } else {
        var pl = b.default_payload || '';
        if (!pl.length) add('Buttons', who + ' needs a default payload');
        else if (pl.length > LIMITS.payload) add('Buttons', who + ' payload is ' + pl.length + ' characters; the maximum is ' + LIMITS.payload);
      }
    });
    return out;
  }

  function historyFor(contentId, lang) {
    return state.history.filter(function (e) {
      if (e.contentId !== contentId) return false;
      if (lang === 'content') return e.lang === null; // name-level events only (create, rename, block)
      return !lang || lang === 'all' ? true : e.lang === lang;
    }).sort(function (a, b) { return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.id - a.id; });
  }

  function log(content, lang, action, extra) {
    var e = {
      id: state.nextId++,
      ts: clock().toISOString(),
      actor: CURRENT_USER,
      contentId: content.id,
      contentName: content.name,
      lang: lang || null,
      action: action,
      before: null,
      after: null,
      detail: null
    };
    for (var k in extra) e[k] = extra[k];
    state.history.push(e);
  }

  // ---- Operations ------------------------------------------------------------
  function validateName(name, exceptId) {
    name = String(name || '').trim();
    if (!name) return 'Name is required';
    var slug = slugify(name);
    if (!slug) return 'Name needs at least one letter (a-z) or digit, because the template name is derived from it';
    for (var i = 0; i < state.contents.length; i++) {
      var c = state.contents[i];
      if (c.id === exceptId) continue;
      if (slugify(c.name) === slug) return 'Another content ("' + c.name + '") already maps to the template name "' + slug + '"';
    }
    return null;
  }

  function newTranslation(lang, text) {
    return { lang: lang, text: text || '', waName: '', deployedText: null, footer: '', header: '', defaults: {}, buttons: [] };
  }

  function createContent(name, firstLang, campaignId) {
    var err = validateName(name);
    if (err) return fail(err);
    var c = {
      id: 'c' + state.nextId++,
      name: String(name).trim(),
      campaignIds: campaignId && getCampaign(campaignId) ? [campaignId] : [],
      headerType: 'none',
      timing: cloneTiming(DEFAULT_TIMING),
      blocked: false,
      deployCounter: 0,
      createdAt: clock().toISOString(),
      translations: [newTranslation(firstLang || 'en', '')]
    };
    state.contents.push(c);
    log(c, null, 'content_created', { after: c.name });
    save();
    return { ok: true, content: c };
  }

  function renameContent(id, name) {
    var c = get(id);
    if (!c) return fail('Content not found');
    name = String(name || '').trim();
    if (name === c.name) return fail('Name unchanged');
    var err = validateName(name, id);
    if (err) return fail(err);
    var before = c.name;
    c.name = name;
    log(c, null, 'renamed', { before: before, after: name });
    save();
    return { ok: true };
  }

  function addTranslation(id, lang, text) {
    var c = get(id);
    if (!c) return fail('Content not found');
    if (getTr(c, lang)) return fail(langName(lang) + ' already exists');
    text = text || '';
    c.translations.push(newTranslation(lang, text));
    log(c, lang, 'language_added', { after: text });
    save();
    return { ok: true };
  }

  // Saves every editable part of one translation. Unused defaults are dropped (placeholders that are no longer in
  // the body / URL). One history event per part that changed, so each shows its own before/after.
  function saveParts(id, lang, parts) {
    var c = get(id);
    if (!c) return fail('Content not found');
    var tr = getTr(c, lang);
    if (!tr) return fail('Translation not found');

    var next = cloneParts(parts);
    next.footer = next.footer || '';
    next.header = next.header || '';
    next.defaults = normDefaults(next.text, next.defaults);
    next.buttons = (next.buttons || []).map(function (b) {
      return b.type === 'URL'
        ? { type: 'URL', text: b.text || '', url: b.url || '', default_parameters: normDefaults(b.url, b.default_parameters) }
        : { type: 'QUICK_REPLY', text: b.text || '', default_payload: b.default_payload || '' };
    });
    var prev = partsOf(tr);

    var changed = [];
    if (prev.text !== next.text) changed.push(['text_edited', null, prev.text, next.text]);
    if (prev.footer !== next.footer) changed.push(['part_edited', 'Footer', prev.footer, next.footer]);
    if (prev.header !== next.header) changed.push(['part_edited', 'Header', prev.header, next.header]);
    if (describeDefaults(prev) !== describeDefaults(next)) changed.push(['part_edited', 'Placeholders', describeDefaults(prev), describeDefaults(next)]);
    if (describeButtons(prev) !== describeButtons(next) || JSON.stringify(normButtons(prev.buttons)) !== JSON.stringify(normButtons(next.buttons))) {
      changed.push(['part_edited', 'Buttons', describeButtons(prev), describeButtons(next)]);
    }
    if (!changed.length) return fail('No changes to save');

    tr.text = next.text; tr.footer = next.footer; tr.header = next.header; tr.defaults = next.defaults; tr.buttons = next.buttons;
    changed.forEach(function (ch) { log(c, lang, ch[0], { detail: ch[1], before: ch[2], after: ch[3] }); });
    save();
    return { ok: true };
  }

  // Header type is one per template (the orchestrator's ref_type), so it is set on the name, not per language
  function setHeaderType(id, type) {
    var c = get(id);
    if (!c) return fail('Content not found');
    var found = HEADER_TYPES.filter(function (h) { return h.id === type; })[0];
    if (!found) return fail('Unknown header type');
    if (c.headerType === type) return fail('No change');
    var before = HEADER_TYPES.filter(function (h) { return h.id === c.headerType; })[0];
    c.headerType = type;
    log(c, null, 'header_type_changed', { before: before ? before.label : null, after: found.label });
    save();
    return { ok: true };
  }

  // A name that already has a published template (any language) can no longer be blocked
  function isDeployed(content) {
    return content.translations.some(function (t) { return !!t.waName; });
  }
  function blockProblem(content) {
    return !content.blocked && isDeployed(content)
      ? 'Cannot block template approval: this name is already published as a template'
      : null;
  }

  function setBlocked(id, blocked) {
    var c = get(id);
    if (!c) return fail('Content not found');
    if (c.blocked === !!blocked) return fail('No change');
    if (blocked && isDeployed(c)) return fail(blockProblem(c));
    c.blocked = !!blocked;
    log(c, null, blocked ? 'blocked' : 'unblocked', {});
    save();
    return { ok: true };
  }

  function canDeploy(content, tr) {
    if (content.blocked) return 'Template approval is blocked for this content';
    if (!tr.text.trim()) return 'Text is empty';
    var bad = problems(content, partsOf(tr));
    if (bad.length) return bad.length + ' problem' + (bad.length === 1 ? '' : 's') + ' to fix before publishing';
    if (statusOf(tr, content) === 'deployed') return 'Already published, no changes since';
    return null;
  }

  // Fake publish: assigns "<slug>_v<n>" as wa_template_name. n is a per-content counter that goes
  // up by one for every publish action, so "Publish all" gives all languages the same name.
  function deployMany(content, translations) {
    content.deployCounter++;
    var name = slugOf(content) + '_v' + content.deployCounter;
    translations.forEach(function (tr) {
      tr.waName = name;
      tr.deployedText = tr.text;
      tr.deployedSig = sigOf(content, tr);
      log(content, tr.lang, 'deployed', { after: tr.text, detail: name });
    });
    save();
    return name;
  }

  function deploy(id, lang) {
    var c = get(id);
    if (!c) return fail('Content not found');
    var tr = getTr(c, lang);
    if (!tr) return fail('Translation not found');
    var why = canDeploy(c, tr);
    if (why) return fail(why);
    return { ok: true, waName: deployMany(c, [tr]), count: 1 };
  }

  function deployAll(id) {
    var c = get(id);
    if (!c) return fail('Content not found');
    if (c.blocked) return fail('Template approval is blocked for this content');
    var targets = c.translations.filter(function (tr) { return !canDeploy(c, tr); });
    if (!targets.length) return fail('Nothing to publish: every translation is empty, has problems or is already published');
    return { ok: true, waName: deployMany(c, targets), count: targets.length };
  }

  // ---- Campaigns: copy / move (drag a content name onto a campaign) ----------------
  // A content name can be in several campaigns (it is the same template, not a duplicate).
  //  copy = add it to the target and keep its current campaigns
  //  move = take it out of its one campaign and put it in the target. If more than one campaign owns it
  //         there is no single place to move it from, so move is refused ("Can't move").
  function campaignName(id) { var k = getCampaign(id); return k ? k.name : id; }

  function planDrop(contentId, targetId) {
    var c = get(contentId), target = getCampaign(targetId);
    if (!c || !target) return null;
    var M = c.campaignIds.slice();
    var inTarget = M.indexOf(targetId) !== -1;
    var plan = { existsIn: M.slice(), inTarget: inTarget, copy: { ok: true }, move: { ok: true, from: M.slice() } };

    if (inTarget) plan.copy = { ok: false, reason: 'Already in ' + target.name };
    else plan.copy.result = M.concat(targetId);

    if (M.length > 1) {
      plan.move = { ok: false, from: [], label: "Can't move",
        reason: 'It is in ' + M.length + ' campaigns (' + M.map(campaignName).join(', ') + '), so there is no single place to move it from. Copy it instead.' };
    } else if (inTarget) {                       // exactly one campaign and it is the target
      plan.move = { ok: false, from: M.slice(), reason: 'Already in ' + target.name };
    } else {
      plan.move.result = [targetId];
    }
    return plan;
  }

  function copyToCampaign(contentId, targetId) {
    var plan = planDrop(contentId, targetId);
    if (!plan) return fail('Content or campaign not found');
    if (!plan.copy.ok) return fail(plan.copy.reason);
    var c = get(contentId);
    c.campaignIds = plan.copy.result;
    log(c, null, 'campaign_copied', { after: campaignName(targetId), detail: targetId });
    save();
    return { ok: true };
  }

  function moveToCampaign(contentId, targetId) {
    var plan = planDrop(contentId, targetId);
    if (!plan) return fail('Content or campaign not found');
    if (!plan.move.ok) return fail(plan.move.reason);
    var c = get(contentId);
    c.campaignIds = plan.move.result;
    log(c, null, 'campaign_moved', { before: plan.move.from.map(campaignName).join(', ') || null, after: campaignName(targetId), detail: targetId });
    save();
    return { ok: true };
  }

  // The orchestrator's extra_content for a name: every key per language (lang code -> value), exactly the shape
  // validate_extra_content expects. `footer` is not in the orchestrator's schema yet (its code reads
  // extra_content["footer"][lang] but marks it FIXME), so it is included only for languages that have one.
  function toExtraContent(id) {
    var c = get(id);
    if (!c) return null;
    var out = { header: {}, body_param_defaults: {}, body_param_positions: {}, buttons: {} };
    var footers = {};
    c.translations.forEach(function (t) {
      var p = partsOf(t);
      if (c.headerType !== 'none') out.header[t.lang] = p.header;
      out.body_param_defaults[t.lang] = normDefaults(p.text, p.defaults);
      out.body_param_positions[t.lang] = positionsOf(p.text);
      out.buttons[t.lang] = normButtons(p.buttons);
      if (p.footer) footers[t.lang] = p.footer;
    });
    if (Object.keys(footers).length) out.footer = footers;
    return out;
  }

  // ---- Flows -------------------------------------------------------------------------
  // A flow is a graph. Template nodes (a template, sent "<days> days before/after <reference date>") and logic nodes
  // (branch on a condition) are joined by edges. A template node has one outgoing edge; a logic node has any number,
  // each named by its condition. Edges may not make a loop. The numbers and reference date are dummy until edited.
  var DEFAULT_TIMING = { days: 7, when: 'before', ref: 'expected_date_of_delivery' };
  var REF_DATES = ['expected_date_of_delivery', 'date_of_birth', 'registration_date', 'discharge_date'];   // suggestions only
  var EDGE_LABEL_MAX = 40;

  function cloneTiming(t) { return { days: t.days, when: t.when, ref: t.ref }; }
  function checkTiming(t) {
    if (!t || typeof t.days !== 'number' || t.days % 1 !== 0 || t.days < 0 || t.days > 999) return 'Days must be a whole number from 0 to 999';
    if (t.when !== 'before' && t.when !== 'after') return 'Choose before or after';
    if (!/^[a-z][a-z0-9_]*$/.test(t.ref || '')) return 'The reference date is a name like expected_date_of_delivery (lowercase letters, digits and _)';
    return null;
  }
  function timingText(t) {
    return t.days === 0 ? 'on ' + t.ref : t.days + ' day' + (t.days === 1 ? '' : 's') + ' ' + t.when + ' ' + t.ref;
  }
  function sameTiming(a, b) { return a.days === b.days && a.when === b.when && a.ref === b.ref; }

  function getFlow(id) {
    for (var i = 0; i < state.flows.length; i++) if (state.flows[i].id === id) return state.flows[i];
    return null;
  }
  function listFlows() { return state.flows; }
  function flowsIn(campaignId) {            // in list order; null = every flow
    return campaignId ? state.flows.filter(function (f) { return f.campaignIds.indexOf(campaignId) !== -1; }) : state.flows;
  }
  function getNode(f, id) {
    for (var i = 0; i < f.nodes.length; i++) if (f.nodes[i].id === id) return f.nodes[i];
    return null;
  }
  function templateNodes(f) { return f.nodes.filter(function (n) { return n.type === 'template'; }); }
  function flowTemplateIds(f) { return templateNodes(f).map(function (n) { return n.templateId; }); }
  function nodeTitle(n) {
    if (n.type === 'template') return tplName(n.templateId);
    if (n.type === 'flow') { var g = getFlow(n.flowId); return g ? g.name : n.flowId; }   // the called flow's name, so it follows a rename
    return n.type === 'action' ? n.name : n.title;
  }   // action nodes are named by you; logic and input nodes are numbered
  function targetsOf(n) {
    return n.type === 'logic' ? n.outs.map(function (o) { return o.to; }).filter(Boolean) : (n.next ? [n.next] : []);
  }
  function flowsIncluding(templateId, campaignId) {
    return flowsIn(campaignId).filter(function (f) { return flowTemplateIds(f).indexOf(templateId) !== -1; });
  }
  // A template is itself a flow in a campaign when no flow of that campaign includes it. "All content" (null)
  // shows it when that is true in any of its campaigns (or it has none and no flow includes it).
  function isImplicit(c, campaignId) {
    if (campaignId) return c.campaignIds.indexOf(campaignId) !== -1 && !flowsIncluding(c.id, campaignId).length;
    if (!c.campaignIds.length) return !flowsIncluding(c.id, null).length;
    return c.campaignIds.some(function (k) { return !flowsIncluding(c.id, k).length; });
  }
  // What the Flows tab lists: the flows you created (in your order), then the templates that are flows by themselves
  function flowItems(campaignId) {
    var items = flowsIn(campaignId).map(function (f) { return { kind: 'flow', flow: f }; });
    state.contents.forEach(function (c) { if (isImplicit(c, campaignId)) items.push({ kind: 'template', content: c }); });
    var order = state.flowOrder || [];
    items.forEach(function (it, i) {      // the shared order wins; anything not in it yet keeps its default place (flows, then templates) after
      var k = itemKey(it.kind, it.kind === 'flow' ? it.flow.id : it.content.id), at = order.indexOf(k);
      it.rank = at === -1 ? 1e6 + i : at;
    });
    items.sort(function (a, b) { return a.rank - b.rank; });
    return items.map(function (it) { delete it.rank; return it; });
  }
  function itemKey(kind, id) { return (kind === 'flow' ? 'f:' : 't:') + id; }

  function logFlow(f, action, extra) {
    var e = { id: state.nextId++, ts: clock().toISOString(), actor: CURRENT_USER, flowId: f.id, contentId: null, contentName: f.name, lang: null, action: action, before: null, after: null, detail: null };
    for (var k in extra) e[k] = extra[k];
    state.history.push(e);
  }
  function historyForFlow(flowId) {
    return state.history.filter(function (e) { return e.flowId === flowId; })
      .sort(function (a, b) { return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.id - a.id; });
  }
  function tplName(id) { var c = get(id); return c ? c.name : id; }

  function validateFlowName(name, exceptId) {
    name = String(name || '').trim();
    if (!name) return 'Name is required';
    var lower = name.toLowerCase();
    for (var i = 0; i < state.flows.length; i++) {
      if (state.flows[i].id !== exceptId && state.flows[i].name.toLowerCase() === lower) return 'A flow named "' + state.flows[i].name + '" already exists';
    }
    for (var j = 0; j < state.contents.length; j++) {
      if (state.contents[j].name.toLowerCase() === lower) return 'A template is already called "' + state.contents[j].name + '" (templates that are not in a flow are listed as flows too)';
    }
    return null;
  }

  function createFlow(name, campaignId) {
    var err = validateFlowName(name);
    if (err) return fail(err);
    var f = { id: 'f' + state.nextId++, name: String(name).trim(), campaignIds: campaignId && getCampaign(campaignId) ? [campaignId] : [], createdAt: clock().toISOString(), timing: cloneTiming(DEFAULT_TIMING), nodes: [] };
    state.flows.push(f);
    logFlow(f, 'flow_created', { after: f.name });
    save();
    return { ok: true, flow: f };
  }

  function renameFlow(id, name) {
    var f = getFlow(id);
    if (!f) return fail('Flow not found');
    name = String(name || '').trim();
    if (name === f.name) return fail('Name unchanged');
    var err = validateFlowName(name, id);
    if (err) return fail(err);
    var before = f.name;
    f.name = name;
    logFlow(f, 'flow_renamed', { before: before, after: name });
    save();
    return { ok: true };
  }

  // ---- nodes --------------------------------------------------------------------------
  // A new node takes the first free slot of a three-column grid, so it never lands on top of an existing (or moved) node
  function nextPosition(f) {
    for (var i = 0; ; i++) {
      var x = 40 + (i % 3) * 340, y = 40 + Math.floor(i / 3) * 260;
      var taken = f.nodes.some(function (n) { return Math.abs(n.x - x) < 300 && Math.abs(n.y - y) < 220; });   // nodes are ~270 x 120-200 px
      if (!taken) return { x: x, y: y };
    }
  }

  // A template joining a flow also joins the flow's campaigns, so a campaign always holds what its flows use
  function joinFlowCampaigns(f, c) {
    f.campaignIds.forEach(function (k) {
      if (c.campaignIds.indexOf(k) === -1) { c.campaignIds.push(k); log(c, null, 'campaign_copied', { after: campaignName(k), detail: k }); }
    });
  }

  // A template appears once per flow. (Template nodes carry no timing; only a template that is a flow by itself has one.)
  function addTemplateNode(flowId, templateId) {
    var f = getFlow(flowId), c = get(templateId);
    if (!f) return fail('Flow not found');
    if (!c) return fail('Template not found');
    if (flowTemplateIds(f).indexOf(templateId) !== -1) return fail('"' + c.name + '" is already in this flow');
    var p = nextPosition(f);
    var node = { id: 'n' + state.nextId++, type: 'template', templateId: templateId, values: {}, next: null, x: p.x, y: p.y };
    f.nodes.push(node);
    logFlow(f, 'flow_node_added', { after: c.name, detail: 'Template' });
    save();
    return { ok: true, node: node };
  }

  // Point a template node at a different template. Its edges stay; a template can still only be in a flow once.
  // The old template is no longer used by this flow (so it may become a flow by itself in its campaign again).
  function changeNodeTemplate(flowId, nodeId, templateId) {
    var f = getFlow(flowId), node = f && getNode(f, nodeId), c = get(templateId);
    if (!node || node.type !== 'template') return fail('Template node not found');
    if (!c) return fail('Template not found');
    if (node.templateId === templateId) return fail('No change');
    if (flowTemplateIds(f).indexOf(templateId) !== -1) return fail('"' + c.name + '" is already in this flow');
    var before = tplName(node.templateId);
    node.templateId = templateId;
    node.values = {};                    // values were for the old template's placeholders
    logFlow(f, 'flow_node_changed', { before: before, after: c.name });
    save();
    return { ok: true };
  }

  // ---- placeholder values of a template node: per flow, over the template's own defaults ----------------------------
  // A template can be used in several flows with different values. The names are the union of the placeholder names of
  // all its languages (a name used in several languages is one value). A blank value means "use the template's default".
  function placeholderNames(contentId) {
    var c = get(contentId), names = [];
    if (!c) return names;
    c.translations.forEach(function (t) { occurrences(t.text).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); }); });
    return names;
  }
  function templateDefault(contentId, name) {        // the template's own default for a name: the first language that has one
    var c = get(contentId), v = '';
    if (c) c.translations.some(function (t) { var d = t.defaults && t.defaults[name]; if (d) { v = d; return true; } return false; });
    return v;
  }
  // [{name, value (this flow's, '' = none), def (the template's), overridden}] for the node's template; stale names are ignored
  function nodeValues(node) {
    var own = node.values || {};
    return placeholderNames(node.templateId).map(function (n) {
      return { name: n, value: own[n] || '', def: templateDefault(node.templateId, n), overridden: !!own[n] };
    });
  }
  function cleanValues(templateId, values) {         // -> {ok, values} with only this template's names and non-blank values, or an error
    var names = placeholderNames(templateId), out = {};
    for (var i = 0; i < names.length; i++) {
      var v = values && values[names[i]] != null ? String(values[names[i]]).trim() : '';
      if (!v) continue;
      if (v.length > LIMITS.value) return { error: 'Keep the value of {{' + names[i] + '}} to ' + LIMITS.value + ' characters' };
      out[names[i]] = v;
    }
    return { ok: true, values: out };
  }
  function valuesText(node, values) {                // "name = value, ..." for history
    var parts = Object.keys(values || {}).map(function (k) { return k + ' = ' + values[k]; });
    return parts.length ? parts.join(', ') : '(template defaults)';
  }
  // Save a template node in one go: its template and its placeholder values (both optional). Atomic: nothing changes
  // unless everything is valid.
  function updateTemplateNode(flowId, nodeId, change) {
    var f = getFlow(flowId), node = f && getNode(f, nodeId);
    if (!node || node.type !== 'template') return fail('Template node not found');
    var templateId = change.templateId || node.templateId, c = get(templateId);
    if (!c) return fail('Template not found');
    var tplChanged = templateId !== node.templateId;
    if (tplChanged && flowTemplateIds(f).indexOf(templateId) !== -1) return fail('"' + c.name + '" is already in this flow');
    var cleaned = cleanValues(templateId, change.values === undefined ? (tplChanged ? {} : node.values) : change.values);
    if (!cleaned.ok) return fail(cleaned.error);
    var oldValues = {}; nodeValues(node).forEach(function (v) { if (v.overridden) oldValues[v.name] = v.value; });
    var valuesChanged = JSON.stringify(sortedObj(oldValues)) !== JSON.stringify(sortedObj(cleaned.values));
    if (!tplChanged && !valuesChanged) return fail('No change');
    if (tplChanged) {
      var before = tplName(node.templateId);
      node.templateId = templateId;
      logFlow(f, 'flow_node_changed', { before: before, after: c.name });
    }
    node.values = cleaned.values;
    if (valuesChanged && !(tplChanged && !Object.keys(cleaned.values).length)) {     // (a template switch alone already says so)
      logFlow(f, 'flow_values_edited', { before: tplChanged ? '(new template)' : valuesText(node, oldValues), after: valuesText(node, cleaned.values), detail: c.name });
    }
    save();
    return { ok: true };
  }
  function sortedObj(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }

  // ---- flow nodes: enter / call another flow -------------------------------------------------
  function callsFlow(from, targetId, seen) {     // does `from` call the flow `targetId`, directly or through other flows?
    seen = seen || {};
    if (!from || seen[from.id]) return false;
    seen[from.id] = true;
    return from.nodes.some(function (n) { return n.type === 'flow' && !!n.flowId && (n.flowId === targetId || callsFlow(getFlow(n.flowId), targetId, seen)); });
  }
  // Why flow `f` cannot call flow `g` (from a node, or a new one), or null. exceptNodeId = the node being changed.
  function callProblem(flowId, calledId, exceptNodeId) {
    var f = getFlow(flowId), g = getFlow(calledId);
    if (!f || !g) return { code: 'missing', message: 'Flow not found' };
    if (f.id === g.id) return { code: 'self', message: 'A flow cannot call itself' };
    if (f.nodes.some(function (n) { return n.type === 'flow' && n.flowId === g.id && n.id !== exceptNodeId; })) return { code: 'dup', message: '"' + g.name + '" is already called in this flow' };
    if (callsFlow(g, f.id)) return { code: 'loop', message: '"' + g.name + '" already calls "' + f.name + '" (directly or through other flows), so this would make them call each other in a loop' };
    return null;
  }

  // The called flow may be in any campaign; calling it does not move or copy it
  function addFlowNode(flowId, calledId) {
    var f = getFlow(flowId), g = getFlow(calledId);
    if (!f) return fail('Flow not found');
    if (!g) return fail('Flow to call not found');
    var bad = callProblem(flowId, calledId);
    if (bad) return fail(bad.message);
    var p = nextPosition(f);
    var node = { id: 'n' + state.nextId++, type: 'flow', flowId: calledId, next: null, x: p.x, y: p.y };
    f.nodes.push(node);
    logFlow(f, 'flow_node_added', { after: g.name, detail: 'Flow call' });
    save();
    return { ok: true, node: node };
  }

  function changeNodeFlow(flowId, nodeId, calledId) {
    var f = getFlow(flowId), node = f && getNode(f, nodeId), g = getFlow(calledId);
    if (!node || node.type !== 'flow') return fail('Flow node not found');
    if (!g) return fail('Flow to call not found');
    if (node.flowId === calledId) return fail('No change');
    var bad = callProblem(flowId, calledId, nodeId);
    if (bad) return fail(bad.message);
    var before = nodeTitle(node);
    node.flowId = calledId;
    logFlow(f, 'flow_call_changed', { before: before, after: g.name });
    save();
    return { ok: true };
  }

  function uniqueLabel(node, base) {            // "Condition 1", "Condition 2", ... not already used by this node
    var used = node.outs.map(function (o) { return o.label.toLowerCase(); }), n = 1;
    while (used.indexOf((base + ' ' + n).toLowerCase()) !== -1) n++;
    return base + ' ' + n;
  }

  // A logic node starts with two outgoing edges to name (and connect)
  function addLogicNode(flowId) {
    var f = getFlow(flowId);
    if (!f) return fail('Flow not found');
    var p = nextPosition(f), n = 1;
    var titles = f.nodes.filter(function (x) { return x.type === 'logic'; }).map(function (x) { return x.title; });
    while (titles.indexOf('Logic ' + n) !== -1) n++;
    var node = { id: 'n' + state.nextId++, type: 'logic', title: 'Logic ' + n, outs: [], x: p.x, y: p.y };
    node.outs.push({ id: 'o' + state.nextId++, label: uniqueLabel(node, 'Condition'), to: null });
    node.outs.push({ id: 'o' + state.nextId++, label: uniqueLabel(node, 'Condition'), to: null });
    f.nodes.push(node);
    logFlow(f, 'flow_node_added', { after: node.title, detail: 'Logic node' });
    save();
    return { ok: true, node: node };
  }

  function removeNode(flowId, nodeId) {         // edges that pointed at it are left unconnected
    var f = getFlow(flowId), node = f && getNode(f, nodeId);
    if (!node) return fail('Node not found');
    f.nodes.splice(f.nodes.indexOf(node), 1);
    f.nodes.forEach(function (n) {
      if (n.type === 'logic') n.outs.forEach(function (o) { if (o.to === nodeId) o.to = null; });
      else if (n.next === nodeId) n.next = null;
    });
    logFlow(f, 'flow_node_removed', { before: nodeTitle(node), detail: node.type === 'template' ? 'Template' : node.type === 'flow' ? 'Flow call' : node.type === 'action' ? 'Action node' : node.type === 'input' ? 'Input node' : 'Logic node' });
    save();
    return { ok: true };
  }

  // Position on the canvas only: not an event worth a history entry
  function moveNode(flowId, nodeId, x, y) {
    var f = getFlow(flowId), node = f && getNode(f, nodeId);
    if (!node) return fail('Node not found');
    node.x = Math.max(0, Math.round(x)); node.y = Math.max(0, Math.round(y));
    save();
    return { ok: true };
  }

  // The timing of a template that is a flow by itself (not in any flow of the campaign)
  function setTemplateTiming(contentId, timing) {
    var c = get(contentId);
    if (!c) return fail('Content not found');
    var err = checkTiming(timing);
    if (err) return fail(err);
    if (sameTiming(c.timing, timing)) return fail('No change');
    var before = timingText(c.timing);
    c.timing = cloneTiming(timing);
    log(c, null, 'timing_edited', { before: before, after: timingText(c.timing) });
    save();
    return { ok: true };
  }

  // Layered layout: a node's rank is its longest path from a node nothing points at; nodes of one rank sit side by side.
  function autoLayout(f, dir) {
    var rank = {}, incoming = {};
    f.nodes.forEach(function (n) { incoming[n.id] = incoming[n.id] || 0; });
    function targets(n) { return n.type === 'logic' ? n.outs.map(function (o) { return o.to; }).filter(Boolean) : (n.next ? [n.next] : []); }
    f.nodes.forEach(function (n) { targets(n).forEach(function (t) { incoming[t] = (incoming[t] || 0) + 1; }); });
    function walk(n, r) {                      // edges never loop, so this ends
      if ((rank[n.id] || 0) >= r && n.id in rank) return;
      rank[n.id] = r;
      targets(n).forEach(function (t) { var m = getNode(f, t); if (m) walk(m, r + 1); });
    }
    f.nodes.forEach(function (n) { if (!incoming[n.id]) walk(n, 0); });
    f.nodes.forEach(function (n) { if (!(n.id in rank)) rank[n.id] = 0; });
    var seen = {}, out = {};
    f.nodes.forEach(function (n) {
      var r = rank[n.id], k = seen[r] || 0; seen[r] = k + 1;
      out[n.id] = dir === 'td' ? { x: 40 + k * 340, y: 40 + r * 220 } : { x: 40 + r * 340, y: 40 + k * 260 };
    });
    return out;
  }

  // How a flow's graph is drawn: edges run left to right ('lr', the default) or top to bottom ('td'). Layout only: not a history event.
  function flowDirection(f) { return f && f.direction === 'td' ? 'td' : 'lr'; }
  function setFlowDirection(flowId, dir) {
    var f = getFlow(flowId);
    if (!f) return fail('Flow not found');
    if (dir !== 'lr' && dir !== 'td') return fail('Direction is left to right or top down');
    if (flowDirection(f) === dir) return fail('No change');
    // each direction remembers its own layout: n.x / n.y are the positions in the current direction, n.alt the other's.
    // A direction used for the first time gets an automatic layered layout (steps follow the edges), never the old layout rotated.
    var auto = autoLayout(f, dir);
    f.nodes.forEach(function (n) {
      var cur = { x: n.x, y: n.y }, to = n.alt || auto[n.id];
      n.x = to.x; n.y = to.y; n.alt = cur;
    });
    f.direction = dir;
    save();
    return { ok: true };
  }

  // The timing of a flow ("N days before/after <reference date>"): one per flow, not per node
  function setFlowTiming(flowId, timing) {
    var f = getFlow(flowId);
    if (!f) return fail('Flow not found');
    var err = checkTiming(timing);
    if (err) return fail(err);
    if (sameTiming(f.timing, timing)) return fail('No change');
    var before = timingText(f.timing);
    f.timing = cloneTiming(timing);
    logFlow(f, 'flow_timing_edited', { before: before, after: timingText(f.timing) });
    save();
    return { ok: true };
  }

  // ---- action nodes: a name and a definition in words ("Label the contact high-risk", ...) -------
  var ACTION_NAME_MAX = 60, ACTION_DEFINITION_MAX = 500;

  function checkNodeName(f, name, exceptNodeId, what) {    // node names are shown in edges and history, so keep them distinct
    if (!name) return 'Name the ' + (what || 'action');
    if (name.length > ACTION_NAME_MAX) return 'Keep the name to ' + ACTION_NAME_MAX + ' characters';
    var lower = name.toLowerCase();
    if (f.nodes.some(function (n) { return n.id !== exceptNodeId && nodeTitle(n).toLowerCase() === lower; })) return 'Another node in this flow is already called "' + name + '"';
    return null;
  }

  function addActionNode(flowId) {
    var f = getFlow(flowId);
    if (!f) return fail('Flow not found');
    var p = nextPosition(f), n = 1;
    while (checkNodeName(f, 'Action ' + n)) n++;
    var node = { id: 'n' + state.nextId++, type: 'action', name: 'Action ' + n, definition: '', next: null, x: p.x, y: p.y };
    f.nodes.push(node);
    logFlow(f, 'flow_node_added', { after: node.name, detail: 'Action node' });
    save();
    return { ok: true, node: node };
  }

  // Rename and/or redefine an action: pass the fields you want to change
  function updateAction(flowId, nodeId, changes) {
    var f = getFlow(flowId), node = f && getNode(f, nodeId);
    if (!node || node.type !== 'action') return fail('Action node not found');
    var name = changes.name === undefined ? node.name : String(changes.name).trim();
    var definition = changes.definition === undefined ? node.definition : String(changes.definition);
    var err = changes.name !== undefined ? checkNodeName(f, name, nodeId) : null;
    if (err) return fail(err);
    if (definition.length > ACTION_DEFINITION_MAX) return fail('Keep the definition to ' + ACTION_DEFINITION_MAX + ' characters (it is ' + definition.length + ')');
    if (name === node.name && definition === node.definition) return fail('No change');
    var oldName = node.name, oldDef = node.definition;
    node.name = name; node.definition = definition;
    if (name !== oldName) logFlow(f, 'flow_action_renamed', { before: oldName, after: name });
    if (definition !== oldDef) logFlow(f, 'flow_action_defined', { detail: name, before: oldDef, after: definition });
    save();
    return { ok: true };
  }

  // ---- input nodes: a plain node (nothing to fill in), numbered Input 1, Input 2, ... ----------
  function renameInput(flowId, nodeId, name) {
    var f = getFlow(flowId), node = f && getNode(f, nodeId);
    if (!node || node.type !== 'input') return fail('Input node not found');
    name = String(name == null ? '' : name).trim();
    var err = checkNodeName(f, name, nodeId, 'input');
    if (err) return fail(err);
    if (name === node.title) return fail('No change');
    var before = node.title;
    node.title = name;
    logFlow(f, 'flow_input_renamed', { before: before, after: name });
    save();
    return { ok: true };
  }
  function addInputNode(flowId) {
    var f = getFlow(flowId);
    if (!f) return fail('Flow not found');
    var p = nextPosition(f), n = 1;
    while (checkNodeName(f, 'Input ' + n)) n++;
    var node = { id: 'n' + state.nextId++, type: 'input', title: 'Input ' + n, next: null, x: p.x, y: p.y };
    f.nodes.push(node);
    logFlow(f, 'flow_node_added', { after: node.title, detail: 'Input node' });
    save();
    return { ok: true, node: node };
  }

  // ---- edges --------------------------------------------------------------------------
  function edgeText(f, from, outId, to) {
    var o = from.type === 'logic' ? from.outs.filter(function (x) { return x.id === outId; })[0] : null;
    return nodeTitle(from) + (o ? ' [' + o.label + ']' : '') + ' → ' + (to ? nodeTitle(to) : 'nothing');
  }
  function findOut(from, outId) { return from.type === 'logic' ? from.outs.filter(function (o) { return o.id === outId; })[0] || null : null; }
  function reaches(f, startId, goalId) {        // can you get from start to goal by following edges?
    var seen = {}, found = false;
    (function walk(id) {
      if (found || seen[id]) return;
      if (id === goalId) { found = true; return; }
      seen[id] = true;
      var n = getNode(f, id);
      if (n) targetsOf(n).forEach(walk);
    })(startId);
    return found;
  }

  // Connect the outgoing edge of `fromId` to `toId`. A template or action node has one edge (outId is ignored); a logic node
  // connects the edge `outId`. Replacing an existing connection is fine. Loops are refused.
  function connect(flowId, fromId, outId, toId) {
    var f = getFlow(flowId);
    if (!f) return fail('Flow not found');
    var from = getNode(f, fromId), to = getNode(f, toId);
    if (!from || !to) return fail('Node not found');
    if (fromId === toId) return fail('A node cannot connect to itself');
    var out = findOut(from, outId);
    if (from.type === 'logic' && !out) return fail('Choose one of the node\'s outgoing edges');
    if ((from.type !== 'logic' ? from.next : out.to) === toId) return fail('No change');
    if (reaches(f, toId, fromId)) return fail('That would make a loop');
    var before = from.type !== 'logic' ? from.next : out.to;
    if (from.type !== 'logic') from.next = toId; else out.to = toId;
    logFlow(f, 'flow_edge_connected', { detail: edgeText(f, from, outId, to), before: before ? nodeTitle(getNode(f, before)) : null, after: nodeTitle(to) });
    save();
    return { ok: true };
  }

  function disconnect(flowId, fromId, outId) {
    var f = getFlow(flowId), from = f && getNode(f, fromId);
    if (!from) return fail('Node not found');
    var out = findOut(from, outId), cur = from.type !== 'logic' ? from.next : (out && out.to);
    if (from.type === 'logic' && !out) return fail('Choose one of the node\'s outgoing edges');
    if (!cur) return fail('Not connected');
    var text = edgeText(f, from, outId, getNode(f, cur));
    if (from.type !== 'logic') from.next = null; else out.to = null;
    logFlow(f, 'flow_edge_disconnected', { before: text });
    save();
    return { ok: true };
  }

  // The dynamic part of a logic node: its outgoing edges can be added, removed and named by the condition they stand for.
  // Saved all at once (that is how the editor works: you edit, then save or cancel). `outs` is the wanted list in order:
  // { id } keeps an existing edge (and its connection), no id adds a new one; existing edges that are missing are removed.
  function updateLogic(flowId, nodeId, outs) {
    var f = getFlow(flowId), node = f && getNode(f, nodeId);
    if (!node || node.type !== 'logic') return fail('Logic node not found');
    if (!outs.length) return fail('A logic node needs at least one outgoing edge');
    var seen = [], wanted = [];
    for (var i = 0; i < outs.length; i++) {
      var label = String(outs[i].label == null ? '' : outs[i].label).trim();
      if (!label) return fail('Name the condition of every outgoing edge');
      if (label.length > EDGE_LABEL_MAX) return fail('Keep each condition name to ' + EDGE_LABEL_MAX + ' characters');
      if (seen.indexOf(label.toLowerCase()) !== -1) return fail('Two edges of ' + node.title + ' are both called "' + label + '"');
      seen.push(label.toLowerCase());
      if (outs[i].id && !findOut(node, outs[i].id)) return fail('Edge not found');
      wanted.push({ id: outs[i].id || null, label: label });
    }
    var keptIds = wanted.filter(function (w) { return w.id; }).map(function (w) { return w.id; });
    var removed = node.outs.filter(function (o) { return keptIds.indexOf(o.id) === -1; });
    var renamed = wanted.filter(function (w) { return w.id && findOut(node, w.id).label !== w.label; });
    var added = wanted.filter(function (w) { return !w.id; });
    if (!removed.length && !renamed.length && !added.length) return fail('No change');
    var next = wanted.map(function (w) {
      if (w.id) { var o = findOut(node, w.id); return { id: o.id, label: w.label, to: o.to }; }
      return { id: 'o' + state.nextId++, label: w.label, to: null };
    });
    removed.forEach(function (o) { logFlow(f, 'flow_out_removed', { before: o.label, detail: node.title + (o.to ? ' (was → ' + tplOrNode(f, o.to) + ')' : '') }); });
    renamed.forEach(function (w) { logFlow(f, 'flow_out_renamed', { before: findOut(node, w.id).label, after: w.label, detail: node.title }); });
    added.forEach(function (w) { logFlow(f, 'flow_out_added', { after: w.label, detail: node.title }); });
    node.outs = next;
    save();
    return { ok: true };
  }
  function tplOrNode(f, id) { var n = getNode(f, id); return n ? nodeTitle(n) : id; }

  // The flow list is one global order; each campaign shows its flows in that order
  function reorderFlow(flowId, targetId, place) { return reorderFlowItem('flow', flowId, 'flow', targetId, place); }

  // Every entry of the Flows list can be dragged among the others: the flows you created AND the templates that are
  // flows by themselves. One shared order (state.flowOrder, keys 'f:<id>' / 't:<id>') covers all of them; each campaign
  // shows its entries in that order.
  function reorderFlowItem(kind, id, targetKind, targetId, place) {
    var item = kind === 'flow' ? getFlow(id) : get(id), target = targetKind === 'flow' ? getFlow(targetId) : get(targetId);
    if (!item || !target) return fail(kind === 'flow' ? 'Flow not found' : 'Template not found');
    var key = itemKey(kind, id), tkey = itemKey(targetKind, targetId);
    if (key === tkey) return fail('No change');
    var all = flowItems(null).map(function (it) { return itemKey(it.kind, it.kind === 'flow' ? it.flow.id : it.content.id); });
    state.contents.forEach(function (c) { var k = itemKey('template', c.id); if (all.indexOf(k) === -1) all.push(k); });   // templates that are in a flow now may be alone later
    var before = all.join();
    all.splice(all.indexOf(key), 1);
    all.splice(all.indexOf(tkey) + (place === 'after' ? 1 : 0), 0, key);
    if (all.join() === before) return fail('No change');
    state.flowOrder = all;
    state.flows.sort(function (a, b) { return all.indexOf(itemKey('flow', a.id)) - all.indexOf(itemKey('flow', b.id)); });   // keeps the stored flow order consistent
    var tname = targetKind === 'flow' ? target.name : target.name, detail = (place === 'after' ? 'after ' : 'before ') + tname;
    if (kind === 'flow') logFlow(item, 'flow_reordered', { detail: detail });
    else log(item, null, 'flow_list_moved', { detail: detail });
    save();
    return { ok: true };
  }

  // ---- refer / duplicate / move a flow to another campaign ---------------------------
  //  refer: the SAME flow is also in the target (one flow, edits apply everywhere).
  //  duplicate: a new, independent flow in the target with the same graph.
  //  move: the flow leaves its campaign for the target.
  // Templates are shared, never duplicated. They come along so the target campaign holds what the flow uses:
  //  refer / duplicate: the templates are added to the target too.
  //  move: templates only this flow uses in the source campaign move with it; templates another flow of the
  //        source still uses stay there (and are also added to the target).
  function uniqueCopyName(name) {              // "X (copy)", then "X (copy 2)", ...
    var n = 1, candidate;
    do { candidate = name + ' (copy' + (n > 1 ? ' ' + n : '') + ')'; n++; } while (validateFlowName(candidate) && n < 200);
    return candidate;
  }

  function planFlowDrop(flowId, targetId) {
    var f = getFlow(flowId), target = getCampaign(targetId);
    if (!f || !target) return null;
    var M = f.campaignIds.slice(), inTarget = M.indexOf(targetId) !== -1;
    var tpls = flowTemplateIds(f).map(function (id) { return get(id); }).filter(Boolean);
    var addToTarget = tpls.filter(function (t) { return t.campaignIds.indexOf(targetId) === -1; }).map(function (t) { return t.id; });
    var plan = { existsIn: M.slice(), inTarget: inTarget, templates: tpls.length, refer: { ok: true }, duplicate: { ok: true }, move: { ok: true, from: M.slice() } };

    if (inTarget) plan.refer = { ok: false, reason: 'Already in ' + target.name };
    else { plan.refer.result = M.concat(targetId); plan.refer.addTemplates = addToTarget; }
    plan.duplicate = { ok: true, name: uniqueCopyName(f.name), addTemplates: addToTarget };   // always possible, even inside the same campaign

    if (M.length > 1) {
      plan.move = { ok: false, from: [], label: "Can't move",
        reason: 'It is in ' + M.length + ' campaigns (' + M.map(campaignName).join(', ') + '), so there is no single place to move it from. Copy it instead.' };
    } else if (inTarget) {
      plan.move = { ok: false, from: M.slice(), reason: 'Already in ' + target.name };
    } else {
      var from = M[0], leave = [], stay = [];
      tpls.forEach(function (t) {
        if (from && t.campaignIds.indexOf(from) !== -1) {
          var usedElsewhere = flowsIncluding(t.id, from).some(function (o) { return o.id !== f.id; });
          (usedElsewhere ? stay : leave).push(t.id);
        }
      });
      plan.move.result = [targetId];
      plan.move.addTemplates = addToTarget;
      plan.move.leave = leave;
      plan.move.stay = stay;
    }
    return plan;
  }

  function carryTemplates(f, targetId, leaveIds, fromId) {
    flowTemplateIds(f).forEach(function (id) {
      var t = get(id);
      if (!t) return;
      var leaving = leaveIds.indexOf(t.id) !== -1;
      var next = t.campaignIds.filter(function (k) { return !(leaving && k === fromId); });
      if (next.indexOf(targetId) === -1) next.push(targetId);
      if (next.join() === t.campaignIds.join()) return;
      t.campaignIds = next;
      log(t, null, leaving ? 'campaign_moved' : 'campaign_copied', { before: leaving ? campaignName(fromId) : null, after: campaignName(targetId), detail: targetId });
    });
  }

  function referFlow(flowId, targetId) {
    var plan = planFlowDrop(flowId, targetId);
    if (!plan) return fail('Flow or campaign not found');
    if (!plan.refer.ok) return fail(plan.refer.reason);
    var f = getFlow(flowId);
    f.campaignIds = plan.refer.result;
    logFlow(f, 'flow_referred', { after: campaignName(targetId), detail: targetId });
    carryTemplates(f, targetId, [], null);
    save();
    return { ok: true };
  }

  // A new flow in the target, placed right after the original, with its own copy of the graph (new ids, same positions)
  function duplicateFlow(flowId, targetId) {
    var plan = planFlowDrop(flowId, targetId);
    if (!plan) return fail('Flow or campaign not found');
    var f = getFlow(flowId), ids = {};
    f.nodes.forEach(function (n) { ids[n.id] = 'n' + state.nextId++; });
    var copy = {
      id: 'f' + state.nextId++, name: plan.duplicate.name, campaignIds: [targetId], createdAt: clock().toISOString(), timing: cloneTiming(f.timing || DEFAULT_TIMING), direction: flowDirection(f),
      nodes: f.nodes.map(function (n) {
        if (n.type === 'template') return { id: ids[n.id], type: 'template', templateId: n.templateId, values: Object.assign({}, n.values || {}), next: n.next ? ids[n.next] : null, x: n.x, y: n.y, alt: n.alt };
        if (n.type === 'action') return { id: ids[n.id], type: 'action', name: n.name, definition: n.definition, next: n.next ? ids[n.next] : null, x: n.x, y: n.y, alt: n.alt };
        if (n.type === 'flow') return { id: ids[n.id], type: 'flow', flowId: n.flowId, next: n.next ? ids[n.next] : null, x: n.x, y: n.y, alt: n.alt };
        if (n.type === 'input') return { id: ids[n.id], type: 'input', title: n.title, next: n.next ? ids[n.next] : null, x: n.x, y: n.y, alt: n.alt };
        return { id: ids[n.id], type: 'logic', title: n.title, x: n.x, y: n.y, alt: n.alt,
          outs: n.outs.map(function (o) { return { id: 'o' + state.nextId++, label: o.label, to: o.to ? ids[o.to] : null }; }) };
      })
    };
    copy.nodes.forEach(function (n) { if (!n.alt) delete n.alt; });
    state.flows.splice(state.flows.indexOf(f) + 1, 0, copy);
    logFlow(copy, 'flow_created', { after: copy.name, detail: 'Duplicate of ' + f.name });
    logFlow(f, 'flow_duplicated', { after: copy.name, detail: campaignName(targetId) });
    carryTemplates(copy, targetId, [], null);
    save();
    return { ok: true, flow: copy };
  }

  function moveFlow(flowId, targetId) {
    var plan = planFlowDrop(flowId, targetId);
    if (!plan) return fail('Flow or campaign not found');
    if (!plan.move.ok) return fail(plan.move.reason);
    var f = getFlow(flowId), from = plan.move.from[0] || null;
    f.campaignIds = plan.move.result;
    logFlow(f, 'flow_moved', { before: from ? campaignName(from) : null, after: campaignName(targetId), detail: targetId });
    carryTemplates(f, targetId, plan.move.leave, from);
    save();
    return { ok: true };
  }

  // ---- CSV -------------------------------------------------------------------
  function csvCell(v) {
    v = v == null ? '' : String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  // Columns: name,language,wa_template_name,text   (one row per content x language)
  function toCsv(ids) {
    var rows = [['name', 'language', 'wa_template_name', 'text']];
    state.contents.forEach(function (c) {
      if (ids && ids.indexOf(c.id) === -1) return;
      c.translations.forEach(function (tr) { rows.push([c.name, tr.lang, tr.waName, tr.text]); });
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  // ---- Word diff (LCS) -------------------------------------------------------
  // Returns [{type:'eq'|'add'|'del', text}] with whitespace kept as its own tokens.
  function diffWords(a, b) {
    var x = String(a || '').split(/(\s+|[.,;:!?।()])/).filter(Boolean);
    var y = String(b || '').split(/(\s+|[.,;:!?।()])/).filter(Boolean);
    var n = x.length, m = y.length, i, j;
    var dp = [];
    for (i = 0; i <= n; i++) { dp.push(new Array(m + 1)); dp[i][m] = 0; }
    for (j = 0; j <= m; j++) dp[n][j] = 0;
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [];
    function push(type, text) {
      var last = out[out.length - 1];
      if (last && last.type === type) last.text += text; else out.push({ type: type, text: text });
    }
    i = 0; j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { push('eq', x[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', x[i]); i++; }
      else { push('add', y[j]); j++; }
    }
    while (i < n) push('del', x[i++]);
    while (j < m) push('add', y[j++]);
    return out;
  }

  // ---- Demo data -------------------------------------------------------------
  function seed() {
    state = { nextId: 1, campaigns: SAMPLE_CAMPAIGNS.map(function (c) { return { id: c.id, name: c.name }; }), contents: [], flows: [], history: [] };
    var t = Date.now() - 6 * 24 * 3600 * 1000;
    clock = function () { t += 47 * 60 * 1000 + 13000; return new Date(t); };

    // change some parts of one translation through the same path the editor uses
    function patch(id, lang, changes) {
      var cur = cloneParts(partsOf(getTr(get(id), lang)));
      for (var k in changes) cur[k] = changes[k];
      return saveParts(id, lang, cur);
    }
    var site = 'https://www.noorahealth.org/{{page}}';

    var w = createContent('Welcome message', 'en', 'k1').content;
    setHeaderType(w.id, 'image');
    patch(w.id, 'en', {
      text: 'Hello {{name}}, welcome to Noora Health. We will share tips to help you care for your newborn.',
      defaults: { name: 'Friend' },
      header: '3f2b8c1e-9a47-4d6b-8c3e-1f5a7b9d2e40',
      footer: 'Noora Health',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Tell me more', default_payload: 'welcome_more' },
        { type: 'URL', text: 'Visit website', url: site, default_parameters: { page: 'about' } }
      ]
    });
    addTranslation(w.id, 'hi', 'नमस्ते {{name}}, नूरा हेल्थ में आपका स्वागत है। हम आपको नवजात शिशु की देखभाल के सुझाव भेजेंगे।');
    patch(w.id, 'hi', {
      defaults: { name: 'दोस्त' },
      footer: 'नूरा हेल्थ',
      buttons: [
        { type: 'QUICK_REPLY', text: 'और जानें', default_payload: 'welcome_more' },
        { type: 'URL', text: 'वेबसाइट देखें', url: site, default_parameters: { page: 'about' } }
      ]
    });
    deployAll(w.id);
    patch(w.id, 'en', { text: 'Hello {{name}}, welcome to Noora Health. We will share simple tips to help you care for your newborn baby.' });

    var a = createContent('Appointment reminder', 'en', 'k2').content;
    patch(a.id, 'en', {
      text: 'Reminder: your appointment is on {{date}} at {{time}}. Please bring your health card.',
      defaults: { date: 'Monday 12 December', time: '10:30 AM' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'Confirm', default_payload: 'appt_confirm' },
        { type: 'QUICK_REPLY', text: 'Reschedule', default_payload: 'appt_reschedule' }
      ]
    });
    addTranslation(a.id, 'hi', 'याद दिलाना: आपकी अपॉइंटमेंट {{date}} को {{time}} बजे है। कृपया अपना हेल्थ कार्ड साथ लाएं।');
    patch(a.id, 'hi', {
      defaults: { date: 'सोमवार 12 दिसंबर', time: 'सुबह 10:30' },
      buttons: [
        { type: 'QUICK_REPLY', text: 'पुष्टि करें', default_payload: 'appt_confirm' },
        { type: 'QUICK_REPLY', text: 'समय बदलें', default_payload: 'appt_reschedule' }
      ]
    });
    addTranslation(a.id, 'kn', '');

    var d = createContent('Daily health tip', 'en', 'k1').content;
    patch(d.id, 'en', { text: 'Tip of the day: wash your hands with soap before feeding your baby.' });
    setBlocked(d.id, true);

    // Welcome message -> Logic 1 -> (Replied) Daily health tip; "No reply" is left unconnected to show an open edge
    var fl = createFlow('Newborn first weeks', 'k1').flow;
    var nW = addTemplateNode(fl.id, w.id).node, nL = addLogicNode(fl.id).node, nD = addTemplateNode(fl.id, d.id).node;
    updateLogic(fl.id, nL.id, [{ id: nL.outs[0].id, label: 'Replied' }, { id: nL.outs[1].id, label: 'No reply' }]);
    var nI = addInputNode(fl.id).node;
    var nA = addActionNode(fl.id).node;
    updateAction(fl.id, nA.id, { name: 'Alert health worker', definition: 'If the family has not replied, notify the assigned community health worker to call them.' });
    connect(fl.id, nI.id, null, nW.id);
    connect(fl.id, nW.id, null, nL.id);
    connect(fl.id, nL.id, nL.outs[0].id, nD.id);
    connect(fl.id, nL.id, nL.outs[1].id, nA.id);
    [[nI, 40, 40], [nW, 380, 40], [nL, 720, 40], [nD, 1100, 40], [nA, 1100, 260]].forEach(function (p) { moveNode(fl.id, p[0].id, p[1], p[2]); });   // tidy layout

    clock = function () { return new Date(); };
    save();
  }

  var Store = {
    CURRENT_USER: CURRENT_USER,
    LANGUAGES: LANGUAGES,
    ACTION_LABELS: ACTION_LABELS,
    langName: langName,
    slugify: slugify,
    load: load,
    reset: reset,
    list: list,
    listCampaigns: listCampaigns,
    getCampaign: getCampaign,
    contentsIn: contentsIn,
    createCampaign: createCampaign,
    DEFAULT_TIMING: DEFAULT_TIMING,
    REF_DATES: REF_DATES,
    checkTiming: checkTiming,
    timingText: timingText,
    EDGE_LABEL_MAX: EDGE_LABEL_MAX,
    getFlow: getFlow,
    listFlows: listFlows,
    flowsIn: flowsIn,
    flowsIncluding: flowsIncluding,
    flowTemplateIds: flowTemplateIds,
    templateNodes: templateNodes,
    getNode: getNode,
    nodeTitle: nodeTitle,
    isImplicit: isImplicit,
    flowItems: flowItems,
    historyForFlow: historyForFlow,
    createFlow: createFlow,
    renameFlow: renameFlow,
    addTemplateNode: addTemplateNode,
    changeNodeTemplate: changeNodeTemplate,
    updateTemplateNode: updateTemplateNode,
    renameInput: renameInput,
    placeholderNames: placeholderNames,
    nodeValues: nodeValues,
    addFlowNode: addFlowNode,
    changeNodeFlow: changeNodeFlow,
    callProblem: callProblem,
    addLogicNode: addLogicNode,
    addActionNode: addActionNode,
    addInputNode: addInputNode,
    updateAction: updateAction,
    ACTION_NAME_MAX: ACTION_NAME_MAX,
    ACTION_DEFINITION_MAX: ACTION_DEFINITION_MAX,
    removeNode: removeNode,
    moveNode: moveNode,
    setTemplateTiming: setTemplateTiming,
    setFlowTiming: setFlowTiming,
    flowDirection: flowDirection,
    setFlowDirection: setFlowDirection,
    connect: connect,
    disconnect: disconnect,
    updateLogic: updateLogic,
    reorderFlow: reorderFlow,
    reorderFlowItem: reorderFlowItem,
    planFlowDrop: planFlowDrop,
    referFlow: referFlow,
    duplicateFlow: duplicateFlow,
    moveFlow: moveFlow,
    campaignName: campaignName,
    planDrop: planDrop,
    copyToCampaign: copyToCampaign,
    moveToCampaign: moveToCampaign,
    get: get,
    getTr: getTr,
    slugOf: slugOf,
    statusOf: statusOf,
    canDeploy: canDeploy,
    isDeployed: isDeployed,
    blockProblem: blockProblem,
    historyFor: historyFor,
    validateName: validateName,
    createContent: createContent,
    renameContent: renameContent,
    addTranslation: addTranslation,
    saveParts: saveParts,
    setHeaderType: setHeaderType,
    LIMITS: LIMITS,
    buttonCounts: buttonCounts,
    canAddButton: canAddButton,
    HEADER_TYPES: HEADER_TYPES,
    positionsOf: positionsOf,
    renamePlaceholder: renamePlaceholder,
    whatsappBody: whatsappBody,
    invalidPlaceholders: invalidPlaceholders,
    partsOf: partsOf,
    cloneParts: cloneParts,
    partsSig: partsSig,
    normDefaults: normDefaults,
    newButton: newButton,
    problems: problems,
    toExtraContent: toExtraContent,
    setBlocked: setBlocked,
    deploy: deploy,
    deployAll: deployAll,
    toCsv: toCsv,
    diffWords: diffWords
  };

  root.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
