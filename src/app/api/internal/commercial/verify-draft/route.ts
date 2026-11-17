/** Independent Company OS draft artifact proof, never a final product receipt.
 * POST is scoped to the Platform, which has already verified the paid SOW.
 * The source artifact is independently pulled from the real Company OS worker.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
 constantTimeEqual,validateDraftRequest,fetchOriginalEvidence,sourceEvidenceValid,
 draftAttestation,signDraftAttestation,callbackEvent,signPlatformCallback,
 PLATFORM_CALLBACK,
} from '@/lib/commercial-draft-verifier'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function POST(req:NextRequest){
 const key=process.env.COMMERCIAL_VERIFIER_INVOKE_TOKEN||''
 const given=(req.headers.get('authorization')||'').replace(/^Bearer /i,'')
 if(!constantTimeEqual(given,key))
   return NextResponse.json({error:'COMMERCIAL_VERIFIER_AUTH_REQUIRED'},{status:key.length>=32?401:503})
 let input:ReturnType<typeof validateDraftRequest>
 try{
   if(Number(req.headers.get('content-length')||0)>2048)
     return NextResponse.json({error:'REQUEST_TOO_LARGE'},{status:413})
   input=validateDraftRequest(await req.json())
 }catch{
   return NextResponse.json({error:'STRICT_SOURCE_BINDING_REQUIRED'},{status:422})
 }
 const privateRead=process.env.COMPANY_OS_COMMERCIAL_VERIFIER_READ_TOKEN||''
 const signatureKey=process.env.CORPORATE_WORKPACKET_VERIFIER_SECRET||''
 const independentKey=process.env.NOETFIELD_VERIFIER_SECRET||''
 if(Math.min(privateRead.length,signatureKey.length,independentKey.length)<32)
   return NextResponse.json({error:'SCOPED_VERIFIER_CREDENTIALS_NOT_CONFIGURED'},{status:503})
 try{
   const source=await fetchOriginalEvidence(input.external_workpacket_id,privateRead)
   const validated=sourceEvidenceValid(source,input)
   const report=draftAttestation(input.external_workpacket_id,validated.digest,validated.trace_evidence)
   const independentlySigned=signDraftAttestation(report,independentKey)
   const payload=callbackEvent(input,validated.digest)
   const signed=signPlatformCallback(payload,signatureKey)
   const response=await fetch(PLATFORM_CALLBACK,{
      method:'POST',
      headers:{'Content-Type':'application/json',
               'X-Noetfield-Verifier-Signature':signed.signature},
      body:signed.body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000)
   })
   if(!response.ok)return NextResponse.json({
     error:'PLATFORM_CALLBACK_UNCONFIRMED',provider_http_status:response.status,
     draft_integrity_passed:true,customer_delivery_verified:false
   },{status:502})
   const ack=await response.json() as {state?:string,workpacket_id?:string}
   if(ack.state!=='RUNNING'&&ack.state!=='VERIFIED')
     return NextResponse.json({error:'PLATFORM_VERIFIER_ACK_MISMATCH'},{status:502})
   if(ack.workpacket_id!==input.platform_workpacket_id)
     return NextResponse.json({error:'PLATFORM_WORKPACKET_ACK_MISMATCH'},{status:502})
   return NextResponse.json({
     schema:'noetfield.commercial-draft-verified.v1',
     state:'RUNNING',draft_integrity_passed:true,
     source_workpacket_id:input.external_workpacket_id,
     verifier_receipt_url:payload.verifier_receipt_url,
     independent_attestation_signature:independentlySigned,
     artifact_sha256:validated.digest,
     run_trace_verified:validated.trace_evidence?.status==='RUNS_CONFIRMED',
     token_usage:validated.trace_evidence ? {
       input:validated.trace_evidence.input_tokens,output:validated.trace_evidence.output_tokens
     }:null,
     actual_provider_cost_minor:null,cost_accounting_state:'PROVIDER_BILLING_NOT_AVAILABLE',
     product_delivered:false,customer_accepted:false,live_cash_claimed:false,
     callback_acknowledged:true
   },{headers:{'Cache-Control':'no-store'}})
 }catch(error){
   const reason=error instanceof Error?error.message:'VERIFY_UNAVAILABLE'
   return NextResponse.json({
     error:/^(COMPANY_OS_ARTIFACT_NOT_AVAILABLE|ARTIFACT_TOO_LARGE|PRIVATE_ORIGIN_READ_UNAVAILABLE)/.test(reason)?
       'COMPANY_OS_ARTIFACT_UNAVAILABLE':'INDEPENDENT_DRAFT_EVIDENCE_NOT_VALIDATED',
     full_delivery_verified:false
   },{status:409})
 }
}
