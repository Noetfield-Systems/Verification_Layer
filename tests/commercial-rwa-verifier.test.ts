import {test,expect} from 'bun:test'
import {
  validateRwaRequest,responseValid,validateRwaSource,
  independentRwaAttestation,completeRwaEvent,signedRwaCallback,signRwaAttestation,
} from '../src/lib/commercial-rwa-verifier'
import {canonicalJson,sha256} from '../src/lib/commercial-draft-verifier'

const ids=[
 'asset-existence','ownership-control','economic-rights',
 'jurisdiction-regulatory','custody-servicing','ledger-architecture',
 'transfer-redemption','default-recovery','dependency-risk','clinical-verdict',
]
const paid={
  platform_workpacket_id:'a52e1358-2017-4111-bd17-45077bedbafe',
  source_intake_id:'INT-ABCDEF123456',payment_event_id:'evt_1234567890',
  engine:'RWA_CLINIC' as const,
}
const intake={
 version:'rwa-readiness.v3',vertical:'private-credit',
 case_context:{jurisdiction:'BC, Canada',issuer:'Test Private Credit Originator',
 asset_value:'CAD 2,400,000',target_investors:'Qualified investors',
 proposed_structure:'SPV secured note'},
}
const clinic={
 ok:true,schema_version:'rwa-readiness.v3',case_id:'RWA-0123456789ABCDEF',
 input_fingerprint:'a'.repeat(64),
 gate_results:ids.map((id,i)=>({
  gate_id:id,step:i+1,state:i===9?'NO_GO':i===5?'NO_LEDGER':'FAIL',
  missing_evidence:[],evidence_refs:[],
 })),
 asset_passport:{case_id:'RWA-0123456789ABCDEF'},
 clinical_verdict:{
  case_id:'RWA-0123456789ABCDEF',status:'NO_GO',
  tokenization_recommendation:'DO_NOT_TOKENIZE',
  verdict_receipt:'sha256:'+('b'.repeat(64))
 },
}
const source={
 schema:'noetfield.rwa-clinic-verifier-source.v1',
 workpacket_id:paid.platform_workpacket_id,
 deal_id:'d2880558-1102-4888-ac77-10c76324a170',
 source_intake_id:paid.source_intake_id,
 scope_ref:'SOW-RWA-2026-001',
 payment_event_id:paid.payment_event_id,engine:'RWA_CLINIC',
 clinic_case_id:clinic.case_id,
 original_case_sha256:sha256(canonicalJson(intake)),
 clinic_case:intake,provider_outcome:clinic,
 independently_verified:false,authenticated_customer_acceptance:false
}
function checks(){
 const validated=validateRwaSource(source,paid)
 const replay={...validated,nativeResult:clinic,
 providerHash:sha256(canonicalJson(clinic)),replayHash:sha256(canonicalJson(clinic))}
 const report=independentRwaAttestation(paid,replay)
 const event=completeRwaEvent(paid,replay)
 return {validated,replay,report,event}
}
test('real Clinic v3 9+1 native response is independently signed with NO_GO a valid final technical verdict',()=>{
 expect(validateRwaRequest(paid)).toEqual(paid)
 expect(responseValid(clinic)).toBe(true)
 const {validated,report,event}=checks()
 expect(validated.caseId).toBe(clinic.case_id)
 expect(report.gate_count).toBe(10)
 expect(report.clinical_status).toBe('NO_GO')
 expect(report.tokenization_recommendation).toBe('DO_NOT_TOKENIZE')
 expect(report.independently_replayed).toBe(true)
 expect(report.customer_accepted).toBe(false)
 expect(report.investment_approval).toBe(false)
 expect(event.status).toBe('VERIFIED')
 expect(event.artifact_url).toContain('/customer/rwa/report/')
 expect(event.verifier_receipt_url).toContain('/rwa-receipts/')
 expect(event.cost_minor).toBe(0)
 expect(event.customer_acceptance).toBe(false)
 expect(signRwaAttestation(report,'rwa-independent-hmac-secret-example-000123')).toHaveLength(64)
 const signed=signedRwaCallback(event,'scoped-platform-hmac-secret-example-000123')
 expect(signed.signature.startsWith('sha256=')).toBe(true)
 expect(JSON.parse(signed.body).status).toBe('VERIFIED')
})
test('reject forged case, mismatched paid source, data mutation and fake verdict',()=>{
 for(const bad of [
  {...source,clinic_case_id:'RWA-FFFFFFFFFFFFFFFF'},
  {...source,payment_event_id:'evt_attacker1234567890'},
  {...source,source_intake_id:'INT-FFFFFFFFFFFF'},
  {...source,original_case_sha256:'0'.repeat(64)},
  {...source,independently_verified:true},
  {...source,provider_outcome:{...clinic,clinical_verdict:{...clinic.clinical_verdict,tokenization_recommendation:'PROCEED'}}},
  {...source,provider_outcome:{...clinic,gate_results:clinic.gate_results.slice(0,9)}},
 ])expect(()=>validateRwaSource(bad,paid)).toThrow()
 expect(responseValid({...clinic,case_id:'RWA-unknown'})).toBe(false)
 expect(()=>validateRwaRequest({...paid,engine:'COMPANY_OS'})).toThrow()
 expect(()=>validateRwaRequest({...paid,source_intake_id:'DEMO-INT-123'})).toThrow()
 expect(()=>validateRwaRequest({...paid,extra:'evil'})).toThrow()
})
