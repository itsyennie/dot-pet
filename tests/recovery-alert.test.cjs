const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { showRecoveryPaused } = require('../src/recovery-alert');
for (const mode of ['supported', 'unsupported', 'failed']) test(mode, async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-pet-alert-'));
 fs.writeFileSync(path.join(dir, 'recovery-alert-pending'), 'app');
 let shown = 0, dialogs = 0, opened = 0, closed = 0;
 class Notification extends EventEmitter {
  static isSupported() { return mode !== 'unsupported'; }
  show() { shown++; this.emit(mode === 'failed' ? 'failed' : 'show'); }
  close() { closed++; }
 }
 let acknowledge;
 const api = { Notification, BrowserWindow: class { isDestroyed(){return false;} destroy(){} }, dialog: { showMessageBox: async (owner, options) => {
   dialogs++; assert.match(options.title, /자동 복구/);
   return new Promise(resolve => { acknowledge = resolve; });
 } }, shell: { openPath: async value => { assert.equal(value, dir); opened++; return ''; } } };
 const first = showRecoveryPaused({dir,kind:'app'},api, options => api.dialog.showMessageBox(null, options));
 const second = showRecoveryPaused({dir,kind:'app'},api);
 assert.equal(first,second);
 acknowledge({response:0}); await first;
 assert.equal(dialogs,1); assert.equal(opened,1);
 assert.equal(shown,mode==='unsupported'?0:1); assert.equal(closed,shown);
 assert.equal(fs.existsSync(path.join(dir,'recovery-alert-pending')),false);
});
