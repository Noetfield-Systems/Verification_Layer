/** Independent RWA Clinic replay verifies actual paid 9+1 technical verdict.
 * The Clinic engine is reused, NOT copied. A different service requests the
 * original case from signed-paid Platform, reruns the stateless Clinic API,
 * compares the complete gate output and signs its own attestation.
 */
import {createHmac} from 'node:crypto'
import {canonicalJson,sha256,constantTimeEqual} from './commercial-draft-verifier'

const PLATFORM_ORIGIN='https://platform.noetfield.com'
export const NATIVE_CLINIC='https://scan.noetfield.com/v1/rwa/cases'
const VERIFIER_ORIGIN='https://verify.noetfield.com'
const CASE_ID=/^RWA-[0-9A-F]{16}$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SOURCE=/^INT-[A-Z0-9]{12}$/
const PAYMENT=/^evt_[A-Za-z0-9]{8,100}$/
const GATE_IDS=[
 'asset-existence','ownership-control','economic-rights',
 'jurisdiction-regulatory','custody-servicing','ledger-architecture',
 'transfer-redemption','default-recovery','dependency-risk','clinical-verdict',
]
type RecordValue=Record<string,unknown>
function rec(x:unknown):x is RecordValue{
 return !!x&&typeof x==='object'&&!Array.isArray(x)
}
export type RwaVerifyRequest={
 platform_workpacket_id:string
 source_intake_id:string
 payment_event_id:string
 engine:'RWA_CLINIC'
}
export function validateRwaRequest(x:unknown):RwaVerifyRequest {
 if(!rec(x)||Object.keys(x).length!==4
    ||typeof x.platform_workpacket_id!=='string'||!UUID.test(x.platform_workpacket_id)
    ||typeof x.source_intake_id!=='string'||!SOURCE.test(x.source_intake_id)
    ||typeof x.payment_event_id!=='string'||!PAYMENT.test(x.payment_event_id)
    ||x.engine!=='RWA_CLINIC')throw Error('SOURCE_BOUND_PAID_RWA_REQUEST_REQUIRED')
 return x as RwaVerifyRequest
}
export function responseValid(x:unknown):boolean{
 if(!rec(x)||x.ok!==true||x.schema_version!=='rwa-readiness.v3'||
    typeof x.case_id!=='string'||!CASE_ID.test(x.case_id)||
    typeof x.input_fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(x.input_fingerprint)||
    !Array.isArray(x.gate_results)||x.gate_results.length!==10||
    !rec(x.clinical_verdict)||!rec(x.asset_passport)||
    x.clinical_verdict.case_id!==x.case_id||
    x.asset_passport.case_id!==x.case_id||
    typeof x.clinical_verdict.verdict_receipt!=='string'||
    x.clinical_verdict.verdict_receipt.length<32)return false
 const expected=GATE_IDS
 for(let i=0;i<10;i++){
   const gate=x.gate_results[i]
   if(!rec(gate)||gate.gate_id!==expected[i]||gate.step!==i+1||
      !['PASS','FAIL','REVIEW','PUBLIC','PERMISSIONED','HYBRID','NO_LEDGER','GO','CONDITIONAL','NO_GO'].includes(String(gate.state)))return false
 }
 const verdict=x.clinical_verdict
 const match={
   GO:'PROCEED',CONDITIONAL:'PROCEED_AFTER_REVIEW',NO_GO:'DO_NOT_TOKENIZE',
 } as Record<string,string>
 if(!['GO','CONDITIONAL','NO_GO'].includes(String(verdict.status))||
    match[String(verdict.status)]!==verdict.tokenization_recommendation||
    x.gate_results[9].state!==verdict.status)return false
 return true
}
export function validateRwaSource(x:unknown,want:RwaVerifyRequest){
 if(!rec(x)||x.schema!=='noetfield.rwa-clinic-verifier-source.v1'||
    x.workpacket_id!==want.platform_workpacket_id||
    x.source_intake_id!==want.source_intake_id||
    x.payment_event_id!==want.payment_event_id||
    x.engine!=='RWA_CLINIC'||x.independently_verified!==false||
    x.authenticated_customer_acceptance!==false||
    typeof x.deal_id!=='string'||!UUID.test(x.deal_id)||
    typeof x.scope_ref!=='string'||x.scope_ref.length<5||
    !rec(x.clinic_case)||!responseValid(x.provider_outcome)||
    x.clinic_case_id!==(x.provider_outcome as RecordValue).case_id||
    typeof x.original_case_sha256!=='string')
     throw Error('RWA_PROVIDER_AND_PAID_SOURCE_MISMATCH')
 const digest=sha256(canonicalJson(x.clinic_case))
 if(digest!==x.original_case_sha256)
     throw Error('RWA_PAID_INTAKE_DIGEST_MISMATCH')
 return {
   originalCase:x.clinic_case as RecordValue,
   outcome:x.provider_outcome as RecordValue,
   dealId:x.deal_id as string,
   caseId:x.clinic_case_id as string,
   caseSha256:digest,
 }
}
async function fetchJSON(url:string,init:RequestInit,maxBytes=180000):Promise<unknown>{
 const resp=await fetch(url,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)})
 if(!resp.ok)throw Error('RWA_PROVIDER_HTTP_'+resp.status)
 const text=await resp.text()
 if(text.length>maxBytes)throw Error('RWA_PROVIDER_RESPONSE_TOO_LARGE')
 return JSON.parse(text) as unknown
}
export async function independentReplay(want:RwaVerifyRequest,readSecret:string){
 if(readSecret.length<32)throw Error('SCOPED_RWA_SOURCE_READER_UNAVAILABLE')
 const source=await fetchJSON(PLATFORM_ORIGIN+'/api/internal/commercial/rwa-verifier-source/'+want.platform_workpacket_id,{
     headers:{Authorization:'Bearer '+readSecret,Accept:'application/json'}
 })
 const checked=validateRwaSource(source,want)
 const replay=await fetchJSON(NATIVE_CLINIC,{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(checked.originalCase)
 })
 if(!responseValid(replay))throw Error('RWA_NATIVE_REPLAY_DID_NOT_RETURN_VALID_VERDICT')
 if((replay as RecordValue).case_id!==checked.caseId||
    (replay as RecordValue).input_fingerprint!==checked.outcome.input_fingerprint)
    throw Error('RWA_CASE_FINGERPRINT_OR_ID_CHANGED')
 const originalHash=sha256(canonicalJson(checked.outcome))
 const replayHash=sha256(canonicalJson(replay))
 if(originalHash!==replayHash)throw Error('RWA_NINE_GATE_OR_VERDICT_MISMATCH')
 return {
   ...checked,
   nativeResult:replay as RecordValue,
   providerHash:originalHash,
   replayHash,
 }
}
export function independentRwaAttestation(want:RwaVerifyRequest,
  evidence:Awaited<ReturnType<typeof independentReplay>>){
 const verdict=evidence.nativeResult.clinical_verdict as RecordValue
 return {
   schema:'noetfield.rwa-clinic-independent-attestation.v1' as const,
   platform_workpacket_id:want.platform_workpacket_id,
   clinic_case_id:evidence.caseId,
   case_sha256:evidence.caseSha256,
   native_result_sha256:evidence.replayHash,
   native_fingerprint:evidence.nativeResult.input_fingerprint as string,
   verdict_receipt:verdict.verdict_receipt as string,
   gate_count:10,
   independently_replayed:true,
   original_provider_result_matched:true,
   clinical_status:verdict.status as string,
   tokenization_recommendation:verdict.tokenization_recommendation as string,
   investment_approval:false,
   product_type:'SCOPED_RWA_TECHNICAL_READINESS_REPORT',
   customer_accepted:false,
 }
}
export function signRwaAttestation(report:ReturnType<typeof independentRwaAttestation>,key:string){
 if(key.length<32)throw Error('INDEPENDENT_ATTESTATION_SIGNER_NOT_CONFIGURED')
 return createHmac('sha256',key).update(canonicalJson(report)).digest('hex')
}
export function rwaReceiptURL(workpacketId:string){
 return VERIFIER_ORIGIN+'/api/internal/commercial/rwa-receipts/'+workpacketId
}
export function completeRwaEvent(want:RwaVerifyRequest,
 evidence:Awaited<ReturnType<typeof independentReplay>>){
 const verified=independentRwaAttestation(want,evidence)
 const eventHash=sha256(want.platform_workpacket_id+'|'+evidence.replayHash+'|'+evidence.caseId)
 return {
   provider_event_id:'rwaproof_'+eventHash.slice(0,40),
   workpacket_id:want.platform_workpacket_id,
   source_intake_id:want.source_intake_id,
   engine:'RWA_CLINIC' as const,
   external_workpacket_id:evidence.caseId,
   status:'VERIFIED' as const,
   artifact_url:PLATFORM_ORIGIN+'/api/corporate-crm/customer/rwa/report/'+evidence.dealId,
   verifier_receipt_url:rwaReceiptURL(want.platform_workpacket_id),
   cost_minor:0,
   technical_readiness_only:true,
   independent_native_replay:true,
   investment_approval:false,
   customer_acceptance:false,
   evidence_sha256:verified.native_result_sha256,
 }
}
export function signedRwaCallback(event:ReturnType<typeof completeRwaEvent>,secret:string){
 if(secret.length<32)throw Error('PLATFORM_INDEPENDENT_CALLBACK_KEY_UNCONFIGURED')
 const body=JSON.stringify(event)
 return {
   body,signature:'sha256='+createHmac('sha256',secret).update(body).digest('hex')
 }
}
export {constantTimeEqual}
