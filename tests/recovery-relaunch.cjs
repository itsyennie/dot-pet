const {app} = require('electron');
const fs=require('node:fs');
const path=require('node:path');
const dir=process.env.RECOVERY_RELAUNCH_DIR;
app.setPath('userData',dir);
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 if(process.argv.includes('--recovery-restart')) {
  fs.writeFileSync(path.join(dir,'relaunch-ok'),JSON.stringify({pid:process.pid,args:process.argv.slice(1)}));
  app.quit();return;
 }
 fs.writeFileSync(path.join(dir,'restart-history.json'),'[1,2,3,4,5]');
 fs.writeFileSync(path.join(dir,'recovery-alert-pending'),'app');
 await require('../src/recovery-alert').showRecoveryPaused({dir,kind:'app'}, {
  Notification:{isSupported:()=>false},shell:{},
  app:{isPackaged:false,getAppPath:()=>__filename,relaunch:o=>app.relaunch(o),quit:()=>app.quit()}
 },async()=>({response:2}));
});
setTimeout(()=>app.exit(1),10000).unref();
