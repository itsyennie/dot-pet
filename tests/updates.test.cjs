const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compare,selectRelease,createUpdater}=require('../src/updates');
const release=(v,extra={})=>({tag_name:'v'+v,published_at:'2026-11-02',prerelease:true,draft:false,assets:[{name:`Dot-Pet-Setup-${v}.exe`,state:'uploaded'}],...extra});
test('numeric versions, preview releases, drafts and missing installers',()=>{
 assert.equal(compare('0.6.10','v0.6.9'),1);
 assert.equal(selectRelease([release('9.0.0',{draft:true}),release('8.0.0',{assets:[]}),release('0.6.10'),release('0.6.9')],'0.6.8').version,'0.6.10');
 assert.equal(selectRelease([release('0.6.8')],'0.6.8'),null);
 assert.equal(selectRelease([release('1.2.3',{html_url:'https://evil.example'})],'0.6.8').url,'https://github.com/itsyennie/dot-pet/releases/tag/v1.2.3');
});
test('persistent notification deduplication, manual checks, newer versions and failures',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dot-pet-updates-'));
 let time=2000000, calls=0, notes=[], remote='0.6.10', fail=false;
 const options={current:'0.6.8',dir,now:()=>time,notify:async(value,manual)=>notes.push({value,manual}),fetcher:async(url,opts)=>{
  calls++;assert.equal(url,'https://api.github.com/repos/itsyennie/dot-pet/releases?per_page=100');assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');assert.ok(opts.signal);assert.ok(!opts.headers.Authorization);
  if(fail)throw Error('offline');return {ok:true,json:async()=>[release(remote)]};
 }};
 let u=createUpdater(options);
 await u.check();await u.check();assert.equal(calls,1);assert.equal(notes.length,1);
 time+=1000000;u=createUpdater(options);await u.check();assert.equal(notes.length,1);
 time+=61000;await u.check(true);assert.equal(notes.length,2);assert.equal(notes[1].manual,true);
 time+=1000000;remote='0.6.11';await u.check();assert.equal(notes.length,3);
 time+=1000000;fail=true;await u.check();assert.equal(notes.length,3);
 time+=61000;await u.check(true);assert.equal(notes.at(-1).value.status,'error');
 u.stop();time+=1000000;const before=calls;await u.check();assert.equal(calls,before);
});
test('concurrent background checks share a request; stopped requests never notify',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dot-pet-updates-'));
 let finish,calls=0,notes=0;
 const u=createUpdater({current:'0.6.8',dir,notify:async()=>notes++,fetcher:()=>{calls++;return new Promise(r=>finish=r);}});
 const one=u.check(),two=u.check();u.stop();finish({ok:true,json:async()=>[release('0.6.9')]});await Promise.all([one,two]);
 assert.equal(calls,1);assert.equal(notes,0);
});
