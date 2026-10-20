/**
 * The Character Hub: an alternative ActorSheetV2 for dnd5e characters. It draws its own HTML
 * from the live Actor and sends every change through the Actor/Item (see actions.mjs). It never
 * mounts or hides the native sheet; "Open native sheet" opens that one separately.
 */
import {MODULE_ID, SHEET_LABEL} from './constants.mjs';
import {shellHtml, errorHtml} from './views.mjs';
import * as act from './actions.mjs';
import {openNativeSheet} from './native.mjs';
import {showHelp} from './help.mjs';
import * as items from './item-actions.mjs';
import {openPartner} from './partners.mjs';

const warn = msg => globalThis.ui?.notifications?.warn?.(msg);
/** Shows a refusal or failure from an action; a success is silent (the sheet re-renders itself). */
export const report = result => { if (result && result.ok === false && result.error) warn(result.error); return result; };

/** Click handlers by data-action. Each receives (sheet, target, event). Views add their own entries. */
export const ACTIONS = {
  'hub-tab': (s, t) => { s.tab = t.dataset.tab; return s.render(); },
  'retry': s => s.render({force: true}),
  'help': s => showHelp(s),
  'open-native': s => openNativeSheet(s.document),
  'hp-damage': (s, t) => hpButton(s, t, -1),
  'hp-heal': (s, t) => hpButton(s, t, 1),
  'inspiration': s => act.toggleInspiration(s.document),
  'exhaustion': (s, t) => act.changeExhaustion(s.document, Number(t.dataset.step)),
  'condition': (s, t) => act.toggleCondition(s.document, t.dataset.id),
  'roll-initiative': (s, t, e) => act.rollInitiative(s.document, e),
  'roll-check': (s, t, e) => act.rollAbilityCheck(s.document, t.dataset.ability, e),
  'roll-save': (s, t, e) => act.rollSavingThrow(s.document, t.dataset.ability, e),
  'roll-skill': (s, t, e) => act.rollSkill(s.document, t.dataset.skill, e),
  'roll-death': (s, t, e) => act.rollDeathSave(s.document, e),
  'item-use': (s, t, e) => items.useItem(s.document, t.dataset.id, e),
  'item-sheet': (s, t) => items.openItemSheet(s.document, t.dataset.id),
  'item-qty': (s, t) => { const item = s.document.items?.get?.(t.dataset.id); return items.setQuantity(s.document, t.dataset.id, Number(item?.system?.quantity ?? 0) + Number(t.dataset.step)); },
  'item-equip': (s, t) => items.equipItem(s.document, t.dataset.id),
  'item-unequip': (s, t) => items.unequipItem(s.document, t.dataset.id),
  'item-attune': (s, t) => items.setAttuned(s.document, t.dataset.id, t.dataset.attuned === '1'),
  'spell-prepare': (s, t) => items.togglePrepared(s.document, t.dataset.id),
  'rest': (s, t) => items.rest(s.document, t.dataset.type),
  'partner-open': (s, t) => openPartner(s.document, t.dataset.partner, t.dataset.ref),
  'doll-art': s => { s.dollArt = s.dollArt === 'token' ? 'portrait' : 'token'; return s.render(); }
};
function hpButton(sheet, target, sign) {
  const input = target.closest('.agch-hp')?.querySelector('[data-hp-amount]');
  const amount = Math.abs(Math.trunc(Number(input?.value) || 0));
  if (!amount) return {ok: false, error: 'Type an amount first.'};
  return act.adjustHp(sheet.document, sign * amount);
}

/** Change handlers by data-edit. Each receives (sheet, input). */
export const EDITS = {
  'hp.value': (s, i) => act.setHp(s.document, 'value', i.value),
  'hp.temp': (s, i) => act.setHp(s.document, 'temp', i.value),
  'hp.tempmax': (s, i) => act.setHp(s.document, 'tempmax', i.value),
  'currency': (s, i) => items.setCurrency(s.document, i.dataset.key, i.value),
  'item-qty': (s, i) => items.setQuantity(s.document, i.dataset.id, i.value),
  'equip-slot': (s, i) => i.value ? items.equipItem(s.document, i.value, {slot: i.dataset.slot}) : null,
  'item-slot': (s, i) => items.setSlot(s.document, i.dataset.id, i.value)
};

/** Builds the class on top of Foundry's ActorSheetV2 (passed in so tests can supply a stand-in). */
export function createHubSheetClass(Base) {
  return class CharacterHubSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ['ag-app', 'ag-character-hub'],
      position: {width: 860, height: 780},
      window: {resizable: true},
      form: {submitOnChange: false, closeOnSubmit: false}
    };
    static LABEL = SHEET_LABEL;
    tab = 'character';

    get hubContext() {
      const actor = this.document, user = globalThis.game?.user;
      const limited = !user?.isGM && actor.limited === true;
      return {actor, sheet: this, tab: this.tab, limited, editable: !limited && act.canEdit(actor, user) && this.isEditable !== false};
    }

    /** Never a blank window: a failure while drawing shows the error inside the sheet with Retry. */
    async _renderHTML() {
      try { return shellHtml(this.hubContext); } catch (err) {
        console.error(`${MODULE_ID} | render failed`, err);
        return errorHtml(err);
      }
    }

    _replaceHTML(result, content) {
      const body = content.querySelector?.('.agch-body');
      const scroll = body?.scrollTop ?? 0;
      content.innerHTML = result;
      const next = content.querySelector?.('.agch-body');
      if (next) next.scrollTop = scroll;
      if (!this._agchBound) {   // listeners live on the stable content element, so bind once
        content.addEventListener?.('change', ev => this._onHubChange(ev));
        content.addEventListener?.('submit', ev => ev.preventDefault());
        this._agchBound = true;
      }
      try { const a = globalThis.game?.modules?.get('ashen-gate-manager')?.api?.appearance; if (a?.contract === 'ag-appearance/0.1-beta') a.applyTo?.(content); } catch {}
    }

    /** Observers still need tabs, Help and Open native sheet; Foundry disables every form control otherwise. */
    _toggleDisabled(disabled) {
      super._toggleDisabled?.(disabled);
      this.element?.querySelectorAll?.('[data-ag-always]').forEach(el => { el.disabled = false; });
    }

    /** ApplicationV2 routes [data-action] clicks without a registered handler here. */
    async _onClickAction(event, target) {
      return this.dispatch(target.dataset.action, target, event);
    }

    async dispatch(action, target, event) {
      const handler = ACTIONS[action];
      if (!handler) return null;
      try { return report(await handler(this, target, event)); } catch (err) {
        console.error(`${MODULE_ID} | ${action}`, err);
        return report({ok: false, error: err?.message ?? String(err)});
      }
    }

    async _onHubChange(event) {
      const input = event.target, key = input?.dataset?.edit;
      if (!key || !EDITS[key]) return null;
      event.stopPropagation?.();
      try { return report(await EDITS[key](this, input)); } catch (err) { return report({ok: false, error: err?.message ?? String(err)}); }
    }
  };
}
