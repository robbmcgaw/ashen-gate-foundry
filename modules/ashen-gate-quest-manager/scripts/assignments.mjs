// Owner of delegated execution (DEC-0081). Campaign state only; never HQ stationing.
import {MOD,assertGM} from './core.mjs';
export const ASSIGNMENT_CONTRACT='ag-quest-assignments/0.1-alpha';
const ID=/^ASSIGN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const OBJECTIVE=/^(QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const REF=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const FLAG=`flags.${MOD}`;
const docs=()=>Array.isArray(game.journal?.contents)?game.journal.contents:[...game.journal];
export function validateAssignment(input){
 const r=structuredClone(input);
 if(!r||!ID.test(r.id??''))throw new Error('Invalid ASSIGN ID');
 if(r.entity_type!=='Assignment'||r.scope!=='campaign_state'||r.owner_system_id!=='SYS-QUEST')throw new Error('Assignment must be Quest-owned campaign state');
 if(!['proposed','draft','approved','superseded','retired'].includes(r.status)||typeof r.version!=='string'||!r.version.trim())throw new Error('Invalid record metadata');
 if(!Array.isArray(r.provenance?.sources)||r.visibility!=='gm'||!Array.isArray(r.refs))throw new Error('Invalid envelope');
 if(r.refs.some(x=>!x||typeof x.relation!=='string'||!x.relation.trim()||!REF.test(x.target_id??'')||!['required','optional'].includes(x.mode)))throw new Error('Invalid typed reference');
 if(!OBJECTIVE.test(r.objective_id??'')||!r.refs.some(x=>x.target_id===r.objective_id&&x.mode==='required'))throw new Error('Assignment requires a typed required Objective reference');
 if(typeof r.execution_status!=='string'||!r.execution_status.trim())throw new Error('Execution status required');
 if(!Array.isArray(r.participants)||!r.participants.every(x=>typeof x==='string'&&x.trim()))throw new Error('Participant IDs must be strings');
 if(!r.results||typeof r.results!=='object'||Array.isArray(r.results))throw new Error('Assignment results must be an object');
 return r;
}
export function assignmentDoc(id){assertGM(game.user);const matches=docs().filter(d=>d.getFlag?.(MOD,'assignmentPrivate')===true&&d.getFlag(MOD,'assignment')?.id===id);if(matches.length>1)throw new Error(`Duplicate Assignment ID ${id}`);return matches[0]||null;}
export function listAssignments({objectiveId=null}={}){
 assertGM(game.user);
 return docs().filter(d=>d.getFlag?.(MOD,'assignmentPrivate')===true).map(d=>d.getFlag(MOD,'assignment'))
  .filter(x=>x&&(!objectiveId||x.objective_id===objectiveId)).map(x=>structuredClone(x));
}
export function getAssignment(id){assertGM(game.user);return structuredClone(assignmentDoc(id)?.getFlag(MOD,'assignment')??null);}
export async function saveAssignment(value,{replace=false,objectiveExists=()=>true,ensureFolder=async()=>null}={}){
 assertGM(game.user);const rec=validateAssignment(value);
 if(!objectiveExists(rec.objective_id))throw new Error('Assignment target Objective is missing from Quest Manager');
 const old=assignmentDoc(rec.id);
 if(old&&!replace)throw new Error(`Assignment ${rec.id} already exists`);
 if(old){await old.update({name:`Quest Assignment — ${rec.id}`,[`${FLAG}.assignment`]:rec});}
 else await JournalEntry.create({name:`Quest Assignment — ${rec.id}`,folder:await ensureFolder('Assignments'),ownership:{default:0},flags:{[MOD]:{assignmentPrivate:true,assignment:rec}},pages:[{name:'GM Assignment',type:'text',text:{format:1,content:'<p>Quest-owned delegated execution. GM-only authoritative campaign state.</p>'}}]});
 return rec.id;
}
export async function removeAssignment(id){assertGM(game.user);const doc=assignmentDoc(id);if(!doc)throw new Error('Assignment not found');await doc.delete();return true;}
