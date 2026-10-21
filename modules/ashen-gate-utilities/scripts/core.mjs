/** Ashen Gate | Utilities 0.2.0-alpha pure session rules. No Foundry globals. */
export const ID = 'ashen-gate-utilities';
export const VERSION = '0.15.1';
export const SKILL_IDS = Object.freeze(['acr','ani','arc','ath','dec','his','ins','itm','inv','med','nat','prc','prf','per','rel','slt','ste','sur']);
export const ABILITY_IDS = Object.freeze(['str','dex','con','int','wis','cha']);
export const MAX_PARTICIPANTS = 24;
export const MAX_CONTRIBUTIONS = 5;
export const MAX_HISTORY = 30;
export const escapeHTML = x => String(x ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const unique = items => [...new Set(items)];
export const finished = slot => slot.status === 'accepted' || slot.status === 'skipped';
export function createSession({id,kind='group',name,actors,skills,rollsPerActor=1,dc=null,visibility='public',successText='',failureText='',createdBy,createdAt=Date.now()}) {
  if(!['group','request'].includes(kind))throw Error('Unknown interaction type.');
  const actorIds=unique(actors??[]).filter(s=>typeof s==='string'&&s.length>0);
  const allowed=unique(skills??[]).filter(s=>SKILL_IDS.includes(s)||ABILITY_IDS.includes(s));
  if(actorIds.length<1||actorIds.length>MAX_PARTICIPANTS)throw Error('Choose 1 to 24 characters.');
  if(allowed.length<1)throw Error('Select at least one permitted skill or ability.');
  if(!Number.isInteger(rollsPerActor)||rollsPerActor<1||rollsPerActor>MAX_CONTRIBUTIONS)throw Error('Invalid contribution count.');
  if(kind==='request'&&rollsPerActor!==1)throw Error('Roll Requests have one contribution per participant.');
  if(kind==='group'&&allowed.length<rollsPerActor)throw Error('The number of permitted skills must meet the contribution count.');
  if(dc!==null&&(!Number.isFinite(Number(dc))||Number(dc)<0||Number(dc)>100))throw Error('DC must be between 0 and 100.');
  if(!['public','private','blind'].includes(visibility))throw Error('Unknown visibility.');
  if(!id||!createdBy)throw Error('Missing session identity.');
  const slots=actorIds.flatMap(actorId=>Array.from({length:rollsPerActor},(_,index)=>({actorId,index,status:'pending',skill:null,total:null,userId:null,proofMessageId:null})));
  return {schema:'ag-utilities-session/0.1',id:String(id),kind,name:String(name||'Untitled Check').slice(0,120),actors:actorIds,skills:allowed,rollsPerActor,dc:dc===null?null:Number(dc),visibility,successText:String(successText).slice(0,1000),failureText:String(failureText).slice(0,1000),createdAt,createdBy,status:'active',slots,audit:[],closedAt:null};
}
export function summary(session) {
  const accepted=session.slots.filter(x=>x.status==='accepted');
  const skipped=session.slots.filter(x=>x.status==='skipped').length;
  const total=accepted.reduce((sum,x)=>sum+x.total,0);
  const average=accepted.length?total/accepted.length:null;
  const complete=session.slots.every(finished);
  const result=!complete?'pending':accepted.length===0?'no-result':session.kind==='request'?'completed':session.dc===null?'completed':average>=session.dc?'success':'failure';
  return {accepted:accepted.length,skipped,pending:session.slots.length-accepted.length-skipped,totalSlots:session.slots.length,average,result};
}
export function acceptRoll(session,{actorId,skill,total,userId,proofMessageId,at=Date.now()}) {
  if(session.status!=='active')throw Error('This interaction is closed.');
  if(!session.actors.includes(actorId))throw Error('Actor is not participating.');
  if(!session.skills.includes(skill))throw Error('Skill is not permitted.');
  if(!Number.isFinite(total)||total<-100||total>1000)throw Error('Roll total is invalid.');
  if(!userId||!proofMessageId)throw Error('Native roll evidence is required.');
  if(session.slots.some(s=>s.proofMessageId===proofMessageId))throw Error('Roll message was already used.');
  const own=session.slots.filter(s=>s.actorId===actorId);
  if(session.kind==='group'&&own.some(s=>s.status==='accepted'&&s.skill===skill))throw Error('A character cannot repeat a skill in one Group Check.');
  const slot=own.find(s=>s.status==='pending');
  if(!slot)throw Error('No pending contributions remain for this character.');
  slot.status='accepted';slot.skill=skill;slot.total=total;slot.userId=userId;slot.proofMessageId=proofMessageId;
  session.audit.push({type:'roll',actorId,slot:slot.index,skill,total,userId,proofMessageId,at});
  if(summary(session).pending===0){session.status='completed';session.closedAt=at;}
  return session;
}
export function skipRoll(session,{actorId,reason='',userId,at=Date.now()}) {
  if(session.status!=='active')throw Error('This interaction is closed.');
  const slot=session.slots.find(s=>s.actorId===actorId&&s.status==='pending');
  if(!slot)throw Error('No pending contributions to skip.');
  slot.status='skipped';
  session.audit.push({type:'skip',actorId,slot:slot.index,reason:String(reason).slice(0,240),userId,at});
  if(summary(session).pending===0){session.status='completed';session.closedAt=at;}
  return session;
}
/** GM early completion: account for every unfilled slot explicitly, never silently discard rolls. */
export function resolveNow(session,{userId,reason='GM ended early',at=Date.now()}){
  if(session.status!=='active')throw Error('Only an active check can be ended.');
  if(!userId)throw Error('GM identity is required.');
  const pending=session.slots.filter(slot=>slot.status==='pending');
  for(const slot of pending){
    slot.status='skipped';
    session.audit.push({type:'skip',actorId:slot.actorId,slot:slot.index,userId,reason:String(reason).slice(0,240),at});
  }
  session.status='completed';session.closedAt=at;
  session.audit.push({type:'resolve-now',userId,at,pendingClosed:pending.length});
  return session;
}
export function voidRoll(session,{actorId,slotIndex,reason,userId,at=Date.now()}){
  if(!String(reason??'').trim())throw Error('Provide an audit reason.');
  const slot=session.slots.find(s=>s.actorId===actorId&&s.index===slotIndex&&s.status==='accepted');
  if(!slot)throw Error('Accepted contribution not found.');
  const prior={...slot};
  Object.assign(slot,{status:'pending',skill:null,total:null,userId:null,proofMessageId:null});
  session.status='active';session.closedAt=null;
  session.audit.push({type:'void',actorId,slot:slotIndex,prior,reason:String(reason).slice(0,240),userId,at});
  return session;
}
export function cancelSession(session,{userId,at=Date.now()}){
  if(session.status!=='active')throw Error('Only active sessions may be cancelled.');
  session.status='cancelled';session.closedAt=at;session.audit.push({type:'cancel',userId,at});return session;
}
/** Player presentation projection: no private roll totals for unrelated players. */
export function projectSession(session,{userId,isGM=false,ownedActorIds=[]}={}){
  const own=new Set(ownedActorIds);
  return {...session,successText:session.status==='completed'?session.successText:'',failureText:session.status==='completed'?session.failureText:'',
    audit:isGM?session.audit:[],slots:session.slots.map(s=>{
      const visible=isGM||session.kind==='group'||session.visibility==='public'||(session.visibility==='private'&&s.userId===userId);
      if(visible)return {...s,proofMessageId:isGM?s.proofMessageId:null};
      return {...s,total:null,skill:null,userId:null,proofMessageId:null};
    })};
}

/* ---- v0.3.0: Group Check bonus/advantage, tally, RollTable draw results, unknown statuses ---- */
export const formatBonus = n => Number.isFinite(n) ? (n >= 0 ? `+${n}` : `−${Math.abs(n)}`) : '—';
/** Skill check modifier as prepared by dnd5e (`system.skills.<id>.total`), or null if unavailable. */
export function skillBonus(actor, skill) {
  const total = Number(actor?.system?.skills?.[skill]?.total);
  return Number.isFinite(total) ? total : null;
}
const isOn = v => !['', '0', 'false', 'null', 'undefined'].includes(String(v ?? '').trim().toLowerCase());
const activeEffects = actor => {
  const list = typeof actor?.allApplicableEffects === 'function' ? [...actor.allApplicableEffects()] : [...(actor?.effects ?? [])];
  return list.filter(e => e && !e.disabled && !e.isSuppressed);
};
/**
 * Advantage/disadvantage a skill check starts with.
 * dnd5e already folds sheet settings and Active Effects into the prepared `roll.mode` of the skill and
 * its ability check (1 advantage, -1 disadvantage), so those are read first. Midi-QOL style effect flags
 * are also honoured when present. Advantage and disadvantage cancel, as they do at the table.
 * Returns {mode: -1|0|1, sources: string[]}; the player can still override the preset.
 */
export function skillRollMode(actor, skill) {
  const sys = actor?.system, sk = sys?.skills?.[skill], ability = sk?.ability;
  const adv = [], dis = [];
  const note = (mode, label) => { if (mode > 0) adv.push(label); else if (mode < 0) dis.push(label); };
  note(Math.sign(Number(sk?.roll?.mode) || 0), 'skill setting');
  if (ability) note(Math.sign(Number(sys?.abilities?.[ability]?.check?.roll?.mode) || 0), `${String(ability).toUpperCase()} check setting`);
  const dnd5eKeys = [`system.skills.${skill}.roll.mode`, ability ? `system.abilities.${ability}.check.roll.mode` : null].filter(Boolean);
  const midi = new RegExp(`^flags\\.midi-qol\\.(advantage|disadvantage)\\.(all|skill\\.(all|${skill})${ability ? `|ability\\.check\\.(all|${ability})` : ''})$`);
  for (const effect of activeEffects(actor)) {
    for (const change of effect.changes ?? []) {
      const key = String(change.key ?? '');
      const m = midi.exec(key);
      if (m && isOn(change.value)) note(m[1] === 'advantage' ? 1 : -1, effect.name ?? effect.label ?? 'effect');
      else if (dnd5eKeys.includes(key)) {
        // Already counted via the prepared value above; just name the effect that set it.
        const v = Math.sign(Number(change.value) || 0), list = v > 0 ? adv : v < 0 ? dis : null;
        if (list && list.length) list[list.length - 1] += ` (${effect.name ?? effect.label ?? 'effect'})`;
      }
    }
  }
  const mode = adv.length && dis.length ? 0 : adv.length ? 1 : dis.length ? -1 : 0;
  return {mode, sources: [...adv.map(s => `Advantage: ${s}`), ...dis.map(s => `Disadvantage: ${s}`)]};
}

/** Chat-ready tally of a finished Group Check (GM whisper). `names(actorId)` and `skillLabel(skillId)` are supplied by the caller. */
export function tallyHTML(session, {actorName = id => id, skillLabel = id => id} = {}) {
  const sum = summary(session), E = escapeHTML;
  const verdict = session.dc === null ? 'Recorded' : sum.result === 'success' ? 'Success' : sum.result === 'failure' ? 'Failure' : 'No result';
  const rows = session.actors.map(id => {
    const mine = session.slots.filter(s => s.actorId === id);
    const parts = mine.map(s => s.status === 'accepted' ? `${E(skillLabel(s.skill))} <strong>${E(s.total)}</strong>` : s.status === 'skipped' ? '<em>skipped</em>' : '<em>no roll</em>');
    return `<li><strong>${E(actorName(id))}</strong>: ${parts.join(' · ')}</li>`;
  }).join('');
  const avg = sum.average === null ? '—' : sum.average.toFixed(1);
  return `<div class="ag-utilities-tally"><h3>${E(session.name)} — ${E(verdict)}</h3><p>Average <strong>${E(avg)}</strong>${session.dc === null ? '' : ` vs DC <strong>${E(session.dc)}</strong>`} · ${sum.accepted} roll(s) counted, ${sum.skipped} skipped</p><ul>${rows}</ul></div>`;
}

const stripTags = html => String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
/**
 * Describes one drawn TableResult. Document and compendium results carry a UUID (`documentUuid` in V13+);
 * those are returned as links so chat can enrich them.
 */
export function describeTableResult(result) {
  const uuid = result?.documentUuid ?? result?.documentUri ?? null;
  const name = String(result?.name ?? '').trim();
  const text = stripTags(result?.description ?? result?.text ?? '');
  if (typeof uuid === 'string' && uuid) {
    const label = name || text || uuid;
    return {kind: 'document', uuid, label, chat: `@UUID[${uuid}]{${label.replace(/[{}\[\]]/g, '')}}`, img: result?.img ?? null};
  }
  const body = [name, text].filter(Boolean).join(': ');
  return {kind: 'text', uuid: null, label: body, chat: body, img: null};
}

/**
 * Effects on an Actor that put `statusId` on `actor.statuses`, for statuses the module does not know.
 * Each entry says where the effect lives so the GM can see its source and remove it.
 */
export function resolveStatusSources(actor, statusId) {
  const out = [];
  const all = typeof actor?.allApplicableEffects === 'function' ? [...actor.allApplicableEffects()] : [...(actor?.effects ?? [])];
  for (const effect of all) {
    const st = effect?.statuses;
    const has = st instanceof Set ? st.has(statusId) : Array.isArray(st) ? st.includes(statusId) : false;
    if (!has && effect?.getFlag?.('core', 'statusId') !== statusId) continue;
    const parent = effect.parent;
    out.push({effect, effectId: effect.id, name: effect.name ?? effect.label ?? statusId, origin: typeof effect.origin === 'string' ? effect.origin : null,
      onActor: !parent || parent === actor || parent.documentName === 'Actor', parentName: parent?.name ?? null, disabled: Boolean(effect.disabled)});
  }
  return out;
}
/** Remove a status the module does not know: delete effects on the Actor, disable ones inherited from an Item. */
export async function removeUnknownStatus(actor, statusId) {
  const sources = resolveStatusSources(actor, statusId);
  if (!sources.length) throw Error(`No active effect on ${actor?.name ?? 'this character'} provides "${statusId}". It may come from the system or another module; remove it in that source.`);
  const own = sources.filter(s => s.onActor), inherited = sources.filter(s => !s.onActor);
  if (own.length) await actor.deleteEmbeddedDocuments('ActiveEffect', own.map(s => s.effectId));
  for (const s of inherited) await s.effect.update({disabled: true});
  return {deleted: own.length, disabled: inherited.length, sources};
}

/* ---- v0.4.0: shared conditions view, per-character removal locks, overlay ---- */
const hasStatus = (actor, id) => { const st = actor?.statuses; return st instanceof Set ? st.has(id) : Array.isArray(st) ? st.includes(id) : false; };
/** Removal is locked unless the GM unlocked the character. `unlocks` is the world setting {actorId: true}. */
export const isUnlocked = (unlocks, actorId) => unlocks?.[actorId] === true;
export function withUnlocked(unlocks, actorId, unlocked) {
  if (typeof actorId !== 'string' || !actorId) throw Error('Character id required.');
  const next = {...(unlocks ?? {})};
  if (unlocked) next[actorId] = true; else delete next[actorId];
  return next;
}
/**
 * Whether `user` may remove `statusId` from `actor`. The GM always may. Anyone else must own the
 * character, the GM must have unlocked it, and the status must be a native one: Custom statuses are
 * removed by deleting or disabling their source effect, which stays a GM decision.
 */
export function removalDecision({user, actor, statusId, unlocks, nativeIds = []}) {
  if (!user) return {ok: false, reason: 'Unknown user.'};
  if (!actor) return {ok: false, reason: 'Character not found.'};
  if (!hasStatus(actor, statusId)) return {ok: false, reason: `${actor.name} does not have that condition.`};
  if (user.isGM) return {ok: true, reason: ''};
  if (!actor.testUserPermission?.(user, 'OWNER')) return {ok: false, reason: `You do not own ${actor.name}.`};
  if (!isUnlocked(unlocks, actor.id)) return {ok: false, reason: `The GM has locked condition removal for ${actor.name}.`};
  if (!nativeIds.includes(statusId)) return {ok: false, reason: 'Custom statuses can only be removed by the GM.'};
  return {ok: true, reason: ''};
}
/** Overlay model: one group per character that has a condition, in the given order. */
export function conditionGroups(actors, {label = id => id, isNative = () => true, canRemove = () => false} = {}) {
  return actors.map(actor => ({actorId: actor.id, name: actor.name, conditions: [...(actor.statuses ?? [])].map(id => ({id, label: label(id), custom: !isNative(id), removable: Boolean(canRemove(actor, id))}))}))
    .filter(g => g.conditions.length);
}

/* ---- v0.5.0: party stash rows and the take-out consent poll ---- */
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
/** Display row for one stash Item. Weight and value are per item, as dnd5e stores them. */
export function stashRow(item, {typeLabel = t => t, electrum = true} = {}) {
  const sys = item?.system ?? {};
  const w = sys.weight !== null && typeof sys.weight === 'object' ? sys.weight : {value: sys.weight, units: ''};
  const weight = num(w.value), price = sys.price !== null && typeof sys.price === 'object' ? sys.price : {value: sys.price, denomination: 'gp'};
  const value = num(price.value);
  return {id: item?.id, uuid: item?.uuid ?? null, img: typeof item?.img === 'string' ? item.img : null, name: String(item?.name ?? 'Unnamed Item'),
    quantity: num(sys.quantity) ?? 1, weight: weight ? `${weight} ${w.units || 'lb'}` : '—', value: value ? priceText(value, price.denomination || 'gp', electrum) : '—',
    type: item?.type ?? 'item', typeLabel: typeLabel(item?.type ?? 'item')};
}
/** 0.13.2: an ep price is shown in gp, sp or cp (same value) while electrum is off; the item itself is not changed. */
export function priceText(value, denomination = 'gp', electrum = true) {
  if (denomination !== 'ep' || electrum) return `${value} ${denomination}`;
  const cp = Math.round(value * 50 * 1e6) / 1e6;
  return cp % 100 === 0 ? `${cp / 100} gp` : cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`;
}
export const CONSENT_TIMEOUT_MS = 60000;
/** Who must approve a take-out: every other active, non-GM user. */
export const consentVoters = (users, requesterId) => [...(users ?? [])].filter(u => u?.active && !u.isGM && u.id !== requesterId).map(u => u.id);
export function createPoll({id, requesterId, voters, now = Date.now(), timeoutMs = CONSENT_TIMEOUT_MS}) {
  if (!id || !requesterId) throw Error('Missing request identity.');
  return {id: String(id), requesterId, voters: [...new Set(voters ?? [])].filter(v => v !== requesterId), votes: {}, expiresAt: now + timeoutMs};
}
/** Records one voter's answer. A deny is final; only listed voters may vote. */
export function recordVote(poll, {userId, vote}) {
  if (!poll.voters.includes(userId)) throw Error('You were not asked to approve this request.');
  if (!['accept', 'deny'].includes(vote)) throw Error('Vote must be accept or deny.');
  if (poll.votes[userId] !== 'deny') poll.votes[userId] = vote;
  return poll;
}
/** 'denied' as soon as anyone denies, 'approved' when every voter accepted (or there are none), 'expired' at the deadline. */
export function pollOutcome(poll, now = Date.now()) {
  const votes = poll.voters.map(id => poll.votes[id]);
  if (votes.includes('deny')) return 'denied';
  if (votes.every(v => v === 'accept')) return 'approved';
  return now >= poll.expiresAt ? 'expired' : 'pending';
}

/* ---- v0.6.0: stash history log ---- */
export const STASH_HISTORY_CAP = 500;
/** How a stash move was approved. `gm` = the GM moved it; `not-required` = no vote was needed. */
export const HISTORY_APPROVALS = ['accepted', 'denied', 'timed-out', 'not-required', 'gm'];
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
/** One history record. `moved` is false for a denied or timed-out take-out (the item stayed). */
export function historyEntry({id, kind, approval, user, actor, item, worldTime = null, realTime = Date.now()} = {}) {
  if (!['deposit', 'withdraw'].includes(kind)) throw new TypeError('History kind must be deposit or withdraw.');
  if (!HISTORY_APPROVALS.includes(approval)) throw new TypeError('Unknown history approval.');
  const row = item ?? {};
  return {id: String(id ?? `h${realTime}`), kind, approval, moved: approval !== 'denied' && approval !== 'timed-out',
    userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', actorId: str(actor?.id), actorName: str(actor?.name),
    itemName: str(row.name) ?? 'Unnamed Item', itemUuid: str(row.uuid, 400), img: str(row.img, 400), quantity: num(row.quantity) ?? 1,
    ...(num(row.contents) > 0 ? {contents: num(row.contents)} : {}),
    worldTime: num(worldTime), realTime: num(realTime) ?? Date.now()};
}
/** 0.13.1: " (with 3 items inside)" for a container entry; '' for anything else, including entries from before 0.13.1. */
export const contentsNote = n => (num(n) > 0 ? ` (with ${n} ${n === 1 ? 'item' : 'items'} inside)` : '');
/* ---- 0.13.1: a container moves with everything inside it ---- */
/**
 * The item followed by everything inside it, nested containers included, parents before children. dnd5e keeps a
 * container's contents as separate Items on the same Actor (or in the world) whose `system.container` is the
 * container's id; `items` is that collection. A cycle or a repeated id is visited once.
 */
export function containedItems(item, items) {
  const all = [...(items ?? [])], out = [item], seen = new Set([item?.id]);
  for (let i = 0; i < out.length; i++) {
    for (const c of all) if (c?.system?.container === out[i].id && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out;
}
/**
 * Creation data for moving `item` and its contents: every copy gets a fresh `_id` (create with `keepId`) and each
 * `system.container` points at the new id of its copied container. The moved item itself leaves any container it was
 * in on the source. Everything else in the data is kept as is. `strip` lists top-level keys to drop (e.g. `folder`).
 */
export function moveBundle(item, items, {randomId, strip = []} = {}) {
  if (typeof randomId !== 'function') throw new TypeError('moveBundle needs randomId.');
  const docs = containedItems(item, items), ids = new Map(docs.map(d => [d.id, randomId()]));
  const data = docs.map((d, i) => {
    const o = d.toObject();
    for (const k of strip) delete o[k];
    o._id = ids.get(d.id);
    if (i > 0) o.system = {...(o.system ?? {}), container: ids.get(d.system.container)};
    else if (o.system?.container) o.system = {...o.system, container: null};
    return o;
  });
  return {sourceIds: docs.map(d => d.id), data, contents: docs.length - 1};
}
/** Newest last; the oldest entries are trimmed once the cap is passed. Never mutates the input. */
export function appendHistory(list, entry, cap = STASH_HISTORY_CAP) {
  const next = [...(Array.isArray(list) ? list : []), entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
/** Short label for the History panel. */
export function approvalLabel(entry) {
  return {accepted: 'Party accepted', denied: 'Party denied', 'timed-out': 'No answer in time', 'not-required': 'No vote needed', gm: 'GM'}[entry?.approval] ?? '';
}

/* ---- v0.8.0: GM gold awards (dnd5e system.currency.gp), logged in stash history with Undo ---- */
export const GOLD_MAX = 1000000;
/** The actor's gp as dnd5e stores it, or null when the dnd5e currency path is missing. */
export function readGp(actor) {
  const cur = actor?.system?.currency;
  if (!cur || typeof cur !== 'object') return null;
  if (cur.gp === undefined || cur.gp === null || cur.gp === '') return 0;
  const n = Number(cur.gp);
  return Number.isFinite(n) ? n : null;
}
/**
 * What each recipient gets. mode 'each': everyone gets `amount`. mode 'split': `amount` is shared evenly in
 * whole gp; the remainder is not paid to anyone (it stays with the GM) and is returned so it can be shown.
 * recipients: [{id, name, held}] with `held` (or the 0.8 name `gp`) read fresh from the actor for the chosen coin.
 * v0.10.0: `coin` picks the dnd5e denomination (cp/sp/ep/gp/pp, default gp); nothing is converted.
 * v0.13.2: `electrum: false` (GM Setup "Use electrum" off) refuses ep.
 */
export function planGoldAward({amount, mode = 'each', recipients, coin = 'gp', electrum = true} = {}) {
  const amt = Number(amount);
  if (!COINS.includes(coin)) throw Error(`Coin must be one of ${COINS.join(', ')}.`);
  if (coin === 'ep' && !electrum) throw Error(ELECTRUM_OFF);
  if (!Number.isInteger(amt) || amt < 1 || amt > GOLD_MAX) throw Error(`${coin === 'gp' ? 'Gold' : COIN_LABELS[coin]} must be a whole number from 1 to ${GOLD_MAX}.`);
  if (!['each', 'split'].includes(mode)) throw Error('Mode must be "each" or "split".');
  const list = [...new Map((recipients ?? []).filter(r => r?.id).map(r => [r.id, {...r, held: r.held ?? r.gp}])).values()];
  if (!list.length) throw Error('Choose at least one character.');
  for (const r of list) if (!Number.isFinite(r.held)) throw Error(`${r.name ?? r.id} has no dnd5e ${coinWord(coin)} (system.currency.${coin}).`);
  const share = mode === 'each' ? amt : Math.floor(amt / list.length);
  if (share < 1) throw Error(`${amt} ${coin} cannot be split between ${list.length} characters in whole ${coin}.`);
  const remainder = mode === 'each' ? 0 : amt - share * list.length;
  return {amount: amt, mode, coin, share, remainder, total: share * list.length,
    recipients: list.map(r => ({actorId: r.id, actorName: String(r.name ?? ''), before: r.held, added: share, after: r.held + share}))};
}
/** History record of a gold award. Lives in the stash history list next to deposits/withdrawals. */
export function goldAwardEntry({id, plan, reason = '', isPublic = false, user, worldTime = null, realTime = Date.now()} = {}) {
  if (!plan?.recipients?.length) throw new TypeError('A gold award needs recipients.');
  return {id: String(id ?? `g${realTime}`), kind: 'gold-award', approval: 'gm', moved: true,
    userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', amount: plan.amount, mode: plan.mode, coin: COINS.includes(plan.coin) ? plan.coin : 'gp', share: plan.share, remainder: plan.remainder,
    reason: String(reason ?? '').trim().slice(0, 240), public: Boolean(isPublic),
    recipients: plan.recipients.map(r => ({actorId: r.actorId, actorName: str(r.actorName) ?? '', before: r.before, added: r.added, after: r.after, undone: false})),
    undo: [], worldTime: num(worldTime), realTime: num(realTime) ?? Date.now()};
}
/**
 * Undo decision per recipient. Only recipients not already undone are considered; each is reversed only if
 * the character still holds at least the coins that were added. `gpOf(actorId, coin)` returns the current amount
 * of the award's coin (gp for entries from before 0.10.0) or null when missing.
 */
export function planGoldUndo(entry, gpOf) {
  if (entry?.kind !== 'gold-award') throw Error('That history entry is not a gold award.');
  const open = (entry.recipients ?? []).filter(r => !r.undone), coin = entryCoin(entry);
  if (!open.length) throw Error(`This ${coin === 'gp' ? 'gold' : 'coin'} award was already undone.`);
  return open.map(r => {
    const gp = gpOf(r.actorId, coin);
    if (gp === undefined) return {...r, ok: false, reason: `${r.actorName} no longer exists.`};
    if (gp === null) return {...r, ok: false, reason: `${r.actorName} has no dnd5e ${coinWord(coin)} (system.currency.${coin}).`};
    if (gp < r.added) return {...r, ok: false, reason: `${r.actorName} has ${gp} ${coin}, fewer than the ${r.added} ${coin} awarded.`};
    return {...r, ok: true, reason: '', now: gp, next: gp - r.added};
  });
}
/** New entry with the reversed recipients marked; never mutates the input. */
export function applyGoldUndo(entry, results, {user, realTime = Date.now()} = {}) {
  const done = new Set(results.filter(r => r.ok).map(r => r.actorId));
  return {...entry, recipients: entry.recipients.map(r => done.has(r.actorId) ? {...r, undone: true} : r),
    undo: [...(entry.undo ?? []), {userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', realTime,
      results: results.map(r => ({actorId: r.actorId, actorName: r.actorName, ok: r.ok, reason: r.reason, removed: r.ok ? r.added : 0}))}]};
}
/** Short chat card for an award (GM whisper, or public if the GM ticked it). */
export function goldCardHTML(entry) {
  const E = escapeHTML, c = entryCoin(entry), how = entry.mode === 'split' ? `${E(entry.amount)} ${c} split evenly` : `${E(entry.share)} ${c} each`;
  const rows = entry.recipients.map(r => `<li><strong>${E(r.actorName)}</strong>: +${E(r.added)} ${c}</li>`).join('');
  return `<div class="ag-utilities-gold"><h3>${c === 'gp' ? 'Gold' : 'Coins'} awarded: ${how}</h3>${entry.reason ? `<p>${E(entry.reason)}</p>` : ''}<ul>${rows}</ul>${entry.remainder ? `<p>${E(entry.remainder)} ${c} left over was not handed out.</p>` : ''}</div>`;
}

/* ---- v0.9.0: one Rolls tab for Group Checks and Roll Requests ---- */
/** Start-form modes. 'group' tallies against the DC (a Group Check); 'individual' collects each roll (a Roll Request). */
export const ROLL_MODES = Object.freeze({group: 'group', individual: 'request'});
/** Window tab ids from before 0.9.0 ('checks', 'rolls') both open the single Rolls tab. */
export const normalizeTab = tab => (tab === 'checks' || tab === 'rolls' || !tab) ? 'rolls' : String(tab);
/**
 * Builds the session the Rolls start form asks for. Individual rolls take exactly one skill and one roll
 * per character, as Roll Requests always have; Group result keeps the Group Check rules in createSession.
 */
export function rollFormSession({mode = 'group', title = '', actors, skills, rollsPerActor = 1, dc = null, id, createdBy, createdAt} = {}) {
  const kind = ROLL_MODES[mode];
  if (!kind) throw Error('Choose Group result or Individual rolls.');
  const picked = unique(skills ?? []).filter(Boolean);
  if (kind === 'request' && picked.length !== 1) throw Error('Individual rolls ask for one skill: tick exactly one.');
  const name = String(title ?? '').trim() || (kind === 'group' ? 'New Group Check' : 'New Roll Request');
  return createSession({id, kind, name, actors, skills: picked, rollsPerActor: kind === 'group' ? Number(rollsPerActor) : 1, dc, visibility: 'public', createdBy, createdAt});
}

/* ---- v0.10.0: party purse (dnd5e system.currency on the stash Actor), coin moves, GM adjust, Undo ---- */
/** dnd5e currency keys, lowest to highest. Shown as five separate counters; nothing is ever converted. */
export const COINS = Object.freeze(['cp', 'sp', 'ep', 'gp', 'pp']);
export const COIN_LABELS = Object.freeze({cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum'});
const coinWord = coin => (coin === 'gp' ? 'gold' : String(COIN_LABELS[coin] ?? coin).toLowerCase());
/** Coin of a history entry; gold awards from before 0.10.0 have none and were gp. */
export const entryCoin = entry => (COINS.includes(entry?.coin) ? entry.coin : 'gp');
/** One coin as dnd5e stores it (blank counts as 0), or null when the dnd5e currency path is missing. */
export function readCoin(actor, coin) {
  if (!COINS.includes(coin)) return null;
  const cur = actor?.system?.currency;
  if (!cur || typeof cur !== 'object') return null;
  const v = cur[coin];
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** All five coins, or null when the actor has no dnd5e currency. */
export function readCoins(actor) {
  if (!actor?.system?.currency || typeof actor.system.currency !== 'object') return null;
  return Object.fromEntries(COINS.map(c => [c, readCoin(actor, c) ?? 0]));
}
const wholeAmount = (amount, {min = 1} = {}) => {
  const n = Number(amount);
  if (amount === '' || amount === null || !Number.isInteger(n) || n < min || n > GOLD_MAX) throw Error(`Amount must be a whole number from ${min} to ${GOLD_MAX}.`);
  return n;
};
const checkCoin = (coin, electrum = true) => { if (!COINS.includes(coin)) throw Error(`Coin must be one of ${COINS.join(', ')}.`); if (coin === 'ep' && !electrum) throw Error(ELECTRUM_OFF); return coin; };
/**
 * A character ↔ purse move. 'deposit' takes coins from the character into the purse; 'take' the reverse.
 * Never more than the giver holds, so neither side can go negative. `actorHas`/`purseHas` are the current amounts.
 */
export function planCoinMove({kind, coin, amount, actorHas, purseHas, actorName = 'The character', electrum = true} = {}) {
  if (!['deposit', 'take'].includes(kind)) throw Error('Move must be deposit or take.');
  checkCoin(coin, electrum);const amt = wholeAmount(amount);
  if (!Number.isFinite(actorHas)) throw Error(`${actorName} has no dnd5e ${coinWord(coin)} (system.currency.${coin}).`);
  if (!Number.isFinite(purseHas)) throw Error(`The party purse has no dnd5e currency (system.currency.${coin}).`);
  if (kind === 'deposit' && actorHas < amt) throw Error(`${actorName} has ${actorHas} ${coin}, fewer than ${amt} ${coin}.`);
  if (kind === 'take' && purseHas < amt) throw Error(`The party purse has ${purseHas} ${coin}, fewer than ${amt} ${coin}.`);
  const sign = kind === 'deposit' ? 1 : -1;
  return {kind, coin, amount: amt, actorBefore: actorHas, actorAfter: actorHas - sign * amt, purseBefore: purseHas, purseAfter: purseHas + sign * amt};
}
/** GM purse change: 'add', 'remove' (never below 0) or 'set' (0 allowed). */
export function planPurseAdjust({op, coin, amount, purseHas, electrum = true} = {}) {
  if (!['add', 'remove', 'set'].includes(op)) throw Error('Adjust must be add, remove or set.');
  checkCoin(coin, electrum);const amt = wholeAmount(amount, {min: op === 'set' ? 0 : 1});
  if (!Number.isFinite(purseHas)) throw Error(`The party purse has no dnd5e currency (system.currency.${coin}).`);
  if (op === 'remove' && purseHas < amt) throw Error(`The party purse has ${purseHas} ${coin}, fewer than ${amt} ${coin}.`);
  const after = op === 'add' ? purseHas + amt : op === 'remove' ? purseHas - amt : amt;
  if (after === purseHas) throw Error(`The party purse already has ${purseHas} ${coin}.`);
  return {op, coin, amount: amt, purseBefore: purseHas, purseAfter: after};
}
export const PURSE_KINDS = Object.freeze(['purse-deposit', 'purse-take', 'purse-adjust']);
/** History record for the purse. `plan` comes from planCoinMove or planPurseAdjust. A denied/timed-out take has moved: false. */
export function purseEntry({id, kind, approval, plan, user, actor = null, reason = '', worldTime = null, realTime = Date.now()} = {}) {
  if (!PURSE_KINDS.includes(kind)) throw new TypeError('Unknown purse history kind.');
  if (!HISTORY_APPROVALS.includes(approval)) throw new TypeError('Unknown history approval.');
  if (!plan || !COINS.includes(plan.coin)) throw new TypeError('A purse entry needs a coin plan.');
  return {id: String(id ?? `p${realTime}`), kind, approval, moved: approval !== 'denied' && approval !== 'timed-out',
    userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', actorId: str(actor?.id), actorName: str(actor?.name),
    coin: plan.coin, amount: plan.amount, op: kind === 'purse-adjust' ? plan.op : null,
    purseBefore: num(plan.purseBefore), purseAfter: num(plan.purseAfter), actorBefore: num(plan.actorBefore ?? null), actorAfter: num(plan.actorAfter ?? null),
    reason: String(reason ?? '').trim().slice(0, 240), undone: false, undo: [], worldTime: num(worldTime), realTime: num(realTime) ?? Date.now()};
}
/** Whether the GM can still try Undo on this entry: GM adjustments and completed takes, once. */
export const purseUndoable = h => (h?.kind === 'purse-adjust' || (h?.kind === 'purse-take' && h.moved === true)) && !h.undone && Number.isFinite(h.purseAfter) && Number.isFinite(h.purseBefore);
/**
 * Undo decision, same refusal rules as gold awards: nothing goes negative and nothing is undone twice.
 * Adjust: put the purse back by the same difference (refused if those coins have since left the purse).
 * Take: move the coins from the character back to the purse (refused if the character no longer holds them).
 * `purseHas` / `actorHas` are current amounts (`undefined` = missing document, null = no dnd5e currency).
 */
export function planPurseUndo(entry, {purseHas, actorHas} = {}) {
  if (!PURSE_KINDS.includes(entry?.kind)) throw Error('That history entry is not a purse change.');
  if (entry.undone) throw Error('This purse change was already undone.');
  if (!purseUndoable(entry)) throw Error(entry.kind === 'purse-deposit' ? 'Deposits are not undone here; the player can take the coins back.' : 'This purse change cannot be undone.');
  const c = entry.coin, refuse = reason => ({ok: false, reason});
  if (purseHas === undefined) return refuse('The party stash no longer exists.');
  if (!Number.isFinite(purseHas)) return refuse(`The party purse has no dnd5e currency (system.currency.${c}).`);
  if (entry.kind === 'purse-adjust') {
    const delta = entry.purseAfter - entry.purseBefore, next = purseHas - delta;
    if (next < 0) return refuse(`The party purse has ${purseHas} ${c}, fewer than the ${delta} ${c} added.`);
    return {ok: true, reason: '', purseNext: next, change: -delta};
  }
  if (actorHas === undefined) return refuse(`${entry.actorName ?? 'The character'} no longer exists.`);
  if (!Number.isFinite(actorHas)) return refuse(`${entry.actorName} has no dnd5e ${coinWord(c)} (system.currency.${c}).`);
  if (actorHas < entry.amount) return refuse(`${entry.actorName} has ${actorHas} ${c}, fewer than the ${entry.amount} ${c} taken.`);
  return {ok: true, reason: '', purseNext: purseHas + entry.amount, actorNext: actorHas - entry.amount, change: entry.amount};
}
/** New entry with the undo attempt recorded (and marked undone when it worked); never mutates the input. */
export function applyPurseUndo(entry, result, {user, realTime = Date.now()} = {}) {
  return {...entry, undone: entry.undone || result.ok === true,
    undo: [...(entry.undo ?? []), {userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', realTime, ok: result.ok === true, reason: String(result.reason ?? '')}]};
}
/** History line for a purse entry. */
export function purseLine(h) {
  const amt = `${h.amount} ${h.coin}`, who = `${h.userName}${h.actorName ? ` (${h.actorName})` : ''}`;
  if (h.kind === 'purse-deposit') return `${who} put ${amt} in the party purse`;
  if (h.kind === 'purse-take') return h.moved ? `${who} took ${amt} from the party purse` : `${who} tried to take ${amt} from the party purse`;
  return h.op === 'set' ? `${h.userName} set the party purse ${h.coin} to ${h.amount}` : `${h.userName} ${h.op === 'add' ? 'added' : 'removed'} ${amt} ${h.op === 'add' ? 'to' : 'from'} the party purse`;
}

/* ---- 0.13.2: GM Setup "Use electrum" (world setting, default off). Off: ep is left out of every coin choice and
   coin display, except a balance that still holds ep, which keeps a dimmed ep line until the GM converts it.
   The purse still stores ep (dnd5e system.currency.ep); nothing is ever converted without the GM confirming. ---- */
export const ELECTRUM_OFF = 'Electrum is turned off in Utilities GM Setup.';
export const EP_IN_SP = 5, EP_IN_CP = 50;
export const CP_VALUE = Object.freeze({cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000});
/** Total value of a coin set in copper. */
export const coinValueCp = coins => COINS.reduce((n, c) => n + (Number(coins?.[c]) || 0) * CP_VALUE[c], 0);
/** Coins offered in a choice (Award Gold, Deposit/Take, Adjust): no ep while electrum is off. */
export const coinChoices = (electrum = true) => (electrum ? [...COINS] : COINS.filter(c => c !== 'ep'));
/** True when a balance still holds ep although electrum is off: show the dimmed ep line, never hide the money. */
export const strandedElectrum = (coins, electrum = true) => !electrum && Number(coins?.ep) > 0;
/** Coin counters to show for a balance. */
export const shownCoins = (coins, electrum = true) => (electrum || strandedElectrum(coins, electrum) ? [...COINS] : coinChoices(false));
/**
 * GM conversion of all the purse's electrum. to 'sp': each ep → 5 sp. to 'gp': each pair of ep → 1 gp and an odd
 * one → 5 sp. Value is kept exactly (1 ep = 5 sp = 50 cp); `coins` is the purse as readCoins gives it.
 */
export function planElectrumConvert({to, coins} = {}) {
  if (!['sp', 'gp'].includes(to)) throw Error('Convert electrum to silver (sp) or gold (gp).');
  if (!coins || typeof coins !== 'object') throw Error('The party purse has no dnd5e currency (system.currency).');
  const before = Object.fromEntries(COINS.map(c => [c, Number(coins[c]) || 0])), ep = before.ep;
  if (!Number.isInteger(ep) || ep < 1) throw Error('The party purse holds no electrum to convert.');
  const addGp = to === 'gp' ? Math.floor(ep / 2) : 0, addSp = to === 'gp' ? (ep % 2) * EP_IN_SP : ep * EP_IN_SP;
  const after = {...before, ep: 0, sp: before.sp + addSp, gp: before.gp + addGp};
  if (coinValueCp(before) !== coinValueCp(after)) throw Error('That conversion would change the purse value; nothing was changed.');
  return {to, ep, addSp, addGp, valueCp: ep * EP_IN_CP, before, after};
}
const gotText = (gp, sp) => [gp ? `${gp} gp` : '', sp ? `${sp} sp` : ''].filter(Boolean).join(' + ');
/** Confirmation preview lines for a conversion plan. */
export function convertPreview(plan) {
  const {before: b, after: a} = plan;
  return [`Convert ${plan.ep} ep → ${gotText(plan.addGp, plan.addSp)}.`, `Electrum: ${b.ep} → ${a.ep} ep`,
    ...(plan.addGp ? [`Gold: ${b.gp} → ${a.gp} gp`] : []), ...(plan.addSp ? [`Silver: ${b.sp} → ${a.sp} sp`] : []),
    `Value kept exactly: ${plan.valueCp} cp (1 ep = 5 sp = 50 cp). Total purse value ${coinValueCp(b)} cp before and after.`];
}
/** History record of a conversion; lives in the stash history next to the other purse rows. */
export function convertEntry({id, plan, user, reason = '', worldTime = null, realTime = Date.now()} = {}) {
  if (!plan?.ep) throw new TypeError('A conversion entry needs a conversion plan.');
  return {id: String(id ?? `x${realTime}`), kind: 'purse-convert', approval: 'gm', moved: true, userId: str(user?.id), userName: str(user?.name) ?? 'Unknown',
    coin: 'ep', amount: plan.ep, to: plan.to, addSp: plan.addSp, addGp: plan.addGp, valueCp: plan.valueCp, before: {...plan.before}, after: {...plan.after},
    reason: str(reason, 300) ?? '', worldTime: num(worldTime), realTime, undone: false, undo: []};
}
export const convertLine = h => `${h.userName} converted ${h.amount} ep to ${gotText(h.addGp, h.addSp)} in the party purse (value kept: ${h.valueCp} cp)`;
/** Undo puts the ep back and removes the coins it added; refused if those coins have since left the purse. */
export function planConvertUndo(entry, coins) {
  if (entry?.kind !== 'purse-convert') throw Error('That history entry is not an electrum conversion.');
  if (entry.undone) throw Error('This conversion was already undone.');
  if (coins === undefined) return {ok: false, reason: 'The party stash no longer exists.'};
  if (!coins) return {ok: false, reason: 'The party purse has no dnd5e currency (system.currency).'};
  if (coins.gp < entry.addGp) return {ok: false, reason: `The party purse has ${coins.gp} gp, fewer than the ${entry.addGp} gp the conversion added.`};
  if (coins.sp < entry.addSp) return {ok: false, reason: `The party purse has ${coins.sp} sp, fewer than the ${entry.addSp} sp the conversion added.`};
  return {ok: true, reason: '', next: {ep: coins.ep + entry.amount, sp: coins.sp - entry.addSp, gp: coins.gp - entry.addGp}};
}
export function applyConvertUndo(entry, result, {user, realTime = Date.now()} = {}) {
  const attempt = {userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', realTime, ok: result.ok, reason: result.reason ?? ''};
  return {...entry, undone: entry.undone || result.ok, undo: [...(entry.undo ?? []), attempt]};
}

export const ROLL_OPEN_MODES = Object.freeze(['group', 'individual']);
/**
 * 0.13.0: normalises an api.rolls.open() request into Start Rolls form values. Nothing is started.
 * Unknown skills and characters are dropped; Individual rolls keep the first skill only.
 * dc: undefined → the form's default 15, null/'' → no DC. actorIds: undefined → the party default.
 */
export function rollPrefill({skills, dc, mode = 'group', actorIds, title = ''} = {}, {characterIds = []} = {}) {
  if (!ROLL_OPEN_MODES.includes(mode)) throw Error("mode must be 'group' or 'individual'.");
  let picked = [...new Set((Array.isArray(skills) ? skills : [skills]).map(String))].filter(s => SKILL_IDS.includes(s));
  if (!picked.length) throw Error(`Choose at least one skill (${SKILL_IDS.join(', ')}).`);
  if (mode === 'individual') picked = picked.slice(0, 1);
  let dcValue = 15;
  if (dc === null || dc === '') dcValue = null;
  else if (dc !== undefined) {
    dcValue = Number(dc);
    if (!Number.isInteger(dcValue) || dcValue < 0 || dcValue > 100) throw Error('DC must be a whole number from 0 to 100.');
  }
  const known = new Set(characterIds);
  const actors = actorIds === undefined || actorIds === null ? null : [...new Set([].concat(actorIds).map(String))].filter(id => known.has(id));
  return {mode, skills: picked, dc: dcValue, actorIds: actors, title: String(title ?? '').slice(0, 120)};
}

/* ---- 0.15.0: shops. Pure rules for the coming Shopping feature (no UI, nothing saved yet). All money is whole copper.
   While electrum is off, ep is never spent, counted, shown or given; ep a balance already holds is left alone. Change is
   never given in ep. Selling to a shop follows design §7c (S1–S9). ---- */
export const SHOP_ID_PREFIXES = Object.freeze(['SHOP', 'SVC', 'MLIST']);
export const SHOP_SCHEMA = 'ag-utilities-shop/1', SERVICE_SCHEMA = 'ag-utilities-service/1';
export const LINE_FLAVOUR_MAX = 300, SHOP_FLAVOUR_MAX = 1000, MERCHANT_NAME_MAX = 120;
export const NOT_WHOLE_CP = "That price isn't a whole number of copper.";
export const NO_CHANGE = "The merchant can't make change for this. Pay with the other purse, or ask the GM.";
export const SHOP_REFUSALS = Object.freeze({notOpen: 'This shop is not open for you.', changed: 'The shop changed. Look again.',
  soldOut: 'Sold out. Nothing was charged.', quantity: 'Choose a whole number of 1 or more.'});
/** Coins change is given in, largest first. Never ep. */
export const CHANGE_COINS = Object.freeze(['pp', 'gp', 'sp', 'cp']);
const refuse = (reason, extra = {}) => ({ok: false, reason, ...extra});
const byValueDesc = list => [...list].sort((a, b) => CP_VALUE[b] - CP_VALUE[a]);
/** Whole, non-negative counts for `list` (missing, blank, negative or broken counts read as 0). */
const coinSet = (coins, list) => Object.fromEntries(list.map(c => { const n = Math.floor(Number(coins?.[c])); return [c, Number.isFinite(n) && n > 0 ? n : 0]; }));

/** `SHOP-COPPER-KETTLE` from "The Copper Kettle"; `-2`, `-3`… while the id is taken or retired. */
export function shopIdFromName(name, taken = [], prefix = 'SHOP', retired = []) {
  if (!SHOP_ID_PREFIXES.includes(prefix)) throw new TypeError(`Id prefix must be one of ${SHOP_ID_PREFIXES.join(', ')}.`);
  let slug = String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  slug = slug.replace(/^THE-(?=.)/, '');
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-[^-]*$/, '') || slug.slice(0, 60);
  const base = `${prefix}-${slug || 'NEW'}`, used = new Set([...(taken ?? []), ...(retired ?? [])].map(String));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}
/** Prefix + upper-case letters, digits and single hyphens. */
export const validId = (id, prefix) => typeof id === 'string' && new RegExp(`^${prefix}(-[A-Z0-9]+)+$`).test(id);

/** `{value, denomination}` → whole copper (1 ep = 50 cp). Throws when it isn't whole copper or is below 0. */
export function priceToCp({value, denomination = 'gp'} = {}) {
  if (!COINS.includes(denomination)) throw Error(`Coin must be one of ${COINS.join(', ')}.`);
  const v = Number(value);
  if (value === '' || value === null || !Number.isFinite(v) || v < 0) throw Error('A price must be a number from 0.');
  const cp = v * CP_VALUE[denomination], whole = Math.round(cp);
  if (Math.abs(cp - whole) > 1e-6) throw Error(NOT_WHOLE_CP);
  return whole;
}
/** "15 sp" when it divides, else mixed from the price coin down ("1 gp 5 sp"). ep is shown as sp while electrum is off. */
export function shopPriceText(cp, coin = 'gp', {electrum = false} = {}) {
  let c = COINS.includes(coin) ? coin : 'gp';
  if (c === 'ep' && !electrum) c = 'sp';
  const n = Math.max(0, Math.round(Number(cp) || 0));
  if (n % CP_VALUE[c] === 0) return `${n / CP_VALUE[c]} ${c}`;
  const parts = [], lead = Math.floor(n / CP_VALUE[c]);
  if (lead) parts.push(`${lead} ${c}`);
  let rest = n - lead * CP_VALUE[c];
  for (const d of ['sp', 'cp']) if (CP_VALUE[d] < CP_VALUE[c]) { const k = Math.floor(rest / CP_VALUE[d]); if (k) parts.push(`${k} ${d}`); rest -= k * CP_VALUE[d]; }
  return parts.join(' ');
}
/** "2 gp 5 sp", largest coin first; "nothing" for none. */
export const coinsText = coins => byValueDesc(COINS).filter(c => Number(coins?.[c]) > 0).map(c => `${coins[c]} ${c}`).join(' ') || 'nothing';
/**
 * `amountCp` in coins, largest first, from `coins` (default pp, gp, sp, cp). `till` limits what is available
 * (null = unlimited). Returns the coins, or null when the till can't make the amount exactly.
 */
export function coinsForAmount(amountCp, {till = null, coins = CHANGE_COINS} = {}) {
  const out = {};let left = amountCp;
  if (!Number.isInteger(left) || left < 0) return null;
  for (const c of byValueDesc(coins)) {
    const n = Math.min(till ? coinSet(till, [c])[c] : Infinity, Math.floor(left / CP_VALUE[c]));
    out[c] = n; left -= n * CP_VALUE[c];
  }
  return left === 0 ? out : null;
}

const optWhole = (v, msg) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw Error(msg);
  return n;
};
const STOCK_MSG = 'Stock must be a whole number from 0, or blank for unlimited.';
/** One shop line as stored. Prices come as `priceCp` or `price: {value, denomination}`; cost as `costCp` or `cost`. */
export function normalizeLine(raw = {}, {randomId} = {}) {
  const lineId = typeof raw.lineId === 'string' && raw.lineId ? raw.lineId : typeof randomId === 'function' ? `ln_${randomId()}` : null;
  if (!lineId) throw new TypeError('A shop line needs a lineId.');
  const priceCp = raw.priceCp !== undefined && raw.priceCp !== null ? Number(raw.priceCp) : raw.price ? priceToCp(raw.price) : 0;
  if (!Number.isInteger(priceCp) || priceCp < 0) throw Error(NOT_WHOLE_CP);
  const costCp = raw.costCp !== undefined && raw.costCp !== null ? Number(raw.costCp) : raw.cost ? priceToCp(raw.cost) : null;
  if (costCp !== null && (!Number.isInteger(costCp) || costCp < 0)) throw Error(NOT_WHOLE_CP);
  const flavour = String(raw.flavour ?? '').trim();
  if (flavour.length > LINE_FLAVOUR_MAX) throw Error(`Item flavour text can be up to ${LINE_FLAVOUR_MAX} characters.`);
  const stock = optWhole(raw.stock, STOCK_MSG), start = raw.stockStart === undefined ? stock : optWhole(raw.stockStart, STOCK_MSG);
  const coin = COINS.includes(raw.priceCoin) ? raw.priceCoin : COINS.includes(raw.price?.denomination) ? raw.price.denomination : 'gp';
  return {lineId, itemId: str(raw.itemId) || null, itemUuid: str(raw.itemUuid, 400) || null, priceCp, priceCoin: coin, flavour, stock, stockStart: start,
    hidden: raw.hidden === true, costCp, sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : 0,
    ...(raw.item && typeof raw.item === 'object' ? {item: raw.item} : {}), ...(Array.isArray(raw.contents) ? {contents: raw.contents} : {})};
}
/** A shop purse: null = none (unlimited cash), else whole coins ≥ 0. ep is refused while electrum is off. */
export function normalizePurse(coins, {electrum = false} = {}) {
  if (coins === null || coins === undefined) return null;
  if (typeof coins !== 'object') throw Error('Shop coins must be whole numbers from 0.');
  if (!electrum && (Number(coins.ep) || 0) !== 0) throw Error(ELECTRUM_OFF);
  return Object.fromEntries(coinChoices(electrum).map(c => {
    const v = coins[c] === undefined || coins[c] === '' || coins[c] === null ? 0 : Number(coins[c]);
    if (!Number.isInteger(v) || v < 0 || v > GOLD_MAX) throw Error('Shop coins must be whole numbers from 0.');
    return [c, v];
  }));
}
export const SHOP_BUYS_DEFAULT = Object.freeze({enabled: false, percent: 50, types: Object.freeze([])});
const normalizePresented = p => (p && (p.mode === 'all' || p.mode === 'users')
  ? {mode: p.mode, userIds: p.mode === 'users' ? [...new Set((p.userIds ?? []).filter(u => typeof u === 'string' && u))] : [], since: num(p.since), by: str(p.by)} : null);
const textField = (v, max, label) => { const s = String(v ?? '').trim(); if (s.length > max) throw Error(`${label} can be up to ${max} characters.`); return s; };
const shared = (raw, prefix, label) => {
  if (!validId(raw.id, prefix)) throw Error(`${label} id must be ${prefix}- and upper-case letters, digits and single hyphens.`);
  const name = textField(raw.name, MERCHANT_NAME_MAX, `${label} name`);
  if (!name) throw Error(`A ${label.toLowerCase()} needs a name.`);
  return {id: raw.id, name, merchant: {name: textField(raw.merchant?.name, MERCHANT_NAME_MAX, 'Merchant name'), img: str(raw.merchant?.img, 400) ?? ''},
    flavour: textField(raw.flavour, SHOP_FLAVOUR_MAX, 'Flavour text'), locationId: str(raw.locationId)?.trim() || null, gmNotes: String(raw.gmNotes ?? ''),
    presented: normalizePresented(raw.presented), rev: Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0,
    createdAt: num(raw.createdAt) ?? 0, updatedAt: num(raw.updatedAt) ?? 0, updatedBy: str(raw.updatedBy)};
};
/** A full shop record as stored (GM data). Throws on anything it can't keep safely; never drops money. */
export function normalizeShop(raw = {}, {electrum = false} = {}) {
  const base = shared(raw, 'SHOP', 'Shop'), purse = normalizePurse(raw.purse, {electrum});
  const purseStart = raw.purseStart === undefined ? (purse ? {...purse} : null) : normalizePurse(raw.purseStart, {electrum});
  const b = raw.buys ?? {}, percent = b.percent === undefined ? 50 : Number(b.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw Error('Buy percent must be a whole number from 1 to 100.');
  const lines = (Array.isArray(raw.lines) ? raw.lines : []).map(l => normalizeLine(l)), ids = new Set();
  for (const l of lines) { if (ids.has(l.lineId)) throw Error(`Two lines share the id ${l.lineId}.`); ids.add(l.lineId); }
  return {schema: SHOP_SCHEMA, ...base, purse, purseStart, showPurse: raw.showPurse !== false,
    buys: {enabled: b.enabled === true, percent, types: [...new Set((Array.isArray(b.types) ? b.types : []).filter(t => typeof t === 'string' && t))]}, lines};
}

/* Services: one registry entry per type. Only the Bank for now. */
export const SERVICE_TYPES = Object.freeze({
  bank: Object.freeze({id: 'bank', label: 'Bank', defaults: () => ({feePercent: 0}),
    checkSettings(s = {}) {
      const fee = s.feePercent === undefined ? 0 : Number(s.feePercent);
      if (!Number.isInteger(fee) || fee < 0 || fee > 50) throw Error('The bank fee must be a whole number from 0 to 50.');
      return {feePercent: fee};
    }})
});
/** A service record as stored. An unknown type is kept untouched (a later Utilities may know it). */
export function normalizeService(raw = {}) {
  const base = shared(raw, 'SVC', 'Service'), type = String(raw.service?.type ?? ''), known = SERVICE_TYPES[type];
  const settings = known ? known.checkSettings({...known.defaults(), ...(raw.service?.settings ?? {})}) : (raw.service?.settings ?? {});
  return {schema: SERVICE_SCHEMA, kind: 'service', ...base, service: {type, settings}, known: !!known};
}

/**
 * The payment for `totalCp` from `hold` (the payer's coins). Price coin first, then smaller coins, then the smallest
 * larger coin that covers what is left. Change comes from the till (shop purse + the coins just handed over), largest
 * first, never ep; `shopPurse: null` = unlimited change. If the till can't make change, an exact payment (largest first)
 * is tried. `exact` = no change needed. `pay`/`back` are the net coins per coin (none goes out and straight back); `after`/`shopAfter` list only the
 * coins in play, so ep held while electrum is off is left out and stays as it is. Nothing goes below 0 on either side.
 */
export function planShopPayment({hold, totalCp, priceCoin = 'gp', shopPurse = null, electrum = false} = {}) {
  if (!hold || typeof hold !== 'object') return refuse("Those coins can't be read (no dnd5e currency).");
  if (!Number.isInteger(totalCp) || totalCp < 0) return refuse(NOT_WHOLE_CP);
  const use = coinChoices(electrum), have = coinSet(hold, use), till0 = shopPurse ? coinSet(shopPurse, use) : null;
  const start = use.includes(priceCoin) ? priceCoin : priceCoin === 'ep' ? 'sp' : null;
  if (!start) throw new TypeError(`Coin must be one of ${COINS.join(', ')}.`);
  const haveCp = coinValueCp(have);
  if (haveCp < totalCp) return refuse(`Not enough coins: ${shopPriceText(totalCp, start, {electrum})} needed, ${shopPriceText(haveCp, 'gp', {electrum})} held.`);
  let given = Object.fromEntries(use.map(c => [c, 0])), rem = totalCp;
  for (const c of byValueDesc(use.filter(c => CP_VALUE[c] <= CP_VALUE[start]))) {
    const n = Math.min(have[c], Math.floor(rem / CP_VALUE[c])); given[c] += n; rem -= n * CP_VALUE[c];
  }
  while (rem > 0) {
    const left = use.filter(c => have[c] > given[c]), cover = left.filter(c => CP_VALUE[c] >= rem);
    if (cover.length) { const c = cover.sort((a, b) => CP_VALUE[a] - CP_VALUE[b])[0]; given[c] += 1; rem -= CP_VALUE[c]; continue; }
    const c = byValueDesc(left)[0], n = Math.min(have[c] - given[c], Math.floor(rem / CP_VALUE[c]));
    given[c] += n; rem -= n * CP_VALUE[c];
  }
  let back = coinsForAmount(-rem, {till: till0 && Object.fromEntries(CHANGE_COINS.map(c => [c, till0[c] + given[c]]))}), exact = rem === 0;
  if (!back) {
    const ex = coinsForAmount(totalCp, {till: have, coins: use});
    if (!ex) return refuse(NO_CHANGE, {noChange: true});
    given = ex; back = {}; exact = true;
  }
  const net = Object.fromEntries(use.map(c => [c, (back[c] ?? 0) - given[c]]));
  const pay = Object.fromEntries(use.map(c => [c, Math.max(0, -net[c])])), backNet = Object.fromEntries(use.map(c => [c, Math.max(0, net[c])]));
  return {ok: true, exact, totalCp, pay, back: backNet, after: Object.fromEntries(use.map(c => [c, have[c] + net[c]])),
    shopAfter: till0 ? Object.fromEntries(use.map(c => [c, till0[c] - net[c]])) : null};
}

/** Whether the shop is presented to this user right now. A merchant list never counts. */
export const presentedTo = (shop, userId) => !!shop?.presented && (shop.presented.mode === 'all' || (shop.presented.userIds ?? []).includes(userId));
/** Design §7 "Who may buy" 2–4 on the GM's own record. Player Access, ownership and the vote are checked by the caller. */
export function checkPurchase({shop, lineId, quantity, rev, userId} = {}) {
  if (!presentedTo(shop, userId)) return refuse(SHOP_REFUSALS.notOpen);
  const line = (shop.lines ?? []).find(l => l.lineId === lineId);
  if (!line || line.hidden || rev !== (shop.rev ?? 0)) return refuse(SHOP_REFUSALS.changed);
  if (line.stock === 0) return refuse(SHOP_REFUSALS.soldOut, {soldOut: true});
  const q = Number(quantity);
  if (quantity === '' || quantity === null || !Number.isInteger(q) || q < 1) return refuse(SHOP_REFUSALS.quantity);
  if (line.stock !== null && line.stock !== undefined && q > line.stock) return refuse(`Only ${line.stock} left. Nothing was charged.`);
  return {ok: true, line, quantity: q, totalCp: line.priceCp * q, stockAfter: line.stock === null || line.stock === undefined ? null : line.stock - q};
}

/**
 * Bank (§7b): the player asks to receive `receive` of `to` and pays in `from` at the standard rates, exactly.
 * The fee (0–50 %) is in the from coin, rounded up, on top. `hold` is the chosen actor's coins.
 */
export function bankQuote({hold, from, to, receive, feePercent = 0, electrum = false} = {}) {
  const use = coinChoices(electrum);
  for (const c of [from, to]) if (!use.includes(c)) return refuse(c === 'ep' ? ELECTRUM_OFF : `Choose a coin: ${use.join(', ')}.`);
  if (from === to) return refuse('Choose two different coins.');
  const r = Number(receive);
  if (receive === '' || receive === null || !Number.isInteger(r) || r < 1 || r > GOLD_MAX) return refuse('Ask for a whole number of coins, 1 or more.');
  const fee = Number(feePercent);
  if (!Number.isInteger(fee) || fee < 0 || fee > 50) return refuse('The bank fee must be a whole number from 0 to 50.');
  const value = r * CP_VALUE[to];
  if (value % CP_VALUE[from]) { const g = (a, b) => (b ? g(b, a % b) : a); return refuse(`Ask for a multiple of ${CP_VALUE[from] / g(CP_VALUE[from], CP_VALUE[to])} ${to}`); }
  if (!hold || typeof hold !== 'object') return refuse("Those coins can't be read (no dnd5e currency).");
  const give = value / CP_VALUE[from], feeCoins = Math.floor((give * fee + 99) / 100), total = give + feeCoins, h = coinSet(hold, [from, to]);
  if (h[from] < total) return refuse(`Not enough ${coinWord(from)}: ${h[from]} ${from} held, ${total} ${from} needed.`);
  return {ok: true, from, to, give, fee: feeCoins, total, receive: r, fromBefore: h[from], fromAfter: h[from] - total, toBefore: h[to], toAfter: h[to] + r};
}

/** Removes `<section class="secret">…</section>` blocks from item HTML. */
export const stripSecrets = html => String(html ?? '').replace(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bsecret\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, '');
const projectBase = (rec, locationName) => ({id: rec.id, name: rec.name, merchant: {name: rec.merchant?.name ?? '', img: rec.merchant?.img ?? ''},
  flavour: rec.flavour ?? '', ...(locationName ? {location: {name: String(locationName)}} : {}), rev: rec.rev ?? 0});
/**
 * The player view of a shop (§5). Never contains hidden lines, costCp, gmNotes, itemId, itemUuid, item snapshots,
 * purseStart, presented or sales; `purse` only when the shop has one and showPurse is on. `locationName` only when
 * Locations says it is revealed (the caller decides). `typeLabel` turns a dnd5e item type into its label.
 */
export function projectShop(shop, {electrum = false, locationName = null, typeLabel = t => t} = {}) {
  const lines = [...(shop?.lines ?? [])].filter(l => !l.hidden).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(l => {
    const it = l.item ?? {}, sys = it.system ?? {}, unid = sys.identified === false;
    return {lineId: l.lineId, name: String((unid && sys.unidentified?.name) || it.name || 'Unnamed Item'), img: typeof it.img === 'string' ? it.img : '',
      type: typeLabel(it.type ?? 'item'), per: Number(sys.quantity) > 0 ? Number(sys.quantity) : 1, priceCp: l.priceCp,
      priceText: shopPriceText(l.priceCp, l.priceCoin, {electrum}), flavour: l.flavour ?? '', stock: l.stock ?? null, soldOut: l.stock === 0,
      description: stripSecrets(unid ? sys.unidentified?.description : sys.description?.value)};
  });
  const purse = shop?.purse && shop.showPurse !== false ? coinSet(shop.purse, coinChoices(electrum)) : null;
  return {...projectBase(shop, locationName), lines, purse};
}
/** The player view of a service; null for a type this version doesn't know. */
export function projectService(service, {locationName = null} = {}) {
  const type = SERVICE_TYPES[service?.service?.type];
  if (!type) return null;
  return {...projectBase(service, locationName), kind: 'service', service: {type: type.id, label: type.label, settings: type.checkSettings(service.service.settings ?? {})}};
}

/* Selling to a shop (§7c). The S1–S9 decisions live in SELL_DEFAULTS so a change of mind is one place. */
export const SELL_DEFAULTS = Object.freeze({
  /** S1 */ shopBuysByDefault: false, percent: 50,
  /** S2: physical types a shop may buy (containers never, S7); the per-shop `buys.types` narrows this. */
  types: Object.freeze(['weapon', 'equipment', 'consumable', 'tool', 'loot']), minValueCp: 1, noSaleFlag: 'noSale',
  /** S5: no party vote when coins come in. S6: a new line is added hidden. S8: not from the party stash. */
  vote: false, newLineHidden: true, fromStash: false
});
export const SELL_REFUSALS = Object.freeze({notBuying: "This shop doesn't buy items.", notOwned: 'You can only sell items from a character you own.',
  container: "Containers can't be sold. Empty it and sell the items separately.", equipped: 'Unequip it first.',
  type: "This shop doesn't buy that kind of item.", noSale: "That item can't be sold.", noValue: 'That item has no value to this shop.',
  cantAfford: "Sorry, the vendor can't afford that."});
/** The item's own dnd5e price per unit in copper (may be a fraction of a copper), or 0. */
const unitPriceCp = item => {
  const pr = item?.system?.price, p = pr !== null && typeof pr === 'object' ? pr : {value: pr, denomination: 'gp'};
  const v = Number(p.value), d = COINS.includes(p.denomination) ? p.denomination : 'gp';
  return Number.isFinite(v) && v > 0 ? v * CP_VALUE[d] : 0;
};
/** S3: percent × the item's own price × quantity, rounded down to whole copper. */
export const sellValueCp = (item, percent = SELL_DEFAULTS.percent, quantity = 1) => Math.max(0, Math.floor(unitPriceCp(item) * quantity * percent / 100 + 1e-9));
/**
 * S1, S2, S7, S8 on fresh item data (an Item or its toObject()). `actorOwned`: the seller owns the character holding it
 * (and it is not the party stash). Pay-out is checked separately by planShopPayout.
 */
export function checkSell({shop, item, actorOwned, quantity, userId, rev} = {}) {
  if (!presentedTo(shop, userId)) return refuse(SHOP_REFUSALS.notOpen);
  if (rev !== undefined && rev !== (shop.rev ?? 0)) return refuse(SHOP_REFUSALS.changed);
  if (shop.buys?.enabled !== true) return refuse(SELL_REFUSALS.notBuying);
  if (actorOwned !== true) return refuse(SELL_REFUSALS.notOwned);
  if (item?.type === 'container') return refuse(SELL_REFUSALS.container);
  const narrowed = Array.isArray(shop.buys.types) && shop.buys.types.length ? shop.buys.types : null;
  if (!SELL_DEFAULTS.types.includes(item?.type) || (narrowed && !narrowed.includes(item.type))) return refuse(SELL_REFUSALS.type);
  if (item?.flags?.[ID]?.[SELL_DEFAULTS.noSaleFlag] === true) return refuse(SELL_REFUSALS.noSale);
  const sys = item.system ?? {};
  if (sys.equipped === true || sys.attuned === true || sys.attunement === 2) return refuse(SELL_REFUSALS.equipped);
  const have = Number(sys.quantity) > 0 ? Math.floor(Number(sys.quantity)) : 1, q = Number(quantity);
  if (quantity === '' || quantity === null || !Number.isInteger(q) || q < 1 || q > have) return refuse(`Choose a whole number from 1 to ${have}.`);
  const percent = Number.isInteger(shop.buys.percent) ? shop.buys.percent : SELL_DEFAULTS.percent, valueCp = sellValueCp(item, percent, q);
  if (unitPriceCp(item) <= 0 || valueCp < SELL_DEFAULTS.minValueCp) return refuse(SELL_REFUSALS.noValue);
  return {ok: true, quantity: q, percent, valueCp};
}
/**
 * S4: what the shop pays, largest coins first (never ep). `shopPurse: null` = unlimited money. Refused with the plain
 * vendor message when the purse holds too little or can't make the exact amount; the amount is named only when the
 * merchant's coins are shown. `gmReason` always has the detail, for the GM's whisper.
 */
export function planShopPayout({amountCp, shopPurse = null, showPurse = true, electrum = false} = {}) {
  if (!Number.isInteger(amountCp) || amountCp < 0) return refuse(NOT_WHOLE_CP);
  const pay = coinsForAmount(amountCp, {till: shopPurse});
  if (!shopPurse) return {ok: true, pay, shopAfter: null};
  const use = coinChoices(electrum), purse = coinSet(shopPurse, use), text = shopPriceText(amountCp, 'gp', {electrum});
  if (!pay) {
    const short = coinValueCp(coinSet(shopPurse, CHANGE_COINS)) < amountCp;
    return refuse(showPurse ? `Sorry, the vendor can't afford that (${text}).` : SELL_REFUSALS.cantAfford,
      {cantAfford: true, gmReason: short ? `The shop purse holds less than ${text}.` : `The shop purse can't pay exactly ${text}.`});
  }
  return {ok: true, pay, shopAfter: Object.fromEntries(use.map(c => [c, purse[c] - (pay[c] ?? 0)]))};
}
/**
 * S6: where a sold item goes. A line with the same itemId (or, with no id on either side, the same name and type)
 * that sells one at a time gets its stock raised (unlimited stays unlimited); otherwise a new hidden line at the
 * item's own price, with `item` as its snapshot (quantity 1).
 */
export function sellStockChange(shop, item, quantity = 1, {randomId} = {}) {
  const itemId = str(item?.flags?.['ashen-gate-manager']?.source?.sourceId) || null;
  const line = (shop?.lines ?? []).find(l => {
    if (Number(l.item?.system?.quantity ?? 1) !== 1) return false;
    return itemId ? l.itemId === itemId : !l.itemId && l.item?.name === item?.name && l.item?.type === item?.type;
  });
  if (line) return {kind: 'raise', lineId: line.lineId, stockBefore: line.stock ?? null, stockAfter: line.stock === null || line.stock === undefined ? null : line.stock + quantity};
  const coin = COINS.includes(item?.system?.price?.denomination) ? item.system.price.denomination : 'gp';
  const snapshot = {...item, system: {...(item?.system ?? {}), quantity: 1, equipped: false}};
  return {kind: 'add', line: normalizeLine({itemId, itemUuid: null, priceCp: Math.floor(unitPriceCp(item) + 1e-9), priceCoin: coin === 'ep' ? 'sp' : coin,
    stock: quantity, hidden: SELL_DEFAULTS.newLineHidden, sort: Math.max(0, ...(shop?.lines ?? []).map(l => Number(l.sort) || 0)) + 10, item: snapshot}, {randomId})};
}

/* History (stash History and the sales log), same style as purseEntry / purseLine. */
export const SHOP_HISTORY_KINDS = Object.freeze(['shop-purchase', 'shop-sale', 'bank-exchange']);
const payFromOk = p => { if (!['purse', 'actor'].includes(p)) throw new TypeError("payFrom must be 'purse' or 'actor'."); return p; };
const coinCopy = c => (c && typeof c === 'object' ? Object.fromEntries(COINS.filter(k => k in c).map(k => [k, num(c[k]) ?? 0])) : null);
/** A purchase. `plan` from planShopPayment; `coinsBefore`/`shopPurseBefore` are what it was planned from. */
export function shopPurchaseEntry({id, shop, line, itemName, quantity = 1, payFrom, payer, actor, user, approval = 'not-required', plan, coinsBefore, shopPurseBefore = null,
  createdItemIds = [], electrum = false, worldTime = null, realTime = Date.now()} = {}) {
  if (!HISTORY_APPROVALS.includes(approval)) throw new TypeError('Unknown history approval.');
  if (!plan?.ok) throw new TypeError('A purchase entry needs a payment plan.');
  return {id: String(id ?? `s${realTime}`), kind: 'shop-purchase', shopId: str(shop?.id), shopName: str(shop?.name) ?? 'Shop', lineId: str(line?.lineId),
    itemName: str(itemName) ?? 'Unnamed Item', quantity, totalCp: plan.totalCp, totalText: shopPriceText(plan.totalCp, line?.priceCoin, {electrum}),
    payFrom: payFromOk(payFrom), payerId: str(payer?.id), payerName: str(payer?.name), actorId: str(actor?.id), actorName: str(actor?.name),
    userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', approval, exact: plan.exact === true, pay: coinCopy(plan.pay), back: coinCopy(plan.back),
    coinsBefore: coinCopy(coinsBefore), coinsAfter: coinCopy(plan.after), shopPurseBefore: coinCopy(shopPurseBefore), shopPurseAfter: coinCopy(plan.shopAfter),
    createdItemIds: (createdItemIds ?? []).filter(x => typeof x === 'string'), worldTime: num(worldTime), realTime: num(realTime) ?? Date.now()};
}
/** A sale to a shop. `check` from checkSell, `payout` from planShopPayout, `stock` from sellStockChange. */
export function shopSaleEntry({id, shop, itemName, check, payout, stock = null, payTo, receiver, actor, user, coinsBefore = null, shopPurseBefore = null,
  electrum = false, worldTime = null, realTime = Date.now()} = {}) {
  if (!check?.ok || !payout?.ok) throw new TypeError('A sale entry needs a sell check and a payout.');
  return {id: String(id ?? `s${realTime}`), kind: 'shop-sale', shopId: str(shop?.id), shopName: str(shop?.name) ?? 'Shop', itemName: str(itemName) ?? 'Unnamed Item',
    quantity: check.quantity, percent: check.percent, totalCp: check.valueCp, totalText: shopPriceText(check.valueCp, 'gp', {electrum}),
    payTo: payFromOk(payTo), receiverId: str(receiver?.id), receiverName: str(receiver?.name), actorId: str(actor?.id), actorName: str(actor?.name),
    userId: str(user?.id), userName: str(user?.name) ?? 'Unknown', approval: 'not-required', pay: coinCopy(payout.pay),
    coinsBefore: coinCopy(coinsBefore), shopPurseBefore: coinCopy(shopPurseBefore), shopPurseAfter: coinCopy(payout.shopAfter),
    stock: stock ? (stock.kind === 'raise' ? {kind: 'raise', lineId: stock.lineId, before: stock.stockBefore, after: stock.stockAfter} : {kind: 'add', lineId: stock.line?.lineId}) : null,
    worldTime: num(worldTime), realTime: num(realTime) ?? Date.now()};
}
/** A bank exchange. `quote` from bankQuote. */
export function bankExchangeEntry({id, service, quote, payFrom, payer, user, worldTime = null, realTime = Date.now()} = {}) {
  if (!quote?.ok) throw new TypeError('A bank entry needs a quote.');
  return {id: String(id ?? `b${realTime}`), kind: 'bank-exchange', serviceId: str(service?.id), serviceName: str(service?.name) ?? 'Bank',
    payFrom: payFromOk(payFrom), payerId: str(payer?.id), payerName: str(payer?.name), userId: str(user?.id), userName: str(user?.name) ?? 'Unknown',
    from: quote.from, to: quote.to, give: quote.give, fee: quote.fee, total: quote.total, receive: quote.receive,
    fromBefore: quote.fromBefore, fromAfter: quote.fromAfter, toBefore: quote.toBefore, toAfter: quote.toAfter, worldTime: num(worldTime), realTime: num(realTime) ?? Date.now()};
}
/** History line for a shop entry. */
export function shopLine(h) {
  const purse = h.payFrom === 'purse', own = `${h.payerName ?? 'their own'}'s coins`;
  if (h.kind === 'shop-purchase') {
    const who = `${h.userName}${h.actorName ? ` (${h.actorName})` : ''}`;
    return `${who} bought ${h.itemName}${h.quantity > 1 ? ` ×${h.quantity}` : ''} at ${h.shopName} for ${h.totalText}, paid from ${purse ? 'the party purse' : own}`;
  }
  if (h.kind === 'shop-sale') {
    const who = `${h.userName}${h.actorName ? ` (${h.actorName})` : ''}`;
    return `${who} sold ${h.itemName}${h.quantity > 1 ? ` ×${h.quantity}` : ''} to ${h.shopName} for ${h.totalText}, paid into ${h.payTo === 'purse' ? 'the party purse' : `${h.receiverName ?? 'their own'}'s coins`}`;
  }
  if (h.kind === 'bank-exchange') return `${h.userName} changed ${h.total} ${h.from} into ${h.receive} ${h.to} at ${h.serviceName}${h.fee ? ` (fee ${h.fee} ${h.from})` : ''}, ${purse ? 'party purse' : own}`;
  return '';
}
