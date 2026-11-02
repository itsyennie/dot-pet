const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const app = new EventEmitter();
app.getPath = () => process.env.RECOVERY_TEST_DIR;
app.getVersion = () => 'test';
app.getAppPath = () => __filename;
app.exit = code => process.exit(code);
const { installRecovery } = require('../src/recovery');
const recovery = installRecovery(app);
const runFile = path.join(app.getPath(), 'runs');
const run = fs.existsSync(runFile) ? Number(fs.readFileSync(runFile, 'utf8')) + 1 : 1;
fs.writeFileSync(runFile, String(run));
if (run > 1) {
  setTimeout(() => { app.emit('before-quit'); process.exit(0); }, 500);
} else {
  process.on('message', mode => {
    if (mode === 'clean') { app.emit('before-quit'); process.exit(0); }
    if (mode === 'crash') process.exit(9);
    if (mode === 'exception') throw new TypeError('PRIVATE CHAT TEXT https://secret.example/');
  });
  process.send?.({ ready: true, dir: recovery.dir });
}
setTimeout(() => { app.emit('before-quit'); process.exit(0); }, 20000);
