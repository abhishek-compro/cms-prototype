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
    campaign_moved: 'Moved to campaign'
  };

  // ---- State -----------------------------------------------------------------
  // state = { nextId, campaigns: [Campaign], contents: [Content], history: [Event] }
  // Campaign = { id, name, createdAt?, createdBy? }   (a content name can be in several campaigns via Content.campaignIds)
  // Content = { id, name, campaignIds: [campaignId], headerType: 'none'|'image'|'video'|'document', blocked, deployCounter, createdAt, translations: [Translation] }
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
    state.contents.forEach(function (c) {
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
    state = { nextId: 1, campaigns: SAMPLE_CAMPAIGNS.map(function (c) { return { id: c.id, name: c.name }; }), contents: [], history: [] };
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
