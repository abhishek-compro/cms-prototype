# Tests

No dependencies and nothing to install. The prototype itself has no build step; these tests drive it as it is.

```
npm run test:unit                                  # data layer + parity: about a second, no browser
npm run test:ui                                    # real browser, suites in parallel: about 20 s
npm test                                           # unit + ui (parallel); the Flows suite is not included
npm run test:serial                                # the same, one file at a time (for a flaky check)
npm run test:flows                                 # the Flows UI suite (tests/flows/), run on its own
npm run test:watch                                 # unit tests re-run on every save
node --test tests/ui/drag-drop.test.js             # one file
node --test --test-name-pattern="drag" tests/ui/   # only tests whose name matches
```

The same without npm: `node --test tests/unit/`, `node --test --test-concurrency=4 tests/ui/`, `node --test tests/flows/`.

Speed: each UI file starts its own Chromium on a free port, so files run in parallel (`--test-concurrency=4`). The driver (`tests/lib/cdp.js`) waits for the page to load and for each click / key / drag to settle (two animation frames and a timer) instead of sleeping fixed times; use `b.settle()` or wait for a condition, never a fixed `sleep`, after an action.

**The full run takes several minutes.** While developing, run the unit suite plus only the UI file for the area you changed; run everything when you have decided it is worth the wait.

Needs: **Node 22+**. The browser suites also need **Chromium or Chrome** (found automatically; or set
`CHROMIUM=/path/to/chrome`). The parity tests also need **python3** and a checkout of the orchestrator
(`ORCHESTRATOR_REPO=/path/to/sms-ivr-orchestrator`, default `~/repos/sms-ivr-orchestrator`). Anything that cannot
run here is reported as **skipped** with the reason, never as a pass.

## What is where

| File | What it checks |
|---|---|
| `unit/store.test.js` | The rules in `prototype/store.js`: names, campaigns, copy/move (`planDrop`), block approval, publishing, placeholders and renaming, validation limits, saving parts, status, `extra_content` export, CSV, history, migration of older saved data. |
| `unit/flows.test.js` | Flows: what the Flows tab lists (single-template flows), the node graph (template / logic / action / input / flow nodes, edges, loops), atomic logic-edge saves, flow calls, reordering, refer / duplicate / move of a flow with its templates, history, older saved data. |
| `unit/orchestrator-parity.test.js` | Runs the **orchestrator's own code** (`campaign/models.py`, loaded via `support/repo_validator.py`): every `extra_content` the prototype exports must pass its real `validate_extra_content`, and placeholder positions must match its `get_body_params_map` (one known difference is pinned and documented). |
| `ui/sidebar-tools.test.js` | Left bar: search and + icons, text boxes that close on blur, filter chip. |
| `ui/campaigns.test.js`, `ui/add-campaign.test.js` | Campaigns sidebar: filtering, creating content inside a campaign, adding campaigns, old saved data. |
| `ui/drag-drop.test.js` | Real mouse drags: the grip handle, the Copy / Move / Cancel dialog, "Can't move". |
| `ui/language-consistency.test.js` | Mismatches between a template's languages: button count / type, header, footer (errors that block publishing while saving works) and placeholder names (warning only), live in the editor. |
| `ui/comments.test.js` | Comments: the Comments button and right sidebar (composer, message pills), selecting text in body / footer / button picks up a quote, header and other-language parts, Open | Resolved with Open | Resolved, Resolve / Reopen, badges, Go to, text that changed, flow nodes (💬 on a node), the node-edit lock, not in the history. (Unit tests in `store.test.js`.) |
| `ui/rewind.test.js` | The history sidebar's two tabs: Content (the tree of content steps) and Other (the linear list of the rest): one line per step (what, who, when), Details panels, git-like lanes, current marker, Rewind as a new step, branches, disabled while unsaved, kept after reload. (Unit tests in `store.test.js`: snapshots, rewind rules, `historyTree` lanes, migration.) |
| `ui/header-media.test.js` | Uploading the header file: image / video / PDF previewed in the editor, the phone and the reference panel; WhatsApp type and size limits, replace / remove, kept after reload, wrong kind for the header type. (Unit tests cover the rules in `store.test.js`.) |
| `ui/preview.test.js` | The phone editor: no Preview button or dialog; the editing panel is the phone (header, body, footer, time, buttons under the bubble, typed in place); placeholders, button payloads / URLs and the media id below the phone; the body grows; the read-only reference phone with defaults filled; light / dark. |
| `ui/template-parts.test.js` | Body-only editor, the + Add dropdown, placeholders (live, rename, merge), buttons (3 quick replies + 1 URL), header, footer, status, publishing, CSV export. |
| `flows/flows.test.js` | Flows tab: the list with the single-template indicator, creating a flow, the canvas (read-only nodes, click to edit with ✓ / ✕ and the edit lock, searchable pickers, flow-call nodes, edge and node hover, connecting and moving by real pointer drags, per-flow placeholder values, the left-to-right / top-down toggle), reordering flows, refer / duplicate / move of a flow, single-template flows dragged like templates. |
| `ui/core.test.js` | Themes, language rows, side by side, history sidebar, block/publish, CSV downloads, rename, reset. |

## How the browser tests work

`lib/cdp.js` starts headless Chromium and speaks the DevTools protocol directly: real mouse clicks, key presses,
text insertion and drags (not synthetic DOM events), so focus, blur and click-vs-mousedown ordering behave as for
a user. `lib/harness.js` runs one suite per browser session and reports every `ok(name, condition)` as its own
sub-test, and fails the suite on any console error. Each run uses a throw-away browser profile.

## Writing a test

```js
const { uiSuite } = require('../lib/harness');
uiSuite('what this suite covers', async ({ b, ok }) => {
  await b.click('[data-action=open-add]');          // real click
  await b.type('Polio drops');                      // real typing
  ok('the box opens, focused', await b.ev(`document.activeElement.id`) === 'new-name');
});
```

`b.ev(js)` evaluates in the page, `b.fill(selector, text)` replaces a field's text, `b.drag(from, to)` does a real
drag, `b.fresh()` resets to the sample data. When a check should look at a screenshot, `b.shot('/tmp/x.png')`.
For data rules prefer a unit test: `loadStore()` gives a fresh store backed by an in-memory `localStorage`.
