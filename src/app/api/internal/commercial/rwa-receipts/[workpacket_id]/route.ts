/** Public non-PII reproducible signature of native RWA Clinic verdict.
 * Does not reveal original customer asset records. Not securities approval.
 */
import {NextRequest,NextResponse} from 'next/server'
import {
 independentReplay,independentRwaAttestation,signRwaAttestation,
} from '@/lib/commercial-rwa-verifier'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(_req:NextRequest,
  {params}:{params:Promise<{workpacket_id:string}>}){
 const {workpacket_id}=await params
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(workpacket_id))
   return NextResponse.json({error:'INVALID_RWA_RECEIPT_ID'},{status:404})
 const readToken=process.env.CORPORATE_RWA_VERIFIER_READ_TOKEN||''
 const independentKey=process.env.NOETFIELD_VERIFIER_SECRET||''
 if(readToken.length<32||independentKey.length<32)
   return NextResponse.json({error:'INDEPENDENT_RECEIPT_UNCONFIGURED'},{status:503})
 try{
   // Source association comes from the paid ledger, never from a URL query
   // containing attacker-chosen payment/intake IDs.
   const res=await fetch(
     'https://platform.noetfield.com/api/internal/commercial/rwa-verifier-source/'+workpacket_id,
     {headers:{Authorization:'Bearer '+readToken,Accept:'application/json'},
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)})
   if(!res.ok)throw Error('RWA_PAID_SOURCE_UNAVAILABLE')
   const source=await res.json() as Record<string,unknown>
   const wanted={
      platform_workpacket_id:workpacket_id,
      source_intake_id:String(source.source_intake_id||''),
      payment_event_id:String(source.payment_event_id||''),
      engine:'RWA_CLINIC' as const
   }
   const evidence=await independentReplay(wanted,readToken)
   const report=independentRwaAttestation(wanted,evidence)
   return NextResponse.json({
      ...report,
      attestation_signature:signRwaAttestation(report,independentKey),
      verification_source:'INDEPENDENT_NATIVE_CLINIC_REPLAY',
      tokenization_approved:false,
      customer_accepted:false
    },{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'}})
 }catch{
   return NextResponse.json({error:'NATIVE_RWA_INTEGRITY_CANNOT_BE_RECONFIRMED',
        customer_accepted:false},{status:409})
 }
}
