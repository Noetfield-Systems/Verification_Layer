/** Actual native RWA Clinic report, independently replayed, not a second
 * scoring engine. Only scoped paid Noetfield Platform may request final proof.
 */
import {NextRequest,NextResponse} from 'next/server'
import {
 constantTimeEqual,validateRwaRequest,independentReplay,
 independentRwaAttestation,signRwaAttestation,
 completeRwaEvent,signedRwaCallback,
} from '@/lib/commercial-rwa-verifier'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const PLATFORM_CALLBACK='https://platform.noetfield.com/api/corporate-crm/workpackets/verifier-result'

export async function POST(req:NextRequest){
 const expected=process.env.COMMERCIAL_VERIFIER_INVOKE_TOKEN||''
 const auth=(req.headers.get('authorization')||'').replace(/^Bearer /i,'')
 if(!constantTimeEqual(auth,expected)){
   return NextResponse.json({error:'RWA_INDEPENDENT_VERIFIER_AUTH_REQUIRED'},
                           {status:expected.length>=32?401:503})
 }
 let wanted:ReturnType<typeof validateRwaRequest>
 try{
   if(Number(req.headers.get('content-length')||0)>2048)
     return NextResponse.json({error:'REQUEST_TOO_LARGE'},{status:413})
   wanted=validateRwaRequest(await req.json())
 }catch{
   return NextResponse.json({error:'SOURCE_BOUND_PAID_RWA_REQUEST_REQUIRED'},{status:422})
 }
 const reader=process.env.CORPORATE_RWA_VERIFIER_READ_TOKEN||''
 const callbackKey=process.env.CORPORATE_WORKPACKET_VERIFIER_SECRET||''
 const separateKey=process.env.NOETFIELD_VERIFIER_SECRET||''
 if(Math.min(reader.length,callbackKey.length,separateKey.length)<32)
   return NextResponse.json({error:'INDEPENDENT_RWA_VERIFIER_NOT_CONFIGURED'},{status:503})
 try{
   const evidence=await independentReplay(wanted,reader)
   const report=independentRwaAttestation(wanted,evidence)
   const proofSignature=signRwaAttestation(report,separateKey)
   const event=completeRwaEvent(wanted,evidence)
   const signed=signedRwaCallback(event,callbackKey)
   const callback=await fetch(PLATFORM_CALLBACK,{
     method:'POST',
     headers:{'Content-Type':'application/json',
              'X-Noetfield-Verifier-Signature':signed.signature},
     body:signed.body,redirect:'error',cache:'no-store',
     signal:AbortSignal.timeout(12000)
   })
   if(!callback.ok)return NextResponse.json({
      error:'SIGNED_PLATFORM_CALLBACK_NOT_CONFIRMED',
      provider_http_status:callback.status,
      independent_replay_passed:true,customer_accepted:false,
   },{status:502})
   const ack=await callback.json() as {state?:string,workpacket_id?:string}
   if(ack.workpacket_id!==wanted.platform_workpacket_id||ack.state!=='VERIFIED')
      return NextResponse.json({error:'CANONICAL_LEDGER_PROOF_NOT_ACKNOWLEDGED'}, {status:502})
   return NextResponse.json({
      schema:'noetfield.rwa-independent-verification-result.v1',
      state:'VERIFIED',customer_accepted:false,
      technical_readiness_only:true,
      no_investment_approval:true,
      independent_replay_passed:true,
      clinic_case_id:evidence.caseId,
      native_case_fingerprint:evidence.nativeResult.input_fingerprint,
      attestation_signature:proofSignature,
      verifier_receipt_url:event.verifier_receipt_url,
      artifact_url:event.artifact_url,
      callback_acknowledged:true
   },{headers:{'Cache-Control':'no-store'}})
 }catch(error){
   const reason=error instanceof Error?error.message:'RWA_INDEPENDENT_VERIFICATION_FAILED'
   return NextResponse.json({error:'ORIGINAL_RWA_CASE_OR_NATIVE_REPLAY_NOT_VERIFIED',
       detail_code:/^[A-Z0-9_]+$/.test(reason)?reason:'PROVIDER_UNAVAILABLE',
       customer_accepted:false,investment_approval:false},{status:409})
 }
}
