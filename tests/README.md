# Tests

No dependencies and nothing to install. The prototype itself has no build step; these tests drive it as it is.

```
npm run test:unit                                  # data layer + parity: about a second, no browser
npm run test:ui                                    # real browser: a few minutes
npm test                                           # everything (the slowest)
node --test tests/ui/drag-drop.test.js             # one file
node --test --test-name-pattern="drag" tests/ui/   # only tests whose name matches
```

The same without npm: `node --test tests/unit/`, `node --test --test-concurrency=1 tests/ui/`, `node --test --test-concurrency=1 tests/`.

**The full run takes several minutes.** While developing, run the unit suite plus only the UI file for the area you changed; run everything when you have decided it is worth the wait.

Needs: **Node 22+**. The browser suites also need **Chromium or Chrome** (found automatically; or set
`CHROMIUM=/path/to/chrome`). The parity tests also need **python3** and a checkout of the orchestrator
(`ORCHESTRATOR_REPO=/path/to/sms-ivr-orchestrator`, default `~/repos/sms-ivr-orchestrator`). Anything that cannot
run here is reported as **skipped** with the reason, never as a pass.

## What is where

| File | What it checks |
|---|---|
| `unit/store.test.js` | The rules in `prototype/store.js`: names, campaigns, copy/move (`planDrop`), block approval, publishing, placeholders and renaming, validation limits, saving parts, status, `extra_content` export, CSV, history, migration of older saved data. |
| `unit/orchestrator-parity.test.js` | Runs the **orchestrator's own code** (`campaign/models.py`, loaded via `support/repo_validator.py`): every `extra_content` the prototype exports must pass its real `validate_extra_content`, and placeholder positions must match its `get_body_params_map` (one known difference is pinned and documented). |
| `ui/sidebar-tools.test.js` | Left bar: search and + icons, text boxes that close on blur, filter chip. |
| `ui/campaigns.test.js`, `ui/add-campaign.test.js` | Campaigns sidebar: filtering, creating content inside a campaign, adding campaigns, old saved data. |
| `ui/drag-drop.test.js` | Real mouse drags: the grip handle, the Copy / Move / Cancel dialog, "Can't move". |
| `ui/template-parts.test.js` | Body-only editor, the + Add dropdown, placeholders (live, rename, merge), buttons (3 quick replies + 1 URL), header, footer, status, publishing, JSON export. |
| `ui/core.test.js` | Themes, language rows, side by side, history sidebar, block/publish, CSV/JSON downloads, rename, reset. |

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
