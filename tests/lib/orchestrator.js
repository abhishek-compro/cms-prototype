// Bridge to the orchestrator's own code (campaign/models.py), run through tests/support/repo_validator.py.
// ORCHESTRATOR_REPO=/path/to/sms-ivr-orchestrator  (default ~/repos/sms-ivr-orchestrator)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = process.env.ORCHESTRATOR_REPO || path.join(os.homedir(), 'repos/sms-ivr-orchestrator');
const HELPER = path.resolve(__dirname, '../support/repo_validator.py');

/** Why these checks cannot run here, or false when they can (usable directly as the `skip` option of a test). */
function skipReason() {
  if (!fs.existsSync(path.join(REPO, 'campaign/models.py'))) return `orchestrator checkout not found at ${REPO} (set ORCHESTRATOR_REPO)`;
  const py = spawnSync('python3', ['--version']);
  if (py.error || py.status !== 0) return 'python3 not available';
  return false;
}

/** mode 'validate': {label: extra_content} -> {label: 'OK' | error}.  mode 'parity': [text] -> [{text, vars, map}]. */
function run(mode, data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-orchestrator-'));
  const file = path.join(dir, 'in.json');
  fs.writeFileSync(file, JSON.stringify(data));
  const r = spawnSync('python3', ['-I', HELPER, mode, file], { encoding: 'utf8', env: Object.assign({}, process.env, { ORCHESTRATOR_REPO: REPO }) });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(r.stderr || 'repo_validator.py failed');
  return JSON.parse(r.stdout);
}

module.exports = { REPO, skipReason, run };
