/** Ashen Gate | Utilities 0.2.0-alpha pure session rules. No Foundry globals. */
export const ID = 'ashen-gate-utilities';
export const VERSION = '0.11.0';
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
export function stashRow(item, {typeLabel = t => t} = {}) {
  const sys = item?.system ?? {};
  const w = sys.weight !== null && typeof sys.weight === 'object' ? sys.weight : {value: sys.weight, units: ''};
  const weight = num(w.value), price = sys.price !== null && typeof sys.price === 'object' ? sys.price : {value: sys.price, denomination: 'gp'};
  const value = num(price.value);
  return {id: item?.id, uuid: item?.uuid ?? null, img: typeof item?.img === 'string' ? item.img : null, name: String(item?.name ?? 'Unnamed Item'),
    quantity: num(sys.quantity) ?? 1, weight: weight ? `${weight} ${w.units || 'lb'}` : '—', value: value ? `${value} ${price.denomination || 'gp'}` : '—',
    type: item?.type ?? 'item', typeLabel: typeLabel(item?.type ?? 'item')};
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
    worldTime: num(worldTime), realTime: num(realTime) ?? Date.now()};
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
 */
export function planGoldAward({amount, mode = 'each', recipients, coin = 'gp'} = {}) {
  const amt = Number(amount);
  if (!COINS.includes(coin)) throw Error(`Coin must be one of ${COINS.join(', ')}.`);
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
const checkCoin = coin => { if (!COINS.includes(coin)) throw Error(`Coin must be one of ${COINS.join(', ')}.`); return coin; };
/**
 * A character ↔ purse move. 'deposit' takes coins from the character into the purse; 'take' the reverse.
 * Never more than the giver holds, so neither side can go negative. `actorHas`/`purseHas` are the current amounts.
 */
export function planCoinMove({kind, coin, amount, actorHas, purseHas, actorName = 'The character'} = {}) {
  if (!['deposit', 'take'].includes(kind)) throw Error('Move must be deposit or take.');
  checkCoin(coin);const amt = wholeAmount(amount);
  if (!Number.isFinite(actorHas)) throw Error(`${actorName} has no dnd5e ${coinWord(coin)} (system.currency.${coin}).`);
  if (!Number.isFinite(purseHas)) throw Error(`The party purse has no dnd5e currency (system.currency.${coin}).`);
  if (kind === 'deposit' && actorHas < amt) throw Error(`${actorName} has ${actorHas} ${coin}, fewer than ${amt} ${coin}.`);
  if (kind === 'take' && purseHas < amt) throw Error(`The party purse has ${purseHas} ${coin}, fewer than ${amt} ${coin}.`);
  const sign = kind === 'deposit' ? 1 : -1;
  return {kind, coin, amount: amt, actorBefore: actorHas, actorAfter: actorHas - sign * amt, purseBefore: purseHas, purseAfter: purseHas + sign * amt};
}
/** GM purse change: 'add', 'remove' (never below 0) or 'set' (0 allowed). */
export function planPurseAdjust({op, coin, amount, purseHas} = {}) {
  if (!['add', 'remove', 'set'].includes(op)) throw Error('Adjust must be add, remove or set.');
  checkCoin(coin);const amt = wholeAmount(amount, {min: op === 'set' ? 0 : 1});
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
