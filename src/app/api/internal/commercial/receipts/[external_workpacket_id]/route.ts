/** Recomputed public, non-PII independent review of the original Company OS
 * blueprint hash. A draft attestation is never final customer acceptance.
 */
import { NextRequest,NextResponse } from 'next/server'
import {
 fetchOriginalEvidence,sourceEvidenceValid,draftAttestation,
 signDraftAttestation,
} from '@/lib/commercial-draft-verifier'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(_req:NextRequest,
  {params}:{params:Promise<{external_workpacket_id:string}>}){
 const {external_workpacket_id}=await params
 if(!/^cwp_[0-9a-f]{32}$/.test(external_workpacket_id))
   return NextResponse.json({error:'INVALID_PUBLIC_RECEIPT_ID'},{status:404})
 const readToken=process.env.COMPANY_OS_COMMERCIAL_VERIFIER_READ_TOKEN||''
 const independentSecret=process.env.NOETFIELD_VERIFIER_SECRET||''
 if(readToken.length<32||independentSecret.length<32)
   return NextResponse.json({error:'VERIFIER_NOT_CONFIGURED'},{status:503})
 try{
   const raw=await fetchOriginalEvidence(external_workpacket_id,readToken)
   if(!raw||typeof raw!=='object')
      throw Error('INVALID_ORIGIN')
   const item=raw as Record<string,unknown>
   const match=sourceEvidenceValid(item,{
      platform_workpacket_id:'00000000-0000-4000-8000-000000000000',
      external_workpacket_id,engine:'COMPANY_OS',
      source_intake_id:String(item.source_intake_id||''),
      payment_event_id:String(item.payment_event_id||'')
   })
   const report=draftAttestation(external_workpacket_id,match.digest)
   return NextResponse.json({
     ...report,
     independent_signature:signDraftAttestation(report,independentSecret),
     verifier:'Noetfield Verification Layer / independent runtime',
     scope:'DRAFT_INTEGRITY_ONLY',
     source_payment_independently_reconciled_to_stripe:false,
     deployment_verified:false,customer_acceptance_verified:false,
   },{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'}})
 }catch{
   return NextResponse.json({error:'ORIGINAL_ARTIFACT_INTEGRITY_NOT_CONFIRMED',
     full_delivery_verified:false},{status:409})
 }
}
