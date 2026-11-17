/* app.js: rendering and event handling. All data and rules live in store.js. */
(function () {
  'use strict';
  var S = window.Store;
  S.load();

  var ui = {
    listTab: 'templates', // content sidebar tab: 'templates' | 'flows'
    flowSel: null,       // Flows tab selection: {kind:'flow'|'template', id} ('template' = a template that is a flow by itself)
    campaignId: null,    // campaign filter for the content list (null = all content)
    selectedId: null,
    side: false,         // side-by-side view (off by default)
    refLang: null,       // read-only reference language (side-by-side)
    editLang: null,      // language being edited (also the active tab when side-by-side is off)
    historyOpen: false,  // right sidebar visible (hidden by default)
    histSubject: 'edit', // side-by-side: whose history the sidebar shows ('edit' | 'ref')
    nameOpen: false,     // sidebar tab 'Other' selected (name-level events) instead of a language tab
    search: '',
    renaming: false,
    newError: '',
    drag: null,          // {id}: the content name being dragged
    dialog: null,        // {contentId, targetId}: copy/move dialog after dropping on a campaign
    campBox: false,      // campaigns sidebar: the new-campaign text box is open (closes on blur)
    campError: '',
    sideBox: null,       // left bar: which text box is open ('search' | 'add' | null); it closes when it loses focus
    drafts: {},          // "contentId|lang" -> unsaved parts of that translation
    shown: {},           // "contentId|lang" -> {footer:true}: optional sections added with the + Add dropdown but still empty
    focusNext: null      // selector to focus after the next render (e.g. the field of a section that was just added)
  };

  var $app = document.getElementById('app');
  var $toast = document.getElementById('toast');
  var $modal = document.getElementById('modal-root');

  // ---- helpers ---------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function draftKey(id, lang) { return id + '|' + lang; }
  // A draft is a full copy of a translation's editable parts (body, header, footer, defaults, buttons). It is
  // created on the first edit; until then the saved parts are shown (treat those as read-only).
  function currentParts(c, tr) { return ui.drafts[draftKey(c.id, tr.lang)] || S.partsOf(tr); }
  function isDirty(c, tr) {
    var d = ui.drafts[draftKey(c.id, tr.lang)];
    return !!d && S.partsSig(d) !== S.partsSig(S.partsOf(tr));
  }
  function editableDraft(c, tr) {
    var k = draftKey(c.id, tr.lang);
    if (!ui.drafts[k]) ui.drafts[k] = S.cloneParts(S.partsOf(tr));
    return ui.drafts[k];
  }
  function problemCount(c, tr) { return tr.text.trim() ? S.problems(c, S.partsOf(tr)).length : 0; }
  function fmtTime(iso) { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  function langLabel(code) { return esc(S.langName(code)) + ' <code>' + esc(code) + '</code>'; }
  var ICON_DOWNLOAD = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
  var ICON_SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ICON_PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  var ICON_FLOW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M2 12h7M15 12h7"/></svg>';
  var ICON_GRIP = '<svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="4" r="1.5"/><circle cx="8.5" cy="4" r="1.5"/><circle cx="3.5" cy="9" r="1.5"/><circle cx="8.5" cy="9" r="1.5"/><circle cx="3.5" cy="14" r="1.5"/><circle cx="8.5" cy="14" r="1.5"/></svg>';
  var THEME_KEY = 'cms-prototype-theme';
  var THEME_ICONS = {
    light: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    system: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    dark: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };
  var THEME_LABELS = { light: 'Light', system: 'System', dark: 'Dark' };
  var THEME_TITLES = { light: 'Light theme', system: 'Follow your device setting', dark: 'Dark theme' };
  // The theme lives on <html data-theme>; no attribute means "System"
  function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'system'; }
  function setTheme(t) {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    var btns = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-checked', String(btns[i].getAttribute('data-theme') === t));
  }
  function themeSwitchHtml() {
    var cur = currentTheme();
    return '<div class="theme-switch" role="radiogroup" aria-label="Color theme">' + ['light', 'system', 'dark'].map(function (t) {
      return '<button class="theme-btn" role="radio" aria-checked="' + (t === cur) + '" data-action="set-theme" data-theme="' + t + '" title="' + THEME_TITLES[t] + '">' +
        THEME_ICONS[t] + '<span>' + THEME_LABELS[t] + '</span></button>';
    }).join('') + '</div>';
  }

  var STATUS_LABEL = { draft: 'Not published', deployed: 'Published', modified: 'Edited since publish' };

  var toastTimer;
  function toast(msg, isError) {
    $toast.innerHTML = '<div class="msg' + (isError ? ' error' : '') + '">' + esc(msg) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.innerHTML = ''; }, 3500);
  }

  function download(filename, text, mime) {
    // CSV gets a BOM so Excel opens the UTF-8 file with Hindi/Kannada text intact
    var isCsv = !mime;
    var blob = new Blob([(isCsv ? '\ufeff' : '') + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  // Keep ui.editLang / ui.refLang pointing at languages that exist on the selected content
  function visibleContent() { return S.contentsIn(ui.campaignId); }

  function normalize() {
    if (ui.campaignId && !S.getCampaign(ui.campaignId)) ui.campaignId = null;
    var visible = visibleContent();
    var c = S.get(ui.selectedId);
    if (!c || visible.indexOf(c) === -1) {      // selection must belong to the chosen campaign
      c = visible.length ? visible[0] : null;
      ui.selectedId = c ? c.id : null;
    }
    if (!c) return null;
    var langs = c.translations.map(function (t) { return t.lang; });
    if (langs.indexOf(ui.editLang) === -1) ui.editLang = langs[0];
    if (langs.indexOf(ui.refLang) === -1 || ui.refLang === ui.editLang) {
      ui.refLang = langs.filter(function (l) { return l !== ui.editLang; })[0] || ui.editLang;
    }
    return c;
  }

  // ---- views -----------------------------------------------------------------
  function topbarHtml() {
    return '<header class="topbar">' +
      '<h1>Content Studio <span class="muted">(prototype)</span></h1>' +
      '<span class="spacer"></span>' + themeSwitchHtml() +
      '<span class="user-chip" title="Every action is recorded as this user">' + esc(S.CURRENT_USER) + '</span>' +
      '<button class="btn icon" data-action="csv-all" title="Download CSV of all content" aria-label="Download CSV of all content">' + ICON_DOWNLOAD + '<span>CSV</span></button>' +
      '<button class="btn" data-action="reset" title="Discard all changes and reload the sample data">Reset demo data</button>' +
      '</header>';
  }

  function listHtml() { return ui.listTab === 'flows' ? flowsListHtml() : templatesListHtml(); }

  function flowSummary(f) {
    if (!f.steps.length) return 'No templates yet';
    var n = f.steps.length + (f.steps.length === 1 ? ' template' : ' templates');
    return n + ' · ' + S.timingText(f.steps[0].timing) + (f.steps.length > 1 ? ' → ' + S.timingText(f.steps[f.steps.length - 1].timing) : '');
  }
  var FLOW_IND = '<span class="flow-ind" title="This template is itself a flow" aria-label="This template is itself a flow">' + ICON_FLOW + '<span>Single template</span></span>';

  // The Flows tab: the flows you created (reorderable), then each template that no flow of this campaign includes,
  // listed as a flow by itself with an indicator.
  function flowsListHtml() {
    var q = ui.search.trim().toLowerCase();
    var items = S.flowItems(ui.campaignId).filter(function (it) {
      return !q || (it.kind === 'flow' ? it.flow.name : it.content.name).toLowerCase().indexOf(q) !== -1;
    });
    if (!items.length) return '<li class="muted small" style="padding:8px 10px">' + (q ? 'No flows found' : 'No flows yet') + '</li>';
    return items.map(function (it) {
      var isFlow = it.kind === 'flow', id = isFlow ? it.flow.id : it.content.id;
      var on = ui.flowSel && ui.flowSel.kind === it.kind && ui.flowSel.id === id;
      return '<li class="content-item flow-item' + (on ? ' active' : '') + '" data-action="select-flow" data-kind="' + it.kind + '" data-id="' + id + '">' +
        '<span class="drag-handle" draggable="true" aria-hidden="true" title="' + (isFlow ? 'Drag to reorder, or onto a campaign to copy or move it' : 'Drag onto a campaign to copy or move it') + '">' + ICON_GRIP + '</span>' +
        '<div class="ci-body"><div class="name">' + esc(isFlow ? it.flow.name : it.content.name) + (isFlow ? '' : ' ' + FLOW_IND) + '</div>' +
        '<div class="flow-meta">' + esc(isFlow ? flowSummary(it.flow) : S.timingText(it.content.timing)) + '</div></div></li>';
    }).join('');
  }

  function templatesListHtml() {
    var q = ui.search.trim().toLowerCase();
    var items = visibleContent().filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) !== -1; });
    if (!items.length) return '<li class="muted small" style="padding:8px 10px">' + (q ? 'No content found' : 'No content yet') + '</li>';
    return items.map(function (c) {
      var chips = c.translations.map(function (t) {
        return '<span class="chip ' + S.statusOf(t, c) + '" title="' + esc(S.langName(t.lang) + ': ' + STATUS_LABEL[S.statusOf(t, c)]) + '">' + esc(t.lang) + '</span>';
      }).join('');
      return '<li class="content-item' + (c.id === ui.selectedId ? ' active' : '') + '" data-action="select" data-id="' + c.id + '">' +
        '<span class="drag-handle" draggable="true" aria-hidden="true" title="Drag onto a campaign to copy or move it">' + ICON_GRIP + '</span>' +
        '<div class="ci-body"><div class="name">' + esc(c.name) + (c.blocked ? ' <span class="badge blocked">no template</span>' : '') + '</div>' +
        '<div class="chips">' + chips + '</div></div></li>';
    }).join('');
  }

  // Left bar tools: two icon buttons (search, new). Clicking one opens its text box in the same spot
  // (the box keeps that icon, and "add" also has its Add button). Losing focus closes the box.
  function sideToolsInner() {
    if (ui.sideBox === 'search') {
      return '<div class="tool-box">' + ICON_SEARCH +
        '<input type="text" id="search" placeholder="Search ' + (ui.listTab === 'flows' ? 'flows' : 'content') + '…" autocomplete="off" value="' + esc(ui.search) + '">' +
        (ui.search ? '<button class="clear-btn" data-action="clear-search" aria-label="Clear search" title="Clear">×</button>' : '') + '</div>';
    }
    if (ui.sideBox === 'add') {
      return '<div class="tool-box">' + ICON_PLUS +
        '<input type="text" id="new-name" placeholder="' + (ui.listTab === 'flows' ? 'New flow name' : 'New content name') + '" autocomplete="off">' +
        '<button class="btn primary add-confirm" data-action="new-content">Add</button></div>' +
        '<div class="form-error" id="new-error">' + esc(ui.newError) + '</div>';
    }
    return '<div class="tool-row">' +
      '<button class="icon-btn' + (ui.search ? ' active' : '') + '" data-action="open-search" aria-label="Search ' + (ui.listTab === 'flows' ? 'flows' : 'content') + '" title="' + (ui.search ? 'Search: ' + esc(ui.search) : 'Search ' + (ui.listTab === 'flows' ? 'flows' : 'content')) + '">' + ICON_SEARCH + '</button>' +
      '<button class="icon-btn" data-action="open-add" aria-label="New ' + (ui.listTab === 'flows' ? 'flow' : 'content') + '" title="New ' + (ui.listTab === 'flows' ? 'flow' : 'content') + '">' + ICON_PLUS + '</button></div>' +
      (ui.search ? '<div class="filter-chip">Search: “' + esc(ui.search) + '” <button class="clear-btn" data-action="clear-search" aria-label="Clear search" title="Clear search">×</button></div>' : '');
  }

  // Campaigns header: title + a + button. Clicking + opens a text box (with an Add button) in the same spot;
  // the box closes when it loses focus, like the content list's boxes.
  function campToolsInner() {
    if (ui.campBox) {
      return '<div class="tool-box">' + ICON_PLUS +
        '<input type="text" id="new-campaign" placeholder="New campaign" autocomplete="off">' +
        '<button class="btn primary camp-add-confirm" data-action="add-campaign">Add</button></div>' +
        '<div class="form-error" id="camp-error">' + esc(ui.campError) + '</div>';
    }
    return '<div class="camp-head"><h2 class="side-title">Campaigns</h2>' +
      '<button class="icon-btn sm" data-action="open-add-campaign" aria-label="New campaign" title="New campaign">' + ICON_PLUS + '</button></div>';
  }
  function updateCampTools() {
    var el = document.getElementById('camp-tools');
    if (!el) return;
    rerendering = true;
    el.innerHTML = campToolsInner();
    rerendering = false;
  }
  function focusCampBox() { var i = document.getElementById('new-campaign'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  function openCampBox() { ui.campBox = true; ui.campError = ''; updateCampTools(); focusCampBox(); }
  function closeCampBox() { if (!ui.campBox) return; ui.campBox = false; ui.campError = ''; updateCampTools(); }
  function addCampaign() {
    var r = S.createCampaign(document.getElementById('new-campaign').value);
    if (!r.ok) { ui.campError = r.error; document.getElementById('camp-error').textContent = r.error; return; }
    ui.campBox = false; ui.campError = '';
    ui.campaignId = r.campaign.id; ui.renaming = false; ui.nameOpen = false;   // jump to the new (empty) campaign
    render();
    toast('Created campaign "' + r.campaign.name + '"');
  }

  function campaignsHtml() {
    function item(id, label) {
      var on = (ui.campaignId || '') === id;
      return '<li><button class="camp-item' + (on ? ' active' : '') + '" data-action="select-campaign" data-id="' + esc(id) + '"' + (on ? ' aria-current="true"' : '') + '>' + esc(label) + '</button></li>';
    }
    return '<aside class="campaigns" aria-label="Campaigns"><div id="camp-tools">' + campToolsInner() + '</div><ul class="camp-list">' +
      item('', 'All content') + S.listCampaigns().map(function (k) { return item(k.id, k.name); }).join('') + '</ul>' +
      '<p class="camp-hint">Drag a template\'s handle (⋮⋮) onto a campaign to copy or move it.</p></aside>';
  }

  function listTitle() {
    var k = ui.campaignId && S.getCampaign(ui.campaignId);
    return k ? k.name : 'All content';
  }

  function sidebarHtml() {
    return '<aside class="sidebar">' +
      '<div class="list-tabs" role="tablist">' + [['templates', 'Templates'], ['flows', 'Flows']].map(function (t) {
        return '<button class="list-tab' + (ui.listTab === t[0] ? ' active' : '') + '" role="tab" aria-selected="' + (ui.listTab === t[0]) + '" data-action="set-list-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="side-tools" id="side-tools">' + sideToolsInner() + '</div>' +
      '<h2 class="side-title" id="list-title">' + esc(listTitle()) + '</h2>' +
      '<ul class="content-list" id="content-list">' + listHtml() + '</ul>' +
      '</aside>';
  }

  // Re-render only the tools area (never the list), so a click on a list item is not disturbed
  var rerendering = false; // removing a focused field fires focusout; that is not the user leaving the box
  function updateSideTools() {
    var el = document.getElementById('side-tools');
    if (!el) return;
    rerendering = true;
    el.innerHTML = sideToolsInner();
    rerendering = false;
  }
  function focusSideBox() {
    var input = ui.sideBox === 'search' ? document.getElementById('search') : ui.sideBox === 'add' ? document.getElementById('new-name') : null;
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
  function openSideBox(which) { ui.sideBox = which; ui.newError = ''; updateSideTools(); focusSideBox(); }
  function closeSideBox() {
    if (!ui.sideBox) return;
    ui.sideBox = null;   // a search filter stays applied (shown as a chip); a half-typed new name is dropped
    ui.newError = '';
    updateSideTools();
  }

  function headHtml(c) {
    var title = ui.renaming
      ? '<div class="rename-row"><input type="text" id="rename-input" value="' + esc(c.name) + '">' +
        '<button class="btn primary" data-action="rename-save">Save</button><button class="btn" data-action="rename-cancel">Cancel</button></div>'
      : '<h2>' + esc(c.name) + '</h2><button class="btn link" data-action="rename-start">Rename</button>';
    var blockWhy = S.blockProblem(c);
    var deployable = c.translations.filter(function (t) { return !S.canDeploy(c, t); }).length;
    return '<div class="content-head">' +
      '<div><div class="title">' + title + '</div>' +
      '<div class="muted small">Template name base: <code>' + esc(S.slugOf(c)) + '</code> · ' + c.translations.length + ' language' + (c.translations.length === 1 ? '' : 's') +
      (c.campaignIds.length ? ' · ' + (c.campaignIds.length === 1 ? 'Campaign' : 'Campaigns') + ': ' + esc(c.campaignIds.map(S.campaignName).join(', ')) : '') + '</div></div>' +
      '<div class="actions">' +
      (blockWhy ? '' : '<label class="block-switch' + (c.blocked ? ' on' : '') + '" title="When on, Publish all does nothing for this content"><input type="checkbox" data-change="toggle-block"' + (c.blocked ? ' checked' : '') + '> Block template approval</label>') +
      '<button class="btn icon" data-action="csv-one" title="Download CSV of this content (' + esc(c.name) + ')" aria-label="Download CSV of this content">' + ICON_DOWNLOAD + '<span>CSV</span></button>' +
      '<button class="btn icon" data-action="json-one" title="Download the orchestrator\'s extra_content JSON (placeholders, header, buttons, footer) for ' + esc(c.name) + '" aria-label="Download extra_content JSON">' + ICON_DOWNLOAD + '<span>JSON</span></button>' +
      '<button class="btn deploy" data-action="deploy-all"' + (deployable ? '' : ' disabled') + '>Publish all' + (deployable ? ' (' + deployable + ')' : '') + '</button>' +
      '</div></div>' +
      (c.blocked ? '<div class="banner">Template approval is blocked for this content. Publishing is disabled, and it stays free-text only.</div>' : '') +
      '';
  }

  function langOptions(c, selected, exclude) {
    return c.translations.filter(function (t) { return t.lang !== exclude; }).map(function (t) {
      return '<option value="' + t.lang + '"' + (t.lang === selected ? ' selected' : '') + '>' + esc(S.langName(t.lang)) + ' (' + t.lang + ')</option>';
    }).join('');
  }

  function addLangHtml(c) {
    var missing = S.LANGUAGES.filter(function (l) { return !S.getTr(c, l.code); });
    return missing.length
      ? '<select class="field-select" data-change="add-lang"><option value="">+ Add language…</option>' +
        missing.map(function (l) { return '<option value="' + l.code + '">' + esc(l.name) + ' (' + l.code + ')</option>'; }).join('') + '</select>'
      : '';
  }

  function toolbarHtml(c) {
    var left = '';
    if (ui.side) {
      left = '<label>Reference <select data-change="set-ref">' + langOptions(c, ui.refLang) + '</select></label>' +
        '<label>Editing <select data-change="set-edit">' + langOptions(c, ui.editLang) + '</select></label>';
    }
    return '<div class="toolbar">' +
      '<label><input type="checkbox" data-change="toggle-side"' + (ui.side ? ' checked' : '') + '> Side by side</label>' +
      left + '<span style="flex:1"></span>' +
      (ui.historyOpen ? '' : '<button class="btn" data-action="toggle-history-pane">Show history</button>') + '</div>';
  }

  function waNameHtml(tr) {
    return '<span class="wa-name muted small">wa_template_name ' + (tr.waName ? '<code>' + esc(tr.waName) + '</code>' : '<code>(empty until published)</code>') + '</span>';
  }

  // ---- template parts (shared by the editing panel and the read-only reference panel) ----------------
  function counter(key, n, max) {
    return '<span class="count' + (n > max ? ' over' : '') + '" data-count="' + key + '">' + n + '</span> / ' + max;
  }
  function lbl(text, extra) { return '<div class="sec-label">' + text + (extra ? ' <span class="muted">' + extra + '</span>' : '') + '</div>'; }
  function posChips(list) { return list.map(function (n) { return '<span class="pos">{{' + n + '}}</span>'; }).join(' '); }

  function shownFor(c, tr) { var k = draftKey(c.id, tr.lang); return ui.shown[k] || (ui.shown[k] = {}); }
  function footerShown(c, tr, p) { var sh = ui.shown[draftKey(c.id, tr.lang)]; return p.footer.length > 0 || !!(sh && sh.footer); }

  // Header type is one per template (name level); each language has its own media id
  function secHeader(c, tr, p, ro) {
    if (c.headerType === 'none') return '';
    var label = S.HEADER_TYPES.filter(function (h) { return h.id === c.headerType; })[0].label;
    if (ro) {
      return '<div class="sec" data-sec="header">' + lbl('Header', '· ' + label.toLowerCase() + ' media') +
        '<div class="ro-val">' + (p.header ? '<code>' + esc(p.header) + '</code>' : '<span class="muted">No media id</span>') + '</div></div>';
    }
    return '<div class="sec" data-sec="header"><div class="sec-label sec-row"><span>Header</span>' +
      '<select class="field-select sm" data-change="set-header-type" aria-label="Header type" title="Applies to every language of this template">' +
      S.HEADER_TYPES.filter(function (h) { return h.id !== 'none'; }).map(function (h) { return '<option value="' + h.id + '"' + (h.id === c.headerType ? ' selected' : '') + '>' + h.label + '</option>'; }).join('') + '</select>' +
      '<span class="grow"></span><button class="btn link" data-action="remove-header" title="Remove the header from every language">Remove</button></div>' +
      '<input class="field" data-input="header" data-lang="' + tr.lang + '" value="' + esc(p.header) + '" placeholder="Media ID (TurnMedia uuid)" autocomplete="off" spellcheck="false"></div>';
  }

  function secBody(c, tr, p, ro) {
    if (ro) {
      var empty = !p.text.trim();
      return '<div class="sec" data-sec="body">' + lbl('Body') + '<div class="ref-text' + (empty ? ' empty' : '') + '">' + (empty ? 'No text yet in this language' : esc(p.text)) + '</div></div>';
    }
    return '<div class="sec" data-sec="body">' + lbl('Body', '· ' + counter('text', p.text.length, S.LIMITS.body)) +
      '<textarea data-input="text" data-lang="' + tr.lang + '" placeholder="Write the ' + esc(S.langName(tr.lang)) + ' text here. Use {{name}} for a placeholder." spellcheck="false">' + esc(p.text) + '</textarea></div>';
  }

  // An editable placeholder name: {{ [name] }}. Committed on Enter / blur (the `change` event), not per keystroke,
  // because renaming rewrites every occurrence in the text.
  function nameInput(kind, tr, name, idx) {
    return '<span class="ph-name"><span class="muted">{{</span><input class="field" data-change="' + kind + '" data-lang="' + tr.lang + '" data-name="' + esc(name) + '"' +
      (idx !== '' ? ' data-idx="' + idx + '"' : '') + ' value="' + esc(name) + '" aria-label="Placeholder name (edit to rename)" autocomplete="off" spellcheck="false"><span class="muted">}}</span></span>';
  }

  // The layer on top of WhatsApp's numbered placeholders: named in the body, numbered for WhatsApp.
  // Only shown when the body has placeholders; the (empty) container stays so it can appear while typing.
  function secPlaceholders(c, tr, p, ro) {
    var pos = S.positionsOf(p.text), names = Object.keys(pos);
    if (!names.length) return ro ? '' : '<div data-sec="placeholders"></div>';
    var rows = names.map(function (n) {
      var d = (p.defaults || {})[n] || '';
      return '<tr><td>' + (ro ? '<code>{{' + esc(n) + '}}</code>' : nameInput('ph-rename', tr, n, '')) + '</td><td>' + posChips(pos[n]) + '</td><td>' +
        (ro ? esc(d) : '<input class="field" data-input="default" data-lang="' + tr.lang + '" data-name="' + esc(n) + '" value="' + esc(d) + '" placeholder="Default value" autocomplete="off">') + '</td></tr>';
    }).join('');
    return '<div class="sec" data-sec="placeholders">' + lbl('Placeholders') +
      '<div class="wa-body"><span class="muted small">WhatsApp body</span><div class="wa-body-text">' + esc(S.whatsappBody(p.text)) + '</div></div>' +
      '<table class="ph-table"><thead><tr><th>Name</th><th>WhatsApp position</th><th>Default value</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (ro ? '' : '<div class="muted small ph-help">Edit a name to rename it everywhere. One name can fill several WhatsApp positions: use it more than once, or rename another placeholder to it.</div>') + '</div>';
  }

  function btnParams(tr, b, i, ro) {
    var pos = S.positionsOf(b.url), names = Object.keys(pos);
    if (!names.length) return '<div class="btn-params" data-params="' + i + '"></div>';
    return '<div class="btn-params" data-params="' + i + '"><table class="ph-table"><thead><tr><th>URL placeholder</th><th>Position</th><th>Default value</th></tr></thead><tbody>' +
      names.map(function (n) {
        var d = (b.default_parameters || {})[n] || '';
        return '<tr><td>' + (ro ? '<code>{{' + esc(n) + '}}</code>' : nameInput('btn-ph-rename', tr, n, i)) + '</td><td>' + posChips(pos[n]) + '</td><td>' +
          (ro ? esc(d) : '<input class="field" data-input="btn-param" data-lang="' + tr.lang + '" data-idx="' + i + '" data-name="' + esc(n) + '" value="' + esc(d) + '" placeholder="Default value" autocomplete="off">') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // Buttons: limits are 3 quick replies and 1 URL button. They are added with the + Add dropdown.
  function secButtons(c, tr, p, ro) {
    var bs = p.buttons || [];
    if (ro) {
      if (!bs.length) return '';
      return '<div class="sec" data-sec="buttons">' + lbl('Buttons') + bs.map(function (b, i) {
        var url = b.type === 'URL';
        return '<div class="bro"><span class="btype">' + (url ? 'URL' : 'Quick reply') + '</span> “' + esc(b.text) + '” <span class="muted">→</span> ' +
          (url ? esc(b.url) : esc(b.default_payload)) + (url ? btnParams(tr, b, i, true) : '') + '</div>';
      }).join('') + '</div>';
    }
    if (!bs.length) return '<div data-sec="buttons"></div>';
    var n = S.buttonCounts(bs);
    return '<div class="sec" data-sec="buttons">' + lbl('Buttons', '· quick replies ' + n.quickReply + ' / ' + S.LIMITS.quickReplies + ' · URL ' + n.url + ' / ' + S.LIMITS.urlButtons) +
      bs.map(function (b, i) {
        var url = b.type === 'URL';
        return '<div class="bcard" data-idx="' + i + '"><div class="bcard-head"><span class="btype">' + (url ? 'URL' : 'Quick reply') + '</span>' +
          '<span class="muted small">Button ' + (i + 1) + '</span><span class="grow"></span>' +
          '<button class="btn link" data-action="btn-remove" data-lang="' + tr.lang + '" data-idx="' + i + '" aria-label="Remove button ' + (i + 1) + '">Remove</button></div>' +
          '<label class="fld"><span>Text <span class="muted small">' + counter('btn-text-' + i, (b.text || '').length, S.LIMITS.buttonText) + '</span></span>' +
          '<input class="field" data-input="btn-text" data-lang="' + tr.lang + '" data-idx="' + i + '" value="' + esc(b.text) + '" autocomplete="off"></label>' +
          (url
            ? '<label class="fld"><span>URL <span class="muted small">use {{name}} for a variable part</span></span>' +
              '<input class="field" data-input="btn-url" data-lang="' + tr.lang + '" data-idx="' + i + '" value="' + esc(b.url) + '" placeholder="https://" autocomplete="off" spellcheck="false"></label>' + btnParams(tr, b, i, false)
            : '<label class="fld"><span>Default payload</span><input class="field" data-input="btn-payload" data-lang="' + tr.lang + '" data-idx="' + i + '" value="' + esc(b.default_payload) + '" autocomplete="off" spellcheck="false"></label>') +
          '</div>';
      }).join('') + '</div>';
  }

  // Footer is per language and optional: shown when it has text, or after it was added with the + Add dropdown
  function secFooter(c, tr, p, ro) {
    if (ro) return p.footer ? '<div class="sec" data-sec="footer">' + lbl('Footer') + '<div class="ro-val">' + esc(p.footer) + '</div></div>' : '';
    if (!footerShown(c, tr, p)) return '';
    return '<div class="sec" data-sec="footer"><div class="sec-label sec-row"><span>Footer <span class="muted">· ' + counter('footer', p.footer.length, S.LIMITS.footer) + '</span></span>' +
      '<span class="grow"></span><button class="btn link" data-action="remove-footer" data-lang="' + tr.lang + '">Remove</button></div>' +
      '<input class="field" data-input="footer" data-lang="' + tr.lang + '" value="' + esc(p.footer) + '" placeholder="No placeholders." autocomplete="off"></div>';
  }

  // The one place to add things: a header (type chosen here), a footer, quick-reply / URL buttons.
  // Options that are already present or at their limit stay listed but disabled, with the reason.
  function secAdd(c, tr, p) {
    var n = S.buttonCounts(p.buttons), canQr = S.canAddButton(p.buttons, 'QUICK_REPLY'), canUrl = S.canAddButton(p.buttons, 'URL');
    function opt(value, label, disabled) { return '<option value="' + value + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '</option>'; }
    var sections = '';
    if (c.headerType === 'none') sections += S.HEADER_TYPES.filter(function (h) { return h.id !== 'none'; }).map(function (h) { return opt('header:' + h.id, 'Header · ' + h.label); }).join('');
    if (!footerShown(c, tr, p)) sections += opt('footer', 'Footer');
    var buttons = opt('button:QUICK_REPLY', 'Quick reply button (' + n.quickReply + ' of ' + S.LIMITS.quickReplies + ' used)', !canQr) +
      opt('button:URL', 'URL button' + (canUrl ? '' : ' (already added)'), !canUrl);
    return '<div class="sec add-row" data-sec="add"><select class="field-select" data-change="add-part" data-lang="' + tr.lang + '" aria-label="Add a header, footer or button">' +
      '<option value="">+ Add…</option>' + (sections ? '<optgroup label="Sections">' + sections + '</optgroup>' : '') + '<optgroup label="Buttons">' + buttons + '</optgroup></select></div>';
  }

  // Only shown when there is something wrong (the container stays so it can appear while typing)
  function secProblems(c, p) {
    var list = S.problems(c, p).filter(function (x) { return x.code !== 'empty'; });
    if (!list.length) return '<div data-sec="problems"></div>';
    return '<div class="sec" data-sec="problems"><div class="probs"><div class="sec-label">Problems (' + list.length + ') <span class="muted">· these block publishing</span></div><ul>' +
      list.map(function (x) { return '<li><strong>' + esc(x.part) + '</strong> ' + esc(x.message) + '</li>'; }).join('') + '</ul></div></div>';
  }

  function refPanelHtml(c, tr) {
    var p = S.partsOf(tr);
    return '<section class="panel ref' + subjectCls('ref') + '" data-role="ref" data-lang="' + tr.lang + '">' +
      '<div class="panel-head"><strong>' + langLabel(tr.lang) + '</strong><span class="badge ' + S.statusOf(tr, c) + '">' + STATUS_LABEL[S.statusOf(tr, c)] + '</span><span class="role">Reference (read-only)</span></div>' +
      secHeader(c, tr, p, true) + secBody(c, tr, p, true) + secPlaceholders(c, tr, p, true) + secButtons(c, tr, p, true) + secFooter(c, tr, p, true) +
      '<div class="panel-foot">' + waNameHtml(tr) + '</div></section>';
  }

  function editPanelHtml(c, tr) {
    var p = currentParts(c, tr);
    var dirty = isDirty(c, tr);
    return '<section class="panel edit' + subjectCls('edit') + '" data-role="edit" data-lang="' + tr.lang + '">' +
      '<div class="panel-head"><strong>' + langLabel(tr.lang) + '</strong><span class="badge ' + S.statusOf(tr, c) + '">' + STATUS_LABEL[S.statusOf(tr, c)] + '</span><span class="role">Editing</span></div>' +
      secHeader(c, tr, p, false) + secBody(c, tr, p, false) + secPlaceholders(c, tr, p, false) + secButtons(c, tr, p, false) + secFooter(c, tr, p, false) + secAdd(c, tr, p) + secProblems(c, p) +
      '<div class="panel-foot">' +
      '<span class="dirty-note small" style="color:var(--warn)">' + (dirty ? 'Unsaved changes' : '') + '</span>' +
      '<span class="grow"></span>' + waNameHtml(tr) +
      '<button class="btn revert" data-action="revert" data-lang="' + tr.lang + '"' + (dirty ? '' : ' disabled') + '>Revert</button>' +
      '<button class="btn primary save" data-action="save" data-lang="' + tr.lang + '"' + (dirty ? '' : ' disabled') + '>Save</button>' +
      '</div></section>';
  }

  function overviewHtml(c) {
    var rows = c.translations.map(function (t) {
      var sel = t.lang === ui.editLang;
      return '<tr class="clickable' + (sel ? ' selected' : '') + '" data-action="pick-lang" data-lang="' + t.lang + '" tabindex="0"' +
        (sel ? ' aria-current="true"' : '') + ' title="Edit ' + esc(S.langName(t.lang)) + '">' +
        '<td>' + langLabel(t.lang) + (isDirty(c, t) ? '<span class="dot" title="Unsaved changes"></span>' : '') + '</td>' +
        '<td>' + (t.waName ? '<code>' + esc(t.waName) + '</code>' : '<span class="muted">—</span>') + '</td>' +
        '<td><span class="badge ' + S.statusOf(t, c) + '">' + STATUS_LABEL[S.statusOf(t, c)] + '</span>' +
          (problemCount(c, t) ? ' <span class="badge blocked" title="Problems block publishing">' + problemCount(c, t) + ' problem' + (problemCount(c, t) === 1 ? '' : 's') + '</span>' : '') + '</td>' +
        '<td class="snippet">' + (t.text ? esc(t.text) : '<span class="muted">(empty)</span>') + '</td></tr>';
    }).join('');
    return '<div class="table-head"><h3 class="section-title">All languages <span class="muted" style="text-transform:none;letter-spacing:0">· click a row to edit that language</span></h3>' + addLangHtml(c) + '</div>' +
      '<table class="overview"><thead><tr><th>Language</th><th>wa_template_name</th><th>Status</th><th>Text (saved)</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function editHtml(c) {
    var editTr = S.getTr(c, ui.editLang);
    var body;
    if (ui.side) {
      var refTr = S.getTr(c, ui.refLang);
      if (c.translations.length < 2) {
        body = '<div class="hint">Add a second language (in the table below) to see two languages side by side.</div><div class="panels single" style="margin-top:16px">' + editPanelHtml(c, editTr) + '</div>';
      } else {
        body = '<div class="panels">' + refPanelHtml(c, refTr) + editPanelHtml(c, editTr) + '</div>';
      }
    } else {
      body = '<div class="panels single">' + editPanelHtml(c, editTr) + '</div>';
    }
    return toolbarHtml(c) + body + overviewHtml(c);
  }

  function diffHtml(before, after) {
    return S.diffWords(before, after).map(function (seg) {
      var cls = seg.type === 'add' ? 'd-add' : seg.type === 'del' ? 'd-del' : '';
      return cls ? '<span class="' + cls + '">' + esc(seg.text) + '</span>' : esc(seg.text);
    }).join('');
  }

  function eventHtml(e, compact) {
    var body = '';
    if (e.action === 'text_edited') body = diffHtml(e.before, e.after);
    else if (e.action === 'renamed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'language_added') body = e.after ? '<div class="quote">' + esc(e.after) + '</div>' : '<span class="muted">Started empty</span>';
    else if (e.action === 'deployed') body = 'Template name <code>' + esc(e.detail) + '</code>';
    else if (e.action === 'content_created') body = esc(e.after);
    else if (e.action === 'part_edited') body = diffHtml(e.before, e.after);
    else if (e.action === 'timing_edited') body = diffHtml(e.before, e.after);
    else if (e.action === 'flow_created') body = esc(e.after);
    else if (e.action === 'flow_renamed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_step_added') body = '<strong>' + esc(e.after) + '</strong> <span class="muted">· ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_step_removed') body = '<strong>' + esc(e.before) + '</strong> <span class="muted">· was ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_steps_reordered') body = diffHtml(e.before, e.after);
    else if (e.action === 'flow_timing_edited') body = '<strong>' + esc(e.detail) + '</strong>: ' + diffHtml(e.before, e.after);
    else if (e.action === 'flow_reordered') body = esc(e.detail);
    else if (e.action === 'flow_copied') body = 'Also in <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_moved') body = (e.before ? esc(e.before) + ' → ' : 'Into ') + '<strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'header_type_changed') body = esc(e.before || 'None') + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'campaign_copied') body = 'Also in <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'campaign_moved') body = (e.before ? esc(e.before) + ' → ' : 'Into ') + '<strong>' + esc(e.after) + '</strong>';
    return '<li class="event act-' + e.action + '"><div class="event-head">' +
      '<strong>' + esc(e.action === 'part_edited' ? 'Edited ' + String(e.detail).toLowerCase() : (S.ACTION_LABELS[e.action] || e.action)) + '</strong>' +
      (e.lang && !compact ? '<span class="chip">' + esc(S.langName(e.lang)) + '</span>' : '') +
      '<span class="muted small">by ' + esc(e.actor) + '</span>' +
      '<span class="when">' + esc(fmtTime(e.ts)) + '</span></div>' +
      (body ? '<div class="event-body">' + body + '</div>' : '') + '</li>';
  }

  // ---- right sidebar: history -------------------------------------------------
  function sideActive(c) { return ui.side && c.translations.length > 1; }
  function subjectLang(c) { return sideActive(c) && ui.histSubject === 'ref' ? ui.refLang : ui.editLang; }
  function subjectCls(role) {
    var c = S.get(ui.selectedId);
    return c && sideActive(c) && ui.histSubject === role ? ' subject' : '';
  }

  function historyPaneInner(c) {
    var fl = currentFlow();
    if (fl) {
      var fev = S.historyForFlow(fl.id);
      return '<div class="hp-head"><div class="hp-top"><h3>History</h3><span class="grow"></span>' +
        '<button class="btn link" data-action="toggle-history-pane" title="Hide history">Hide</button></div>' +
        '<div class="hp-tabs" role="tablist"><button class="hp-tab active" role="tab" aria-selected="true">Flow</button></div></div>' +
        (fev.length ? '<ul class="timeline compact">' + fev.map(function (e) { return eventHtml(e, true); }).join('') + '</ul>' : '<div class="hint">No history yet.</div>');
    }
    var side = sideActive(c);
    var lang = subjectLang(c);
    var tabs = side
      ? [{ id: 'ref', label: S.langName(ui.refLang), cap: 'Reference' }, { id: 'edit', label: S.langName(ui.editLang), cap: 'Editing' }]
      : [{ id: 'edit', label: S.langName(ui.editLang) }];
    tabs.push({ id: 'other', label: 'Other' });
    var active = ui.nameOpen ? 'other' : (side ? ui.histSubject : 'edit');

    var tabsHtml = '<div class="hp-tabs" role="tablist">' + tabs.map(function (t) {
      return '<button class="hp-tab' + (t.id === active ? ' active' : '') + '" role="tab" aria-selected="' + (t.id === active) + '" data-action="hist-tab" data-tab="' + t.id + '">' +
        (t.cap ? '<span class="cap">' + t.cap + '</span>' : '') + esc(t.label) + '</button>';
    }).join('') + '</div>';

    var head = '<div class="hp-head"><div class="hp-top"><h3>History</h3><span class="grow"></span>' +
      '<button class="btn link" data-action="toggle-history-pane" title="Hide history">Hide</button></div>' + tabsHtml + '</div>';

    var body;
    if (active === 'other') {
      var names = S.historyFor(c.id, 'content');
      body = '<div class="muted small" style="margin-bottom:12px">Not tied to a language: created, renamed, approval blocked/allowed, header type changed, timing changed, copied or moved between campaigns.</div>' +
        (names.length ? '<ul class="timeline compact">' + names.map(function (e) { return eventHtml(e, true); }).join('') + '</ul>' : '<div class="hint">None yet.</div>');
    } else {
      var events = S.historyFor(c.id, lang);
      body = events.length
        ? '<ul class="timeline compact">' + events.map(function (e) { return eventHtml(e, true); }).join('') + '</ul>'
        : '<div class="hint">No history yet for ' + esc(S.langName(lang)) + '.</div>';
    }
    return head + body;
  }

  // Re-render only the sidebar (and the highlighted panel); never touches the textarea or its caret
  function updateHistoryPane() {
    var c = S.get(ui.selectedId);
    if (!c && !currentFlow()) return;
    var pane = document.getElementById('history-pane');
    if (pane) pane.innerHTML = historyPaneInner(c);
    var panels = document.querySelectorAll('.panel[data-role]');
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.toggle('subject', !!c && sideActive(c) && panels[i].getAttribute('data-role') === ui.histSubject);
    }
  }

  // ---- Flows tab: selection, the flow editor, the card for a template that is a flow by itself ----------
  function ensureFlowSel() {                 // keep the selection on something that is still listed
    var items = S.flowItems(ui.campaignId);
    var cur = ui.flowSel && items.filter(function (it) { return it.kind === ui.flowSel.kind && (it.kind === 'flow' ? it.flow.id : it.content.id) === ui.flowSel.id; })[0];
    if (!cur) {
      cur = items[0] || null;
      ui.flowSel = cur ? { kind: cur.kind, id: cur.kind === 'flow' ? cur.flow.id : cur.content.id } : null;
    }
    return cur;
  }
  function currentFlow() {                   // the explicit flow shown in the Flows tab, if any
    return ui.listTab === 'flows' && ui.flowSel && ui.flowSel.kind === 'flow' ? S.getFlow(ui.flowSel.id) : null;
  }

  // "<n> days [before|after] <reference date>": committed on change (Enter / blur), one history event per edit
  function timingEditor(t, attrs) {
    function sel(v, label) { return '<option value="' + v + '"' + (t.when === v ? ' selected' : '') + '>' + label + '</option>'; }
    return '<span class="timing" ' + attrs + '>' +
      '<input class="field num" type="number" min="0" max="999" step="1" data-t="days" data-change="timing" value="' + esc(t.days) + '" aria-label="Number of days">' +
      '<span class="muted">days</span>' +
      '<select class="field-select" data-t="when" data-change="timing" aria-label="Before or after">' + sel('before', 'before') + sel('after', 'after') + '</select>' +
      '<input class="field ref" type="text" list="ref-dates" data-t="ref" data-change="timing" value="' + esc(t.ref) + '" aria-label="Reference date" placeholder="reference_date" autocomplete="off" spellcheck="false">' +
      '</span>';
  }

  function flowCardHtml(c) {
    return '<div class="flow-card"><div class="flow-card-row">' + FLOW_IND + '<strong>This template is itself a flow.</strong>' +
      '<span class="muted small">It is in no flow of ' + (ui.campaignId ? 'this campaign' : 'its campaign') + '.</span></div>' +
      '<div class="flow-card-row"><span class="muted">Sent</span>' + timingEditor(c.timing, 'data-tpl="' + c.id + '"') + '</div></div>';
  }

  function flowEditorHtml(f) {
    var title = ui.renaming
      ? '<div class="rename-row"><input type="text" id="rename-input" value="' + esc(f.name) + '">' +
        '<button class="btn primary" data-action="rename-save">Save</button><button class="btn" data-action="rename-cancel">Cancel</button></div>'
      : '<h2>' + esc(f.name) + '</h2><button class="btn link" data-action="rename-start">Rename</button>';
    var inFlow = f.steps.map(function (st) { return st.templateId; });
    var addable = S.list().filter(function (c) { return inFlow.indexOf(c.id) === -1; });
    var steps = f.steps.map(function (st, i) {
      var c = S.get(st.templateId);
      return '<li class="step-row" data-flow="' + f.id + '" data-idx="' + i + '">' +
        '<span class="drag-handle" draggable="true" aria-hidden="true" title="Drag to reorder">' + ICON_GRIP + '</span>' +
        '<span class="step-no">' + (i + 1) + '</span>' +
        '<div class="step-main"><button class="btn link step-name" data-action="open-template" data-id="' + st.templateId + '" title="Open this template">' + esc(c ? c.name : st.templateId) + '</button>' +
        '<div class="step-timing"><span class="muted">Sent</span>' + timingEditor(st.timing, 'data-flow="' + f.id + '" data-idx="' + i + '"') + '</div></div>' +
        '<button class="btn link" data-action="step-remove" data-idx="' + i + '" aria-label="Remove ' + esc(c ? c.name : 'template') + ' from the flow">Remove</button></li>';
    }).join('');
    return '<div class="content-head"><div><div class="title">' + title + '</div>' +
      '<div class="muted small">Flow · ' + f.steps.length + ' template' + (f.steps.length === 1 ? '' : 's') +
      (f.campaignIds.length ? ' · ' + (f.campaignIds.length === 1 ? 'Campaign' : 'Campaigns') + ': ' + esc(f.campaignIds.map(S.campaignName).join(', ')) : '') + '</div></div>' +
      (ui.historyOpen ? '' : '<div class="actions"><button class="btn" data-action="toggle-history-pane">Show history</button></div>') + '</div>' +
      '<h3 class="section-title">Templates, in sending order <span class="muted" style="text-transform:none;letter-spacing:0">· drag the handle to reorder</span></h3>' +
      (steps ? '<ol class="steps" id="steps">' + steps + '</ol>' : '<div class="hint">No templates in this flow yet. Add one below.</div>') +
      '<div class="add-step"><select class="field-select" data-change="add-step" data-flow="' + f.id + '" aria-label="Add a template to this flow"' + (addable.length ? '' : ' disabled') + '>' +
      '<option value="">+ Add template…</option>' + addable.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select></div>';
  }

  function flowsMainHtml(fi, c) {
    if (!fi) return '<div class="hint">No flows here yet. Use the + button in the left bar to create one. Templates that are not in a flow are listed here as flows by themselves.</div>';
    if (fi.kind === 'template') return flowCardHtml(fi.content) + headHtml(fi.content) + editHtml(fi.content);
    return flowEditorHtml(fi.flow);
  }

  function render() {
    var fi = null;
    if (ui.listTab === 'flows') {
      fi = ensureFlowSel();
      if (fi && fi.kind === 'template') ui.selectedId = fi.content.id;   // a template that is a flow: edit it like any template
    }
    var c = normalize();
    var main;
    if (ui.listTab === 'flows') main = flowsMainHtml(fi, c);
    else main = c
      ? headHtml(c) + editHtml(c)
      : '<div class="hint">No content in ' + (ui.campaignId ? 'this campaign' : 'the list') + ' yet. Use the + button in the left bar to add one.</div>';
    var subject = currentFlow() || (ui.listTab === 'flows' ? (fi && fi.kind === 'template' ? c : null) : c);
    var pane = subject && ui.historyOpen ? '<aside class="history-pane" id="history-pane">' + historyPaneInner(c) + '</aside>' : '';
    $app.innerHTML = topbarHtml() + '<div class="layout' + (pane ? '' : ' hist-off') + '">' + campaignsHtml() + sidebarHtml() + '<main class="main">' + main + '</main>' + pane + '</div>' +
      '<datalist id="ref-dates">' + S.REF_DATES.map(function (d) { return '<option value="' + d + '">'; }).join('') + '</datalist>';
    if (ui.focusNext) {
      var fields = document.querySelectorAll(ui.focusNext);
      if (fields.length) fields[fields.length - 1].focus();
      ui.focusNext = null;
    }
    else if (ui.renaming) { var r = document.getElementById('rename-input'); if (r) { r.focus(); r.select(); } }
    else if (ui.sideBox) focusSideBox();
    else if (ui.campBox) focusCampBox();
  }

  // ---- events ----------------------------------------------------------------
  function result(r, okMsg) {
    if (r.ok) { if (okMsg) toast(okMsg); } else toast(r.error, true);
    return r.ok;
  }

  function panelOf(lang) { return document.querySelector('.panel.edit[data-lang="' + lang + '"]'); }

  // Re-render one section of the editing panel. Only sections that do not contain the field being typed in
  function refreshSec(lang, sec) {
    var c = S.get(ui.selectedId), tr = c && S.getTr(c, lang), panel = panelOf(lang);
    if (!tr || !panel) return;
    var el = panel.querySelector('[data-sec="' + sec + '"]');
    if (!el) return;
    var p = currentParts(c, tr);
    var html = sec === 'placeholders' ? secPlaceholders(c, tr, p, false) : sec === 'buttons' ? secButtons(c, tr, p, false) : sec === 'problems' ? secProblems(c, p) : sec === 'add' ? secAdd(c, tr, p) : null;
    if (html !== null) el.outerHTML = html;
  }
  function refreshParams(lang, idx) {
    var c = S.get(ui.selectedId), tr = c && S.getTr(c, lang), panel = panelOf(lang);
    var el = panel && panel.querySelector('[data-params="' + idx + '"]');
    if (el) el.outerHTML = btnParams(tr, currentParts(c, tr).buttons[idx], idx, false);
  }
  // A timing row (days / before-after / reference date) changed. The reference date is normalised to a variable-style
  // name (lowercase, spaces become _). Invalid input is refused with a message and the row goes back.
  function saveTimingFromUi(input) {
    var box = input.closest('.timing');
    var daysText = box.querySelector('[data-t=days]').value.trim();
    var timing = {
      days: daysText === '' ? NaN : Number(daysText),
      when: box.querySelector('[data-t=when]').value,
      ref: box.querySelector('[data-t=ref]').value.trim().toLowerCase().replace(/\s+/g, '_')
    };
    var r = box.hasAttribute('data-tpl')
      ? S.setTemplateTiming(box.getAttribute('data-tpl'), timing)
      : S.setStepTiming(box.getAttribute('data-flow'), parseInt(box.getAttribute('data-idx'), 10), timing);
    if (!r.ok && r.error !== 'No change') toast(r.error, true);
    render();
  }

  // Rename (or merge) a placeholder from its name field, in the body or in a URL button
  function renamePlaceholderFromUi(input, inUrl) {
    var c = S.get(ui.selectedId), lang = input.getAttribute('data-lang'), tr = S.getTr(c, lang);
    var from = input.getAttribute('data-name'), idx = parseInt(input.getAttribute('data-idx'), 10);
    var d = editableDraft(c, tr), btn = inUrl ? d.buttons[idx] : null;
    var r = inUrl ? S.renamePlaceholder(btn.url, btn.default_parameters, from, input.value) : S.renamePlaceholder(d.text, d.defaults, from, input.value);
    var restore = function () { if (inUrl) refreshParams(lang, idx); else refreshSec(lang, 'placeholders'); };
    if (!r.ok) { toast(r.error, true); restore(); return; }
    if (!r.changed) { restore(); return; }                     // same name (or only spaces were added)
    var panel = panelOf(lang);
    if (inUrl) {
      btn.url = r.text; btn.default_parameters = r.defaults;
      panel.querySelector('[data-input="btn-url"][data-idx="' + idx + '"]').value = r.text;
    } else {
      d.text = r.text; d.defaults = r.defaults;
      panel.querySelector('[data-input="text"]').value = r.text;
      setCount(lang, 'text', r.text.length, S.LIMITS.body);
    }
    restore(); refreshSec(lang, 'problems'); syncDirty(lang);
    if (r.merged) toast('{{' + from + '}} now uses the existing name: one value fills several WhatsApp positions');
  }
  function setCount(lang, key, n, max) {
    var el = panelOf(lang).querySelector('[data-count="' + key + '"]');
    if (el) { el.textContent = n; el.classList.toggle('over', n > max); }
  }
  function syncDirty(lang) {
    var c = S.get(ui.selectedId), tr = S.getTr(c, lang), panel = panelOf(lang), dirty = isDirty(c, tr);
    panel.querySelector('.dirty-note').textContent = dirty ? 'Unsaved changes' : '';
    panel.querySelector('.save').disabled = !dirty;
    panel.querySelector('.revert').disabled = !dirty;
  }

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'search') {
      ui.search = t.value;
      document.getElementById('content-list').innerHTML = listHtml();
      var clear = t.parentNode.querySelector('.clear-btn');
      if (t.value && !clear) {            // show the clear button without touching the text field
        t.insertAdjacentHTML('afterend', '<button class="clear-btn" data-action="clear-search" aria-label="Clear search" title="Clear">×</button>');
      } else if (!t.value && clear) {
        clear.remove();
      }
      return;
    }
    var kind = t.getAttribute('data-input');
    if (kind) {
      var c = S.get(ui.selectedId), lang = t.getAttribute('data-lang'), tr = S.getTr(c, lang);
      var d = editableDraft(c, tr), idx = parseInt(t.getAttribute('data-idx'), 10), name = t.getAttribute('data-name');
      if (kind === 'text') { d.text = t.value; setCount(lang, 'text', t.value.length, S.LIMITS.body); refreshSec(lang, 'placeholders'); }
      else if (kind === 'footer') { d.footer = t.value; setCount(lang, 'footer', t.value.length, S.LIMITS.footer); }
      else if (kind === 'header') { d.header = t.value; }
      else if (kind === 'default') { d.defaults[name] = t.value; }
      else if (kind === 'btn-text') { d.buttons[idx].text = t.value; setCount(lang, 'btn-text-' + idx, t.value.length, S.LIMITS.buttonText); }
      else if (kind === 'btn-payload') { d.buttons[idx].default_payload = t.value; }
      else if (kind === 'btn-url') { d.buttons[idx].url = t.value; refreshParams(lang, idx); }
      else if (kind === 'btn-param') { d.buttons[idx].default_parameters[name] = t.value; }
      refreshSec(lang, 'problems');
      syncDirty(lang);
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target, what = t.getAttribute('data-change');
    if (!what) return;
    if (what === 'ph-rename' || what === 'btn-ph-rename') { renamePlaceholderFromUi(t, what === 'btn-ph-rename'); return; }
    if (what === 'timing') { saveTimingFromUi(t); return; }
    if (what === 'add-step') {
      if (!t.value) return;
      var addedTo = S.getFlow(t.getAttribute('data-flow'));
      result(S.addStep(addedTo.id, t.value), 'Added to the flow, with the default timing (edit it below)');
      render();
      return;
    }
    var c = S.get(ui.selectedId);
    if (what === 'toggle-side') { ui.side = t.checked; }
    else if (what === 'set-ref') { ui.refLang = t.value; }
    else if (what === 'set-edit') { ui.editLang = t.value; }
    else if (what === 'set-header-type') { result(S.setHeaderType(c.id, t.value), 'Header type: ' + t.options[t.selectedIndex].text); }
    else if (what === 'add-part') {
      var v = t.value, lang0 = t.getAttribute('data-lang'), tr0 = S.getTr(c, lang0);
      if (!v) return;
      if (v.indexOf('header:') === 0) { result(S.setHeaderType(c.id, v.slice(7)), 'Header added to every language'); ui.focusNext = '.panel.edit [data-input="header"]'; }
      else if (v === 'footer') { shownFor(c, tr0).footer = true; ui.focusNext = '.panel.edit [data-input="footer"]'; }
      else if (v.indexOf('button:') === 0) {
        var d0 = editableDraft(c, tr0), type0 = v.slice(7);
        if (S.canAddButton(d0.buttons, type0)) d0.buttons.push(S.newButton(type0));
        ui.focusNext = '.panel.edit [data-input="btn-text"]';
      }
    }
    else if (what === 'toggle-block') {
      result(S.setBlocked(c.id, t.checked), t.checked ? 'Template approval blocked' : 'Template approval allowed');
    } else if (what === 'add-lang') {
      if (!t.value) return;
      if (result(S.addTranslation(c.id, t.value), S.langName(t.value) + ' added')) {
        ui.editLang = t.value;
        if (ui.refLang === t.value) ui.refLang = null;
      }
    }
    render();
  });

  document.addEventListener('keydown', function (ev) {
    if (ui.dialog) {
      if (ev.key === 'Escape') { ev.preventDefault(); closeDialog(); return; }
      if (ev.key === 'Tab') {                      // keep focus inside the dialog
        var f = $modal.querySelectorAll('button:not([disabled])');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
        else if (!$modal.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
        return;
      }
    }
    var row = ev.target.closest && ev.target.closest('tr[data-action]');
    if (row && ev.target === row && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); row.click(); return; }
    if (ev.key === 'Escape' && ev.target.id === 'search') {
      ui.search = ''; document.getElementById('content-list').innerHTML = listHtml(); closeSideBox(); return;
    }
    if (ev.key === 'Escape' && ev.target.id === 'new-name') { closeSideBox(); return; }
    if (ev.key === 'Escape' && ev.target.id === 'new-campaign') { closeCampBox(); return; }
    if (ev.key === 'Enter' && ev.target.id === 'new-campaign') { addCampaign(); return; }
    if (ev.key === 'Enter' && ev.target.id === 'new-name') { addContent(); }
    else if (ev.key === 'Enter' && ev.target.id === 'rename-input') { saveRename(); }
    else if (ev.key === 'Escape' && ev.target.id === 'rename-input') { ui.renaming = false; render(); }
    else if ((ev.metaKey || ev.ctrlKey) && ev.key === 's' && ev.target.getAttribute && ev.target.getAttribute('data-input') && ev.target.getAttribute('data-lang')) {
      ev.preventDefault();
      doSave(ev.target.getAttribute('data-lang'));
    }
  });

  function addFlow() {
    var r = S.createFlow(document.getElementById('new-name').value, ui.campaignId);
    if (!r.ok) { ui.newError = r.error; document.getElementById('new-error').textContent = r.error; return; }
    ui.newError = ''; ui.sideBox = null; ui.renaming = false;
    ui.flowSel = { kind: 'flow', id: r.flow.id };
    render();
    toast('Created flow "' + r.flow.name + '"' + (r.flow.campaignIds.length ? ' in ' + S.campaignName(r.flow.campaignIds[0]) : ''));
  }

  function addContent() {
    if (ui.listTab === 'flows') return addFlow();
    var input = document.getElementById('new-name');
    var r = S.createContent(input.value, 'en', ui.campaignId);
    if (!r.ok) { ui.newError = r.error; document.getElementById('new-error').textContent = r.error; return; }
    ui.newError = '';
    ui.sideBox = null;
    ui.selectedId = r.content.id;
    ui.renaming = false;
    ui.editLang = null;
    ui.refLang = null;
    render();
    toast('Created "' + r.content.name + '"' + (r.content.campaignIds.length ? ' in ' + S.campaignName(r.content.campaignIds[0]) : ''));
  }

  function saveRename() {
    var fl = currentFlow();
    var c = S.get(ui.selectedId);
    var r = fl ? S.renameFlow(fl.id, document.getElementById('rename-input').value) : S.renameContent(c.id, document.getElementById('rename-input').value);
    if (r.ok || r.error === 'Name unchanged') { ui.renaming = false; render(); if (r.ok) toast('Renamed'); }
    else toast(r.error, true);
  }

  function doSave(lang) {
    var c = S.get(ui.selectedId);
    var key = draftKey(c.id, lang);
    if (!ui.drafts[key]) return;
    if (result(S.saveParts(c.id, lang, ui.drafts[key]), 'Saved ' + S.langName(lang))) {
      delete ui.drafts[key];
      if (!S.partsOf(S.getTr(c, lang)).footer) delete ui.shown[key];   // an added-but-empty footer is not kept
    }
    render();
  }

  // ---- copy / move dialog (after dropping a content name on a campaign) ----------------
  var dialogReturnFocus = null;

  function dialogHtml() {
    var d = ui.dialog, isFlow = d.kind === 'flow';
    var item = isFlow ? S.getFlow(d.flowId) : S.get(d.contentId);
    var plan = isFlow ? S.planFlowDrop(d.flowId, d.targetId) : S.planDrop(d.contentId, d.targetId);
    var target = S.campaignName(d.targetId);
    var existing = plan.existsIn.map(function (id) {
      return '<li><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>' + esc(S.campaignName(id)) +
        (id === d.targetId ? ' <span class="muted small">(this campaign)</span>' : '') + '</li>';
    }).join('');
    var names = plan.existsIn.map(S.campaignName);
    function count(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

    var copyDesc = plan.copy.ok
      ? (names.length ? 'Keep it in ' + names.join(', ') + ' and add it to ' + target : 'Add it to ' + target)
      : plan.copy.reason;
    var fromNames = plan.move.from.map(S.campaignName);
    var moveDesc = plan.move.ok
      ? (fromNames.length ? 'Remove it from ' + fromNames.join(', ') + (plan.inTarget ? ' (it stays in ' + target + ')' : ' and add it to ' + target) : 'Add it to ' + target)
      : plan.move.reason;
    if (isFlow) {      // a flow brings its templates along
      if (plan.copy.ok && plan.copy.addTemplates.length) copyDesc += '. ' + count(plan.copy.addTemplates.length, 'template') + ' will be added to ' + target + ' too';
      if (plan.move.ok) {
        var bits = [];
        if (plan.move.leave.length) bits.push(count(plan.move.leave.length, 'template') + ' move' + (plan.move.leave.length === 1 ? 's' : '') + ' with it');
        if (plan.move.stay.length) bits.push(count(plan.move.stay.length, 'template') + ' stay' + (plan.move.stay.length === 1 ? 's' : '') + ' in ' + fromNames.join(', ') + ' because another flow there uses ' + (plan.move.stay.length === 1 ? 'it' : 'them') + ' (also added to ' + target + ')');
        var staying = plan.move.addTemplates.filter(function (id) { return plan.move.leave.indexOf(id) === -1 && plan.move.stay.indexOf(id) === -1; });
        if (staying.length) bits.push(count(staying.length, 'template') + ' will be added to ' + target);
        if (bits.length) moveDesc += '. ' + bits.join('; ');
      }
    }

    function opt(action, label, desc, ok) {
      return '<button class="dlg-opt' + (ok ? '' : ' off') + '" data-action="' + action + '"' + (ok ? '' : ' disabled') + '><strong>' + label + '</strong><span>' + esc(desc) + '</span></button>';
    }
    return '<div class="modal-backdrop" data-action="dialog-backdrop">' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<h2 id="dlg-title">“' + esc(item.name) + '” <span class="muted">→</span> ' + esc(target) + '</h2>' +
      '<div class="dlg-label">Already in</div>' +
      '<ul class="exists-list" aria-label="Campaigns this ' + (isFlow ? 'flow' : 'template') + ' is already in">' + (existing || '<li class="muted">Not in any campaign yet</li>') + '</ul>' +
      '<div class="dlg-options">' +
      opt('dialog-copy', 'Copy', copyDesc, plan.copy.ok) +
      opt('dialog-move', plan.move.label || 'Move', moveDesc, plan.move.ok) +
      opt('dialog-cancel', 'Cancel', 'Close without changing anything', true) +
      '</div></div></div>';
  }

  function showDialog(dialog) {
    dialogReturnFocus = document.activeElement;
    ui.dialog = dialog;
    $modal.innerHTML = dialogHtml();
    var first = $modal.querySelector('.dlg-opt:not([disabled])');
    if (first) first.focus();
  }
  function openDropDialog(contentId, targetId) {
    if (!S.planDrop(contentId, targetId)) return;
    showDialog({ kind: 'content', contentId: contentId, targetId: targetId });
  }
  function openFlowDialog(flowId, targetId) {
    if (!S.planFlowDrop(flowId, targetId)) return;
    showDialog({ kind: 'flow', flowId: flowId, targetId: targetId });
  }
  function closeDialog() {
    ui.dialog = null;
    $modal.innerHTML = '';
    if (dialogReturnFocus && dialogReturnFocus.focus && document.contains(dialogReturnFocus)) dialogReturnFocus.focus();
    dialogReturnFocus = null;
  }
  function applyDialog(kind) {
    var d = ui.dialog, target = S.campaignName(d.targetId), r, name;
    if (d.kind === 'flow') {
      name = (S.getFlow(d.flowId) || {}).name || '';
      r = kind === 'copy' ? S.copyFlow(d.flowId, d.targetId) : S.moveFlow(d.flowId, d.targetId);
    } else {
      name = (S.get(d.contentId) || {}).name || '';
      r = kind === 'copy' ? S.copyToCampaign(d.contentId, d.targetId) : S.moveToCampaign(d.contentId, d.targetId);
    }
    closeDialog();
    if (r.ok) { render(); toast((kind === 'copy' ? 'Copied ' : 'Moved ') + (d.kind === 'flow' ? 'flow ' : '') + '“' + name + '” to ' + target); }
    else toast(r.error, true);
  }

  // ---- drag and drop ------------------------------------------------------------------
  // What can be dragged (always by its grip handle):
  //   a template, or a template that is a flow by itself -> onto a campaign: Copy / Move / Cancel dialog
  //   a flow you created                                  -> onto a campaign (same dialog), or onto another flow to reorder
  //   a step inside a flow                                -> onto another step of the same flow to reorder
  function dropTarget(ev) {
    var b = ev.target.closest && ev.target.closest('.camp-item');
    return b && b.getAttribute('data-id') ? b : null;     // "All content" is not a target
  }
  function clearDropMarks() {
    var els = document.querySelectorAll('.drop-over, .dragging, .drop-before, .drop-after');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('drop-over', 'dragging', 'drop-before', 'drop-after');
  }
  function placeOf(ev, el) { var r = el.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2 ? 'before' : 'after'; }

  document.addEventListener('dragstart', function (ev) {
    var handle = ev.target.closest && ev.target.closest('.drag-handle');
    if (!handle) return;                               // only a handle starts a drag
    var row = handle.closest('.step-row'), li = handle.closest('.content-item[data-id]');
    var el = row || li;
    if (!el) return;
    if (row) ui.drag = { kind: 'step', flowId: row.getAttribute('data-flow'), idx: parseInt(row.getAttribute('data-idx'), 10) };
    else if (li.classList.contains('flow-item') && li.getAttribute('data-kind') === 'flow') ui.drag = { kind: 'flow', id: li.getAttribute('data-id') };
    else ui.drag = { kind: 'content', id: li.getAttribute('data-id') };   // a template (also one that is a flow by itself)
    try { ev.dataTransfer.setDragImage(el, 24, 20); } catch (e) { /* ignore */ }
    ev.dataTransfer.effectAllowed = 'copyMove';
    try { ev.dataTransfer.setData('text/plain', ui.drag.id || ui.drag.flowId); } catch (e) { /* ignore */ }
    el.classList.add('dragging');
  });

  // Where would this drop land? {type:'campaign'|'flow'|'step', el, place?} or null
  function dropSpot(ev) {
    var d = ui.drag;
    if (!d) return null;
    var camp = dropTarget(ev);
    if (camp && (d.kind === 'content' || d.kind === 'flow')) return { type: 'campaign', el: camp };
    if (d.kind === 'flow') {
      var fi = ev.target.closest && ev.target.closest('.flow-item[data-kind="flow"]');
      if (fi && fi.getAttribute('data-id') !== d.id) return { type: 'flow', el: fi, place: placeOf(ev, fi) };
    }
    if (d.kind === 'step') {
      var sr = ev.target.closest && ev.target.closest('.step-row');
      if (sr && sr.getAttribute('data-flow') === d.flowId && parseInt(sr.getAttribute('data-idx'), 10) !== d.idx) return { type: 'step', el: sr, place: placeOf(ev, sr) };
    }
    return null;
  }
  function dragOverTarget(ev) {
    var spot = dropSpot(ev);
    if (!spot) return;
    ev.preventDefault();                       // marks it as a valid drop target
    ev.dataTransfer.dropEffect = spot.type === 'campaign' ? 'copy' : 'move';
    var prev = document.querySelectorAll('.drop-over, .drop-before, .drop-after');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('drop-over', 'drop-before', 'drop-after');
    spot.el.classList.add(spot.type === 'campaign' ? 'drop-over' : 'drop-' + spot.place);
  }
  document.addEventListener('dragenter', dragOverTarget);
  document.addEventListener('dragover', dragOverTarget);
  document.addEventListener('dragleave', function (ev) {
    var el = ev.target.closest && ev.target.closest('.camp-item, .flow-item, .step-row');
    if (el && !(ev.relatedTarget && el.contains(ev.relatedTarget))) el.classList.remove('drop-over', 'drop-before', 'drop-after');
  });
  document.addEventListener('drop', function (ev) {
    var spot = dropSpot(ev);
    if (!spot) return;
    ev.preventDefault();
    var drag = ui.drag;
    clearDropMarks();
    ui.drag = null;
    if (spot.type === 'campaign') {
      if (drag.kind === 'flow') openFlowDialog(drag.id, spot.el.getAttribute('data-id'));
      else openDropDialog(drag.id, spot.el.getAttribute('data-id'));
    } else if (spot.type === 'flow') {
      result(S.reorderFlow(drag.id, spot.el.getAttribute('data-id'), spot.place));
      render();
    } else {                                   // step: final index after taking the dragged one out
      var ti = parseInt(spot.el.getAttribute('data-idx'), 10) + (spot.place === 'after' ? 1 : 0);
      result(S.moveStep(drag.flowId, drag.idx, drag.idx < ti ? ti - 1 : ti));
      render();
    }
  });
  document.addEventListener('dragend', function () { clearDropMarks(); ui.drag = null; });

  function pickSubject(ev) {
    var panel = ev.target.closest && ev.target.closest('.panel[data-role]');
    if (!panel) return;
    var role = panel.getAttribute('data-role');
    if (ui.histSubject !== role) { ui.histSubject = role; updateHistoryPane(); }
  }
  document.addEventListener('focusin', pickSubject);

  document.addEventListener('focusout', function (ev) {
    if (!ui.sideBox || rerendering) return;
    var t = ev.target;
    if (!(t.matches && t.matches('#search, #new-name, .add-confirm, .tool-box .clear-btn'))) return;  // elements of the open box only
    var tools = document.getElementById('side-tools');
    if (tools && ev.relatedTarget && tools.contains(ev.relatedTarget)) return;  // moved to Add / clear inside the box
    closeSideBox();
  });
  document.addEventListener('focusout', function (ev) {
    if (!ui.campBox || rerendering) return;
    var t = ev.target;
    if (!(t.matches && t.matches('#new-campaign, .camp-add-confirm'))) return;
    var tools = document.getElementById('camp-tools');
    if (tools && ev.relatedTarget && tools.contains(ev.relatedTarget)) return;   // moved to Add inside the box
    closeCampBox();
  });
  // Pressing Add or x must not steal focus from the text field first (that would close the box before the click lands)
  document.addEventListener('mousedown', function (ev) {
    if (ev.target.closest && ev.target.closest('.add-confirm, .camp-add-confirm, .tool-box .clear-btn')) ev.preventDefault();
  });

  document.addEventListener('click', function (ev) {
    pickSubject(ev);
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var c = S.get(ui.selectedId);
    var lang = el.getAttribute('data-lang');

    switch (action) {
      case 'select':
        ui.selectedId = el.getAttribute('data-id'); ui.renaming = false; ui.editLang = null; ui.refLang = null; ui.nameOpen = false;
        break;
      case 'dialog-copy': applyDialog('copy'); return;
      case 'dialog-move': applyDialog('move'); return;
      case 'dialog-cancel': closeDialog(); return;
      case 'dialog-backdrop': if (ev.target === el) closeDialog(); return;
      case 'open-add-campaign': openCampBox(); return;
      case 'add-campaign': addCampaign(); return;
      case 'set-list-tab': ui.listTab = el.getAttribute('data-tab'); ui.sideBox = null; ui.renaming = false; break;
      case 'select-flow':
        ui.flowSel = { kind: el.getAttribute('data-kind'), id: el.getAttribute('data-id') };
        if (ui.flowSel.kind === 'template') { ui.selectedId = ui.flowSel.id; ui.editLang = null; ui.refLang = null; }
        ui.renaming = false; ui.nameOpen = false;
        break;
      case 'open-template': {          // jump from a flow step to the template itself
        var tid = el.getAttribute('data-id'), tpl = S.get(tid);
        ui.listTab = 'templates'; ui.selectedId = tid; ui.editLang = null; ui.refLang = null; ui.renaming = false;
        if (ui.campaignId && tpl && tpl.campaignIds.indexOf(ui.campaignId) === -1) ui.campaignId = null;   // keep it visible
        break;
      }
      case 'step-remove': {
        var fl2 = currentFlow();
        result(S.removeStep(fl2.id, parseInt(el.getAttribute('data-idx'), 10)));
        break;
      }
      case 'select-campaign':
        ui.campaignId = el.getAttribute('data-id') || null; ui.renaming = false; ui.nameOpen = false;
        break;
      case 'open-search': openSideBox('search'); return;
      case 'open-add': openSideBox('add'); return;
      case 'clear-search':
        ui.search = '';
        document.getElementById('content-list').innerHTML = listHtml();
        updateSideTools();
        if (ui.sideBox) focusSideBox();
        return;
      case 'new-content': addContent(); return;
      case 'pick-lang': ui.editLang = lang; ui.nameOpen = false; break;
      case 'set-theme': setTheme(el.getAttribute('data-theme')); return;
      case 'toggle-history-pane': ui.historyOpen = !ui.historyOpen; break;
      case 'hist-tab': {
        var tab = el.getAttribute('data-tab');
        if (tab === 'other') ui.nameOpen = true;
        else { ui.nameOpen = false; ui.histSubject = tab; }
        updateHistoryPane();
        return;
      }
      case 'rename-start': ui.renaming = true; break;
      case 'rename-cancel': ui.renaming = false; break;
      case 'rename-save': saveRename(); return;
      case 'save': doSave(lang); return;
      case 'revert': delete ui.drafts[draftKey(c.id, lang)]; delete ui.shown[draftKey(c.id, lang)]; break;
      case 'deploy-all': {
        var dirtyLangs = c.translations.filter(function (t) { return isDirty(c, t); });
        var withProblems = c.translations.filter(function (t) { return problemCount(c, t) > 0; }).length;
        var ra = S.deployAll(c.id);
        result(ra, ra.ok ? 'Published ' + ra.count + ' translation' + (ra.count === 1 ? '' : 's') + ' as ' + ra.waName +
          (withProblems ? ' (' + withProblems + ' skipped: has problems)' : '') +
          (dirtyLangs.length ? ' (unsaved edits were not included)' : '') : '');
        break;
      }
      case 'btn-remove': {
        var d2 = editableDraft(c, S.getTr(c, lang));
        d2.buttons.splice(parseInt(el.getAttribute('data-idx'), 10), 1);
        refreshSec(lang, 'buttons'); refreshSec(lang, 'add'); refreshSec(lang, 'problems'); syncDirty(lang);
        return;
      }
      case 'remove-footer': {
        var tr4 = S.getTr(c, lang);
        editableDraft(c, tr4).footer = '';
        shownFor(c, tr4).footer = false;
        break;
      }
      case 'remove-header': result(S.setHeaderType(c.id, 'none'), 'Header removed from every language'); break;
      case 'json-one': download(S.slugOf(c) + '.extra_content.json', JSON.stringify(S.toExtraContent(c.id), null, 2) + '\n', 'application/json'); return;
      case 'csv-all': download('content-' + today() + '.csv', S.toCsv()); return;
      case 'csv-one': download(S.slugOf(c) + '-' + today() + '.csv', S.toCsv([c.id])); return;
      case 'reset':
        if (!window.confirm('Discard all changes and reload the sample data?')) return;
        S.reset(); ui.drafts = {}; ui.shown = {}; ui.campaignId = null; ui.selectedId = null; ui.editLang = null; ui.refLang = null; ui.renaming = false;
        break;
    }
    render();
  });

  render();
})();
