// Structural guard only, NOT proof of database RLS correctness.
// Run against the v2 HF-only draft; never executes SQL.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const root=resolve(__dirname,'../db/hf-training');
const v1=readFileSync(resolve(root,'class-live-sessions-DRAFT-DO-NOT-APPLY.sql'),'utf8');
const v2=readFileSync(resolve(root,'class-access-v2-DRAFT-DO-NOT-APPLY.sql'),'utf8');

test('older HF SQL is explicitly superseded and must not be applied',()=>{
  assert.match(v1,/SUPERADO POR class-access-v2/);
  assert.match(v1,/NO EJECUTAR Y NO COMBINAR CON V2/);
});

test('v2 must stay unexecuted until role and consent audits pass',()=>{
  assert.match(v2,/NO EJECUTAR/);
  assert.match(v2,/NO ES UNA MIGRACIÓN APROBADA/);
  assert.match(v2,/HF TRAINING/);
  assert.match(v2,/NUNCA GG FAMILY NI HPS/i);
  assert.match(v2,/BLOQUEANTES ANTES DE APLICAR/);
});

test('v2 roles are admin-provisioned, never writable by the browser',()=>{
  assert.match(v2,/create table public\.hf_class_actors/i);
  assert.match(v2,/alter table public\.hf_class_actors enable row level security/i);
  assert.match(v2,/grant select on public\.hf_class_actors to authenticated/i);
  assert.doesNotMatch(v2,/grant\s+(?:insert|update|delete)[^;]*hf_class_actors[^;]*to authenticated/i);
  assert.match(v2,/actor_kind in \('trainer','screen'\)/);
});

test('screen approval is explicit and only screen accounts can perform it',()=>{
  assert.match(v2,/create policy hf_pair_accept_only_screen/);
  assert.match(v2,/screen_user_id = \(select auth\.uid\(\)\)/);
  assert.match(v2,/and accepted_at is null/);
  assert.match(v2,/actor_kind = 'screen' and a\.active/);
  assert.match(v2,/grant update\(accepted_at\) on public\.hf_class_pairings to authenticated/);
  assert.match(v2,/hf_pair_accept_guard/);
});

test('revocation exists and is append-only for either party',()=>{
  assert.match(v2,/create table public\.hf_class_pair_revocations/);
  assert.match(v2,/pair_id uuid primary key/);
  assert.match(v2,/create policy hf_pair_revocation_actor_insert/);
  assert.doesNotMatch(v2,/grant\s+(?:update|delete)[^;]*hf_class_pair_revocations[^;]*to authenticated/i);
  assert.match(v2,/not exists \(select 1 from public\.hf_class_pair_revocations/);
});

test('all exposed HF tables need explicit RLS, grants and allowed fields',()=>{
  const tables=['hf_class_actors','hf_class_pairings','hf_class_pair_revocations','hf_class_live_sessions'];
  for(const table of tables){
    assert.match(v2,new RegExp('alter table public\\.'+table+' enable row level security','i'));
    assert.match(v2,new RegExp('revoke all on public\\.'+table+' from public, anon, authenticated','i'));
  }
  assert.match(v2,/constraint hf_live_public_runtime_keys/);
  assert.match(v2,/constraint hf_live_public_plan_format/);
  assert.match(v2,/constraint hf_live_payload_limits/);
  const sqlOnly=v2.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlOnly,/\bsecurity\s+definer\b/i);
});
