/**
 * GM-only recovery dialog for the Headquarters private vault (0.14.0).
 * Nothing here runs by itself and nothing is deleted. The store (private-state.mjs) enforces every safety rule;
 * this file only asks the GM, in plain words, and shows no ids.
 *   dialogs: {choice(title, html, choices), form(title, fields, opts)}  (the kit's choiceDialog / formDialog)
 *   notify:  {info(message)}
 */
import {NEW_VAULT_PHRASE} from './private-state.mjs';
import {esc} from './ag-dialogs.mjs';

export const RECOVERY_TITLE='Headquarters private vault';

const INTRO={
 missing:`<p>Headquarters keeps the GM-only details (hirelings and their notes, private layouts) in a private Journal that players cannot see. That Journal can no longer be found. It may have been deleted, or a sync or import may have removed it.</p>
<p>Players still see the public Guildhall layout. <strong>Nothing has been changed or deleted.</strong> Until this is sorted out, GM editing in Headquarters stays locked.</p>`,
 multiple:`<p>More than one private vault Journal exists, and Headquarters will not guess which one is right.</p>
<p>Open the Journals sidebar, find the extra copies (search for "Private Campaign State"), and move or delete the ones you do not want yourself. Then choose Look again. Nothing has been changed or deleted.</p>`,
 incompatible:`<p>The private vault Journal is empty or in a format this version cannot read, and Headquarters will not overwrite it.</p>
<p>If you have a backup or an earlier copy of that Journal, restore it in the Journals sidebar, then choose Look again. Nothing has been changed or deleted.</p>`
};

/** The dialog body for a diagnosis (see store.diagnose()), plus an optional note about what the last try did. */
export function recoveryHtml(diagnosis,note=''){
 return `${note?`<p class="ag-note"><strong>${esc(note)}</strong></p>`:''}${INTRO[diagnosis.problem]??''}`;
}

export const pickLabel=c=>`Vault Journal ${c.number}${c.folder?` in folder "${c.folder}"`:''} (${c.valid?`${c.revision} saved changes`:'cannot be read'})`;

const NEW_VAULT_WARNING=`This builds a fresh private vault from the public Guildhall copy that players can see. Everything that was only in the lost vault cannot be recovered this way: the hireling roster, staffing, their notes and history, and any private layout details. Hirelings will need to be added to the roster again. Nothing is deleted. If you might still find the old Journal (a backup, or Foundry's own export), choose Cancel and restore it instead.`;

export function createVaultRecovery({store,isGM,dialogs,notify,onRecovered=()=>{}}){
 let running=null;
 const plain=e=>String(e?.message??e).replace(/^Error:\s*/,'');
 async function loop(){
  let note='';
  for(;;){
   if(store.isReady())return {status:'ready'};
   const d=store.diagnose();
   if(!d.recoverable)return {status:'unrecoverable'};
   const choices=[{action:'look-again',label:'Look again',default:true}];
   if(d.canPick)choices.push({action:'pick',label:'Pick a vault journal…'});
   if(d.canStartNew)choices.push({action:'start-new',label:'Start a new private vault…',danger:true});
   const action=await dialogs.choice(RECOVERY_TITLE,recoveryHtml(d,note),choices);
   if(!action)return {status:'cancelled'};
   note='';
   try{
    if(action==='look-again'){
     await store.rescan();
    }else if(action==='pick'){
     const found=store.diagnose().candidates;
     const answer=await dialogs.form('Pick a vault journal',[{name:'journal',label:'Vault journal',type:'select',value:found[0]?.token,options:found.map(c=>({value:c.token,label:pickLabel(c)}))}],{ok:'Use this journal'});
     if(!answer)continue;
     await store.relinkToVault(answer.journal);
    }else if(action==='start-new'){
     const answer=await dialogs.form('Start a new private vault?',[{name:'phrase',label:`Type ${NEW_VAULT_PHRASE} to confirm`,type:'text',value:'',hint:NEW_VAULT_WARNING}],{ok:'Start new vault'});
     if(!answer)continue;
     await store.startNewVault({confirmation:answer.phrase});
    }else continue;
   }catch(error){
    note=action==='look-again'&&error?.code==='vault-missing'?'Still no private vault Journal was found.':plain(error);
    continue;
   }
   notify.info(action==='start-new'?'Headquarters started a new private vault from the public copy. Add your hirelings to the roster again.':'Headquarters found its private vault again.');
   onRecovered(action);
   return {status:'recovered',via:action};
  }
 }
 /** Opens the dialog for a GM when recovery applies. One dialog at a time; players get nothing. */
 function run(){
  if(!isGM())return Promise.resolve({status:'not-gm'});
  if(running)return running;
  running=loop().finally(()=>{running=null;});
  return running;
 }
 const available=()=>{try{return isGM()&&!store.isReady()&&store.diagnose().recoverable;}catch{return false;}};
 return Object.freeze({run,available,isOpen:()=>running!==null});
}
