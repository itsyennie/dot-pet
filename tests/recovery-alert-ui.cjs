const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { showRecoveryPaused } = require('../src/recovery-alert');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(),'dot-pet-alert-ui-')));
app.on('window-all-closed',()=>{});
const timeout = setTimeout(()=>app.exit(1),15000);
app.whenReady().then(async()=>{
 const dir=app.getPath('userData');
 let opened=0;
 const result=showRecoveryPaused({dir,kind:'app'}, {BrowserWindow,Notification:{isSupported:()=>false},shell:{openPath:async p=>{assert.equal(p,dir);opened++;return '';}}});
 let win;
 for(let i=0;i<80;i++) { win=BrowserWindow.getAllWindows()[0]; if(win?.isVisible() && !win.webContents.isLoading())break; await new Promise(r=>setTimeout(r,100)); }
 assert.ok(win?.isVisible());
 assert.match(await win.webContents.executeJavaScript('document.body.innerText'),/자동 복구가 멈췄어요/);
 fs.mkdirSync(path.join(__dirname,'../.test-results'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'../.test-results/recovery-alert.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript('document.querySelector("a").click()');
 await result;
 assert.equal(opened,1);
 console.log('PASS visible recovery alert, text, diagnostics action and close');
 clearTimeout(timeout);app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
