// Trusted main-branch verifier. Never executes code or prompts from an untrusted PR.
import {readFileSync} from 'node:fs'
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'))
const run=event.workflow_run
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN
if(!repo||!token||!run)throw Error('Verifier identity missing')
const m=run.head_branch.match(/^sina\/repair-issue-(\d+)-run-(\d+)$/)
if(!m)process.exit(0)
const issue=Number(m[1]),sha=run.head_sha
const base='https://api.github.com/repos/'+repo
const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}
async function api(path,method='GET',body){
 const r=await fetch(base+path,{method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)})
 const d=r.status===204?{}:await r.json().catch(()=>({}))
 if(!r.ok)throw Error('GitHub '+path+' '+r.status+' '+JSON.stringify(d).slice(0,180))
 return d
}
async function say(s){await api('/issues/'+issue+'/comments','POST',{body:s.slice(0,3500)})}
const prs=await api('/pulls?state=open&per_page=100')
const pr=prs.find(p=>p.head.ref===run.head_branch&&p.title.startsWith('[SINA-QA #'+issue+']'))
if(!pr){console.log('No matching open PR for completed verification');process.exit(0)}
if(run.conclusion!=='success'){
 await say('CI REJECTED: '+run.html_url+'; candidate '+sha+'. Issue remains open; no deploy or close.')
 throw Error('Independent CI failed')
}
if(pr.head.sha!==sha)throw Error('Stale verification SHA; no merge')
const files=await api('/pulls/'+pr.number+'/files?per_page=100')
const allowed=/^src\/components\/dashboard\/(?:relative-time|empty-state|verdict-badge|copyable-hash)\.tsx$/
if(files.length!==1||files[0].status!=='modified'||!allowed.test(files[0].filename)||files[0].changes>150){
 await say('SCOPE REJECTED: candidate '+sha+' exceeds approved low-risk UI allowlist. No deploy.')
 throw Error('Unapproved mutation scope')
}
if(process.env.SINA_QA_AUTO_PROMOTE_UI!=='true'){
 await say('CI PASSED: '+run.html_url+'; SHA '+sha+'. RELEASE_HOLD: SINA_QA_AUTO_PROMOTE_UI is not true. Production untouched, issue OPEN.')
 console.log('Release permit HOLD. Candidate verified but not promoted.')
 process.exit(0)
}
const merged=await api('/pulls/'+pr.number+'/merge','PUT',{commit_title:'sina: approved bounded QA repair #'+issue,sha,merge_method:'squash'})
if(!merged.merged||!merged.sha)throw Error('GitHub did not confirm merge')
const mergeSha=merged.sha
await say('MERGED by bounded release policy; merge SHA '+mergeSha+'. Awaiting independent deployed-revision recheck; do NOT close prematurely.')
const url=process.env.QA_BASE_URL
async function smoke(){
 const h=await fetch(url+'/api/health',{signal:AbortSignal.timeout(15000)})
 if(h.status!==200)return {ok:false,reason:'health '+h.status}
 const json=await h.json()
 if(json.status!=='ok'||json.database!=='connected')return {ok:false,reason:'DB health failure'}
 if(json.revision!==mergeSha)return {ok:false,reason:'deployed SHA mismatch '+String(json.revision||'none').slice(0,12)}
 const home=await fetch(url+'/',{signal:AbortSignal.timeout(15000)})
 if(home.status!==200)return {ok:false,reason:'home '+home.status}
 const anon=await fetch(url+'/api/v1/verify',{method:'POST',headers:{'content-type':'application/json'},body:'{"artifact":"x"}',signal:AbortSignal.timeout(15000)})
 if(anon.status!==401)return {ok:false,reason:'verify auth '+anon.status}
 const invalid=await fetch(url+'/api/signup',{method:'POST',headers:{'content-type':'application/json'},body:'{"email":"invalid"}',signal:AbortSignal.timeout(15000)})
 if(invalid.status!==400)return {ok:false,reason:'signup validation '+invalid.status}
 return {ok:true,reason:'revision, database, home, auth and signup'}
}
let result={ok:false,reason:'not started'}
for(let i=0;i<45;i++){
 try{result=await smoke()}catch(e){result={ok:false,reason:String(e.message).slice(0,100)}}
 if(result.ok)break
 await new Promise(r=>setTimeout(r,12000))
}
if(!result.ok){
 await say('RECHECK FAILED / ISSUE OPEN: exact deployed revision '+mergeSha+' not independently verified. Last observation: '+result.reason+'. Fix must remain tracked.')
 throw Error('Post-deploy recheck failed')
}
await say('QA CLOSED WITH EVIDENCE: issue #'+issue+'; model patch PR '+pr.html_url+'; CI '+run.html_url+'; merge SHA '+mergeSha+'; deployed revision MATCH; live recheck PASS ('+result.reason+').')
await api('/issues/'+issue,'PATCH',{state:'closed',state_reason:'completed'})
console.log('CLOSED issue #'+issue+' after exact deployed SHA and live gates passed')
