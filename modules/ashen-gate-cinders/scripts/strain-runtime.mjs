/** Strain, Foundry side: the api.strain door, the config setting and long/short rest recovery.
 * Actor data: flags['ashen-gate-strain'].state (its own scope, unchanged since Skill Trees 0.15.0), written only by a GM client.
 * blocked(): a reason while this module must stay off (an older Skill Trees still runs its own Strain), else null. */
import {STRAIN_SCOPE,STRAIN_CONTRACT,CONFIG_SCHEMA,defaultConfig,validateConfig,normalizeConfig,normalizeState,applyChange,restRecovery,summarize} from './strain.mjs';
import {isLevelBackup,LEVEL_BACKUP_MESSAGE} from './cinder.mjs';

export const STRAIN_SETTING='strainConfig';
export const STRAIN_HOOK='ashenGateStrain.changed';
const CONFIG_ROW={id:'STRAIN-CONFIG',name:'Strain config'};

export function createStrain({module,onConfigChange=()=>{},recoveryBonus=()=>0,blocked=()=>null}){
  const config=()=>normalizeConfig(game.settings.get(module,STRAIN_SETTING));
  const readState=actor=>normalizeState(actor?.flags?.[STRAIN_SCOPE]?.state);
  const requireReader=actor=>{
    if(!actor)throw Error('No Actor');
    requireOn();
    if(!game.user?.isGM&&!actor.isOwner)throw Error('Actor access denied');
  };
  const requireOn=()=>{const why=blocked();if(why)throw Error(why);};
  const requireGM=()=>{requireOn();if(!game.user?.isGM)throw Error('GM only: Strain changes run on the GM client');};

  // One change at a time per character, so two quick calls cannot both read the same old value.
  const locks=new Map();
  const withLock=(id,fn)=>{
    const run=(locks.get(id)??Promise.resolve()).then(fn),tail=run.catch(()=>{});
    locks.set(id,tail);tail.then(()=>{if(locks.get(id)===tail)locks.delete(id);});
    return run;
  };
  async function change(actor,op,amount,options={}){
    requireGM();
    if(!actor||typeof actor.update!=='function')throw Error('No Actor');
    if(isLevelBackup(actor))throw Error(LEVEL_BACKUP_MESSAGE);
    return withLock(actor.id,async()=>{
      const {state,result}=applyChange(readState(actor),config(),{...options,op,amount,at:Date.now(),by:game.user.id});
      // One update writes the value and its history entry together: the change is saved whole or not at all.
      // setFlag only accepts active module ids, so the own-scope flag is written with a plain update.
      if(result.changed)await actor.update({[`flags.${STRAIN_SCOPE}.state`]:state});
      return result;
    });
  }

  function previewConfigImport(file){
    requireGM();
    const {errors,warnings,config:next}=validateConfig(file);
    if(errors.length)return {errors,warnings,rows:[]};
    const same=JSON.stringify(next)===JSON.stringify(config());
    return {errors:[],warnings,rows:[{...CONFIG_ROW,action:same?'skip':'update',reason:same?'Same as the current config.':'Replaces the band names, Backfire schedule and Strain rules. Character Strain is not changed.'}]};
  }
  async function importConfig(file){
    requireGM();
    const {errors,warnings,config:next}=validateConfig(file);
    if(errors.length)return {created:[],updated:[],skipped:[],failed:[{id:CONFIG_ROW.id,reason:errors.join('; ')}],warnings};
    if(JSON.stringify(next)===JSON.stringify(config()))return {created:[],updated:[],skipped:[{id:CONFIG_ROW.id,reason:'Same as the current config.'}],failed:[],warnings};
    await game.settings.set(module,STRAIN_SETTING,next);
    return {created:[],updated:[CONFIG_ROW.id],skipped:[],failed:[],warnings};
  }
  async function resetConfig(){requireGM();await game.settings.set(module,STRAIN_SETTING,null);return config();}

  // Long/short rest: dnd5e posts a "rest" chat message for the character. The active GM's client takes the recovery off once
  // per message (opId rest:<message id>), only for a character the message's author owns. No message (rest chat off) = no recovery.
  async function onRestMessage(message){
    if(!game.user?.isGM||game.users?.activeGM?.id!==game.user.id||blocked())return null;
    if(message?.type!=='rest')return null;
    const type=message.system?.type;if(!['long','short'].includes(type))return null;
    const actor=game.actors?.get?.(message.speaker?.actor);if(!actor)return null;
    const author=message.author;
    if(author&&!author.isGM&&actor.testUserPermission?.(author,'OWNER')!==true)return null;
    // strain.recovery modifiers (e.g. from Cinder perks) add to a rest that already recovers Strain.
    const base=config().rest_recovery[type]??0;
    let bonus=0;if(base>0){try{bonus=Number(recoveryBonus(actor))||0;}catch(error){console.error(`[${module}] Strain recovery bonus failed`,error);}}
    const amount=restRecovery(config(),type,bonus);
    if(amount<1||readState(actor).value<1)return null;
    try{
      return await change(actor,'remove',amount,{source:{module,kind:`rest_${type}`,ref:message.id},reason:type==='long'?'Long rest':'Short rest',opId:`rest:${message.id}`});
    }catch(error){console.error(`[${module}] Strain rest recovery failed`,error);ui.notifications?.error?.(`Strain: rest recovery for ${actor.name} failed: ${error?.message??error}`);return null;}
  }

  // Every client: tell subscribers when an Actor's Strain changed (from the latest history entry).
  function onUpdateActor(actor,changes){
    if(!changes?.flags?.[STRAIN_SCOPE]?.state||blocked())return;
    const s=readState(actor),last=s.history.at(-1)??null;
    Hooks.callAll(STRAIN_HOOK,{actorId:actor.id,from:last?last.to-last.delta:null,to:s.value,source:last?.source??null,opId:last?.opId??null});
  }

  const api={
    contract:STRAIN_CONTRACT,scope:STRAIN_SCOPE,configSchema:CONFIG_SCHEMA,hook:STRAIN_HOOK,
    /** {value, band:{label,from,to}, chance, guaranteed, normalUseBackfires, guaranteeAt, hardMax}. GM or the Actor's owner. */
    get:actor=>{requireReader(actor);return summarize(config(),readState(actor));},
    history:actor=>{requireReader(actor);return readState(actor).history;},
    config:()=>config(),
    defaultConfig:()=>defaultConfig(),
    validateConfig:file=>validateConfig(file),
    add:(actor,amount,options)=>change(actor,'add',amount,options),
    remove:(actor,amount,options)=>change(actor,'remove',amount,options),
    set:(actor,amount,options)=>change(actor,'set',amount,options),
    previewConfigImport,importConfig,resetConfig
  };
  return {
    api,config,readState,onRestMessage,onUpdateActor,
    register(){
      game.settings.register(module,STRAIN_SETTING,{scope:'world',config:false,type:Object,default:null,onChange:()=>onConfigChange()});
    }
  };
}
