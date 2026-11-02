const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'dot-pet-update-ui-')));
app.on('window-all-closed',()=>{});
const timeout=setTimeout(()=>app.exit(1),15000);
app.whenReady().then(async()=>{
 const url='https://github.com/itsyennie/dot-pet/releases/tag/v0.7.0';let opened='';
 await require('../src/update-window').showUpdate({status:'available',current:'0.6.9',release:{version:'0.7.0',preview:true,url}},false,{BrowserWindow,Notification:{isSupported:()=>false},shell:{openExternal:async value=>{opened=value;}}});
 const win=BrowserWindow.getAllWindows()[0];assert.ok(win.isVisible());
 assert.match(await win.webContents.executeJavaScript('document.body.innerText'),/0.6.9 → 새 버전 0.7.0/);
 fs.mkdirSync(path.join(__dirname,'../.test-results'),{recursive:true});
 await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(path.join(__dirname,'../.test-results/update.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript('document.querySelector("a").click()');
 await new Promise(r=>setTimeout(r,100));assert.equal(opened,url);assert.ok(win.isDestroyed());
 console.log('PASS update window and download link');clearTimeout(timeout);app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
