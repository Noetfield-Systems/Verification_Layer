// Real QA finding ingestion. An open Issue is the durable checkpoint, not a green badge.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const repo=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN
if(!repo||!token)throw Error('Missing GitHub identity')
const base=process.env.QA_BASE_URL||'https://verification-layer-api-production.up.railway.app'
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'))
const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}
async function api(path,method='GET',payload){
  const r=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{...headers,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined})
  const j=r.status===204?{}:await r.json().catch(()=>({}))
  if(!r.ok)throw Error(method+' '+path+': '+r.status+' '+JSON.stringify(j).slice(0,200))
  return j
}
async function probe(path,opts,expect){
  try {
    const r=await fetch(base+path,{...opts,signal:AbortSignal.timeout(15000)})
    if(r.status!==expect)return path+': HTTP '+r.status+' not '+expect
    if(path==='/api/health'){
      const j=await r.json()
      if(j.status!=='ok'||j.database!=='connected')return '/api/health: database not ready'
    }
    return ''
  }catch(e){return path+': '+String(e.message).slice(0,100)}
}
let title='',target='',evidence=''
if(process.env.GITHUB_EVENT_NAME==='workflow_run'){
  const run=event.workflow_run
  if(run.conclusion!=='failure'||run.head_branch!=='main')process.exit(0)
  title='[SINA-QA] CI regression '+run.head_sha.slice(0,12)
  evidence='CI: '+run.html_url+'; commit '+run.head_sha
  try{
    const logs=execFileSync('gh',['run','view',String(run.id),'--log-failed','-R',repo],{encoding:'utf8',timeout:35000,maxBuffer:1500000})
    target=(logs.match(/src\/components\/dashboard\/(?:relative-time|empty-state|verdict-badge|copyable-hash)\.tsx/)||[])[0]||''
    evidence+='\n'+logs.slice(-2500).replace(/sk-[a-zA-Z0-9_-]{10,}/g,'[redacted]')
  }catch{evidence+='\nNo diagnostic log available'}
}else{
  const outcomes=await Promise.all([
    probe('/api/health',undefined,200),probe('/',undefined,200),
    probe('/api/v1/verify',{method:'POST',headers:{'content-type':'application/json'},body:'{"artifact":"x"}'},401),
    probe('/api/signup',{method:'POST',headers:{'content-type':'application/json'},body:'{"email":"invalid"}'},400)
  ])
  const failed=outcomes.filter(Boolean)
  if(!failed.length){console.log('LIVE QA PASS; no issue');process.exit(0)}
  title='[SINA-QA] Live API regression'
  evidence=failed.join('\n')+'; base='+base
}
const issues=await api('/issues?state=open&per_page=100')
let issue=issues.find(i=>i.title===title&&!i.pull_request)
if(!issue){
  issue=await api('/issues','POST',{title,body:[
    'Automated finding. Do not close without fix SHA, independent CI and deployed live recheck.',
    'Target file: '+(target||'UNDETERMINED — no automatic code changes'),
    'Acceptance: CI PASS, exact deployed commit SHA matches, health/home/auth/invalid signup recheck PASS.',
    'Evidence:\n'+evidence.slice(0,3800)
  ].join('\n\n')})
  console.log('Issue opened:',issue.html_url)
}else{
  await api('/issues/'+issue.number+'/comments','POST',{body:'Reproduced '+new Date().toISOString()+'\n'+evidence.slice(0,700)})
}
try {
  await api('/actions/workflows/sina-qa-repair.yml/dispatches','POST',{ref:'main',inputs:{issue_number:String(issue.number)}})
  console.log('Real repair workflow dispatched: #'+issue.number)
}catch(e){
  await api('/issues/'+issue.number+'/comments','POST',{body:'BLOCKED: repair dispatch failed: '+String(e.message).slice(0,300)})
  throw e
}
