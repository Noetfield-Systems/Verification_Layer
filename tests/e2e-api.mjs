/** Real HTTP+PostgreSQL E2E. Two verified mailboxes, API keys, tenant isolation,
 * idempotency, free quota and concurrency. Requires a migrated TEST_DATABASE_URL. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { once } from 'node:events';

if (!process.env.DATABASE_URL?.startsWith('postgresql://')) {
  throw new Error('Refusing E2E without PostgreSQL TEST DATABASE_URL');
}
const codes = new Map();
const mock = createServer(async (req,res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const code = /sign-in code is (\d{6})/.exec(request.text || '')?.[1];
  if (req.url !== '/emails' || !request.to?.[0] || !code) {
    res.writeHead(422); return res.end('{}');
  }
  codes.set(request.to[0], code);
  res.writeHead(200, {'Content-Type':'application/json'}); res.end('{"id":"test-message"}');
});
mock.listen(0, '127.0.0.1');
await once(mock,'listening');
const mockPort=mock.address().port;
const port=3107;
const base=`http://127.0.0.1:${port}`;
const env = { ...process.env, CI:'true', PORT:String(port), HOSTNAME:'127.0.0.1',
  NODE_ENV:'production', RESEND_API_KEY:'ci-test', NOETFIELD_EMAIL_FROM:'test@example.test',
  NOETFIELD_E2E_RESEND_URL:`http://127.0.0.1:${mockPort}/emails`,
  NOETFIELD_RECEIPT_SECRET:'ci-receipt-secret-only-for-integration-tests-12345',
  NOETFIELD_VERIFIER_SECRET:'ci-verifier-secret-only-for-integration-tests-67890',
  NOETFIELD_SINA_CONTROL_TOKEN:'ci-operator-secret-only-for-integration-tests-43210',
  NOETFIELD_FREE_TIER_LIMIT:'2', NOETFIELD_FREE_TIER_WINDOW_DAYS:'30',
  NOETFIELD_PUBLIC_BASE_URL:base,
};
const proc = spawn('bun',['.next/standalone/server.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
let logs='';
proc.stdout.on('data',x=>logs+=x.toString().slice(0,4000));
proc.stderr.on('data',x=>logs+=x.toString().slice(0,4000));
async function call(path,method='GET',key,body){
 const res=await fetch(base+path,{method,headers:{ ...(key?{Authorization:`Bearer ${key}`}:{}) , ...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined});
 const text=await res.text(); let data;
 try{data=JSON.parse(text)}catch{data=text}
 return {status:res.status,data};
}
async function signup(email){
 const sent = await call('/api/signup','POST',undefined,{email,companyName:email.split('@')[0]});
 assert.equal(sent.status,202,JSON.stringify(sent.data));
 const code=codes.get(email); assert.match(code,/^\d{6}$/);
 const verified=await call('/api/signup','PUT',undefined,{email,code});
 assert.equal(verified.status,201,JSON.stringify(verified.data));
 assert.match(verified.data.api_key,/^nf_live_[a-f0-9]{48}$/);
 return verified.data;
}
const passArtifact='// SPDX-License-Identifier: MIT\n// Copyright (c) Noetfield\nexport function hello(){return "ok"}\n';
try{
 let ready=false;
 for(let i=0;i<100;i++){
   if(proc.exitCode!==null) throw new Error('App crashed: '+logs.slice(-3000));
   try{const r=await call('/api/health'); if(r.status===200){ready=true;break}}catch{}
   await sleep(300);
 }
 if(!ready) throw new Error('App health timeout '+logs.slice(-3000));
 assert.equal((await call('/api/dashboard','POST',undefined,{action:'stats'})).status,401);
 assert.equal((await call('/api/sina/state')).status,401);
 const salt = Date.now()+ '-' + Math.random().toString(36).slice(2);
 const a=await signup('tenant-a-'+salt+'@example.test');
 const b=await signup('tenant-b-'+salt+'@example.test');
 assert.notEqual(a.project_id,b.project_id);
 const a0=await call('/api/dashboard','POST',a.api_key,{action:'stats'});
 assert.equal(a0.status,200); assert.equal(a0.data.total,0); assert.equal(a0.data.scoped_to_project_id,a.project_id);
 const forged=await call('/api/dashboard','POST',a.api_key,{action:'stats',projectId:b.project_id});
 assert.equal(forged.status,403);
 const payload=(artifact,keyData)=>({artifact,artifact_type:'code',metadata:{source:'cursor',project_id:keyData.project_id}});
 const pass=await call('/api/v1/verify','POST',a.api_key,payload(passArtifact,a));
 assert.equal(pass.status,201,JSON.stringify(pass.data)); assert.equal(pass.data.verdict,'pass');
 const replay=await call('/api/v1/verify','POST',a.api_key,payload(passArtifact,a));
 assert.equal(replay.status,200); assert.equal(replay.data.idempotent,true); assert.equal(replay.data.verdict_hash,pass.data.verdict_hash);
 const fail=await call('/api/v1/verify','POST',a.api_key,payload('const key="AKIAIOSFODNN7EXAMPLE";',a));
 assert.equal(fail.status,201); assert.equal(fail.data.verdict,'fail');
 const denyQuota=await call('/api/v1/verify','POST',a.api_key,payload(passArtifact+'\nconst v=1;',a));
 assert.equal(denyQuota.status,402,'third unique verification must fail quota');
 assert.equal((await call(`/api/v1/receipt/${pass.data.verdict_hash}`,'GET',b.api_key)).status,404);
 assert.equal((await call(`/api/v1/receipt/${pass.data.verdict_hash}`,'GET',a.api_key)).status,200);
 const bpass=await call('/api/v1/verify','POST',b.api_key,payload(passArtifact,b));
 assert.equal(bpass.status,201); assert.notEqual(bpass.data.verdict_hash,pass.data.verdict_hash);
 const aStats=await call('/api/dashboard','POST',a.api_key,{action:'stats'});
 const bStats=await call('/api/dashboard','POST',b.api_key,{action:'stats'});
 assert.equal(aStats.data.total,2); assert.equal(bStats.data.total,1);
 const keysCross=await call('/api/keys','POST',a.api_key,{action:'list'});
 assert.equal(keysCross.status,200); assert.equal(keysCross.data.keys.length,1);
 const selfRevoke=await call('/api/keys','POST',a.api_key,{action:'revoke',id:a.key_id});
 assert.equal(selfRevoke.status,409);
 // Parallel distinct submissions: one remaining B slot; at most one accepted.
 const batch=await Promise.all(Array.from({length:6},(_,i)=>call('/api/v1/verify','POST',b.api_key,payload(passArtifact+`\n// unique ${i}`,b))));
 assert.equal(batch.filter(x=>x.status===201).length,1,'quota must be enforced under concurrent requests');
 assert.equal(batch.filter(x=>x.status===402).length,5);
 assert.equal((await call('/api/dashboard','POST',b.api_key,{action:'stats'})).data.total,2);
 console.log('E2E PASS: email OTP, 2 tenants, dashboard, scopes, 8-gate PASS/FAIL, stable replay, receipt ownership, quota, concurrent quota, protected Sina');
}catch(e){console.error('E2E FAIL',e,'\nserver:',logs.slice(-5000));process.exitCode=1}
finally{proc.kill('SIGTERM');mock.close()}
