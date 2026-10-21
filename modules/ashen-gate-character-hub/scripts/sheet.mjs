/**
 * The Character Hub: an alternative ActorSheetV2 for dnd5e characters. It draws its own HTML
 * from the live Actor and sends every change through the Actor/Item (see actions.mjs). It never
 * mounts or hides the native sheet; "Open native sheet" opens that one separately.
 */
import {MODULE_ID, SHEET_LABEL, clampOpacity, windowOpacity} from './constants.mjs';
import {shellHtml, errorHtml} from './views.mjs';
import * as act from './actions.mjs';
import {openNativeSheet} from './native.mjs';
import {showHelp} from './help.mjs';
import * as items from './item-actions.mjs';
import {openPartner, mountEmbeds, unmountEmbeds, depositToParty} from './partners.mjs';
import * as comp from './companions.mjs';
import * as vis from './visibility.mjs';
import {openConfig} from './configure.mjs';
import {toggleSection} from './collapse.mjs';
import {setListChoice} from './organize.mjs';

const warn = msg => globalThis.ui?.notifications?.warn?.(msg);
/** Shows a refusal or failure from an action; a success is silent (the sheet re-renders itself). */
export const report = result => { if (result && result.ok === false && result.error) warn(result.error); return result; };

/** Click handlers by data-action. Each receives (sheet, target, event). Views add their own entries. */
export const ACTIONS = {
  'hub-tab': (s, t) => { s.tab = t.dataset.tab; s.menu = null; return s.render(); },
  'ag-subtab': (s, t) => { s.agTab = t.dataset.partner; return s.render(); },
  'inv-view': (s, t) => { s.invView = t.dataset.view === 'party' ? 'party' : 'character'; return s.render(); },
  'slot-menu': (s, t) => toggleMenu(s, `slot:${t.dataset.slot}`),
  'other-menu': (s, t) => toggleMenu(s, `other:${t.dataset.id}`),
  'section-toggle': (s, t) => toggleSection(s.element ?? t.closest?.('.agch-root'), t.dataset.key),
  'ag-jump': (s, t) => { s.tab = 'ashen-gate'; s.agTab = t.dataset.partner; s.menu = null; return s.render(); },
  'hp-apply': (s, t) => hpApply(s, t),
  'item-more': (s, t) => toggleMore(s, t),
  'item-favorite': (s, t) => items.toggleFavorite(s.document, t.dataset.id),
  'slot-open': (s, t) => items.openItemSheet(s.document, t.dataset.id),
  'menu-close': s => toggleMenu(s, null),
  'cond-add': s => { s.condAdd = !s.condAdd; return s.render(); },
  'item-deposit': (s, t) => { s.menu = null; return depositToParty(s.document, t.dataset.id, act.canEdit); },
  'slot-equip': (s, t) => { s.menu = null; return items.equipItem(s.document, t.dataset.id, {slot: t.dataset.slot}); },
  'slot-swap': (s, t) => items.swapSlots(s.document, t.dataset.id, t.dataset.slot, t.dataset.other, t.dataset.otherSlot),
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
  'companion-remove': (s, t) => comp.removeCompanion(s.document, t.dataset.entry),
  'companion-move': (s, t) => comp.moveCompanion(s.document, t.dataset.entry, Number(t.dataset.step)),
  'companion-detach': (s, t) => comp.detachPerk(s.document, t.dataset.entry, t.dataset.id),
  'visibility-preset': (s, t) => vis.applyPreset(t.dataset.preset),
  'doll-art': s => { s.dollArt = s.dollArt === 'token' ? 'portrait' : 'token'; return s.render(); }
};
/** One small menu at a time (a slot's actions or the conditions list); the same key again closes it. */
function toggleMenu(sheet, key) {
  sheet.menu = key && sheet.menu !== key ? key : null;
  return sheet.render();
}
/**
 * Hides list rows whose name does not contain the search text (no re-render, so typing keeps focus). A section left
 * with no matching rows is hidden too; a container stays visible while something inside it matches.
 */
export function applyFilter(root, text) {
  const q = String(text ?? '').trim().toLowerCase();
  for (const row of root?.querySelectorAll?.('.agch-body .agch-card, .agch-body .agch-plist > li') ?? []) {
    const name = (row.querySelector?.('.agch-item__name')?.textContent ?? row.textContent ?? '').toLowerCase();
    row.hidden = !!q && !name.includes(q);
  }
  for (const box of root?.querySelectorAll?.('.agch-body .agch-contents') ?? []) {
    const any = [...(box.querySelectorAll?.('.agch-card') ?? [])].some(r => !r.hidden);
    if (any && box.previousElementSibling) box.previousElementSibling.hidden = false;
  }
  for (const sec of root?.querySelectorAll?.('.agch-body .agch-sec') ?? []) {
    if (typeof sec.querySelectorAll !== 'function' || !sec.classList) continue;
    const cards = [...sec.querySelectorAll('.agch-card')];
    sec.classList.toggle('is-filtered-out', !!q && cards.length > 0 && cards.every(r => r.hidden));
  }
}
/** "More" on a card: shows or hides its full description in place; the sheet remembers it until it closes. */
function toggleMore(sheet, target) {
  const key = target.dataset.key, open = !sheet.expanded.has(key);
  if (open) sheet.expanded.add(key); else sheet.expanded.delete(key);
  const detail = target.closest?.('.agch-card')?.querySelector?.('.agch-card__detail');
  if (detail) detail.hidden = !open;
  target.setAttribute?.('aria-expanded', String(open));
  if ('textContent' in target) target.textContent = open ? 'Less' : 'More';
  return {ok: true, result: open};
}
/** Saves this user's window opacity (client setting). */
export function saveOpacity(value) {
  try { return globalThis.game?.settings?.set?.(MODULE_ID, 'windowOpacity', clampOpacity(value)); } catch (err) { console.warn(`${MODULE_ID} | opacity not saved`, err); return null; }
}
/** Apply in the HP editor: one update with the three values, then the editor closes. */
async function hpApply(sheet, target) {
  const box = target.closest?.('.agch-hpedit');
  const values = Object.fromEntries([...(box?.querySelectorAll?.('[data-hpedit]') ?? [])].map(i => [i.dataset.hpedit, i.value]));
  const result = await act.setHpValues(sheet.document, values);
  if (result.ok) { sheet.menu = null; sheet.render(); }
  return result;
}
function hpButton(sheet, target, sign) {
  const input = target.closest('.agch-hp')?.querySelector('[data-hp-amount]');
  const amount = Math.abs(Math.trunc(Number(input?.value) || 0));
  if (!amount) return {ok: false, error: 'Type an amount first.'};
  return act.adjustHp(sheet.document, sign * amount);
}

/** Change handlers by data-edit. Each receives (sheet, input). */
export const EDITS = {
  'currency': (s, i) => items.setCurrency(s.document, i.dataset.key, i.value),
  'item-qty': (s, i) => items.setQuantity(s.document, i.dataset.id, i.value),
  'item-slot': (s, i) => items.setSlot(s.document, i.dataset.id, i.value),
  'companion-add': (s, i) => i.value ? comp.addCompanion(s.document, i.value, i.dataset.kind) : null,
  'companion-attach': (s, i) => i.value ? comp.attachPerk(s.document, i.dataset.entry, i.value) : null,
  'pet-cap-override': (s, i) => comp.setPetCapOverride(i.dataset.actor, i.value),
  'pet-cap-default': (s, i) => comp.setDefaultPetCap(i.value),
  'part-visibility': (s, i) => vis.setVisibility({[i.dataset.part]: i.checked === true}),
  'list-sort': async (s, i) => { const r = await setListChoice(i.dataset.tab, i.dataset.field, i.value); if (r.ok) s.render(); return r; }
};

/** Reads the Item from a drop (sidebar, compendium or this sheet) the way dnd5e does. */
export async function droppedItem(event) {
  const TE = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  let data = null;
  try { data = TE?.getDragEventData ? TE.getDragEventData(event) : JSON.parse(event.dataTransfer?.getData('text/plain') || 'null'); } catch { data = null; }
  if (data?.type !== 'Item') return null;
  const Item = globalThis.Item?.implementation ?? globalThis.Item;
  return Item?.fromDropData ? Item.fromDropData(data) : null;
}

/** Builds the class on top of Foundry's ActorSheetV2 (passed in so tests can supply a stand-in). */
export function createHubSheetClass(Base) {
  return class CharacterHubSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ['ag-app', 'ag-character-hub'],
      position: {width: 1240, height: 800},
      window: {resizable: true},
      form: {submitOnChange: false, closeOnSubmit: false}
    };
    static LABEL = SHEET_LABEL;
    tab = 'overview';
    /** Open slot menu: 'slot:<id>' or null. */
    menu = null;
    /** The conditions box shows the inactive conditions to add. */
    condAdd = false;
    /** Partner views mounted in this sheet: key → {element, handle} (see mountEmbeds). */
    _embeds = new Map();
    invView = 'character';
    agTab = null;
    /** Search text per tab (Combat, Inventory, Magic, Features). */
    filters = {};
    /** Cards whose "More" is open (detail keys), kept across re-renders while the sheet is open. */
    expanded = new Set();

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
      mountEmbeds(content, this._embeds);
      const next = content.querySelector?.('.agch-body');
      if (next) next.scrollTop = scroll;
      this.applyOpacity();
      applyFilter(content, this.filters[this.tab] ?? '');
      if (!this._agchBound) {   // listeners live on the stable content element, so bind once
        content.addEventListener?.('change', ev => this._onHubChange(ev));
        content.addEventListener?.('input', ev => {
          if (ev.target?.matches?.('[data-filter]')) { this.filters[this.tab] = ev.target.value; applyFilter(content, ev.target.value); }
          if (ev.target?.matches?.('[data-opacity]')) this.applyOpacity(ev.target.value);
        });
        content.addEventListener?.('change', ev => { if (ev.target?.matches?.('[data-opacity]')) saveOpacity(ev.target.value); });
        content.addEventListener?.('contextmenu', ev => this._onContextMenu(ev));
        content.addEventListener?.('click', ev => this._onOutsideClick(ev));
        content.addEventListener?.('dblclick', ev => this._onHpBarOpen(ev));
        content.addEventListener?.('keydown', ev => {
          if (ev.key === 'Escape' && this.menu) { ev.stopPropagation(); toggleMenu(this, null); return; }
          if ((ev.key === 'Enter' || ev.key === ' ') && ev.target?.matches?.('[data-hp-bar]')) { this._onHpBarOpen(ev); return; }
          if (ev.key === 'Enter' && ev.target?.matches?.('[data-hpedit]')) { ev.preventDefault(); this.dispatch('hp-apply', ev.target, ev); }
        });
        content.addEventListener?.('submit', ev => ev.preventDefault());
        content.addEventListener?.('dragover', ev => { if (ev.target?.closest?.('[data-drop-companion]')) ev.preventDefault(); });
        content.addEventListener?.('drop', ev => this._onCompanionDrop(ev));
        this._agchBound = true;
      }
      try { const a = globalThis.game?.modules?.get('ashen-gate-manager')?.api?.appearance; if (a?.contract === 'ag-appearance/0.1-beta') a.applyTo?.(content); } catch {}
    }

    /** Observers still need tabs, Help and Open native sheet; Foundry disables every form control otherwise. */
    _toggleDisabled(disabled) {
      super._toggleDisabled?.(disabled);
      this.element?.querySelectorAll?.('[data-ag-always]').forEach(el => { el.disabled = false; });
    }

    /** ApplicationV2 routes [data-action] clicks without a registered handler here. Embedded partner views handle their own. */
    async _onClickAction(event, target) {
      if (target?.closest?.('.agch-embed')) return null;
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

    /**
     * Right-click: on a filled slot (or an Other equipped row) it unequips; on an empty slot it opens the slot's menu;
     * on a stat marked data-config it opens dnd5e's own configuration window for it. Embedded partner views keep theirs.
     */
    _onContextMenu(event) {
      if (event.target?.closest?.('.agch-embed')) return null;
      const filled = event.target?.closest?.('[data-action="slot-open"]');
      const slot = filled ?? event.target?.closest?.('[data-action="slot-menu"]');
      if (slot) {
        event.preventDefault(); event.stopPropagation();
        if (filled) { this.menu = null; return items.unequipItem(this.document, filled.dataset.id).then(report); }
        this.menu = `slot:${slot.dataset.slot}`;
        return this.render();
      }
      const cfg = event.target?.closest?.('[data-config]');
      if (!cfg) return null;
      event.preventDefault(); event.stopPropagation();
      return openConfig(this.document, cfg.dataset.config, cfg.dataset.configKey ?? null).then(report);
    }

    /** Double-click (or Enter) on the HP bar opens the small HP editor. Only for users who can edit the character. */
    _onHpBarOpen(event) {
      const bar = event.target?.closest?.('[data-hp-bar]');
      if (!bar || !this.hubContext.editable) return null;
      event.preventDefault?.();
      this.menu = 'hp';
      return this.render();
    }

    /**
     * Sets the window background opacity. The value goes into --ag-window-opacity (the Hub's own backgrounds mix with
     * it), and the window's own background is set inline with !important so no core, system or theme rule keeps the
     * window opaque behind the content. Text, icons, slots and controls stay solid.
     */
    applyOpacity(value = windowOpacity()) {
      const v = clampOpacity(value), el = this.element;
      el?.style?.setProperty?.('--ag-window-opacity', `${v}%`);
      el?.style?.setProperty?.('background', 'var(--agch-bg)', 'important');
      const content = el?.querySelector?.(':scope > .window-content'), header = el?.querySelector?.(':scope > .window-header');
      content?.style?.setProperty?.('background', 'transparent', 'important');
      header?.style?.setProperty?.('background', 'var(--agch-bg-sunken)', 'important');
      return v;
    }

    /** Partner views are unmounted when the sheet closes. */
    _onClose(options) {
      unmountEmbeds(this._embeds);
      return super._onClose?.(options);
    }

    /** A click outside the open menu (and not on a menu opener) closes it. */
    _onOutsideClick(event) {
      if (!this.menu) return null;
      const t = event.target;
      if (t?.closest?.('.agch-menu, [data-action="slot-menu"], [data-action="other-menu"]')) return null;
      this.menu = null;
      return this.render();
    }

    /** Drops on a Companions zone are handled here; other drops fall through to Foundry's own sheet handling. */
    async _onCompanionDrop(event) {
      const zone = event.target?.closest?.('[data-drop-companion]');
      if (!zone) return null;
      event.preventDefault(); event.stopPropagation();
      try {
        const item = await droppedItem(event);
        const kind = zone.dataset.dropCompanion;
        const result = kind === 'perk' ? await comp.attachDroppedPerk(this.document, zone.dataset.entry, item) : await comp.addDroppedCompanion(this.document, item, kind);
        return report(result);
      } catch (err) { return report({ok: false, error: err?.message ?? String(err)}); }
    }

    async _onHubChange(event) {
      const input = event.target, key = input?.dataset?.edit;
      if (!key || !EDITS[key]) return null;
      event.stopPropagation?.();
      try { return report(await EDITS[key](this, input)); } catch (err) { return report({ok: false, error: err?.message ?? String(err)}); }
    }
  };
}
