/** Independent commercial work-product draft checks (not delivery acceptance).
 * Only the existing verified artifact from Company OS is admissible.
 * The verifier reads the origin under a dedicated scoped token and recomputes
 * the digest rather than trusting an upstream "verified" claim.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const COMPANY_OS_ORIGIN='https://business-os-core-production.up.railway.app'
export const PLATFORM_CALLBACK='https://platform.noetfield.com/api/corporate-crm/workpackets/verifier-result'
export const PUBLIC_VERIFIER_ORIGIN='https://verify.noetfield.com'
const SOURCE=/^INT-[A-Z0-9]{12}$/
const EXTERNAL=/^cwp_[0-9a-f]{32}$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PAYMENT=/^evt_[A-Za-z0-9]{8,100}$/

export type DraftRequest = {
 platform_workpacket_id:string
 external_workpacket_id:string
 source_intake_id:string
 payment_event_id:string
 engine:'COMPANY_OS'
}
type JsonRecord=Record<string,unknown>

function record(x:unknown):x is JsonRecord {
 return Boolean(x&&typeof x==='object'&&!Array.isArray(x))
}

export function constantTimeEqual(actual:string,expected:string):boolean {
 if(!actual||expected.length<32)return false
 const a=Buffer.from(actual);const b=Buffer.from(expected)
 return a.length===b.length&&timingSafeEqual(a,b)
}

export function validateDraftRequest(data:unknown):DraftRequest {
 if(!record(data)||Object.keys(data).length!==5)throw Error('STRICT_COMMERICAL_VERIFY_CONTRACT_REQUIRED')
 const x=data as JsonRecord
 if(typeof x.platform_workpacket_id!=='string'||!UUID.test(x.platform_workpacket_id)||
    typeof x.external_workpacket_id!=='string'||!EXTERNAL.test(x.external_workpacket_id)||
    typeof x.source_intake_id!=='string'||!SOURCE.test(x.source_intake_id)||
    typeof x.payment_event_id!=='string'||!PAYMENT.test(x.payment_event_id)||
    x.engine!=='COMPANY_OS')throw Error('SOURCED_PAID_COMPANY_OS_IDS_REQUIRED')
 return x as DraftRequest
}

export function canonicalJson(x:unknown):string {
 if(x===null||typeof x!=='object')return JSON.stringify(x)
 if(Array.isArray(x))return '['+x.map(canonicalJson).join(',')+']'
 return '{'+Object.keys(x as JsonRecord).sort()
   .map(k=>JSON.stringify(k)+':'+canonicalJson((x as JsonRecord)[k])).join(',')+'}'
}

export function sha256(input:string):string {
 return createHash('sha256').update(input,'utf8').digest('hex')
}

export type VerifiedRunTrace={
 status:'RUNS_CONFIRMED'
 source:'CANONICAL_COMPANY_OS_COMPLETED_RUNS'
 run_ids:string[]
 input_tokens:number
 output_tokens:number
 cost_accounting_state:'PROVIDER_BILLING_NOT_AVAILABLE'
 provider_cost_minor:null
 currency:null
}

export function traceEvidenceValid(artifact:JsonRecord):VerifiedRunTrace|undefined {
 const trace=artifact.execution_trace
 // Historical paid drafts may predate trace capture; never claim a trace
 // for them, but preserve compatibility with their original signed proofs.
 if(trace===undefined)return undefined
 if(!record(trace)||trace.source!=='CANONICAL_COMPANY_OS_COMPLETED_RUNS'||
    !Array.isArray(trace.runs)||trace.runs.length!==2||
    trace.provider_cost_minor!==null||trace.currency!==null||
    trace.cost_accounting_state!=='PROVIDER_BILLING_NOT_AVAILABLE')
   throw Error('UNTRUSTED_EXECUTION_TRACE_OR_BILLING_CLAIM')
 const agents=artifact.agent_results
 if(!Array.isArray(agents)||agents.length!==2)throw Error('TRACE_REQUIRES_TWO_AGENTS')
 let input=0,output=0
 const ids:string[]=[]
 const roles=new Set<string>()
 for(const run of trace.runs) {
  if(!record(run)||typeof run.run_id!=='string'||run.run_id.length<12||
     typeof run.task_id!=='string'||run.task_id.length<12||
     !['engineering_operator','risk_governance'].includes(String(run.role||''))||
     run.provider!=='openai-compatible'||run.status!=='completed'||
     typeof run.model!=='string'||run.model.length<2||
     typeof run.started_at!=='string'||!run.started_at||
     typeof run.finished_at!=='string'||!run.finished_at||
     !Number.isSafeInteger(run.input_tokens)||Number(run.input_tokens)<0||
     !Number.isSafeInteger(run.output_tokens)||Number(run.output_tokens)<0)
    throw Error('INVALID_CANONICAL_RUN_TRACE')
  if(ids.includes(run.run_id)||roles.has(String(run.role)))
    throw Error('DUPLICATE_MODEL_RUN_OR_ROLE')
  const linked=agents.find(x=>record(x)&&x.task_id===run.task_id&&x.role===run.role)
  if(!record(linked)||linked.run_id!==run.run_id||linked.model!==run.model||
     linked.provider!==run.provider||linked.input_tokens!==run.input_tokens||
     linked.output_tokens!==run.output_tokens)
    throw Error('MODEL_RUN_NOT_BOUND_TO_AGENT_ARTIFACT')
  ids.push(run.run_id)
  roles.add(String(run.role))
  input+=Number(run.input_tokens)
  output+=Number(run.output_tokens)
 }
 if(input!==trace.total_input_tokens||output!==trace.total_output_tokens||
    roles.size!==2||!roles.has('engineering_operator')||!roles.has('risk_governance'))
   throw Error('RUN_TRACE_TOKEN_TOTAL_MISMATCH')
 return {status:'RUNS_CONFIRMED',source:'CANONICAL_COMPANY_OS_COMPLETED_RUNS',
   run_ids:ids,input_tokens:input,output_tokens:output,
   cost_accounting_state:'PROVIDER_BILLING_NOT_AVAILABLE',
   provider_cost_minor:null,currency:null}
}

export function sourceEvidenceValid(data:unknown,wanted:DraftRequest){
 if(!record(data)||data.schema!=='noetfield.company-os-artifact-verification-input.v1'||
   data.workpacket_id!==wanted.external_workpacket_id||data.source_intake_id!==wanted.source_intake_id||
   data.engine!=='COMPANY_OS'||data.payment_event_id!==wanted.payment_event_id||
   data.origin!=='business-os-core-production'||data.independently_verified!==false||
   !record(data.artifact)||typeof data.artifact_sha256!=='string') {
     throw Error('COMPANY_OS_SOURCE_OR_PAYMENT_MISMATCH')
 }
 const artifact=data.artifact
 if(artifact.schema!=='noetfield.company-os-commercial-artifact.v1'||
   artifact.workpacket_id!==wanted.external_workpacket_id||
   artifact.source_intake_id!==wanted.source_intake_id||
   artifact.payment_event_id!==wanted.payment_event_id||
   artifact.engine!=='COMPANY_OS'||artifact.scope_ref!==data.scope_ref||
   artifact.work_product_kind!=='AI_SALES_OS_IMPLEMENTATION_BLUEPRINT_DRAFT'||
   artifact.work_product_stage!=='INTERNAL_REVIEW_READY_NOT_DEPLOYED'||
   artifact.product_delivered!==false||artifact.customer_accepted!==false||
   artifact.independent_verification!==false)throw Error('UNTRUSTED_WORK_PRODUCT_CLAIMS')
 const traceEvidence=traceEvidenceValid(artifact)
 const digest=sha256(canonicalJson(artifact))
 if(digest!==data.artifact_sha256)throw Error('ORIGINAL_ARTIFACT_HASH_MISMATCH')
 if(!Array.isArray(artifact.agent_results)||artifact.agent_results.length!==2)
   throw Error('TWO_ACTUAL_SPECIALIST_RUNS_REQUIRED')
 const roles=new Set<string>()
 for(const item of artifact.agent_results){
   if(!record(item)||typeof item.task_id!=='string'||item.task_id.length<12||
      item.provider!=='openai-compatible'||typeof item.role!=='string'||
      !record(item.recommendation))throw Error('MODEL_BACKED_SPECIALIST_EVIDENCE_REQUIRED')
   roles.add(item.role)
   if(String(item.recommendation.assessment||'').length<25||
      String(item.recommendation.next_best_action||'').length<15)
     throw Error('SUBSTANTIVE_AGENT_OUTPUT_REQUIRED')
 }
 if(roles.size!==2||!roles.has('engineering_operator')||!roles.has('risk_governance'))
   throw Error('DISTINCT_ENGINEERING_AND_RISK_REVIEW_REQUIRED')
 if(!Array.isArray(artifact.acceptance_tests)||artifact.acceptance_tests.length<3||
    artifact.acceptance_tests.some(t=>!record(t)||t.verified!==false))
    throw Error('FINAL_DELIVERY_CANNOT_BE_INFERRED_FROM_DRAFT')
 return {digest,gate_checks:[
   'SOURCE_AND_PAYMENT_BINDING','CONTENT_HASH_MATCH','ENGINEERING_MODEL_RUN',
   'RISK_REVIEW_MODEL_RUN','CUSTOMER_DELIVERY_NOT_CLAIMED'
 ],full_delivery_verified:false,trace_evidence:traceEvidence}
}

export async function fetchOriginalEvidence(externalId:string,secret:string):Promise<unknown>{
 if(!EXTERNAL.test(externalId)||secret.length<32)throw Error('PRIVATE_ORIGIN_READ_UNAVAILABLE')
 const r=await fetch(COMPANY_OS_ORIGIN+'/api/internal/commercial/workpackets/'+externalId,{
  headers:{Authorization:'Bearer '+secret,Accept:'application/json'},
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000)
 })
 if(!r.ok)throw Error('COMPANY_OS_ARTIFACT_NOT_AVAILABLE_'+r.status)
 const raw=await r.text()
 if(raw.length>150000)throw Error('ARTIFACT_TOO_LARGE')
 return JSON.parse(raw) as unknown
}

export function draftAttestation(externalId:string,digest:string,trace?:VerifiedRunTrace){
 const checks=['SOURCE_AND_PAYMENT_BINDING','CONTENT_HASH_MATCH','ENGINEERING_MODEL_RUN',
   'RISK_REVIEW_MODEL_RUN','CUSTOMER_DELIVERY_NOT_CLAIMED']
 return {
  schema:'noetfield.commercial-draft-attestation.v1',
  external_workpacket_id:externalId,
  artifact_sha256:digest,
  checks,verified_draft_integrity:true,
  independent_from_company_os:true,
  customer_deliverable_verified:false,
  deployed_product_verified:false,
  ...(trace ? {execution_trace:trace,run_trace_verified:true} : {}),
 }
}

export function signDraftAttestation(attestation:ReturnType<typeof draftAttestation>,secret:string){
 if(secret.length<32)throw Error('INDEPENDENT_VERIFIER_SIGNER_UNCONFIGURED')
 return createHmac('sha256',secret).update(canonicalJson(attestation)).digest('hex')
}

export function callbackEvent(wanted:DraftRequest,digest:string){
 const eventId='draftproof_'+sha256(wanted.platform_workpacket_id+'|'+wanted.external_workpacket_id+'|'+digest).slice(0,40)
 return {
  provider_event_id:eventId,
  workpacket_id:wanted.platform_workpacket_id,
  external_workpacket_id:wanted.external_workpacket_id,
  source_intake_id:wanted.source_intake_id,
  engine:'COMPANY_OS' as const,
  status:'RUNNING' as const,
  artifact_sha256:digest,
  independently_verified_draft:true,
  full_delivery_verified:false,
  verifier_receipt_url:PUBLIC_VERIFIER_ORIGIN+'/api/internal/commercial/receipts/'+wanted.external_workpacket_id,
 }
}

export function signPlatformCallback(payload:ReturnType<typeof callbackEvent>,secret:string){
 if(secret.length<32)throw Error('PLATFORM_CALLBACK_SIGNATURE_NOT_CONFIGURED')
 const body=JSON.stringify(payload)
 const sig=createHmac('sha256',secret).update(body).digest('hex')
 return {body,signature:'sha256='+sig}
}
