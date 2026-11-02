const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
test('restart button launches a fresh Electron process and resets the recovery budget',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dot-pet-relaunch-'));
 const child=spawn(require('electron'),[path.join(__dirname,'recovery-relaunch.cjs'),'--recovery-alert'],{env:{...process.env,RECOVERY_RELAUNCH_DIR:dir},stdio:'ignore'});
 const file=path.join(dir,'relaunch-ok');
 try {
  for(let i=0;i<120&&!fs.existsSync(file);i++)await new Promise(r=>setTimeout(r,100));
  assert.ok(fs.existsSync(file),'fresh process reached normal restart mode');
  const result=JSON.parse(fs.readFileSync(file));
  assert.notEqual(result.pid,child.pid);
  assert.ok(!result.args.includes('--recovery-alert'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'restart-history.json'))),[]);
  assert.ok(!fs.existsSync(path.join(dir,'recovery-alert-pending')));
 } finally {child.kill();}
});
