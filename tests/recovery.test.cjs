const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn) {
  for (let i = 0; i < 120; i++) { if (fn()) return; await pause(100); }
  throw Error('Recovery timeout');
}
for (const mode of ['clean', 'crash', 'exception', 'limit']) test(mode, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-pet-recovery-'));
  const logDir = path.join(dir, 'diagnostics');
  const readLog = () => { try { return fs.readFileSync(path.join(logDir, 'recovery.jsonl'), 'utf8'); } catch { return ''; } };
  if (mode === 'limit') {
    fs.mkdirSync(logDir);
    fs.writeFileSync(path.join(logDir, 'restart-history.json'), JSON.stringify(Array(5).fill(Date.now())));
  }
  const child = fork(path.join(__dirname, 'recovery-child.cjs'), [], { env: { ...process.env, RECOVERY_TEST_DIR: dir }, stdio: ['ignore','ignore','ignore','ipc'] });
  await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); });
  await waitFor(() => readLog().includes('watchdog-start'));
  child.send(mode === 'limit' ? 'crash' : mode);
  if (mode === 'clean') {
    await waitFor(() => readLog().includes('watchdog-stop'));
    assert.equal(fs.readFileSync(path.join(dir, 'runs'), 'utf8'), '1');
    assert.ok(!readLog().includes('restarted'));
  } else if (mode === 'limit') {
    await waitFor(() => readLog().includes('recovery-paused'));
    assert.equal(fs.readFileSync(path.join(dir, 'runs'), 'utf8'), '1');
  } else {
    await waitFor(() => readLog().includes('watchdog-stop'));
    assert.equal(fs.readFileSync(path.join(dir, 'runs'), 'utf8'), '2');
    assert.ok(readLog().includes('unexpected-exit'));
    assert.ok(readLog().includes('restarted'));
    if (mode === 'exception') assert.ok(readLog().includes('uncaught-exception'));
  }
  assert.ok(!readLog().includes('PRIVATE CHAT TEXT'));
  assert.ok(!readLog().includes('secret.example'));
});
