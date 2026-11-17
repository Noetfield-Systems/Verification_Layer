import {test,expect} from 'bun:test'
import {
 validateDraftRequest,canonicalJson,sha256,sourceEvidenceValid,
 callbackEvent,draftAttestation,signDraftAttestation,
 signPlatformCallback,constantTimeEqual
} from '../src/lib/commercial-draft-verifier'

const req={
 platform_workpacket_id:'a52e1358-2017-4111-bd17-45077bedbafe',
 external_workpacket_id:'cwp_0123456789abcdef0123456789abcdef',
 source_intake_id:'INT-ABCDEF123456',
 payment_event_id:'evt_real987654321',
 engine:'COMPANY_OS' as const,
}
const recommendation={
 assessment:'A detailed source-matched engineering blueprint containing concrete acceptance and negative-path tests.',
 next_best_action:'Implement exact one-lead-to-one-owner state routing and check all failure conditions.'
}
const artifact={
 schema:'noetfield.company-os-commercial-artifact.v1',
 workpacket_id:req.external_workpacket_id,
 engine:'COMPANY_OS',source_intake_id:req.source_intake_id,
 scope_ref:'SOW-2026-REAL-01',payment_event_id:req.payment_event_id,
 work_product_kind:'AI_SALES_OS_IMPLEMENTATION_BLUEPRINT_DRAFT',
 work_product_stage:'INTERNAL_REVIEW_READY_NOT_DEPLOYED',
 agent_results:[
  {task_id:'task_engineer_1234567890',role:'engineering_operator',
    provider:'openai-compatible',recommendation},
  {task_id:'task_reviewer_1234567890',role:'risk_governance',
    provider:'openai-compatible',recommendation},
 ],
 acceptance_tests:[
  {id:'INTAKE',verified:false},{id:'DEDUPE',verified:false},
  {id:'CONTACT',verified:false}],
 product_delivered:false,customer_accepted:false,
 independent_verification:false,generated_at:'2026-11-17T12:00:00Z'
}
function original(){
 return {
  schema:'noetfield.company-os-artifact-verification-input.v1',
  workpacket_id:req.external_workpacket_id,source_intake_id:req.source_intake_id,
  payment_event_id:req.payment_event_id,scope_ref:artifact.scope_ref,
  engine:'COMPANY_OS',origin:'business-os-core-production',
  artifact,artifact_sha256:sha256(canonicalJson(artifact)),
  independently_verified:false
 }
}
test('independent draft attestation checks original agent result hash, source, payment and scope',()=>{
 expect(validateDraftRequest(req)).toEqual(req)
 const evidence=sourceEvidenceValid(original(),req)
 expect(evidence.digest).toHaveLength(64)
 expect(evidence.full_delivery_verified).toBe(false)
 const report=draftAttestation(req.external_workpacket_id,evidence.digest)
 expect(report.verified_draft_integrity).toBe(true)
 expect(report.customer_deliverable_verified).toBe(false)
 const signature=signDraftAttestation(report,'separate-independent-verifier-secret-1234567890')
 expect(signature).toHaveLength(64)
 const event=callbackEvent(req,evidence.digest)
 expect(event.status).toBe('RUNNING')
 expect(event.full_delivery_verified).toBe(false)
 const callback=signPlatformCallback(event,'platform-hmac-callback-secret-1234567890')
 expect(callback.signature.startsWith('sha256=')).toBe(true)
 expect(callback.body.includes('"status":"RUNNING"')).toBe(true)
})
test('reject source, payment, artifact spoof, missing risk review and final-delivery claims',()=>{
 for(const bad of [
  {...original(),payment_event_id:'evt_attacker987654321'},
  {...original(),artifact_sha256:'f'.repeat(64)},
  {...original(),artifact:{...artifact,product_delivered:true}},
  {...original(),artifact:{...artifact,agent_results:[artifact.agent_results[0]]}},
  {...original(),artifact:{...artifact,acceptance_tests:[{id:'INCOMPLETE',verified:true}]}},
 ]){
  expect(()=>sourceEvidenceValid(bad,req)).toThrow()
 }
})
test('only exact strict platform source payload and scoped bearer key are valid',()=>{
 expect(constantTimeEqual('x'.repeat(40),'x'.repeat(40))).toBe(true)
 expect(constantTimeEqual('x'.repeat(40),'y'.repeat(40))).toBe(false)
 expect(constantTimeEqual('','x'.repeat(40))).toBe(false)
 expect(()=>validateDraftRequest({...req,extra:'evil'})).toThrow()
 expect(()=>validateDraftRequest({...req,source_intake_id:'DEMO-INT-01'})).toThrow()
 expect(()=>validateDraftRequest({...req,engine:'RWA_CLINIC'})).toThrow()
})

function traceBoundOriginal(){
 const data=original()
 const agents=artifact.agent_results.map((a,i)=>({
   ...a,run_id:'run_canonical_worker_'+(i+1)+'_123456',
   model:'provider-actual-model',input_tokens:90+i*10,output_tokens:30+i*5
 }))
 const runs=agents.map((a,i)=>({
   run_id:a.run_id,task_id:a.task_id,role:a.role,provider:'openai-compatible',
   model:a.model,status:'completed',input_tokens:a.input_tokens,output_tokens:a.output_tokens,
   started_at:'2026-11-17T12:01:00Z',finished_at:'2026-11-17T12:02:00Z'
 }))
 const traced={
   ...artifact,agent_results:agents,
   execution_trace:{
    source:'CANONICAL_COMPANY_OS_COMPLETED_RUNS',runs,
    total_input_tokens:190,total_output_tokens:65,
    provider_cost_minor:null,currency:null,
    cost_accounting_state:'PROVIDER_BILLING_NOT_AVAILABLE'
   }
 }
 return {...data,artifact:traced,artifact_sha256:sha256(canonicalJson(traced))}
}

test('actual two-provider-run trace and token usage are bound to signed independent draft receipt',()=>{
 const result=sourceEvidenceValid(traceBoundOriginal(),req)
 expect(result.trace_evidence?.status).toBe('RUNS_CONFIRMED')
 expect(result.trace_evidence?.input_tokens).toBe(190)
 expect(result.trace_evidence?.output_tokens).toBe(65)
 expect(result.trace_evidence?.provider_cost_minor).toBeNull()
 const signed=draftAttestation(req.external_workpacket_id,result.digest,result.trace_evidence)
 expect(signed.run_trace_verified).toBe(true)
 expect(signed.execution_trace?.run_ids).toHaveLength(2)
 expect(signDraftAttestation(signed,'separate-independent-verifier-secret-1234567890')).toHaveLength(64)
 expect(signed.deployed_product_verified).toBe(false)
})

test('reject falsified token totals, mismatched model run, billing claim or duplicated run identifiers',()=>{
 const originalWithTrace=traceBoundOriginal()
 function mutated(edit:(x:any)=>void){
   const payload=structuredClone(originalWithTrace) as any
   edit(payload.artifact)
   payload.artifact_sha256=sha256(canonicalJson(payload.artifact))
   return payload
 }
 for(const forged of [
   mutated(a=>{a.execution_trace.total_input_tokens=99999}),
   mutated(a=>{a.execution_trace.runs[0].run_id='run_unrelated_fake_987654321'}),
   mutated(a=>{a.execution_trace.runs[1].run_id=a.execution_trace.runs[0].run_id}),
   mutated(a=>{a.execution_trace.provider_cost_minor=0}),
   mutated(a=>{a.execution_trace.runs[0].status='blocked'}),
   mutated(a=>{a.agent_results[0].model='different-unrecorded-model'}),
 ]) expect(()=>sourceEvidenceValid(forged,req)).toThrow()
})

test('legacy draft without actual run records is not mislabeled as verified trace',()=>{
 const result=sourceEvidenceValid(original(),req)
 expect(result.trace_evidence).toBeUndefined()
 const signed=draftAttestation(req.external_workpacket_id,result.digest,result.trace_evidence)
 expect('run_trace_verified' in signed).toBe(false)
})
