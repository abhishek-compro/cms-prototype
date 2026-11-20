/* app.js: rendering and event handling. All data and rules live in store.js. */
(function () {
  'use strict';
  var S = window.Store;
  S.load();

  var ui = {
    listTab: 'templates', // content sidebar tab: 'templates' | 'flows'
    flowInfo: false,     // the hint under the flow toolbar is open (under its i button)
    flowSel: null,       // Flows tab selection: {kind:'flow'|'template', id} ('template' = a template that is a flow by itself)
    campaignId: null,    // campaign filter for the content list (null = all content)
    selectedId: null,
    histInfo: false,     // the explanation at the top of the history tabs is open (under the i button)
    histLang: null,      // the language the history sidebar shows (one at a time; null = the first language)
    langOrder: {},       // per content: a temporary order of its language panels (this view only, never saved; the default is English, then alphabetical)
    listW: { templates: null, flows: null },   // widths (px) of the content / flows column set by dragging its edge; null = the default for that tab
    campCollapsed: false, // the campaigns column is collapsed to a narrow rail with the selected campaign's name turned 90 degrees
    scrollLang: null,    // a language panel to bring into view after the next render (a language was just added, or a comment pointed at it)
    historyOpen: false,  // right sidebar visible (hidden by default)
    commentsOpen: false, // the right sidebar shows comments (instead of history)
    commentsTab: 'open', // 'open' | 'resolved'
    cmTarget: null,      // what the next comment is about: { scope, lang, part, idx, start, end, quote } | { scope, nodeId }
    cmDraft: '',         // the comment being written (kept across re-renders)
    histTab: 'content',  // history sidebar tab: 'content' (the one-line tree) | 'other' (plain list of the rest)
    treeDetails: {},     // Tree tab: ids of the steps whose details are open
    search: '',
    renaming: false,
    newError: '',
    nodeEdit: null,      // the node being edited {flow, node, type, draft}; while set, nothing outside that node can be used
    justDragged: false,  // a node was just dragged: the click that follows must not open it for editing
    conn: null,          // flow canvas: an edge being drawn {flow, node, out}
    nodeDrag: null,      // flow canvas: a node being moved
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
  // problems of this language plus the mismatches between languages (those block publishing too; saved parts)
  function problemCount(c, tr) { return tr.text.trim() ? S.problems(c, S.partsOf(tr)).length + S.consistency(c).errors.length : 0; }
  function draftsByLang(c) { var m = {}; c.translations.forEach(function (t) { m[t.lang] = currentParts(c, t); }); return m; }
  function fmtTime(iso) { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  function langLabel(code) { return esc(S.langName(code)) + ' <code>' + esc(code) + '</code>'; }
  var ICON_PENCIL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_INFO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';
  var CHEVRON_L = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var CHEVRON_R = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  var ICON_LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var ICON_COMMENT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>';
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

  function visibleContent() { return S.contentsIn(ui.campaignId); }

  function normalize() {
    if (ui.campaignId && !S.getCampaign(ui.campaignId)) ui.campaignId = null;
    var visible = visibleContent();
    var c = S.get(ui.selectedId);
    if (!c || visible.indexOf(c) === -1) {      // selection must belong to the chosen campaign
      c = visible.length ? visible[0] : null;
      ui.selectedId = c ? c.id : null;
    }
    return c || null;
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
    if (!f.nodes.length) return 'No nodes yet';
    var count = {};
    f.nodes.forEach(function (n) { count[n.type] = (count[n.type] || 0) + 1; });
    var parts = [];
    if (count.template) parts.push(count.template + (count.template === 1 ? ' template' : ' templates'));
    ['logic', 'action', 'input'].forEach(function (t) { if (count[t]) parts.push(count[t] + ' ' + t + (count[t] > 1 && t !== 'logic' ? 's' : '')); });
    if (count.flow) parts.push(count.flow + (count.flow === 1 ? ' flow call' : ' flow calls'));
    return parts.join(' · ');
  }
  var FLOW_IND = '<span class="flow-ind" title="This template is itself a flow" aria-label="This template is itself a flow">' + ICON_FLOW + '</span>';

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
      var name = isFlow ? it.flow.name : it.content.name, t = isFlow ? it.flow.timing : it.content.timing, timing = S.timingText(t);
      var tip = timing + ' ' + name + (isFlow ? ' (' + flowSummary(it.flow) + ')' : ' (a template that is itself a flow)');
      // a row of a table (the columns line up across all rows): grip | icon | n days | before/after | reference date | name
      return '<li class="content-item flow-item single-line' + (on ? ' active' : '') + '" data-action="select-flow" data-kind="' + it.kind + '" data-id="' + id + '" title="' + esc(tip) + '">' +
        '<span class="drag-handle" draggable="true" aria-hidden="true" title="' + 'Drag to reorder, or onto a campaign to copy or move it' + '">' + ICON_GRIP + '</span>' +
        '<span class="fi-ind">' + (isFlow ? '' : FLOW_IND) + '</span> ' +
        '<span class="fi-days">' + (t.days === 0 ? '' : t.days + (t.days === 1 ? ' day' : ' days')) + '</span> ' +
        '<span class="fi-when">' + (t.days === 0 ? 'on' : esc(t.when)) + '</span> ' +
        '<span class="fi-ref">' + esc(t.ref) + '</span> ' +
        '<span class="name">' + esc(name) + '</span></li>';
    }).join('');
  }

  function templatesListHtml() {
    var q = ui.search.trim().toLowerCase();
    var items = visibleContent().filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) !== -1; });
    if (!items.length) return '<li class="muted small" style="padding:8px 10px">' + (q ? 'No content found' : 'No content yet') + '</li>';
    return items.map(function (c) {
      var renamingThis = ui.renaming && c.id === ui.selectedId && !currentFlow();
      var chips = c.translations.map(function (t) {
        return '<span class="chip ' + S.statusOf(t, c) + '" title="' + esc(S.langName(t.lang) + ': ' + STATUS_LABEL[S.statusOf(t, c)]) + '">' + esc(t.lang) + '</span>';
      }).join('');
      return '<li class="content-item' + (c.id === ui.selectedId ? ' active' : '') + '" data-action="select" data-id="' + c.id + '">' +
        '<span class="drag-handle" draggable="true" aria-hidden="true" title="Drag onto a campaign to copy or move it">' + ICON_GRIP + '</span>' +
        '<div class="ci-body">' + (renamingThis
          ? '<div class="ci-rename"><input type="text" id="rename-input" value="' + esc(c.name) + '" aria-label="Content name">' +
            '<button class="btn link" data-action="rename-save" title="Save the new name" aria-label="Save the new name">✓</button>' +
            '<button class="btn link" data-action="rename-cancel" title="Cancel (Esc)" aria-label="Cancel renaming">✕</button></div>'
          : '<div class="name"><span class="name-text">' + esc(c.name) + '</span>' + (c.blocked ? ' <span class="badge blocked">no template</span>' : '') +
            '<button class="ci-edit" data-action="rename-start" data-id="' + c.id + '" title="Rename" aria-label="Rename ' + esc(c.name) + '">' + ICON_PENCIL + '</button></div>') +
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
    return '<div class="camp-head"><h2 class="side-title">Campaigns</h2><span class="camp-btns">' +
      '<button class="icon-btn sm" data-action="open-add-campaign" aria-label="New campaign" title="New campaign">' + ICON_PLUS + '</button>' +
      '<button class="icon-btn sm camp-toggle" data-action="camps-toggle" aria-expanded="true" aria-label="Collapse the campaigns" title="Collapse the campaigns">' + CHEVRON_L + '</button></span></div>';
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
    ui.campaignId = r.campaign.id; ui.renaming = false;   // jump to the new (empty) campaign
    render();
    toast('Created campaign "' + r.campaign.name + '"');
  }

  function campaignsHtml() {
    if (ui.campCollapsed) {                  // a narrow rail: the way back, and the selected campaign's name turned 90 degrees
      var cur = listTitle();
      return '<aside class="campaigns collapsed" aria-label="Campaigns (collapsed)">' +
        '<button class="icon-btn sm camp-toggle camp-expand" data-action="camps-toggle" aria-expanded="false" aria-label="Show the campaigns" title="Show the campaigns">' + CHEVRON_R + '</button>' +
        '<button class="camp-rail" data-action="camps-toggle" aria-expanded="false" aria-label="Campaign: ' + esc(cur) + '. Show the campaigns" title="' + esc(cur) + ' (click to show the campaigns)"><span class="camp-rail-text">' + esc(cur) + '</span></button></aside>';
    }
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
      '<ul class="content-list' + (ui.listTab === 'flows' ? ' flows-table' : '') + '" id="content-list" data-tab="' + ui.listTab + '">' + listHtml() + '</ul>' +
      '<div class="list-resizer" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the list: drag, or press the left and right arrow keys; double-click to reset" title="Drag to resize (double-click to reset)"></div>' +
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
    // no name heading and no description line (the name is in the list on the left; Rename is the pencil on its item there);
    // the actions live in the editor toolbar below. Only the blocked banner stays here.
    return c.blocked ? '<div class="banner">Template approval is blocked for this content. Publishing is disabled, and it stays free-text only.</div>' : '';
  }

  function addLangHtml(c) {
    var missing = S.LANGUAGES.filter(function (l) { return !S.getTr(c, l.code); });
    return missing.length
      ? '<select class="field-select" data-change="add-lang"><option value="">+ Add language…</option>' +
        missing.map(function (l) { return '<option value="' + l.code + '">' + esc(l.name) + ' (' + l.code + ')</option>'; }).join('') + '</select>'
      : '';
  }

  // The workflow: which group the content sits with, as dots connected by lines with the group's name below each dot. Previous groups green,
  // the current one yellow and blinking, the next ones white; the arrows at the two ends move the content to the previous / next group.
  function stagesHtml(c) {
    var idx = S.stageIndex(c), prev = S.STAGES[idx - 1], next = S.STAGES[idx + 1];
    function arrow(dir, target, glyph) {
      var why = dir < 0 ? (target ? 'Move back to ' + target.label : 'Already with the first group') : (target ? 'Move on to ' + target.label : 'Already with the last group');
      return '<button class="stage-arrow" data-action="stage-' + (dir < 0 ? 'back' : 'next') + '"' + (target ? '' : ' disabled') + ' aria-label="' + esc(why) + '" title="' + esc(why) + '">' + glyph + '</button>';
    }
    return '<div class="stages" role="group" aria-label="Where this content is in the workflow">' + arrow(-1, prev, CHEVRON_L) +
      '<ol class="stage-list">' + S.STAGES.map(function (st, i) {
        var state = i < idx ? 'done' : i === idx ? 'now' : 'todo';
        return '<li class="stage ' + state + '" data-stage="' + st.id + '"' + (i === idx ? ' aria-current="step" title="This content is with ' + esc(st.label) + ' now"' : '') + '>' +
          '<span class="stage-dot" aria-hidden="true"></span><span class="stage-label">' + esc(st.label) + '</span></li>';
      }).join('') + '</ol>' + arrow(1, next, CHEVRON_R) + '</div>';
  }

  function toolbarHtml(c) {
    var blockWhy = S.blockProblem(c);
    return '<div class="toolbar">' +
      '<span class="tb-left">' + stagesHtml(c) + '<span class="lang-lock off" id="lang-lock" role="status">' + ICON_LOCK + '<span class="lock-name"></span></span></span><span class="tb-group">' +
      (blockWhy ? '' : '<label class="block-switch' + (c.blocked ? ' on' : '') + '" title="When on, this content cannot be published"><input type="checkbox" data-change="toggle-block"' + (c.blocked ? ' checked' : '') + '> Free text</label>') +
      cmButtonHtml({ kind: 'content', id: c.id, c: c }) +
      '<button class="btn icon" data-action="csv-one" title="Download CSV of this content (' + esc(c.name) + ')" aria-label="Download CSV of this content">' + ICON_DOWNLOAD + '<span>CSV</span></button>' +
      '<button class="btn' + (ui.historyOpen ? ' on' : '') + '" data-action="toggle-history-pane" aria-pressed="' + !!ui.historyOpen + '" title="' + (ui.historyOpen ? 'Hide' : 'Show') + ' the history sidebar">History</button>' +
      addLangHtml(c) +                       // the + Add language dropdown is the last control of the strip: the extreme right of the toolbar
      '</span></div>';
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

  // ---- the editing panel IS the phone ----------------------------------------------------------------------------------
  // The language's message is edited in place as WhatsApp shows it: the header media at the top of the bubble, the body text, the
  // footer and the time, and the buttons under the bubble. What is not part of the picture sits below the phone: the header media
  // id, the placeholders (names, WhatsApp positions, default values), the buttons' payloads / URLs, and the problems.
  // Containers data-sec="header|body|footer|buttons|add" (in the phone) and "header-id|placeholders|button-details|problems"
  // (below it) always exist or can appear while typing; never re-render the field being typed in.

  function headerVisualHtml(c, p) {
    return waHeaderHtml(c, p);                 // only the picture: no caption under it
  }

  // Header type is one per template (name level); each language has its own link. In the phone: only the header as it looks
  // (a tile with the file's name); the type, the link and the limits are below the phone (secHeaderUrl).
  function secHeader(c, tr, p) {
    if (c.headerType === 'none') return '';
    return '<div class="wa-part wa-part-header" data-sec="header">' + cmBadge(c, tr.lang, 'header') +
      '<div class="wa-hvis" data-media="' + tr.lang + '">' + headerVisualHtml(c, p) + '</div>' +
      '<div class="wa-hbtns"><button class="wa-edit" data-action="edit-header" data-lang="' + tr.lang + '" aria-label="Upload a different ' + c.headerType + '" title="Upload a different ' + c.headerType + ' (' + esc(S.headerHint(c.headerType)) + ')">' + ICON_PENCIL + '</button>' +
      '<button class="wa-edit wa-remove" data-action="remove-header" aria-label="Remove the header" title="Remove the header from every language">×</button></div>' +
      '<input type="file" class="file-input" data-change="upload-header" data-lang="' + tr.lang + '" accept="' + esc(S.mediaAccept(c.headerType)) + '" tabindex="-1" aria-hidden="true"></div>';
  }
  // below the phone: the header type (applies to every language), its limits, and the link to the file on the static CDN
  function secHeaderUrl(c, tr, p) {
    if (c.headerType === 'none') return '<div data-sec="header-url"></div>';
    return '<div class="sec" data-sec="header-url"><div class="sec-label sec-row"><span>Header</span>' +
      '<select class="field-select sm" data-change="set-header-type" aria-label="Header type" title="Applies to every language of this template">' +
      S.HEADER_TYPES.filter(function (h) { return h.id !== 'none'; }).map(function (h) { return '<option value="' + h.id + '"' + (h.id === c.headerType ? ' selected' : '') + '>' + h.label + '</option>'; }).join('') + '</select>' +
      '<span class="wa-hint small">' + esc(S.headerHint(c.headerType)) + '</span><span class="grow"></span>' +
      '<button class="btn link" data-action="remove-header" title="Remove the header from every language">Remove header</button></div>' +
      '<label class="fld"><span>Media link <span class="muted small">file on the static CDN</span></span>' +
      '<input class="field" data-input="header" data-lang="' + tr.lang + '" value="' + esc(p.header) + '" placeholder="https://cdn.example.org/path/file.' + (c.headerType === 'video' ? 'mp4' : c.headerType === 'document' ? 'pdf' : 'png') + '" aria-label="Header media link" inputmode="url" autocomplete="off" spellcheck="false"></label></div>';
  }

  function secBody(c, tr, p) {
    return '<div class="wa-part wa-part-body" data-sec="body">' + cmBadge(c, tr.lang, 'body') +
      '<textarea class="wa-text-in" rows="3" data-input="text" data-lang="' + tr.lang + '" aria-label="Body" placeholder="Write the ' + esc(S.langName(tr.lang)) + ' text here. Use {{name}} for a placeholder." spellcheck="false">' + esc(p.text) + '</textarea></div>';
  }

  // An editable placeholder name: {{ [name] }}. Committed on Enter / blur (the `change` event), not per keystroke,
  // because renaming rewrites every occurrence in the text.
  function nameInput(kind, tr, name, idx) {
    return '<span class="ph-name"><span class="muted">{{</span><input class="field" data-change="' + kind + '" data-lang="' + tr.lang + '" data-name="' + esc(name) + '"' +
      (idx !== '' ? ' data-idx="' + idx + '"' : '') + ' value="' + esc(name) + '" aria-label="Placeholder name (edit to rename)" autocomplete="off" spellcheck="false"><span class="muted">}}</span></span>';
  }

  // The layer on top of WhatsApp's numbered placeholders: named in the body, numbered for WhatsApp.
  // Only shown when the body has placeholders; the (empty) container stays so it can appear while typing.
  function secPlaceholders(c, tr, p) {
    var pos = S.positionsOf(p.text), names = Object.keys(pos);
    if (!names.length) return '<div data-sec="placeholders"></div>';
    var rows = names.map(function (n) {
      var d = (p.defaults || {})[n] || '';
      return '<tr><td>' + nameInput('ph-rename', tr, n, '') + '</td><td>' + posChips(pos[n]) + '</td><td>' +
        '<input class="field" data-input="default" data-lang="' + tr.lang + '" data-name="' + esc(n) + '" value="' + esc(d) + '" placeholder="Default" autocomplete="off">' + '</td></tr>';
    }).join('');
    return '<div class="sec" data-sec="placeholders">' + lbl('Body placeholders') +
      '<table class="ph-table"><thead><tr><th>Name</th><th>Position</th><th>Default</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="muted small ph-help">Edit a name to rename it everywhere. One name can fill several WhatsApp positions: use it more than once, or rename another placeholder to it.</div></div>';
  }

  function btnParams(tr, b, i) {
    var pos = S.positionsOf(b.url), names = Object.keys(pos);
    if (!names.length) return '<div class="btn-params" data-params="' + i + '"></div>';
    return '<div class="btn-params" data-params="' + i + '"><table class="ph-table"><thead><tr><th>URL placeholder</th><th>Position</th><th>Default</th></tr></thead><tbody>' +
      names.map(function (n) {
        var d = (b.default_parameters || {})[n] || '';
        return '<tr><td>' + nameInput('btn-ph-rename', tr, n, i) + '</td><td>' + posChips(pos[n]) + '</td><td>' +
          '<input class="field" data-input="btn-param" data-lang="' + tr.lang + '" data-idx="' + i + '" data-name="' + esc(n) + '" value="' + esc(d) + '" placeholder="Default" autocomplete="off">' + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // Buttons, in the phone under the bubble: the text of each is typed on the button itself. Limits: 3 quick replies and 1 URL button.
  function secButtons(c, tr, p) {
    var bs = p.buttons || [];
    if (!bs.length) return '<div data-sec="buttons"></div>';
    return '<div class="wa-btns wa-btns-edit" data-sec="buttons">' + bs.map(function (b, i) {
      var url = b.type === 'URL';
      return '<div class="bcard wa-btn wa-btn-edit" data-idx="' + i + '">' +
        '<span class="wa-btn-ic" title="' + (url ? 'URL button' : 'Quick reply') + '" aria-hidden="true">' + (url ? '↗' : '↩') + '</span>' +
        '<input class="wa-btn-in" data-input="btn-text" data-lang="' + tr.lang + '" data-idx="' + i + '" value="' + esc(b.text) + '" placeholder="' + (url ? 'URL button' : 'Quick reply') + '" aria-label="Button ' + (i + 1) + ' text" autocomplete="off">' +
        '<span class="wa-count small">' + counter('btn-text-' + i, (b.text || '').length, S.LIMITS.buttonText) + '</span>' + cmBadge(c, tr.lang, 'button', i) +
        '<button class="wa-x" data-action="btn-remove" data-lang="' + tr.lang + '" data-idx="' + i + '" aria-label="Remove button ' + (i + 1) + '" title="Remove this button">×</button></div>';
    }).join('') + '</div>';
  }
  // below the phone: what each button does. The button's own text is the label of its field (quick reply payload, or the URL and its variables).
  function secButtonDetails(c, tr, p) {
    var bs = p.buttons || [];
    if (!bs.length) return '<div data-sec="button-details"></div>';
    return '<div class="sec" data-sec="button-details">' + lbl('Buttons') +
      bs.map(function (b, i) {
        var url = b.type === 'URL', label = '<span class="bdet-label" data-label="' + i + '">' + esc(b.text || 'Button ' + (i + 1)) + '</span>';
        return '<div class="bdet" data-idx="' + i + '">' +
          (url
            ? '<label class="fld"><span>' + label + ' <span class="muted small">URL · use {{name}} for a variable part</span></span>' +
              '<input class="field" data-input="btn-url" data-lang="' + tr.lang + '" data-idx="' + i + '" value="' + esc(b.url) + '" placeholder="https://" autocomplete="off" spellcheck="false"></label>' + btnParams(tr, b, i)
            : '<label class="fld"><span>' + label + ' <span class="muted small">default payload</span></span><input class="field" data-input="btn-payload" data-lang="' + tr.lang + '" data-idx="' + i + '" value="' + esc(b.default_payload) + '" autocomplete="off" spellcheck="false"></label>') +
          '</div>';
      }).join('') + '</div>';
  }

  // Footer is per language and optional: shown when it has text, or after it was added with the + Add dropdown
  function secFooter(c, tr, p) {
    if (!footerShown(c, tr, p)) return '';
    return '<div class="wa-part wa-part-footer" data-sec="footer">' + cmBadge(c, tr.lang, 'footer') +
      '<input class="wa-foot-in" data-input="footer" data-lang="' + tr.lang + '" value="' + esc(p.footer) + '" placeholder="Footer (no placeholders)" aria-label="Footer" autocomplete="off">' +
      '<span class="wa-count small">' + counter('footer', p.footer.length, S.LIMITS.footer) + '</span>' +
      '<button class="wa-x" data-action="remove-footer" data-lang="' + tr.lang + '" aria-label="Remove footer" title="Remove the footer">×</button></div>';
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
    return '<div class="wa-add add-row" data-sec="add"><select class="field-select" data-change="add-part" data-lang="' + tr.lang + '" aria-label="Add a header, footer or button">' +
      '<option value="">+ Add…</option>' + (sections ? '<optgroup label="Sections">' + sections + '</optgroup>' : '') + '<optgroup label="Buttons">' + buttons + '</optgroup></select></div>';
  }

  // Only shown when there is something wrong (the container stays so it can appear while typing)
  // Errors block publishing (this language's own, and mismatches between the languages of the template, which use the
  // unsaved drafts too); warnings do not (a placeholder used in some languages and not in others).
  function secProblems(c, tr, p) {
    var cross = S.consistency(c, draftsByLang(c));
    var list = S.problems(c, p).filter(function (x) { return x.code !== 'empty'; }).concat(cross.errors), warns = cross.warnings;
    if (!list.length && !warns.length) return '<div data-sec="problems"></div>';
    function items(a) { return a.map(function (x) { return '<li><strong>' + esc(x.part) + '</strong> ' + esc(x.message) + '</li>'; }).join(''); }
    return '<div class="sec" data-sec="problems">' +
      (list.length ? '<div class="probs"><div class="sec-label">Problems (' + list.length + ') <span class="muted">· these block publishing, saving still works</span></div><ul>' + items(list) + '</ul></div>' : '') +
      (warns.length ? '<div class="warns"><div class="sec-label">Warnings (' + warns.length + ') <span class="muted">· these do not block publishing</span></div><ul>' + items(warns) + '</ul></div>' : '') + '</div>';
  }

  function editPanelHtml(c, tr) {
    var p = currentParts(c, tr);
    var dirty = isDirty(c, tr);
    var bubble = '<div class="wa-bubble" data-preview="bubble">' + secHeader(c, tr, p) + secBody(c, tr, p) + secFooter(c, tr, p) +
      '<div class="wa-meta"><span class="wa-count small">' + counter('text', p.text.length, S.LIMITS.body) + '</span><span class="wa-time">9:41</span></div></div>';
    return '<section class="panel edit" data-role="edit" data-lang="' + tr.lang + '">' +
      '<div class="panel-head"><span class="lang-grip" draggable="true" aria-hidden="true" title="Drag onto another language to reorder the view (not saved)">' + ICON_GRIP + '</span><strong>' + langLabel(tr.lang) + '</strong><span class="badge ' + S.statusOf(tr, c) + '">' + STATUS_LABEL[S.statusOf(tr, c)] + '</span>' +
      (problemCount(c, tr) ? '<span class="badge blocked" title="Problems block publishing">' + problemCount(c, tr) + ' problem' + (problemCount(c, tr) === 1 ? '' : 's') + '</span>' : '') +
      '<span class="head-actions"><button class="btn revert" data-action="revert" data-lang="' + tr.lang + '"' + (dirty ? '' : ' disabled') + '>Revert</button>' +
      '<button class="btn primary save" data-action="save" data-lang="' + tr.lang + '"' + (dirty ? '' : ' disabled') + '>Save</button></span></div>' +
      '<div class="wa-editor">' + phoneShell(bubble + secButtons(c, tr, p), ' editable') + secAdd(c, tr, p) + '</div>' +
      '<div class="wa-details">' + secHeaderUrl(c, tr, p) + secPlaceholders(c, tr, p) + secButtonDetails(c, tr, p) + secProblems(c, tr, p) + '</div>' +
      '<div class="panel-foot">' +
      '<span class="dirty-note small" style="color:var(--warn)">' + (dirty ? 'Unsaved changes' : '') + '</span>' +
      '<span class="grow"></span>' + waNameHtml(tr) +
      '</div></section>';
  }

  // every language is an editing panel (a phone with its details below), side by side in one horizontal strip
  function editHtml(c) {
    return toolbarHtml(c) + '<div class="panels">' + S.orderLangs(c, ui.langOrder[c.id]).map(function (tr) { return editPanelHtml(c, tr); }).join('') + '</div>';
  }

  function diffHtml(before, after) {
    return S.diffWords(before, after).map(function (seg) {
      var cls = seg.type === 'add' ? 'd-add' : seg.type === 'del' ? 'd-del' : '';
      return cls ? '<span class="' + cls + '">' + esc(seg.text) + '</span>' : esc(seg.text);
    }).join('');
  }

  function eventBody(e) {
    var body = '';
    if (e.action === 'text_edited') body = diffHtml(e.before, e.after);
    else if (e.action === 'renamed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'stage_moved') body = esc(stageLabel(e.before)) + ' → <strong>' + esc(stageLabel(e.after)) + '</strong>';
    else if (e.action === 'language_added') body = e.after ? '<div class="quote">' + esc(e.after) + '</div>' : '<span class="muted">Started empty</span>';
    else if (e.action === 'deployed') body = 'Template name <code>' + esc(e.detail) + '</code>';
    else if (e.action === 'content_created') body = esc(e.after);
    else if (e.action === 'part_edited') body = diffHtml(e.before, e.after);
    else if (e.action === 'timing_edited') body = diffHtml(e.before, e.after);
    else if (e.action === 'flow_created') body = esc(e.after) + (e.detail ? ' <span class="muted">· ' + esc(e.detail) + '</span>' : '');
    else if (e.action === 'flow_renamed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_node_added') body = '<strong>' + esc(e.after) + '</strong> <span class="muted">· ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_node_removed') body = '<strong>' + esc(e.before) + '</strong> <span class="muted">· was ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_values_edited') body = '<strong>' + esc(e.detail) + '</strong>: ' + diffHtml(e.before, e.after);
    else if (e.action === 'flow_call_changed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_node_changed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_edge_connected') body = esc(e.detail) + (e.before ? ' <span class="muted">· was → ' + esc(e.before) + '</span>' : '');
    else if (e.action === 'flow_edge_disconnected') body = esc(e.before);
    else if (e.action === 'flow_out_added') body = '<strong>' + esc(e.after) + '</strong> <span class="muted">on ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_out_removed') body = '<strong>' + esc(e.before) + '</strong> <span class="muted">on ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_out_renamed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong> <span class="muted">on ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_input_renamed' || e.action === 'flow_logic_renamed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_action_renamed') body = esc(e.before) + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_action_defined') body = '<strong>' + esc(e.detail) + '</strong>: ' + diffHtml(e.before, e.after);
    else if (e.action === 'flow_step_added') body = '<strong>' + esc(e.after) + '</strong> <span class="muted">· ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_step_removed') body = '<strong>' + esc(e.before) + '</strong> <span class="muted">· was ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_steps_reordered') body = diffHtml(e.before, e.after);
    else if (e.action === 'flow_timing_edited') body = diffHtml(e.before, e.after);
    else if (e.action === 'flow_reordered' || e.action === 'flow_list_moved') body = esc(e.detail);
    else if (e.action === 'flow_copied' || e.action === 'flow_referred') body = 'Also in <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'flow_duplicated') body = 'Duplicated as <strong>' + esc(e.after) + '</strong> <span class="muted">in ' + esc(e.detail) + '</span>';
    else if (e.action === 'flow_moved') body = (e.before ? esc(e.before) + ' → ' : 'Into ') + '<strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'header_type_changed') body = esc(e.before || 'None') + ' → <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'rewound') body = 'Back to <strong>' + esc(eventTitle(S.eventOf(e.to))) + '</strong> <span class="muted">· from ' + esc(eventTitle(S.eventOf(e.from))) + '</span>';
    else if (e.action === 'campaign_copied') body = 'Also in <strong>' + esc(e.after) + '</strong>';
    else if (e.action === 'campaign_moved') body = (e.before ? esc(e.before) + ' → ' : 'Into ') + '<strong>' + esc(e.after) + '</strong>';
    return body;
  }
  function eventHtml(e, compact) {
    var body = eventBody(e);
    return '<li class="event act-' + e.action + '"><div class="event-head">' +
      '<strong>' + esc(e.action === 'part_edited' ? 'Edited ' + String(e.detail).toLowerCase() : e.action === 'stage_moved' ? 'Moved to ' + stageLabel(e.after) : (S.ACTION_LABELS[e.action] || e.action)) + '</strong>' +
      (e.lang && !compact ? '<span class="chip">' + esc(S.langName(e.lang)) + '</span>' : '') +
      '<span class="muted small">by ' + esc(e.actor) + '</span>' +
      '<span class="when">' + esc(fmtTime(e.ts)) + '</span></div>' +
      (body ? '<div class="event-body">' + body + '</div>' : '') + '</li>';
  }

  // ---- comments: a button at the top opens the right sidebar (composer on top, comments as pills, Open | Resolved), badges on the parts ----
  // The composer at the top of a template / flow adds a comment about the whole thing, a part (body, header, footer, a button) or, for
  // body / footer / button text, the text you selected in the field (the selection is picked up as you make it and shown as a quote).
  // On a flow, about a node (the 💬 on a node, or the dropdown). Resolved comments leave the Open list and sit under Resolved.
  function cmScopeNow() {
    var f = currentFlow();
    if (f) return { kind: 'flow', id: f.id, f: f };
    var c = S.get(ui.selectedId);
    return c ? { kind: 'content', id: c.id, c: c } : null;
  }
  function cmTargetNow(scope) { return ui.cmTarget && scope && ui.cmTarget.scope === scope.id ? ui.cmTarget : null; }
  function cmWhere(scope) { return scope.kind === 'flow' ? { flowId: scope.id } : { contentId: scope.id }; }
  function cmNodeLabel(f, nodeId, fallback) {
    var n = S.getNode(f, nodeId);
    return n ? NODE_LABEL[n.type] + ' · ' + S.nodeTitle(n) : (fallback || 'A node') + ' (removed)';
  }
  function cmPartLabel(c, m) {
    if (m.part === 'body') return 'Body';
    if (m.part === 'header') return 'Header';
    if (m.part === 'footer') return 'Footer';
    if (m.part === 'button') return 'Button ' + (m.idx + 1);
    return 'Whole template';
  }
  function cmTextNow(c, m) {                 // the text a comment points into, as it is in the editor now (unsaved edits included)
    var tr = S.getTr(c, m.lang);
    if (!tr) return '';
    var p = currentParts(c, tr);
    if (m.part === 'body') return p.text;
    if (m.part === 'footer') return p.footer;
    if (m.part === 'button') return (p.buttons[m.idx] || {}).text || '';
    return '';
  }
  function cmOpenCount(scope, test) {
    return S.commentsFor(cmWhere(scope), 'open').filter(test || function () { return true; }).length;
  }
  // a small 💬 n next to the label of a part that has open comments
  function cmBadge(c, lang, part, idx) {
    var n = cmOpenCount({ kind: 'content', id: c.id }, function (m) { return m.lang === lang && m.part === part && (part !== 'button' || m.idx === idx); });
    return n ? ' <button class="cm-badge" data-action="cm-show" title="' + n + ' open comment' + (n === 1 ? '' : 's') + ' on this part. Click to show them." aria-label="' + n + ' open comments on this part">💬 ' + n + '</button>' : '';
  }
  function cmSelectHtml(scope) {
    var t = cmTargetNow(scope), opts = '';
    function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
    if (scope.kind === 'flow') {
      opts = opt('general', 'Whole flow', !t || !t.nodeId) + scope.f.nodes.map(function (n) { return opt('node|' + n.id, cmNodeLabel(scope.f, n.id), t && t.nodeId === n.id); }).join('');
    } else {
      var c = scope.c;
      opts = opt('general', 'Whole template', !t || !t.part) + S.orderLangs(c, ui.langOrder[c.id]).map(function (tr) {
        var p = currentParts(c, tr), g = [];
        function o(part, label, idx) { var sel = t && t.lang === tr.lang && t.part === part && (part !== 'button' || t.idx === idx); g.push(opt(tr.lang + '|' + part + '|' + (idx === undefined ? '' : idx), label, sel)); }
        o('body', 'Body');
        if (c.headerType !== 'none') o('header', 'Header');
        if (p.footer || footerShown(c, tr, p)) o('footer', 'Footer');
        (p.buttons || []).forEach(function (b, i) { o('button', 'Button ' + (i + 1) + (b.text ? ' · ' + b.text : ''), i); });
        return '<optgroup label="' + esc(S.langName(tr.lang)) + '">' + g.join('') + '</optgroup>';
      }).join('');
    }
    return '<select class="field-select" id="cm-target-sel" data-change="cm-target" aria-label="What the comment is about">' + opts + '</select>' +
      (t && t.quote ? '<span class="cm-quote" title="The text you selected">“' + esc(clip(t.quote, 60)) + '” <button class="btn link" data-action="cm-clear-quote" aria-label="Comment on the whole part instead of the selected text">×</button></span>' : '');
  }
  function cmItemHtml(scope, m) {
    var where, loc = null, note = '', goto = true;
    if (scope.kind === 'flow') {
      where = m.nodeId ? cmNodeLabel(scope.f, m.nodeId, m.nodeLabel) : 'Whole flow';
      goto = !!(m.nodeId && S.getNode(scope.f, m.nodeId));
    } else {
      where = (m.lang ? S.langName(m.lang) + ' · ' : '') + cmPartLabel(scope.c, m);
      if (m.quote) {
        loc = S.locateComment(m, cmTextNow(scope.c, m));
        note = loc.state === 'moved' ? 'The text has moved since' : loc.state === 'gone' ? 'This text has changed or been removed since' : '';
      }
      goto = !!m.part;
    }
    return '<li class="cm-item cm-pill' + (m.resolved ? ' resolved' : '') + '" data-comment="' + m.id + '">' +
      '<div class="cm-head"><span class="chip">' + esc(where) + '</span></div>' +
      (m.quote ? '<blockquote class="cm-q' + (loc && loc.state === 'gone' ? ' gone' : '') + '">“' + esc(m.quote) + '”' + (note ? ' <span class="muted small">' + note + '</span>' : '') + '</blockquote>' : '') +
      '<div class="cm-text">' + esc(m.text) + '</div>' +
      '<div class="cm-meta muted small"><strong>' + esc(m.author) + '</strong> · ' + esc(fmtTime(m.createdAt)) + '</div>' +
      (m.resolved ? '<div class="muted small">Resolved by ' + esc(m.resolvedBy) + ' · ' + esc(fmtTime(m.resolvedAt)) + '</div>' : '') +
      '<div class="cm-actions">' + (goto ? '<button class="btn link" data-action="cm-goto" data-comment="' + m.id + '">Go to</button>' : '') +
      (m.resolved ? '<button class="btn link" data-action="cm-reopen" data-comment="' + m.id + '">Reopen</button>'
        : '<button class="btn" data-action="cm-resolve" data-comment="' + m.id + '">Resolve</button>') + '</div></li>';
  }
  function cmButtonHtml(scope) {            // "Comments (n)" in the header of a template / flow: opens the right sidebar
    var n = S.commentsFor(cmWhere(scope), 'open').length;
    var label = 'Comments (' + n + ' open)';
    return '<button class="btn icon cm-open' + (ui.commentsOpen ? ' on' : '') + '" data-action="cm-toggle" aria-pressed="' + !!ui.commentsOpen + '" aria-label="' + label + '" title="' + label + ' · ' + (ui.commentsOpen ? 'hide' : 'show') + ' the comments sidebar">' + ICON_COMMENT + (n ? '<span class="cm-n">' + n + '</span>' : '') + '</button>';
  }
  // the right sidebar in comments mode: the composer on top, then the comments as message pills (Open | Resolved)
  function commentsPaneInner(scope) {
    var open = S.commentsFor(cmWhere(scope), 'open'), done = S.commentsFor(cmWhere(scope), 'resolved');
    var showing = ui.commentsTab === 'resolved' ? done : open;
    return '<div class="hp-head"><div class="hp-top"><h3>Comments</h3><span class="grow"></span>' +
      '<button class="btn link" data-action="cm-toggle" title="Hide comments">Hide</button></div></div>' +
      '<section class="comments" id="comments" aria-label="New comment">' +
      '<label class="cm-on"><span class="muted small">Comment on</span><span id="cm-target-wrap" class="cm-target-wrap">' + cmSelectHtml(scope) + '</span></label>' +
      '<textarea id="cm-text" rows="3" class="field cm-text-in" placeholder="Add a comment…" title="Ctrl+Enter adds the comment" aria-label="New comment" maxlength="' + S.COMMENT_MAX + '">' + esc(ui.cmDraft) + '</textarea>' +
      '<div class="cm-send"><span class="muted small">Ctrl+Enter</span><button class="btn primary" data-action="cm-add">Add comment</button></div></section>' +
      '<div class="cm-list"><div class="hp-tabs" role="tablist">' +
      [['open', 'Open (' + open.length + ')'], ['resolved', 'Resolved (' + done.length + ')']].map(function (t) {
        return '<button class="hp-tab' + (ui.commentsTab === t[0] ? ' active' : '') + '" role="tab" aria-selected="' + (ui.commentsTab === t[0]) + '" data-action="cm-tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      (showing.length ? '<ul class="cm-items">' + showing.map(function (m) { return cmItemHtml(scope, m); }).join('') + '</ul>'
        : '<div class="hint">' + (ui.commentsTab === 'resolved' ? 'No resolved comments.' : 'No open comments.') + '</div>') + '</div>';
  }
  function refreshCmTarget() {
    var scope = cmScopeNow(), el = document.getElementById('cm-target-wrap');
    if (scope && el) el.innerHTML = cmSelectHtml(scope);       // only the target: the text box is never re-rendered
  }
  function captureSelection(t) {                 // text selected in the body, footer or a button's text becomes the comment's quote
    if (!t || !t.getAttribute || ui.nodeEdit || document.activeElement !== t) return;   // only a selection being made right now, in the field you are in
    var kind = t.getAttribute('data-input');
    if (kind !== 'text' && kind !== 'footer' && kind !== 'btn-text') return;
    if (t.selectionStart == null || t.selectionStart === t.selectionEnd) return;
    var scope = cmScopeNow();
    if (!scope || scope.kind !== 'content') return;
    var quote = t.value.slice(t.selectionStart, t.selectionEnd);
    if (quote.length > S.QUOTE_MAX) { toast('Select at most ' + S.QUOTE_MAX + ' characters to comment on', true); return; }
    ui.cmTarget = { scope: scope.id, lang: t.getAttribute('data-lang'), part: kind === 'text' ? 'body' : kind === 'footer' ? 'footer' : 'button',
      idx: kind === 'btn-text' ? parseInt(t.getAttribute('data-idx'), 10) : undefined, start: t.selectionStart, end: t.selectionEnd, quote: quote };
    refreshCmTarget();
  }
  document.addEventListener('select', function (ev) { captureSelection(ev.target); }, true);
  document.addEventListener('mouseup', function (ev) { captureSelection(ev.target); });
  document.addEventListener('keyup', function (ev) { captureSelection(ev.target); });
  function addCommentFromUi() {
    var scope = cmScopeNow(), box = document.getElementById('cm-text');
    if (!scope) return;
    var t = cmTargetNow(scope), where = cmWhere(scope);
    if (box) ui.cmDraft = box.value;
    if (scope.kind === 'flow') { if (t && t.nodeId) where.nodeId = t.nodeId; }
    else if (t && t.part) { where.lang = t.lang; where.part = t.part; if (t.idx !== undefined) where.idx = t.idx; if (t.quote) { where.start = t.start; where.end = t.end; where.quote = t.quote; } }
    var r = S.addComment(where, ui.cmDraft);
    if (!r.ok) { toast(r.error, true); return; }
    ui.cmDraft = ''; ui.cmTarget = null; ui.commentsOpen = true; ui.historyOpen = false; ui.commentsTab = 'open';
    toast('Comment added');
    render();
  }
  function gotoComment(id) {
    var m = S.getComment(id), scope = cmScopeNow();
    if (!m || !scope) return;
    if (scope.kind === 'flow') {
      var el = document.querySelector('.fnode[data-node="' + m.nodeId + '"]');
      if (!el) { toast('That node is not in this flow any more', true); return; }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600);
      return;
    }
    var sel = m.part === 'body' ? '[data-input="text"]' : m.part === 'footer' ? '[data-input="footer"]' : m.part === 'button' ? '[data-input="btn-text"][data-idx="' + m.idx + '"]' : m.part === 'header' ? '[data-input="header"]' : null;
    var field = sel && document.querySelector('.panel.edit[data-lang="' + m.lang + '"] ' + sel);
    if (!field) { toast('That part is not in the editor any more', true); return; }
    field.scrollIntoView({ block: 'center', inline: 'center' });
    field.focus({ preventScroll: true });
    var loc = m.quote ? S.locateComment(m, field.value) : null;
    if (loc && loc.start !== undefined) field.setSelectionRange(loc.start, loc.end);
  }

  // ---- right sidebar: history -------------------------------------------------

  // ---- the undo tree (Tree tab): one line per step, drawn like `git log --graph` ---------------------------------
  // One line: what happened, who, when. The current step has a marker; "Rewind" puts the template back as it was after that step
  // (logged as a new step, nothing is deleted: the steps after it stay as another branch).
  function stageLabel(id) { var st = S.STAGES.filter(function (x) { return x.id === id; })[0]; return st ? st.label : id; }
  function clip(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function eventTitle(e) {
    if (!e) return 'an earlier step';
    var lang = e.lang ? S.langName(e.lang) + ' · ' : '';
    switch (e.action) {
      case 'text_edited': return lang + 'text → “' + clip(e.after, 36) + '”';
      case 'part_edited': return lang + (e.detail === 'Footer' ? 'footer → “' + clip(e.after, 30) + '”' : 'edited the ' + String(e.detail).toLowerCase());
      case 'language_added': return 'Added ' + S.langName(e.lang);
      case 'deployed': return lang + 'published as ' + e.detail;
      case 'content_created': return 'Created';
      case 'renamed': return 'Renamed to “' + e.after + '”';
      case 'header_type_changed': return 'Header type: ' + (e.before || 'None') + ' → ' + e.after;
      case 'campaign_copied': return 'Copied to ' + e.after;
      case 'campaign_moved': return 'Moved to ' + e.after;
      case 'stage_moved': return 'Moved to ' + stageLabel(e.after);
      case 'rewound': return 'Rewound to: ' + eventTitle(S.eventOf(e.to));
      case 'flow_list_moved': return 'Moved in the flow list';
      default: return S.ACTION_LABELS[e.action] || e.action;
    }
  }
  function shortTime(iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  var TREE_X = function (k) { return 9 + k * 14; }, TREE_H = 30, TREE_MID = 15;
  function treeGraph(row, width) {
    var x = TREE_X, parts = [], lane = row.lane, id = row.event.id;
    row.before.forEach(function (target, k) {
      if (target == null) return;
      if (target === id) {                                              // this line ends at the node
        parts.push(k === lane ? '<line class="l' + (k % 6) + '" x1="' + x(k) + '" y1="0" x2="' + x(k) + '" y2="' + TREE_MID + '"/>'
          : '<path class="l' + (k % 6) + '" d="M' + x(k) + ' 0 C' + x(k) + ' ' + (TREE_MID - 2) + ' ' + x(lane) + ' 4 ' + x(lane) + ' ' + TREE_MID + '"/>');
      } else if (k !== lane) {                                           // a line passing by
        parts.push('<line class="l' + (k % 6) + '" x1="' + x(k) + '" y1="0" x2="' + x(k) + '" y2="' + TREE_H + '"/>');
      }
    });
    if (row.after[lane] != null) parts.push('<line class="l' + (lane % 6) + '" x1="' + x(lane) + '" y1="' + TREE_MID + '" x2="' + x(lane) + '" y2="' + TREE_H + '"/>');
    var cls = 'node l' + (lane % 6) + (row.isHead ? ' head' : '') + (row.event.action === 'rewound' ? ' rw' : '');
    parts.push('<circle class="' + cls + '" cx="' + x(lane) + '" cy="' + TREE_MID + '" r="' + (row.isHead ? 6 : 4.5) + '"/>');
    return '<svg class="tree-graph" width="' + (x(width - 1) + 9) + '" height="' + TREE_H + '" aria-hidden="true">' + parts.join('') + '</svg>';
  }
  // The lanes that run on past a step (drawn behind its details so the graph stays unbroken while they are open)
  function treeThrough(row, width) {
    var x = TREE_X, parts = [];
    row.after.forEach(function (target, k) { if (target != null) parts.push('<line class="l' + (k % 6) + '" x1="' + x(k) + '" y1="0" x2="' + x(k) + '" y2="100%"/>'); });
    return '<svg class="tree-graph through" width="' + (x(width - 1) + 9) + '" height="100%" aria-hidden="true">' + parts.join('') + '</svg>';
  }
  function treeDetailsHtml(row, width) {
    var e = row.event, body = eventBody(e);
    return '<div class="tree-detail" id="tree-detail-' + e.id + '" style="--tree-gutter:' + (TREE_X(width - 1) + 15) + 'px">' + treeThrough(row, width) + '<div class="tree-detail-body">' +
      '<div class="tree-detail-head"><strong>' + esc(eventTitle(e)) + '</strong>' + (e.lang ? ' <span class="chip">' + esc(S.langName(e.lang)) + '</span>' : '') + '</div>' +
      '<div class="muted small">' + esc(S.ACTION_LABELS[e.action] || e.action) + ' · by ' + esc(e.actor) + ' · ' + esc(fmtTime(e.ts)) + '</div>' +
      (body ? '<div class="event-body">' + body + '</div>' : '') +
      (row.isHead ? '<div class="muted small">This is the current step.</div>' : row.problem ? '<div class="muted small">Cannot rewind here: ' + esc(row.problem) + '.</div>' : '') +
      '</div></div>';
  }
  // the language the history sidebar shows: the chosen one if the template still has it, else the first
  function histLangNow(c) { return c && S.getTr(c, ui.histLang) ? ui.histLang : (c && c.translations[0] ? S.orderLangs(c, ui.langOrder[c.id])[0].lang : null); }
  // the Language dropdown at the top of the Content tab: the tree shows one language at a time
  function histLangPickHtml(c) {
    var hl = histLangNow(c);
    return '<div class="hp-lang"><select class="field-select" data-change="hist-lang" aria-label="Language shown in the history">' +
      S.orderLangs(c, ui.langOrder[c.id]).map(function (t) { return '<option value="' + t.lang + '"' + (t.lang === hl ? ' selected' : '') + '>' + esc(S.langName(t.lang)) + ' (' + t.lang + ')</option>'; }).join('') +
      '</select>' + histInfoBtn() + '</div>';
  }
  // the explanations of the history tabs sit under an "i" button (closed by default)
  function histInfoBtn() {
    return '<button class="info-btn' + (ui.histInfo ? ' on' : '') + '" data-action="hist-info" aria-expanded="' + !!ui.histInfo + '" aria-controls="hist-info" aria-label="About this list" title="About this list">' + ICON_INFO + '</button>';
  }
  function histInfoBox(html) { return ui.histInfo ? '<div class="muted small hist-info" id="hist-info">' + html + '</div>' : ''; }
  function treeHtml(c) {
    var tree = S.historyTree(c.id, histLangNow(c)), dirty = c.translations.some(function (t) { return isDirty(c, t); });
    var help = histInfoBox('Changes to the content, as a tree. <strong>Details</strong> shows what changed in a step. <strong>Rewind</strong> puts the content (text, header, footer, placeholders, buttons) back as it was after a step. It is recorded as a new step and nothing is deleted: the steps after it stay as another branch you can return to, and editing from here starts a new one. Everything else (publishing, renaming, campaigns, timing) is under <strong>Other</strong>.');
    if (dirty) help += '<div class="tree-note" role="status">Save or revert your unsaved edits to rewind.</div>';
    return histLangPickHtml(c) + help + '<ol class="tree" aria-label="Content history tree, newest first">' + tree.rows.map(function (row) {
      var e = row.event, what = eventTitle(e), why = dirty ? 'Save or revert your unsaved edits first' : row.problem;
      var tip = what + ' — ' + e.actor + ', ' + fmtTime(e.ts), open = !!ui.treeDetails[e.id];
      return '<li class="tree-item' + (open ? ' open' : '') + '" data-event="' + e.id + '"><div class="tree-row' + (row.isHead ? ' current' : '') + '" title="' + esc(tip) + '">' + treeGraph(row, tree.width) +
        '<span class="tree-what">' + esc(what) + '</span>' +
        (row.isHead ? '<span class="tree-cur" title="The content is as it was after this step">current</span>' : '') +
        '<span class="tree-meta">' + esc(e.actor) + ' · ' + esc(shortTime(e.ts)) + '</span>' +
        '<button class="btn link tree-details" data-action="tree-detail" data-event="' + e.id + '" aria-expanded="' + open + '" aria-controls="tree-detail-' + e.id + '" aria-label="Details of: ' + esc(what) + '">Details</button>' +
        (row.isHead ? '' : '<button class="btn tree-rewind" data-action="rewind" data-event="' + e.id + '" aria-label="Rewind to: ' + esc(what) + '"' + (why ? ' disabled' : '') + ' title="' + esc(why || 'Put the content back as it was after this step') + '">Rewind</button>') +
        '</div>' + (open ? treeDetailsHtml(row, tree.width) : '') + '</li>';
    }).join('') + '</ol>';
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
    var tabs = [{ id: 'content', label: 'Content' }, { id: 'other', label: 'Other' }];   // content changes as a tree; everything else as a list
    var active = ui.histTab;

    var tabsHtml = '<div class="hp-tabs" role="tablist">' + tabs.map(function (t) {
      return '<button class="hp-tab' + (t.id === active ? ' active' : '') + '" role="tab" aria-selected="' + (t.id === active) + '" data-action="hist-tab" data-tab="' + t.id + '">' +
        esc(t.label) + '</button>';
    }).join('') + '</div>';

    var head = '<div class="hp-head"><div class="hp-top"><h3>History</h3><span class="grow"></span>' +
      '<button class="btn link" data-action="toggle-history-pane" title="Hide history">Hide</button></div>' + tabsHtml + '</div>';

    var body;
    if (active === 'content') {
      body = treeHtml(c);
    } else {
      var names = S.historyFor(c.id, 'activity');
      body = '<div class="hp-lang"><span class="grow"></span>' + histInfoBtn() + '</div>' +
        histInfoBox('Other activity, one after the other: published, renamed, free text on or off, timing changed, copied or moved between campaigns. Changes to the content itself are in the <strong>Content</strong> tab.') +
        (names.length ? '<ul class="timeline compact">' + names.map(function (e) { return eventHtml(e, false); }).join('') + '</ul>' : '<div class="hint">None yet.</div>');
    }
    return head + body;
  }

  // The language panel of the language the history is showing (the Content tab's dropdown) gets the same outline as a panel you are working in
  function markHistLang() {
    var c = S.get(ui.selectedId), pane = document.getElementById('history-pane'), lang = pane && ui.histTab === 'content' && !currentFlow() && c ? histLangNow(c) : null;
    [].forEach.call(document.querySelectorAll('.panel.edit'), function (p) { p.classList.toggle('hist-sel', !!lang && p.getAttribute('data-lang') === lang); });
  }

  // Re-render only the sidebar (and the highlighted panel); never touches the textarea or its caret
  function updateHistoryPane() {
    var c = S.get(ui.selectedId);
    if (!c && !currentFlow()) return;
    var pane = document.getElementById('history-pane');
    if (pane) pane.innerHTML = historyPaneInner(c);
    var lay = document.querySelector('.layout');     // the wide column is only for the Content tree and only while the history pane is really shown
    if (lay) lay.classList.toggle('tree-on', !!pane && !!c && !currentFlow() && ui.histTab === 'content');
    markHistLang();
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
  // The timing as one line of flowing text:  <n> days <before/after> <reference date> <name>.  No borders, no boxes, no dropdown arrows: the
  // number, "before / after" and the date are still the editable parts (click one and change it), they just look like text.
  function timingEditor(t, attrs) {
    function sel(v, label) { return '<option value="' + v + '"' + (t.when === v ? ' selected' : '') + '>' + label + '</option>'; }
    function wch(text, extra, k) { return ' style="width:' + (Math.round((String(text).length * (k || 1) + extra) * 10) / 10) + 'ch"'; }      // each part is about as wide as its text (letters are narrower than the 0 that ch measures)
    return '<span class="timing" ' + attrs + '>' +
      '<input class="field num" type="number" min="0" max="999" step="1" data-t="days" data-change="timing" value="' + esc(t.days) + '" aria-label="Number of days"' + wch(t.days, 0.4) + '>' +
      '<span class="tl-word">days</span>' +
      '<select class="field-select" data-t="when" data-change="timing" aria-label="Before or after"' + wch(t.when, 0.6, 0.92) + '>' + sel('before', 'before') + sel('after', 'after') + '</select>' +
      '<select class="field-select ref" data-t="ref" data-change="timing" aria-label="Reference date"' + wch(t.ref, 0.6, 0.92) + '>' +
        (S.REF_DATES.indexOf(t.ref) === -1 ? '<option value="' + esc(t.ref) + '" selected>' + esc(t.ref) + '</option>' : '') +   // a value saved earlier that is not in the list stays selectable
        S.REF_DATES.map(function (d) { return '<option value="' + d + '"' + (t.ref === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
      '</span>';
  }

  // the line above a flow, or above a template that is a flow by itself: its timing and its name, as one line of text
  function flowCardHtml(c) {
    return '<div class="flow-card timing-line">' + timingEditor(c.timing, 'data-tpl="' + c.id + '"') + '<span class="tl-name">' + esc(c.name) + '</span></div>';
  }

  // ---- a searchable picker (templates, flows): used by template nodes, flow nodes and the "+ Template…" / "+ Flow…" buttons ---
  // A button showing the current choice opens a list with a search box. Typing filters by name (any part of it);
  // ArrowUp/Down move, Enter picks, Escape or a click elsewhere closes. Options that cannot be chosen are shown disabled with why.
  function comboHtml(o) {
    return '<div class="combo" data-combo="' + o.kind + '" ' + o.attrs + '>' +
      '<button type="button" class="combo-btn" data-action="combo-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="' + esc(o.aria) + '"' + (o.first ? ' data-first' : '') + (o.disabled ? ' disabled' : '') + '>' + esc(o.label) + '</button>' +
      '<div class="combo-pop"><input type="text" class="field combo-search" placeholder="' + esc(o.search) + '" aria-label="' + esc(o.search) + '" autocomplete="off" spellcheck="false">' +
      '<ul class="combo-list" role="listbox">' + o.options.map(function (opt) {
        if (opt.header) return '<li class="combo-group" role="presentation">' + esc(opt.header) + '</li>';
        return '<li role="option" class="combo-opt' + (opt.current ? ' current' : '') + (opt.disabled ? ' disabled' : '') + '" data-action="combo-pick" data-id="' + opt.id + '" aria-selected="' + !!opt.current + '"' + (opt.disabled ? ' aria-disabled="true"' : '') + '>' +
          '<span class="combo-name">' + esc(opt.label) + '</span>' + (opt.note ? ' <span class="muted small">' + esc(opt.note) + '</span>' : '') + '</li>';
      }).join('') + '</ul><div class="combo-empty muted small">' + esc(o.empty) + '</div></div></div>';
  }
  function comboOptions(combo) { return [].slice.call(combo.querySelectorAll('.combo-opt')); }
  function comboVisible(combo) { return comboOptions(combo).filter(function (li) { return li.style.display !== 'none' && !li.classList.contains('disabled'); }); }
  function closeCombos(except) {
    var open = document.querySelectorAll('.combo.open');
    for (var i = 0; i < open.length; i++) if (open[i] !== except) { open[i].classList.remove('open'); open[i].querySelector('.combo-btn').setAttribute('aria-expanded', 'false'); }
  }
  function filterCombo(combo, q) {
    q = q.trim().toLowerCase();
    var shown = 0;
    comboOptions(combo).forEach(function (li) {
      var show = !q || li.querySelector('.combo-name').textContent.toLowerCase().indexOf(q) !== -1;
      li.style.display = show ? '' : 'none'; li.classList.remove('active');
      if (show) shown++;
    });
    combo.querySelector('.combo-empty').style.display = shown ? 'none' : 'block';
    [].forEach.call(combo.querySelectorAll('.combo-group'), function (g) {          // a group heading shows only while something under it shows
      var n = g.nextElementSibling, any = false;
      while (n && !n.classList.contains('combo-group')) { if (n.style.display !== 'none') any = true; n = n.nextElementSibling; }
      g.style.display = any ? '' : 'none';
    });
    var first = comboVisible(combo)[0];
    if (first) first.classList.add('active');       // Enter picks this one
  }
  function openCombo(combo) {
    closeCombos(combo);
    combo.classList.add('open');
    combo.querySelector('.combo-btn').setAttribute('aria-expanded', 'true');
    var search = combo.querySelector('.combo-search');
    search.value = '';
    filterCombo(combo, '');
    search.focus();
  }
  function moveCombo(combo, step) {
    var list = comboVisible(combo), cur = list.filter(function (li) { return li.classList.contains('active'); })[0];
    if (!list.length) return;
    var next = list[(list.indexOf(cur) + step + list.length) % list.length];
    if (cur) cur.classList.remove('active');
    next.classList.add('active');
    next.scrollIntoView({ block: 'nearest' });
  }
  function pickCombo(li) {
    var combo = li.closest('.combo');
    if (li.classList.contains('disabled')) return;
    var id = li.getAttribute('data-id'), flow = combo.getAttribute('data-flow'), node = combo.getAttribute('data-node'), kind = combo.getAttribute('data-combo');
    closeCombos();
    if (kind === 'node' || kind === 'fnode') {           // staged: the node's ✓ saves it, ✕ discards it
      if (ui.nodeEdit) {
        if (kind === 'node') {            // values belong to a template's placeholders: another template starts with none (the original keeps its own)
          var orig = S.getNode(S.getFlow(flow), node);
          ui.nodeEdit.draft.templateId = id;
          ui.nodeEdit.draft.values = orig && orig.templateId === id ? Object.assign({}, orig.values || {}) : {};
          delete ui.nodeEdit.draft.previewLang;
        } else ui.nodeEdit.draft.flowId = id;
      }
      ui.focusNext = '.fnode.editing .node-save';
      render();
      return;
    }
    if (kind === 'addnode') {                            // one dropdown for every kind of node: type:logic | type:action | type:input | tpl:<id> | flow:<id>
      var what = id.split(':')[0], arg = id.slice(what.length + 1), r2;
      if (what === 'type') r2 = arg === 'logic' ? S.addLogicNode(flow) : arg === 'action' ? S.addActionNode(flow) : S.addInputNode(flow);
      else if (what === 'flow') r2 = S.addFlowNode(flow, arg);
      else r2 = S.addTemplateNode(flow, arg);
      result(r2, what === 'flow' ? 'Flow call added' : what === 'tpl' ? 'Added to the flow' : NODE_LABEL[arg] + ' node added');
      if (r2.ok && r2.node) { var pl = newNodePlace(flow, r2.node.type); if (pl) S.moveNode(flow, r2.node.id, pl.x, pl.y); }     // the middle of what you see, on top
      render();
      return;
    }
    var r = kind === 'addflow' ? S.addFlowNode(flow, id) : S.addTemplateNode(flow, id);
    result(r, kind === 'addflow' ? 'Flow call added' : 'Added to the flow');
    render();
  }

  // Where a new node goes: the middle of the part of the canvas you can see right now (however far it is scrolled), never exactly on top of another
  // node (a node already there is cascaded 28px), and above the others (it is the last node, so it is drawn last).
  var NEW_NODE_SIZE = { template: [270, 130], flow: [270, 110], logic: [270, 170], action: [270, 110], input: [270, 60] };
  function newNodePlace(flowId, type) {
    var wrap = document.getElementById('canvas-wrap'), cv = document.getElementById('canvas'), f = S.getFlow(flowId);
    if (!wrap || !cv || !f) return null;
    var wr = wrap.getBoundingClientRect(), cr = cv.getBoundingClientRect(), sz = NEW_NODE_SIZE[type] || [270, 120];
    var cx = wr.left + wrap.clientLeft + wrap.clientWidth / 2 - cr.left, cy = wr.top + wrap.clientTop + wrap.clientHeight / 2 - cr.top;
    var x = Math.max(20, Math.round(cx - sz[0] / 2)), y = Math.max(20, Math.round(cy - sz[1] / 2));
    while (f.nodes.some(function (n) { return Math.abs(n.x - x) < 12 && Math.abs(n.y - y) < 12; })) { x += 28; y += 28; }
    return { x: x, y: y };
  }

  // ---- the flow canvas: nodes joined by edges ---------------------------------------------
  // Template node: a template + its timing. Logic node: branches, with any number of outgoing edges named by condition.
  // Action node: a named action you define. Input node: something the flow takes in (a start point).
  var NODE_LABEL = { template: 'Template', flow: 'Flow', logic: 'Logic', action: 'Action', input: 'Input' };

  // The flows a flow node of `f` can call: every other flow; those it cannot call are listed disabled with why
  function flowOptions(f, node) {
    return S.listFlows().filter(function (g) { return g.id !== f.id; }).map(function (g) {
      var current = !!node && node.flowId === g.id;
      var bad = current ? null : S.callProblem(f.id, g.id, node && node.id);
      return { id: g.id, label: g.name, current: current, disabled: !!bad, note: bad ? (bad.code === 'loop' ? 'calls this flow' : 'already in this flow') : '' };
    });
  }

  var EDITABLE = { template: true, flow: true, action: true, logic: true, input: true };

  function draftOfNode(n) {
    if (n.type === 'template') return { templateId: n.templateId, values: Object.assign({}, n.values || {}) };
    if (n.type === 'flow') return { flowId: n.flowId };
    if (n.type === 'input') return { title: n.title };
    if (n.type === 'action') return { name: n.name, definition: n.definition };
    return { title: n.title, outs: n.outs.map(function (o) { return { id: o.id, label: o.label }; }) };
  }

  // Placeholder values of a template node (this flow only): one field per placeholder name of the template, all
  // languages together; blank = use the template's own default (shown as the hint)
  function valuesEditHtml(d) {
    var vals = S.nodeValues({ templateId: d.templateId, values: d.values });
    if (!vals.length) return '<div class="muted small vals-none">This template has no placeholders.</div>';
    return '<div class="vals"><div class="muted small">Placeholder values in this flow (blank uses the template\'s default)</div>' + vals.map(function (v) {
      return '<label class="val-row"><span class="val-name">{{' + esc(v.name) + '}}</span>' +
        '<input class="field" data-edit="value" data-name="' + esc(v.name) + '" value="' + esc(v.value) + '" placeholder="' + esc(v.def || 'no default') + '" autocomplete="off" maxlength="200" aria-label="Value of ' + esc(v.name) + ' in this flow"></label>';
    }).join('') + '</div>';
  }

  function nodeHtml(f, n) {
    var attrs = 'data-flow="' + f.id + '" data-node="' + n.id + '"';
    var title = S.nodeTitle(n);
    var editing = !!ui.nodeEdit && ui.nodeEdit.flow === f.id && ui.nodeEdit.node === n.id;
    var d = editing ? ui.nodeEdit.draft : null;
    var head = '<div class="fnode-head"><span class="ftype">' + NODE_LABEL[n.type] + '</span>' +
      ((n.type === 'input' || n.type === 'logic' || n.type === 'action') && editing
        ? '<input class="field node-title-input" data-edit="' + (n.type === 'action' ? 'name' : 'title') + '" data-first value="' + esc(n.type === 'action' ? d.name : d.title) + '" aria-label="Name of this ' + (n.type === 'logic' ? 'logic node' : n.type) + '" autocomplete="off">'   // the label itself becomes the field
        : n.type === 'template' || n.type === 'flow' ? '' : '<span class="fnode-title">' + esc(title) + '</span>') +
      '<span class="grow"></span>' +
      (editing ? '' : (function () { var n2 = S.commentsFor({ flowId: f.id }, 'open').filter(function (m) { return m.nodeId === n.id; }).length;
        return '<button class="node-cm' + (n2 ? ' has' : '') + '" data-action="cm-node" data-node="' + n.id + '" title="Comment on this node" aria-label="Comment on ' + esc(title) + (n2 ? ' (' + n2 + ' open)' : '') + '">💬' + (n2 ? '<span class="cm-n">' + n2 + '</span>' : '') + '</button>'; })()) +
      (editing ? '<button class="node-btn node-save" data-action="node-save" aria-label="Save changes to this node" title="Save">✓</button>' +
        '<button class="node-btn node-cancel" data-action="node-cancel" aria-label="Cancel and discard changes to this node" title="Cancel">✕</button>' : '') +
      '</div>';
    var body = '';

    if (n.type === 'template') {
      if (editing) {
        var used = S.flowTemplateIds(f), others = used.filter(function (id) { return id !== n.templateId; });
        body = '<div class="fnode-body"><div class="fld"><span>Template</span>' + comboHtml({
          kind: 'node', attrs: attrs, first: true, label: S.nodeTitle({ type: 'template', templateId: d.templateId }), aria: 'Template of this node. Click to choose another.', search: 'Search templates…', empty: 'No template matches',
          options: S.list().map(function (c) {
            var taken = others.indexOf(c.id) !== -1;
            return { id: c.id, label: c.name, current: c.id === d.templateId, disabled: taken, note: taken ? 'already in this flow' : '' };
          })
        }) + '</div>' + valuesEditHtml(d) + '</div>';
      } else {
        var shown = S.nodeValues(n).filter(function (v) { return v.overridden; });
        body = '<div class="fnode-body view"><div class="muted small">Template</div><div class="view-row"><strong class="view-name">' + esc(title) + '</strong>' +
          '<button class="btn link" data-action="open-template" data-id="' + n.templateId + '" title="Open this template">Open</button></div>' +
          (shown.length ? '<div class="view-vals" aria-label="Placeholder values in this flow">' + shown.map(function (v) {
            return '<div><span class="muted">{{' + esc(v.name) + '}}</span> ' + esc(v.value) + '</div>';
          }).join('') + '</div>' : '') + '</div>';
      }
    } else if (n.type === 'flow') {
      if (editing) {
        body = '<div class="fnode-body"><div class="fld"><span>Calls the flow</span>' + comboHtml({
          kind: 'fnode', attrs: attrs, first: true, label: S.nodeTitle({ type: 'flow', flowId: d.flowId }), aria: 'Flow called by this node. Click to choose another.', search: 'Search flows…', empty: 'No flow matches',
          options: flowOptions(f, { id: n.id, flowId: d.flowId })
        }) + '</div></div>';
      } else {
        body = '<div class="fnode-body view"><div class="muted small">Calls the flow</div><div class="view-row"><strong class="view-name">' + esc(title) + '</strong>' +
          '<button class="btn link" data-action="open-flow" data-id="' + n.flowId + '" title="Open this flow">Open</button></div></div>';
      }
    } else if (n.type === 'action') {
      if (editing) {
        body = '<div class="fnode-body">' +
          '<label class="fld"><span>Definition</span><textarea class="field" data-edit="definition" rows="3" placeholder="Describe what this action does">' + esc(d.definition) + '</textarea></label></div>';
      } else {
        body = n.definition ? '<div class="fnode-body view"><div class="view-def">' + esc(n.definition) + '</div></div>' : '';   // the name is in the header
      }
    } else if (n.type === 'input') {
      // nothing below the header: while editing, the header's label is the text field
    } else if (n.type === 'logic') {
      if (editing) {
        var single = d.outs.length <= 1;
        body = '<div class="fnode-body"><div class="muted small" style="margin-bottom:4px">Outgoing edges, named by condition</div>' + d.outs.map(function (o, i) {
          return '<div class="out-row"><input class="field" data-edit="out" data-i="' + i + '" value="' + esc(o.label) + '" placeholder="Condition" aria-label="Condition for outgoing edge ' + (i + 1) + '" autocomplete="off">' +
            '<button class="btn link out-x" data-action="edit-out-remove" data-i="' + i + '" aria-label="Remove outgoing edge ' + (i + 1) + '" title="' + (single ? 'A logic node needs at least one outgoing edge' : 'Remove this outgoing edge') + '"' + (single ? ' disabled' : '') + '>×</button>' +
            (o.id ? '<span class="port out" ' + attrs + ' data-out="' + o.id + '" data-port="out" title="Drag onto another node to connect this edge"></span>' : '') + '</div>';
        }).join('') + '<button class="btn add-out" data-action="edit-out-add">+ Add outgoing edge</button></div>';
      } else {
        body = '<div class="fnode-body view">' + n.outs.map(function (o) {
          return '<div class="out-row view"><span class="out-label">' + esc(o.label) + '</span>' +
            '<span class="port out" ' + attrs + ' data-out="' + o.id + '" data-port="out" title="Drag onto another node to connect this edge"></span></div>';
        }).join('') + '</div>';
      }
    }
    return '<div class="fnode fnode-' + n.type + (EDITABLE[n.type] ? ' editable' : '') + (editing ? ' editing' : '') + '" ' + attrs + ' style="left:' + n.x + 'px;top:' + n.y + 'px"' +
      (EDITABLE[n.type] && !editing ? ' title="Click to edit"' : '') + '>' +
      (editing ? '' : '<button class="node-x" data-action="node-remove" ' + attrs + ' aria-label="Remove ' + esc(title) + '" title="Remove this node">×</button>') +
      '<span class="port in" ' + attrs + ' data-port="in" title="Edges end here"></span>' +
      head + body +
      (n.type === 'logic' ? '' : '<span class="port out" ' + attrs + ' data-port="out" title="Drag onto another node to connect"></span>') +
      (editing && n.type === 'template' ? nodePreviewHtml(d) : '') + '</div>';
  }

  // ---- editing a node: edit, then ✓ save or ✕ cancel. Nothing else can be used meanwhile. ----------
  function startNodeEdit(flowId, nodeId) {
    var f = S.getFlow(flowId), n = f && S.getNode(f, nodeId);
    if (!n || !EDITABLE[n.type] || ui.nodeEdit) return;
    ui.nodeEdit = { flow: flowId, node: nodeId, type: n.type, draft: draftOfNode(n) };
    ui.focusNext = '.fnode.editing [data-first]';
    render();
    var first = document.querySelector('.fnode.editing .combo-btn[data-first]');
    if (first) first.focus({ preventScroll: true });
  }
  function cancelNodeEdit() { ui.nodeEdit = null; render(); }
  function saveNodeEdit() {
    var e = ui.nodeEdit;
    if (!e) return;
    var r = e.type === 'template' ? S.updateTemplateNode(e.flow, e.node, { templateId: e.draft.templateId, values: e.draft.values })
      : e.type === 'flow' ? S.changeNodeFlow(e.flow, e.node, e.draft.flowId)
      : e.type === 'input' ? S.renameInput(e.flow, e.node, e.draft.title)
      : e.type === 'action' ? S.updateAction(e.flow, e.node, { name: e.draft.name, definition: e.draft.definition })
      : S.updateLogic(e.flow, e.node, e.draft.outs, e.draft.title);
    if (r.ok || r.error === 'No change') {           // saved (or nothing changed): back to reading mode
      ui.nodeEdit = null;
      render();
      if (r.ok) toast('Saved');
    } else {
      toast(r.error, true);                           // refused: stay in edit mode so it can be fixed (or cancelled)
    }
  }
  function editingEl() { return ui.nodeEdit ? document.querySelector('.fnode.editing') : null; }
  function outsideEdit(ev) {
    var el = editingEl();
    return !!el && !!ev.target && !!ev.target.closest && !el.contains(ev.target);
  }
  function nudgeEdit() {                              // "you are still editing this": shake the node and say so
    var el = editingEl();
    if (!el) return;
    el.classList.remove('attention'); void el.offsetWidth; el.classList.add('attention');
    toast('Save (✓) or cancel (✕) your changes to this node first', true);
  }
  // Capture phase: runs before every other handler, so a click, focus or Tab outside the node never reaches the page
  ['mousedown', 'click', 'dblclick', 'contextmenu', 'dragstart'].forEach(function (type) {
    document.addEventListener(type, function (ev) {
      if (!outsideEdit(ev)) return;
      ev.preventDefault(); ev.stopPropagation();
      if (type === 'mousedown') nudgeEdit();
    }, true);
  });
  document.addEventListener('focusin', function (ev) {
    if (!outsideEdit(ev)) return;
    var el = editingEl(), first = el.querySelector('[data-first]') || el.querySelector('.node-save');
    if (first) first.focus();
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (ev.target && ev.target.id === 'cm-text' && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); addCommentFromUi(); }
  });
  document.addEventListener('keydown', function (ev) {      // Tab stays inside the node
    var el = editingEl();
    if (!el || ev.key !== 'Tab') return;
    var items = [].slice.call(el.querySelectorAll('input:not([disabled]), textarea, select, button:not([disabled])')).filter(function (x) { return x.offsetParent !== null && !x.classList.contains('node-x'); });
    if (!items.length) return;
    var idx = items.indexOf(document.activeElement);
    if (ev.shiftKey ? (idx <= 0) : (idx === -1 || idx === items.length - 1)) { ev.preventDefault(); items[ev.shiftKey ? items.length - 1 : 0].focus(); }
  }, true);

  function canvasSize(f) {
    var w = 900, h = 420;
    f.nodes.forEach(function (n) { w = Math.max(w, n.x + 340); h = Math.max(h, n.y + 300); });
    return { w: w, h: h };
  }

  function flowEditorHtml(f) {
    // one quiet header row: the name (with a small pencil to rename it), its timing as plain text, and the comments / history buttons at the right.
    // What the flow holds and its campaigns are in the name's tooltip; the hint about dragging is behind the i button of the toolbar.
    var tip = 'Flow · ' + flowSummary(f) + (f.campaignIds.length ? ' · ' + (f.campaignIds.length === 1 ? 'Campaign' : 'Campaigns') + ': ' + f.campaignIds.map(S.campaignName).join(', ') : '');
    var title = ui.renaming
      ? '<span class="rename-row"><input type="text" id="rename-input" value="' + esc(f.name) + '" aria-label="Flow name">' +
        '<button class="icon-btn sm" data-action="rename-save" aria-label="Save the new name" title="Save the new name">✓</button><button class="icon-btn sm" data-action="rename-cancel" aria-label="Cancel renaming" title="Cancel (Esc)">✕</button></span>'
      : '<h2 title="' + esc(tip) + '">' + esc(f.name) + '</h2>' +
        '<button class="icon-btn sm" data-action="rename-start" aria-label="Rename the flow" title="Rename">' + ICON_PENCIL + '</button>';
    var inFlow = S.flowTemplateIds(f);
    var addable = S.list().filter(function (c) { return inFlow.indexOf(c.id) === -1; });
    var size = canvasSize(f);
    return '<div class="flow-head">' + title +
      '<div class="flow-card timing-line">' + timingEditor(f.timing, 'data-flow-timing="' + f.id + '"') + '</div>' +
      '<div class="actions">' + cmButtonHtml({ kind: 'flow', id: f.id, f: f }) + (ui.historyOpen ? '' : '<button class="btn" data-action="toggle-history-pane" title="Show the history sidebar">History</button>') + '</div></div>' +
      '<div class="flow-toolbar">' +
      comboHtml({
        kind: 'addnode', attrs: 'data-flow="' + f.id + '"', label: '+ Add node', aria: 'Add a node to the flow', search: 'Search node types, templates and flows…', empty: 'Nothing matches',
        options: [{ header: 'Node types' },
          { id: 'type:logic', label: 'Logic', note: 'branch on conditions' }, { id: 'type:action', label: 'Action', note: 'something you define' }, { id: 'type:input', label: 'Input', note: 'where the flow starts' },
          { header: 'Templates' }].concat(
          S.list().map(function (c) { var inIt = inFlow.indexOf(c.id) !== -1; return { id: 'tpl:' + c.id, label: c.name, disabled: inIt, note: inIt ? 'already in this flow' : '' }; }),
          [{ header: 'Flows' }],
          flowOptions(f, null).map(function (o) { return { id: 'flow:' + o.id, label: o.label, disabled: o.disabled, note: o.note }; }))
      }) +
      '<span class="seg dir-toggle" role="group" aria-label="Direction of the edges">' + [['lr', '→ Left to right'], ['td', '↓ Top down']].map(function (d) {
        var on = S.flowDirection(f) === d[0];
        return '<button type="button" class="btn' + (on ? ' on' : '') + '" data-action="flow-direction" data-dir="' + d[0] + '" aria-pressed="' + on + '">' + d[1] + '</button>';
      }).join('') + '</span>' +
      '<button class="info-btn' + (ui.flowInfo ? ' on' : '') + '" data-action="flow-info" aria-expanded="' + !!ui.flowInfo + '" aria-controls="flow-help" aria-label="How to use the canvas" title="How to use the canvas">' + ICON_INFO + '</button></div>' +
      (ui.flowInfo ? '<div class="muted small flow-help" id="flow-help">Drag a node by its header to move it. Drag from the output dot of a node onto another node to connect.</div>' : '') +
      '<div class="canvas-wrap" id="canvas-wrap"><div class="canvas' + (S.flowDirection(f) === 'td' ? ' td' : '') + '" id="canvas" data-flow="' + f.id + '" style="width:' + size.w + 'px;height:' + size.h + 'px">' +
      '<svg class="edges" id="edges" width="' + size.w + '" height="' + size.h + '"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="arrow-head"/></marker></defs><g id="edge-paths"></g></svg>' +
      f.nodes.map(function (n) { return nodeHtml(f, n); }).join('') +
      '<div id="edge-pills"></div>' +
      (f.nodes.length ? '' : '<div class="canvas-empty muted">Empty flow. Add a template, logic, action or input node above.</div>') +
      '</div></div>';
  }

  // Hovering an edge (its line or its pill) highlights it and shows its disconnect cross
  var hotEdge = null;
  function setHotEdge(key) {
    hotEdge = key;
    [].forEach.call(document.querySelectorAll('#edge-paths .edge, #edge-pills .edge-pill'), function (el) {
      el.classList.toggle('hot', !!key && el.getAttribute('data-edge') === key);
    });
  }
  document.addEventListener('mouseover', function (ev) {
    var e = ev.target.closest && ev.target.closest('.edge, .edge-pill');
    if (e) setHotEdge(e.getAttribute('data-edge'));
    else if (hotEdge) setHotEdge(null);
  });

  // A curve from p1 to p2 that leaves p1 and arrives at p2 sideways (left to right) or vertically (top down)
  function edgePath(p1, p2, dir) {
    if (dir === 'td') { var dy = Math.max(50, Math.abs(p2.y - p1.y) / 2); return 'M' + p1.x + ' ' + p1.y + ' C' + p1.x + ' ' + (p1.y + dy) + ' ' + p2.x + ' ' + (p2.y - dy) + ' ' + p2.x + ' ' + p2.y; }
    var dx = Math.max(50, Math.abs(p2.x - p1.x) / 2);
    return 'M' + p1.x + ' ' + p1.y + ' C' + (p1.x + dx) + ' ' + p1.y + ' ' + (p2.x - dx) + ' ' + p2.y + ' ' + p2.x + ' ' + p2.y;
  }
  // Draw every edge as a curve from its port to the target node's input port, with a pill (condition name + disconnect)
  function drawEdges() {
    var canvas = document.getElementById('canvas');
    if (!canvas) return;
    var f = S.getFlow(canvas.getAttribute('data-flow'));
    if (!f) return;
    var cr = canvas.getBoundingClientRect(), paths = '', pills = '';
    function pt(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top }; }
    f.nodes.forEach(function (n) {
      var outs = n.type === 'logic' ? n.outs.map(function (o) { return { id: o.id, label: o.label, to: o.to }; }) : [{ id: null, label: '', to: n.next }];
      outs.forEach(function (o) {
        if (!o.to) return;
        var a = canvas.querySelector('.port.out[data-node="' + n.id + '"]' + (o.id ? '[data-out="' + o.id + '"]' : ''));
        var b = canvas.querySelector('.port.in[data-node="' + o.to + '"]');
        if (!a || !b) return;
        var p1 = pt(a), p2 = pt(b);
        var key = n.id + ':' + (o.id || ''), d = edgePath(p1, p2, S.flowDirection(f));
        paths += '<g class="edge" data-edge="' + key + '"><path class="edge-hit" d="' + d + '"/><path class="edge-line" d="' + d + '" marker-end="url(#arrow)"/></g>';
        pills += '<div class="edge-pill' + (hotEdge === key ? ' hot' : '') + '" data-edge="' + key + '" style="left:' + ((p1.x + p2.x) / 2) + 'px;top:' + ((p1.y + p2.y) / 2) + 'px" data-node="' + n.id + '"' + (o.id ? ' data-out="' + o.id + '"' : '') + '>' +
          '<button class="pill-x" data-action="edge-remove" data-flow="' + f.id + '" data-node="' + n.id + '"' + (o.id ? ' data-out="' + o.id + '"' : '') +
          ' aria-label="Disconnect ' + esc(S.nodeTitle(n) + (o.label ? ' [' + o.label + ']' : '')) + ' from ' + esc(S.nodeTitle(S.getNode(f, o.to))) + '" title="Disconnect">×</button></div>';
      });
    });
    var g = document.getElementById('edge-paths'), pl = document.getElementById('edge-pills');
    if (g) g.innerHTML = paths.replace(/class="edge" data-edge="([^"]*)"/g, function (m, k) { return 'class="edge' + (hotEdge === k ? ' hot' : '') + '" data-edge="' + k + '"'; });
    if (pl) pl.innerHTML = pills;
  }

  function resizeCanvas() {            // after a node was dragged: grow the canvas if needed, redraw the edges
    var canvas = document.getElementById('canvas');
    var f = canvas && S.getFlow(canvas.getAttribute('data-flow'));
    if (!f) return;
    var size = canvasSize(f), svg = document.getElementById('edges');
    canvas.style.width = size.w + 'px'; canvas.style.height = size.h + 'px';
    if (svg) { svg.setAttribute('width', size.w); svg.setAttribute('height', size.h); }
    drawEdges();
  }


  function flowsMainHtml(fi, c) {
    if (!fi) return '<div class="hint">No flows here yet. Use the + button in the left bar to create one. Templates that are not in a flow are listed here as flows by themselves.</div>';
    if (fi.kind === 'template') return flowCardHtml(fi.content) + headHtml(fi.content) + editHtml(fi.content);
    return flowEditorHtml(fi.flow);
  }

  function scrollSnapshot() {
    var m = document.querySelector('.main'), w = document.getElementById('canvas-wrap'), cv = document.getElementById('canvas'), l = document.getElementById('content-list');
    var pn = document.querySelector('.panels');
    return { strip: pn ? pn.scrollLeft : 0, stripTop: pn ? pn.scrollTop : 0, list: l ? l.scrollTop : 0, listLeft: l ? l.scrollLeft : 0, listTab: l ? l.getAttribute('data-tab') : null, flow: cv ? cv.getAttribute('data-flow') : null, main: m ? m.scrollTop : 0, left: w ? w.scrollLeft : 0, top: w ? w.scrollTop : 0 };
  }
  function scrollRestore(snap) {       // re-rendering the flow editor must not throw you back to the top-left of the canvas
    var lst = document.getElementById('content-list');
    if (lst && lst.getAttribute('data-tab') === snap.listTab) { lst.scrollTop = snap.list; lst.scrollLeft = snap.listLeft; }   // the same list, redrawn: it keeps its place both ways (a different tab starts at the top-left)
    var pn2 = document.querySelector('.panels');
    if (pn2) { pn2.scrollLeft = snap.strip; pn2.scrollTop = snap.stripTop; }           // the row of language panels keeps its place when it is redrawn             // the list keeps its place when the page is redrawn (it is the only thing in the column that scrolls)
    var cv = document.getElementById('canvas');
    if (!cv || cv.getAttribute('data-flow') !== snap.flow) return;
    var m = document.querySelector('.main'), w = document.getElementById('canvas-wrap');
    if (m) m.scrollTop = snap.main;
    if (w) { w.scrollLeft = snap.left; w.scrollTop = snap.top; }
  }

  // ---- uploaded header files: kept as data in IndexedDB, shown from local blob URLs (nothing is ever fetched) --------------
  // Key = the (dummy CDN) link the upload was given. mediaUrls: link -> blob URL, filled at start-up and on upload. If IndexedDB is not
  // available (some private windows) the file is still shown until the page is closed.
  var mediaUrls = {};
  function mediaDb() {
    return new Promise(function (resolve, reject) {
      try {
        var req = window.indexedDB.open('cms-prototype-media', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('files', { keyPath: 'url' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
  }
  function mediaTx(mode, fn) {
    return mediaDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('files', mode), out = fn(tx.objectStore('files'));
        tx.oncomplete = function () { db.close(); resolve(out && out.result); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  }
  function mediaPut(url, blob) { return mediaTx('readwrite', function (st) { return st.put({ url: url, blob: blob }); }).catch(function () { /* kept for this session only */ }); }
  function mediaClear() {
    Object.keys(mediaUrls).forEach(function (u) { try { URL.revokeObjectURL(mediaUrls[u]); } catch (e) { /* ignore */ } });
    mediaUrls = {};
    return mediaTx('readwrite', function (st) { return st.clear(); }).catch(function () { /* ignore */ });
  }
  function mediaLoad() {
    return mediaTx('readonly', function (st) { return st.getAll(); }).then(function (rows) {
      (rows || []).forEach(function (r) { if (r && r.blob && !mediaUrls[r.url]) mediaUrls[r.url] = URL.createObjectURL(r.blob); });
      return (rows || []).length;
    }).catch(function () { return 0; });
  }

  // A small lock in the toolbar while a language panel is in focus: it denotes that other users cannot edit that language while you are in it
  // (one user in the prototype, so it only shows). Updated from the focus events: nothing is re-rendered.
  function updateLangLock() {
    var el = document.getElementById('lang-lock');
    if (!el) return;
    var a = document.activeElement, p = a && a.closest ? a.closest('.panel.edit') : null;
    if (!p) { el.classList.add('off'); return; }
    var name = S.langName(p.getAttribute('data-lang')), why = name + ' is locked while you are in it: other users cannot edit it';
    el.querySelector('.lock-name').textContent = name;
    el.title = why; el.setAttribute('aria-label', why);
    el.classList.remove('off');
  }
  document.addEventListener('focusin', updateLangLock);
  document.addEventListener('focusout', function () { setTimeout(updateLangLock, 0); });

  // ---- resizing the content / flows column: drag its right edge (double-click resets, left / right arrows resize from the keyboard) ----
  // A width is kept per tab (Templates and Flows have their own) and remembered in this browser; until you set one the tab has its default
  // (a fixed width for Templates, as wide as the longest entry for Flows).
  var LISTW_KEY = 'cms-prototype-list-widths';
  try { var lw = JSON.parse(localStorage.getItem(LISTW_KEY) || '{}'); ui.listW = { templates: +lw.templates || null, flows: +lw.flows || null }; } catch (e) { /* ignore: the defaults */ }
  function listWLimits() {
    var other = (ui.campCollapsed ? 44 : 210) + 360 + ((ui.historyOpen || ui.commentsOpen) ? 340 : 0);      // what the other columns need, at least
    return { min: 180, max: Math.max(280, window.innerWidth - other) };
  }
  function setListW(px, save) {
    var lay = document.querySelector('.layout'), tab = ui.listTab, lim = listWLimits();
    if (px === null) { ui.listW[tab] = null; if (lay) lay.style.removeProperty('--list-w'); }
    else { px = Math.round(Math.max(lim.min, Math.min(lim.max, px))); ui.listW[tab] = px; if (lay) lay.style.setProperty('--list-w', px + 'px'); }
    if (save) { try { localStorage.setItem(LISTW_KEY, JSON.stringify(ui.listW)); } catch (e) { /* ignore */ } }
  }
  var resizing = null;
  document.addEventListener('mousedown', function (ev) {
    var h = ev.target.closest && ev.target.closest('.list-resizer');
    if (!h || ev.button !== 0) return;
    ev.preventDefault();
    resizing = { x: ev.clientX, w: document.querySelector('.sidebar').getBoundingClientRect().width };
    document.body.classList.add('resizing');
  });
  document.addEventListener('mousemove', function (ev) { if (resizing) setListW(resizing.w + ev.clientX - resizing.x, false); });
  document.addEventListener('mouseup', function () {
    if (!resizing) return;
    resizing = null; document.body.classList.remove('resizing');
    setListW(ui.listW[ui.listTab], true);
  });
  document.addEventListener('dblclick', function (ev) { if (ev.target.closest && ev.target.closest('.list-resizer')) setListW(null, true); });
  document.addEventListener('keydown', function (ev) {
    if (!(ev.target.classList && ev.target.classList.contains('list-resizer'))) return;
    var step = ev.shiftKey ? 64 : 16, cur = document.querySelector('.sidebar').getBoundingClientRect().width;
    if (ev.key === 'ArrowLeft') setListW(cur - step, true);
    else if (ev.key === 'ArrowRight') setListW(cur + step, true);
    else if (ev.key === 'Home' || ev.key === 'Escape') setListW(null, true);
    else return;
    ev.preventDefault();
  });

  function autosize(el) { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }   // the body grows with its text, like the bubble
  function autosizeAll() { [].forEach.call(document.querySelectorAll('.wa-text-in'), autosize); }

  function render() {
    if (ui.nodeEdit) {
      var shown = currentFlow(), here = shown && shown.id === ui.nodeEdit.flow && S.getNode(shown, ui.nodeEdit.node);
      if (!here) ui.nodeEdit = null;
    }
    var snap = scrollSnapshot();
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
    var cmScope = ui.commentsOpen ? cmScopeNow() : null;
    var histShown = !cmScope && subject && ui.historyOpen;
    var pane = cmScope ? '<aside class="history-pane comments-pane" id="comments-pane">' + commentsPaneInner(cmScope) + '</aside>'
      : histShown ? '<aside class="history-pane" id="history-pane">' + historyPaneInner(c) + '</aside>' : '';
    $app.innerHTML = topbarHtml() + '<div class="layout' + (ui.listTab === 'flows' ? ' flows-wide' : '') + (ui.campCollapsed ? ' camps-collapsed' : '') + (pane ? '' : ' hist-off') + (histShown && ui.histTab === 'content' && !currentFlow() ? ' tree-on' : '') + '"' + (ui.listW[ui.listTab] ? ' style="--list-w:' + ui.listW[ui.listTab] + 'px"' : '') + '>' + campaignsHtml() + sidebarHtml() + '<main class="main">' + main + '</main>' + pane + '</div>';
    if (ui.focusNext) {
      var fields = document.querySelectorAll(ui.focusNext);
      if (fields.length) { var fld = fields[fields.length - 1]; fld.focus(fld.closest('.fnode') ? { preventScroll: true } : undefined); }   // a node field must not scroll the canvas
      ui.focusNext = null;
    }
    else if (ui.renaming) { var r = document.getElementById('rename-input'); if (r) { r.focus(); r.select(); } }
    else if (ui.sideBox) focusSideBox();
    else if (ui.campBox) focusCampBox();
    drawEdges();
    autosizeAll();
    markHistLang();
    updateLangLock();
    if (ui.scrollLang) { var sp = panelOf(ui.scrollLang); if (sp) sp.scrollIntoView({ inline: 'center', block: 'nearest' }); ui.scrollLang = null; }
    scrollRestore(snap);
  }

  // ---- events ----------------------------------------------------------------
  function result(r, okMsg) {
    if (r.ok) { if (okMsg) toast(okMsg); } else toast(r.error, true);
    return r.ok;
  }

  // A file was chosen for the header of one language: check it against WhatsApp's rules, give it a random link on the dummy CDN,
  // keep its data in IndexedDB and show it right away. Nothing is saved until the language is saved (the link is part of the draft).
  function uploadHeader(input) {
    var file = input.files && input.files[0], lang = input.getAttribute('data-lang');
    var c = S.get(ui.selectedId), tr = c && S.getTr(c, lang);
    if (!file || !tr) return;
    var meta = { name: file.name, type: file.type, size: file.size };
    var why = S.checkFile(c.headerType, meta);
    input.value = '';
    if (why) { toast(why, true); return; }
    var r = S.addMedia(c.headerType, meta);
    if (!r.ok) { toast(r.error, true); return; }
    mediaUrls[r.url] = URL.createObjectURL(file);
    mediaPut(r.url, file);
    editableDraft(c, tr).header = r.url;
    refreshSec(lang, 'header'); refreshSec(lang, 'problems'); syncDirty(lang);
    toast(file.name + ' attached as ' + r.url);
  }
  function panelOf(lang) { return document.querySelector('.panel.edit[data-lang="' + lang + '"]'); }

  // Re-render one section of the editing panel. Only sections that do not contain the field being typed in
  var SEC_HTML = {
    placeholders: secPlaceholders, buttons: secButtons, 'button-details': secButtonDetails,
    problems: secProblems, add: secAdd, header: secHeader, 'header-url': secHeaderUrl
  };
  function refreshSec(lang, sec) {
    var c = S.get(ui.selectedId), tr = c && S.getTr(c, lang), panel = panelOf(lang);
    if (!tr || !panel) return;
    var p = currentParts(c, tr);
    (sec === 'buttons' ? ['buttons', 'button-details'] : sec === 'header' ? ['header', 'header-url'] : [sec]).forEach(function (k) {
      var el = panel.querySelector('[data-sec="' + k + '"]');
      if (el && SEC_HTML[k]) el.outerHTML = SEC_HTML[k](c, tr, p);
    });
  }
  function refreshParams(lang, idx) {
    var c = S.get(ui.selectedId), tr = c && S.getTr(c, lang), panel = panelOf(lang);
    var el = panel && panel.querySelector('[data-params="' + idx + '"]');
    if (el) el.outerHTML = btnParams(tr, currentParts(c, tr).buttons[idx], idx);
  }
  // The timing row of a flow, or of a template that is a flow by itself (days / before-after / reference date) changed. The reference
  // date is normalised to a variable-style name (lowercase, spaces become _). Invalid input is refused with a message
  // and the row goes back.
  function saveTimingFromUi(input) {
    var box = input.closest('.timing');
    var daysText = box.querySelector('[data-t=days]').value.trim();
    var timing = {
      days: daysText === '' ? NaN : Number(daysText),
      when: box.querySelector('[data-t=when]').value,
      ref: box.querySelector('[data-t=ref]').value.trim().toLowerCase().replace(/\s+/g, '_')
    };
    var fid = box.getAttribute('data-flow-timing');
    var r = fid ? S.setFlowTiming(fid, timing) : S.setTemplateTiming(box.getAttribute('data-tpl'), timing);
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
      var bodyEl = panel.querySelector('[data-input="text"]'); bodyEl.value = r.text; autosize(bodyEl);
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
    if (ui.histTab === 'content') updateHistoryPane();       // Rewind is unavailable while something is unsaved
  }

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.classList && t.classList.contains('combo-search')) { filterCombo(t.closest('.combo'), t.value); return; }
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
    if (t.id === 'cm-text') { ui.cmDraft = t.value; return; }
    var edit = t.getAttribute && t.getAttribute('data-edit');
    if (edit && ui.nodeEdit) {
      if (edit === 'out') ui.nodeEdit.draft.outs[parseInt(t.getAttribute('data-i'), 10)].label = t.value;
      else if (edit === 'value') { ui.nodeEdit.draft.values[t.getAttribute('data-name')] = t.value; refreshNodePreview(); }
      else ui.nodeEdit.draft[edit] = t.value;
      return;
    }
    var kind = t.getAttribute('data-input');
    if (kind) {
      var c = S.get(ui.selectedId), lang = t.getAttribute('data-lang'), tr = S.getTr(c, lang);
      var d = editableDraft(c, tr), idx = parseInt(t.getAttribute('data-idx'), 10), name = t.getAttribute('data-name');
      if (kind === 'text') { d.text = t.value; autosize(t); setCount(lang, 'text', t.value.length, S.LIMITS.body); refreshSec(lang, 'placeholders'); }
      else if (kind === 'footer') { d.footer = t.value; setCount(lang, 'footer', t.value.length, S.LIMITS.footer); }
      else if (kind === 'header') { d.header = t.value; var mbox = panelOf(lang).querySelector('[data-media]'); if (mbox) mbox.innerHTML = headerVisualHtml(c, d); }
      else if (kind === 'default') { d.defaults[name] = t.value; }
      else if (kind === 'btn-text') {
        d.buttons[idx].text = t.value; setCount(lang, 'btn-text-' + idx, t.value.length, S.LIMITS.buttonText);
        var lab = panelOf(lang).querySelector('[data-label="' + idx + '"]'); if (lab) lab.textContent = t.value || 'Button ' + (idx + 1);     // the label of its payload / URL field below the phone
      }
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
    if (what === 'upload-header') { uploadHeader(t); return; }
    if (what === 'hist-lang') { ui.histLang = t.value; updateHistoryPane(); return; }
    if (what === 'cm-target') {
      var sc = cmScopeNow(), v = t.value.split('|');
      if (!sc) return;
      ui.cmTarget = v[0] === 'general' ? null : v[0] === 'node' ? { scope: sc.id, nodeId: v[1] }
        : { scope: sc.id, lang: v[0], part: v[1], idx: v[2] === '' ? undefined : parseInt(v[2], 10) };
      refreshCmTarget();
      return;
    }
    var c = S.get(ui.selectedId);
    if (what === 'set-header-type') { result(S.setHeaderType(c.id, t.value), 'Header type: ' + t.options[t.selectedIndex].text); }
    else if (what === 'add-part') {
      var v = t.value, lang0 = t.getAttribute('data-lang'), tr0 = S.getTr(c, lang0);
      if (!v) return;
      if (v.indexOf('header:') === 0) { result(S.setHeaderType(c.id, v.slice(7)), 'Header added to every language'); ui.focusNext = '.panel.edit[data-lang="' + lang0 + '"] [data-input="header"]'; }
      else if (v === 'footer') { shownFor(c, tr0).footer = true; ui.focusNext = '.panel.edit[data-lang="' + lang0 + '"] [data-input="footer"]'; }
      else if (v.indexOf('button:') === 0) {
        var d0 = editableDraft(c, tr0), type0 = v.slice(7);
        if (S.canAddButton(d0.buttons, type0)) d0.buttons.push(S.newButton(type0));
        ui.focusNext = '.panel.edit[data-lang="' + lang0 + '"] .wa-btn-edit:last-child [data-input="btn-text"]';
      }
    }
    else if (what === 'toggle-block') {
      result(S.setBlocked(c.id, t.checked), t.checked ? 'Template approval blocked' : 'Template approval allowed');
    } else if (what === 'add-lang') {
      if (!t.value) return;
      if (result(S.addTranslation(c.id, t.value), S.langName(t.value) + ' added')) {
        ui.scrollLang = t.value;
      }
    }
    render();
  });

  document.addEventListener('keydown', function (ev) {
    var combo = ev.target.closest && ev.target.closest('.combo');
    if (combo && combo.classList.contains('open')) {
      if (ev.key === 'Escape') { ev.preventDefault(); closeCombos(); combo.querySelector('.combo-btn').focus(); return; }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); moveCombo(combo, ev.key === 'ArrowDown' ? 1 : -1); return; }
      if (ev.key === 'Enter' && ev.target.classList.contains('combo-search')) {
        ev.preventDefault();
        var active = combo.querySelector('.combo-opt.active');
        if (active) pickCombo(active);
        return;
      }
    }
    if (ui.nodeEdit) {
      if (ev.key === 'Escape') { ev.preventDefault(); cancelNodeEdit(); return; }
      var inField = ev.target.getAttribute && ev.target.getAttribute('data-edit');
      if (ev.key === 'Enter' && inField && (ev.target.tagName !== 'TEXTAREA' || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); saveNodeEdit(); return; }
    }
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
    var fromNames = plan.move.from.map(S.campaignName);
    function count(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
    function opt(action, label, desc, ok) {
      return '<button class="dlg-opt' + (ok ? '' : ' off') + '" data-action="' + action + '"' + (ok ? '' : ' disabled') + '><strong>' + label + '</strong><span>' + esc(desc) + '</span></button>';
    }
    var moveDesc = plan.move.ok
      ? (fromNames.length ? 'Remove it from ' + fromNames.join(', ') + (plan.inTarget ? ' (it stays in ' + target + ')' : ' and add it to ' + target) : 'Add it to ' + target)
      : plan.move.reason;
    var options;

    if (isFlow) {
      // refer = the same flow in more than one campaign; duplicate = a new independent flow; move; cancel
      var referDesc = plan.refer.ok
        ? 'The same flow also appears in ' + target + (names.length ? ' (and stays in ' + names.join(', ') + '), so editing it changes it everywhere' : '')
        : plan.refer.reason;
      var addN = plan.duplicate.addTemplates.length;
      var tplNote = addN ? '. ' + count(addN, 'template') + ' will be added to ' + target + ' too' : '';
      if (plan.refer.ok) referDesc += tplNote;
      var dupDesc = 'Make an independent copy called “' + plan.duplicate.name + '” in ' + target + '; editing either one leaves the other alone. The templates are shared, not duplicated' + tplNote;
      if (plan.move.ok) {
        var bits = [];
        if (plan.move.leave.length) bits.push(count(plan.move.leave.length, 'template') + ' move' + (plan.move.leave.length === 1 ? 's' : '') + ' with it');
        if (plan.move.stay.length) bits.push(count(plan.move.stay.length, 'template') + ' stay' + (plan.move.stay.length === 1 ? 's' : '') + ' in ' + fromNames.join(', ') + ' because another flow there uses ' + (plan.move.stay.length === 1 ? 'it' : 'them') + ' (also added to ' + target + ')');
        var staying = plan.move.addTemplates.filter(function (id) { return plan.move.leave.indexOf(id) === -1 && plan.move.stay.indexOf(id) === -1; });
        if (staying.length) bits.push(count(staying.length, 'template') + ' will be added to ' + target);
        if (bits.length) moveDesc += '. ' + bits.join('; ');
      }
      options = opt('dialog-refer', 'Refer same flow', referDesc, plan.refer.ok) +
        opt('dialog-duplicate', 'Duplicate flow', dupDesc, true) +
        opt('dialog-move', plan.move.label || 'Move flow', moveDesc, plan.move.ok);
    } else {
      var copyDesc = plan.copy.ok
        ? (names.length ? 'Keep it in ' + names.join(', ') + ' and add it to ' + target : 'Add it to ' + target)
        : plan.copy.reason;
      options = opt('dialog-copy', 'Copy', copyDesc, plan.copy.ok) + opt('dialog-move', plan.move.label || 'Move', moveDesc, plan.move.ok);
    }
    return '<div class="modal-backdrop" data-action="dialog-backdrop">' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<h2 id="dlg-title">“' + esc(item.name) + '” <span class="muted">→</span> ' + esc(target) + '</h2>' +
      '<div class="dlg-label">Already in</div>' +
      '<ul class="exists-list" aria-label="Campaigns this ' + (isFlow ? 'flow' : 'template') + ' is already in">' + (existing || '<li class="muted">Not in any campaign yet</li>') + '</ul>' +
      '<div class="dlg-options">' + options + opt('dialog-cancel', 'Cancel', 'Close without changing anything', true) + '</div></div></div>';
  }

  // ---- preview: the template as a WhatsApp message on a phone (in a dialog) --------------------------------------------
  // Shows the parts as they are now, unsaved edits included (the reference panel shows its saved parts). Placeholders are
  // filled with their default values; one without a default stays as {{name}}, marked.
  function waFormat(text) {                        // WhatsApp's inline formatting: *bold* _italic_ ~strike~ ```mono```
    return text
      .replace(/```([^`]+)```/g, '<code>$1</code>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<strong>$2</strong>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,!?:;])/g, '$1<s>$2</s>')
      .replace(/\n/g, '<br>');
  }
  function waBodyHtml(text, defaults) {
    var out = '', last = 0, re = /\{\{([a-zA-Z1-9_]+)\}\}/g, m;
    while ((m = re.exec(text))) {
      out += waFormat(esc(text.slice(last, m.index)));
      var d = (defaults || {})[m[1]];
      out += d ? '<span class="wa-var" title="{{' + esc(m[1]) + '}}">' + esc(d) + '</span>' : '<span class="wa-var missing" title="No default value yet">{{' + esc(m[1]) + '}}</span>';
      last = re.lastIndex;
    }
    return out + waFormat(esc(text.slice(last)));
  }
  var HEADER_ICON = { image: '🖼', video: '▶', document: '📄' };
  // The phone with the message in it: the template's header type + these parts (header, text, defaults, footer, buttons)
  function waHeaderHtml(c, p) {
    var head = '';
    if (c.headerType !== 'none') {
      var label = S.HEADER_TYPES.filter(function (h) { return h.id === c.headerType; })[0].label;
      // The link is never fetched (the prototype connects to nothing): an uploaded file is shown from its local data, any other
      // link as a tile with the file's name
      var url = (p.header || '').trim(), usable = url && !S.checkMediaUrl(c.headerType, url), name = usable ? S.mediaFileName(url) : '';
      var meta = usable ? S.getMedia(url) : null, data = meta && meta.kind === c.headerType ? mediaUrls[url] : null;
      if (data && c.headerType === 'image') head = '<div class="wa-media-file" title="' + esc(meta.name + ' · ' + S.fmtSize(meta.size)) + '"><img class="wa-img" src="' + esc(data) + '" alt="' + esc(meta.name) + '"></div>';
      else if (data && c.headerType === 'video') head = '<div class="wa-media-file" title="' + esc(meta.name + ' · ' + S.fmtSize(meta.size)) + '"><video class="wa-img" src="' + esc(data) + '" controls preload="metadata"></video></div>';
      else if (usable && c.headerType === 'document') head = '<div class="wa-doc"><span class="wa-media-ic" aria-hidden="true">📄</span><div><div class="wa-doc-name">' + esc((meta && meta.name) || name || 'Document') + '</div><div class="wa-sub">PDF' + (meta ? ' · ' + esc(S.fmtSize(meta.size)) : '') + '</div></div></div>';
      else if (usable) head = '<div class="wa-media wa-media-' + c.headerType + ' linked" title="' + esc(url) + '"><span class="wa-media-ic" aria-hidden="true">' + HEADER_ICON[c.headerType] + '</span><span class="wa-media-name">' + esc(name || label) + '</span></div>';
      else head = '<div class="wa-media wa-media-' + c.headerType + '"><span class="wa-media-ic" aria-hidden="true">' + HEADER_ICON[c.headerType] + '</span><span>' + esc(label) + '</span></div>';
    }
    return head;
  }
  // the phone around a chat: status bar, WhatsApp header with the sender, the chat background
  function phoneShell(chat, cls) {
    return '<div class="phone' + (cls || '') + '" aria-label="Phone showing the WhatsApp message">' +
      '<div class="phone-bar"><span>9:41</span><span class="phone-icons" aria-hidden="true">▂▄▆ ▮</span></div>' +
      '<div class="wa-head"><span aria-hidden="true">‹</span><span class="wa-avatar" aria-hidden="true">N</span><div><div class="wa-contact">Noora Health</div><div class="wa-sub">Business account</div></div></div>' +
      '<div class="wa-chat">' + chat + '</div></div>';
  }
  function phoneHtml(c, p) {
    var head = waHeaderHtml(c, p);
    var body = p.text.trim() ? '<div class="wa-text">' + waBodyHtml(p.text, p.defaults) + '</div>' : '<div class="wa-text muted">No text yet in this language</div>';
    var buttons = (p.buttons || []).map(function (b) {
      var url = b.type === 'URL';
      return '<div class="wa-btn">' + (url ? '<span aria-hidden="true">↗</span> ' : '<span aria-hidden="true">↩</span> ') + esc(b.text || (url ? 'URL button' : 'Quick reply')) + '</div>';
    }).join('');
    return phoneShell('<div class="wa-bubble" data-preview="bubble">' + head + body +
        (p.footer ? '<div class="wa-foot">' + esc(p.footer) + '</div>' : '') +
        '<div class="wa-time">9:41</div></div>' + (buttons ? '<div class="wa-btns">' + buttons + '</div>' : ''));
  }
  // While a template node is edited: a read-only phone beside the node showing the message with this node's values
  // (draft values over the template's defaults), updated as you type or pick; it exists only while the node is edited.
  function nodePreviewHtml(d) {
    var c = S.get(d.templateId);
    if (!c) return '';
    var withText = c.translations.filter(function (t) { return t.text.trim(); })[0];
    var lang = d.previewLang && S.getTr(c, d.previewLang) ? d.previewLang : (withText || c.translations[0]).lang;
    var p = S.cloneParts(S.partsOf(S.getTr(c, lang)));
    Object.keys(d.values || {}).forEach(function (k) { var v = String(d.values[k]).trim(); if (v) p.defaults[k] = v; });
    return '<aside class="node-preview" aria-label="Preview of this node\'s message (read-only)">' +
      '<div class="np-head"><span class="muted small">Preview · read-only</span><span class="np-langs">' +
      c.translations.map(function (t) {
        return '<button type="button" class="btn link np-lang' + (t.lang === lang ? ' on' : '') + '" data-action="node-preview-lang" data-lang="' + t.lang + '" aria-pressed="' + (t.lang === lang) + '" title="' + esc(S.langName(t.lang)) + '">' + esc(t.lang) + '</button>';
      }).join('') + '</span></div>' + phoneHtml(c, p) + '</aside>';
  }
  function refreshNodePreview() {                 // after a value was typed: only the preview changes, never the field being typed in
    var el = document.querySelector('.fnode.editing .node-preview');
    if (el && ui.nodeEdit) el.outerHTML = nodePreviewHtml(ui.nodeEdit.draft);
  }

  function showDialog(dialog) {
    dialogReturnFocus = document.activeElement;
    ui.dialog = dialog;
    $modal.innerHTML = dialogHtml();
    var first = $modal.querySelector('.dlg-opt:not([disabled]), .dlg-close');
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
    var d = ui.dialog, target = S.campaignName(d.targetId), r, name, msg;
    if (d.kind === 'flow') {
      name = (S.getFlow(d.flowId) || {}).name || '';
      r = kind === 'refer' ? S.referFlow(d.flowId, d.targetId) : kind === 'duplicate' ? S.duplicateFlow(d.flowId, d.targetId) : S.moveFlow(d.flowId, d.targetId);
      msg = kind === 'refer' ? 'Flow “' + name + '” is now also in ' + target
        : kind === 'duplicate' ? 'Duplicated flow “' + name + '” to ' + target + (r.flow ? ' as “' + r.flow.name + '”' : '')
        : 'Moved flow “' + name + '” to ' + target;
    } else {
      name = (S.get(d.contentId) || {}).name || '';
      r = kind === 'copy' ? S.copyToCampaign(d.contentId, d.targetId) : S.moveToCampaign(d.contentId, d.targetId);
      msg = (kind === 'copy' ? 'Copied “' : 'Moved “') + name + '” to ' + target;
    }
    closeDialog();
    if (r.ok) { render(); toast(msg); }
    else toast(r.error, true);
  }

  // ---- drag and drop ------------------------------------------------------------------
  // What can be dragged (always by its grip handle):
  //   a template, or a template that is a flow by itself -> onto a campaign: Copy / Move / Cancel dialog
  //   a flow you created                                  -> onto a campaign (same dialog)
  //   either of them                                      -> above / below another entry of the Flows list to reorder
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
    var grip = ev.target.closest && ev.target.closest('.lang-grip');       // a language panel, by its grip: reorder the view
    if (grip) {
      var gp = grip.closest('.panel.edit');
      ui.drag = { kind: 'lang', id: ui.selectedId, lang: gp.getAttribute('data-lang') };
      try { ev.dataTransfer.setDragImage(gp, 40, 20); } catch (e) { /* ignore */ }
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', ui.drag.lang); } catch (e) { /* ignore */ }
      gp.classList.add('dragging');
      return;
    }
    var handle = ev.target.closest && ev.target.closest('.drag-handle');
    if (!handle) return;                               // only a handle starts a drag
    var li = handle.closest('.content-item[data-id]');
    var el = li;
    if (!el) return;
    if (li.classList.contains('flow-item') && li.getAttribute('data-kind') === 'flow') ui.drag = { kind: 'flow', id: li.getAttribute('data-id') };
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
    if (d.kind === 'lang') {                                              // another language panel of the same content: before / after it
      var pn = ev.target.closest && ev.target.closest('.panel.edit');
      if (!pn || pn.getAttribute('data-lang') === d.lang || d.id !== ui.selectedId) return null;
      var pr = pn.getBoundingClientRect();
      return { type: 'lang', el: pn, place: ev.clientX < pr.left + pr.width / 2 ? 'before' : 'after' };
    }
    var camp = dropTarget(ev);
    if (camp && (d.kind === 'content' || d.kind === 'flow')) return { type: 'campaign', el: camp };
    var fi = ev.target.closest && ev.target.closest('.flow-item');      // anything in the Flows list can be moved among the others
    if (fi && (d.kind === 'flow' || d.kind === 'content') && !(fi.getAttribute('data-id') === d.id && fi.getAttribute('data-kind') === (d.kind === 'flow' ? 'flow' : 'template'))) return { type: 'flow', el: fi, place: placeOf(ev, fi) };
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
    var el = ev.target.closest && ev.target.closest('.camp-item, .flow-item, .panel.edit');
    if (el && !(ev.relatedTarget && el.contains(ev.relatedTarget))) el.classList.remove('drop-over', 'drop-before', 'drop-after');
  });
  document.addEventListener('drop', function (ev) {
    var spot = dropSpot(ev);
    if (!spot) return;
    ev.preventDefault();
    var drag = ui.drag;
    clearDropMarks();
    ui.drag = null;
    if (spot.type === 'lang') {               // a temporary order of the language panels: only this view, nothing is saved
      var cl = S.get(drag.id), order = S.orderLangs(cl, ui.langOrder[drag.id]).map(function (t) { return t.lang; });
      order.splice(order.indexOf(drag.lang), 1);
      var at = order.indexOf(spot.el.getAttribute('data-lang'));
      order.splice(spot.place === 'before' ? at : at + 1, 0, drag.lang);
      ui.langOrder[drag.id] = order;
      render();
      return;
    }
    if (spot.type === 'campaign') {
      if (drag.kind === 'flow') openFlowDialog(drag.id, spot.el.getAttribute('data-id'));
      else openDropDialog(drag.id, spot.el.getAttribute('data-id'));
    } else {                                   // reorder: put the flow before/after the one it was dropped on
      result(S.reorderFlowItem(drag.kind === 'flow' ? 'flow' : 'template', drag.id, spot.el.getAttribute('data-kind'), spot.el.getAttribute('data-id'), spot.place));
      render();
    }
  });
  document.addEventListener('dragend', function () { clearDropMarks(); ui.drag = null; });

  // ---- flow canvas pointer interactions: move a node by its header, draw an edge from a port --------
  function setTempEdge(canvas, p1, p2) {
    var g = document.getElementById('edge-paths'), path = document.getElementById('temp-edge');
    if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.id = 'temp-edge'; g.appendChild(path); }
    var cv = document.getElementById('canvas');
    path.setAttribute('d', edgePath(p1, p2, cv && cv.classList.contains('td') ? 'td' : 'lr'));
  }
  function clearConnectUi() {
    var t = document.getElementById('temp-edge');
    if (t) t.remove();
    var hot = document.querySelectorAll('.connect-target');
    for (var i = 0; i < hot.length; i++) hot[i].classList.remove('connect-target');
  }
  function nodeUnder(ev) {
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    return el && el.closest ? el.closest('.fnode') : null;
  }

  document.addEventListener('mousedown', function (ev) {
    if (ev.button !== 0) return;
    var canvas = document.getElementById('canvas');
    if (!canvas || !canvas.contains(ev.target)) return;
    var port = ev.target.closest('.port.out');
    if (port) {
      ev.preventDefault();
      ui.conn = { flow: canvas.getAttribute('data-flow'), node: port.getAttribute('data-node'), out: port.getAttribute('data-out') || null };
      return;
    }
    var head = ev.target.closest('.fnode-head');
    if (head && !ev.target.closest('button, input, select, textarea')) {
      ev.preventDefault();
      var el = head.parentNode;
      ui.nodeDrag = { flow: canvas.getAttribute('data-flow'), node: el.getAttribute('data-node'), el: el, sx: ev.clientX, sy: ev.clientY,
        left: parseInt(el.style.left, 10) || 0, top: parseInt(el.style.top, 10) || 0, moved: false };
    }
  });
  document.addEventListener('mousemove', function (ev) {
    var canvas = document.getElementById('canvas');
    if (!canvas) return;
    if (ui.conn) {
      var cr = canvas.getBoundingClientRect();
      var port = canvas.querySelector('.port.out[data-node="' + ui.conn.node + '"]' + (ui.conn.out ? '[data-out="' + ui.conn.out + '"]' : ''));
      if (!port) return;
      var r = port.getBoundingClientRect();
      setTempEdge(canvas, { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top }, { x: ev.clientX - cr.left, y: ev.clientY - cr.top });
      var hot = document.querySelectorAll('.connect-target');
      for (var i = 0; i < hot.length; i++) hot[i].classList.remove('connect-target');
      var over = nodeUnder(ev);
      if (over && over.getAttribute('data-node') !== ui.conn.node) over.classList.add('connect-target');
    } else if (ui.nodeDrag) {
      var d = ui.nodeDrag;
      d.x = Math.max(0, d.left + ev.clientX - d.sx); d.y = Math.max(0, d.top + ev.clientY - d.sy);
      if (Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 2) d.moved = true;
      d.el.style.left = d.x + 'px'; d.el.style.top = d.y + 'px';
      drawEdges();
    }
  });
  document.addEventListener('mouseup', function (ev) {
    if (ui.conn) {
      var c = ui.conn, over = nodeUnder(ev);
      ui.conn = null;
      clearConnectUi();
      if (over && over.getAttribute('data-node') !== c.node) {
        var r = S.connect(c.flow, c.node, c.out, over.getAttribute('data-node'));
        if (!r.ok && r.error !== 'No change') toast(r.error, true);
        render();
      }
    } else if (ui.nodeDrag) {
      var d = ui.nodeDrag;
      ui.nodeDrag = null;
      if (d.moved) {
        S.moveNode(d.flow, d.node, d.x, d.y); resizeCanvas();
        ui.justDragged = true; setTimeout(function () { ui.justDragged = false; }, 0);   // the click that follows a drag is not a click on the node
      }
    }
  });


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
    if (!ev.target.closest('.combo')) closeCombos();
    var nodeEl = ev.target.closest('.fnode');
    if (nodeEl && !ui.nodeEdit && !ui.justDragged && !ev.target.closest('button, a, input, select, textarea, .port, .combo')) {
      startNodeEdit(nodeEl.getAttribute('data-flow'), nodeEl.getAttribute('data-node'));
      return;
    }
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    var c = S.get(ui.selectedId);
    var lang = el.getAttribute('data-lang');

    switch (action) {
      case 'select':
        if (ev.target.closest && ev.target.closest('.ci-rename')) return;   // clicking inside the rename box is not selecting
        ui.selectedId = el.getAttribute('data-id'); ui.renaming = false;
        break;
      case 'dialog-copy': applyDialog('copy'); return;
      case 'dialog-refer': applyDialog('refer'); return;
      case 'dialog-duplicate': applyDialog('duplicate'); return;
      case 'dialog-move': applyDialog('move'); return;
      case 'dialog-cancel': closeDialog(); return;
      case 'dialog-backdrop': if (ev.target === el) closeDialog(); return;
      case 'open-add-campaign': openCampBox(); return;
      case 'add-campaign': addCampaign(); return;
      case 'combo-toggle': {
        var cb = el.closest('.combo');
        if (cb.classList.contains('open')) closeCombos(); else openCombo(cb);
        return;
      }
      case 'combo-pick': pickCombo(el); return;
      case 'open-flow': {              // jump from a flow node to the flow it calls
        var target = S.getFlow(el.getAttribute('data-id'));
        ui.listTab = 'flows'; ui.flowSel = { kind: 'flow', id: target.id }; ui.renaming = false;
        if (ui.campaignId && target.campaignIds.indexOf(ui.campaignId) === -1) ui.campaignId = null;   // keep it listed
        break;
      }
      case 'set-list-tab': ui.listTab = el.getAttribute('data-tab'); ui.sideBox = null; ui.renaming = false; break;
      case 'select-flow':
        ui.flowSel = { kind: el.getAttribute('data-kind'), id: el.getAttribute('data-id') };
        if (ui.flowSel.kind === 'template') { ui.selectedId = ui.flowSel.id; }
        ui.renaming = false;
        break;
      case 'open-template': {          // jump from a flow step to the template itself
        var tid = el.getAttribute('data-id'), tpl = S.get(tid);
        ui.listTab = 'templates'; ui.selectedId = tid; ui.renaming = false;
        if (ui.campaignId && tpl && tpl.campaignIds.indexOf(ui.campaignId) === -1) ui.campaignId = null;   // keep it visible
        break;
      }
      case 'add-node': {
        var fl2 = currentFlow(), kind = el.getAttribute('data-type');
        result(kind === 'logic' ? S.addLogicNode(fl2.id) : kind === 'action' ? S.addActionNode(fl2.id) : S.addInputNode(fl2.id));
        break;
      }
      case 'node-remove': result(S.removeNode(el.getAttribute('data-flow'), el.getAttribute('data-node'))); break;
      case 'flow-direction': result(S.setFlowDirection(el.closest('.flow-toolbar') ? document.getElementById('canvas').getAttribute('data-flow') : '', el.getAttribute('data-dir'))); break;
      case 'node-preview-lang': if (ui.nodeEdit) { ui.nodeEdit.draft.previewLang = el.getAttribute('data-lang'); render(); } return;
      case 'node-save': saveNodeEdit(); return;
      case 'node-cancel': cancelNodeEdit(); return;
      case 'edit-out-add': {                 // a new edge, named Condition N (the first number not used by this node's edges)
        var labels = ui.nodeEdit.draft.outs.map(function (o) { return o.label.toLowerCase(); }), k = 1;
        while (labels.indexOf('condition ' + k) !== -1) k++;
        ui.nodeEdit.draft.outs.push({ id: null, label: 'Condition ' + k });
        ui.focusNext = '.fnode.editing .out-row:last-of-type input';
        break;
      }
      case 'edit-out-remove': ui.nodeEdit.draft.outs.splice(parseInt(el.getAttribute('data-i'), 10), 1); break;
      case 'edge-remove': result(S.disconnect(el.getAttribute('data-flow'), el.getAttribute('data-node'), el.getAttribute('data-out') || null)); break;
      case 'select-campaign':
        ui.campaignId = el.getAttribute('data-id') || null; ui.renaming = false;
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
      case 'set-theme': setTheme(el.getAttribute('data-theme')); return;
      case 'toggle-history-pane': ui.historyOpen = !ui.historyOpen; if (ui.historyOpen) ui.commentsOpen = false; break;   // one right sidebar: history or comments
      case 'camps-toggle': ui.campCollapsed = !ui.campCollapsed; ui.campBox = false; ui.campError = ''; ui.focusNext = '.campaigns .camp-toggle'; break;
      case 'flow-info': ui.flowInfo = !ui.flowInfo; break;
      case 'hist-info': ui.histInfo = !ui.histInfo; updateHistoryPane(); return;
      case 'hist-tab': {
        ui.histTab = el.getAttribute('data-tab') === 'other' ? 'other' : 'content';
        updateHistoryPane();
        return;
      }
      case 'cm-add': addCommentFromUi(); return;
      case 'cm-toggle': ui.commentsOpen = !ui.commentsOpen; if (ui.commentsOpen) ui.historyOpen = false; break;
      case 'cm-show': ui.commentsOpen = true; ui.historyOpen = false; ui.commentsTab = 'open'; break;
      case 'cm-tab': ui.commentsTab = el.getAttribute('data-tab') === 'resolved' ? 'resolved' : 'open'; break;
      case 'cm-clear-quote': if (ui.cmTarget) { ui.cmTarget.quote = undefined; ui.cmTarget.start = ui.cmTarget.end = undefined; } refreshCmTarget(); return;
      case 'cm-resolve': if (!result(S.setCommentResolved(el.getAttribute('data-comment'), true), 'Comment resolved')) return; break;
      case 'cm-reopen': if (!result(S.setCommentResolved(el.getAttribute('data-comment'), false), 'Comment reopened')) return; ui.commentsTab = 'open'; break;
      case 'cm-goto': gotoComment(el.getAttribute('data-comment')); return;
      case 'cm-node': {
        var sc2 = cmScopeNow();
        if (!sc2 || sc2.kind !== 'flow') return;
        ui.cmTarget = { scope: sc2.id, nodeId: el.getAttribute('data-node') };
        ui.commentsOpen = true; ui.historyOpen = false;
        ui.focusNext = '#cm-text';
        break;
      }
      case 'tree-detail': {
        var did = el.getAttribute('data-event');
        if (ui.treeDetails[did]) delete ui.treeDetails[did]; else ui.treeDetails[did] = true;
        updateHistoryPane();
        var again = document.querySelector('.tree-details[data-event="' + did + '"]'); if (again) again.focus();
        return;
      }
      case 'rewind': {
        var evId = parseInt(el.getAttribute('data-event'), 10);
        if (c.translations.some(function (t) { return isDirty(c, t); })) { toast('Save or revert your unsaved edits first', true); return; }
        var label = eventTitle(S.eventOf(evId));
        if (!result(S.rewind(c.id, evId), 'Rewound to: ' + label)) return;
        break;
      }
      case 'rename-start': {
        var rid = el.getAttribute('data-id');
        if (rid && rid !== ui.selectedId) { ui.selectedId = rid; }   // the pencil on a list item selects it, then renames it
        ui.renaming = true; break;
      }
      case 'rename-cancel': ui.renaming = false; break;
      case 'rename-save': saveRename(); return;
      case 'save': doSave(lang); return;
      case 'revert': delete ui.drafts[draftKey(c.id, lang)]; delete ui.shown[draftKey(c.id, lang)]; break;
      case 'stage-back': case 'stage-next': {
        var rs = S.moveStage(c.id, action === 'stage-back' ? -1 : 1);
        result(rs, rs.ok ? 'Moved to ' + rs.to.label : '');
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
      case 'edit-header': { var fi = panelOf(lang) && panelOf(lang).querySelector('.file-input'); if (fi) fi.click(); return; }   // the pencil on the picture: choose a file
      case 'remove-header': result(S.setHeaderType(c.id, 'none'), 'Header removed from every language'); break;
      case 'csv-all': download('content-' + today() + '.csv', S.toCsv()); return;
      case 'csv-one': download(S.slugOf(c) + '-' + today() + '.csv', S.toCsv([c.id])); return;
      case 'reset':
        if (!window.confirm('Discard all changes and reload the sample data?')) return;
        S.reset(); mediaClear(); ui.langOrder = {}; ui.drafts = {}; ui.shown = {}; ui.campaignId = null; ui.selectedId = null; ui.renaming = false;
        break;
    }
    render();
  });

  render();
  // uploaded header files come back from IndexedDB a moment after the first paint
  mediaLoad().then(function (n) {
    if (!n) return;
    var f = document.activeElement;
    if (ui.nodeEdit || (f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))) {          // never disturb what is being typed: only the pictures
      [].forEach.call(document.querySelectorAll('.panel.edit'), function (p) { refreshSec(p.getAttribute('data-lang'), 'header'); });
    } else render();
  });
})();
