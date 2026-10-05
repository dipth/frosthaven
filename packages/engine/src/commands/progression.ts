/**
 * Character progression in downtime, ported from GHS
 * src/app/ui/figures/character/sheet/abilities (ability-cards-dialog: card
 * picks at level-up; enhancements/enhancements.ts: enhancing) and
 * character-sheet.ts donate() (AGPL-3.0).
 */
import { ActionType } from '@fh/ghs-core/vendor/game/model/data/Action';
import { ConditionName } from '@fh/ghs-core/vendor/game/model/data/Condition';
import { Element } from '@fh/ghs-core/vendor/game/model/data/Element';
import { Enhancement, type EnhancementAction } from '@fh/ghs-core/vendor/game/model/data/Enhancement';
import { PersonalQuestAutotrackType } from '@fh/ghs-core/vendor/game/model/data/PersonalQuest';
import { z } from 'zod';
import { abilityCard, cardsToPick, enhancementCost, previousEnhancements } from '../ghs-ui/enhancements';
import { CommandError, type CommandDef } from '../runtime';
import { characterCommand, name } from './character';

const enhancementActions = ['plus1', 'hex', ActionType.jump, ...Object.values(ConditionName), ...Object.values(Element)] as [string, ...string[]];

const commands: CommandDef[] = [
  characterCommand(
    'character.enhance',
    {
      cardId: z.number().int(),
      half: z.enum(['top', 'bottom']),
      /** Which enhancement slot (as numbered by the player, from 0). */
      slot: z.number().int().min(0).max(20).default(0),
      enhancement: z.enum(enhancementActions),
      base: z.enum(Object.values(ActionType) as [ActionType, ...ActionType[]]).optional(),
      multiTarget: z.boolean().default(false),
      hexes: z.number().int().min(1).max(20).optional(),
      special: z.enum(['summon', 'lost', 'persistent']).optional(),
      /** Record an enhancement that's already on the physical card, without paying. */
      record: z.boolean().default(false)
    },
    (rt, c, spec) => {
      if (!abilityCard(c, spec.cardId)) {
        throw new CommandError(`${c.name} has no ability card ${spec.cardId}`, 'invalid_payload');
      }
      const enhancement = spec.enhancement as EnhancementAction;
      const cost = enhancementCost(c, { ...spec, enhancement });
      if (!spec.record) {
        if (rt.game.party.campaignMode && rt.gm.fhRules() && !rt.gm.enhancementsManager.enhancerLevel) {
          throw new CommandError('Enhancing needs a working enhancer');
        }
        if (cost > c.progress.gold) {
          throw new CommandError(`The enhancement costs ${cost} gold; ${rt.gm.characterManager.characterName(c)} has ${c.progress.gold}`);
        }
      }
      rt.gm.stateManager.before('enhanceCard', name(rt, c), spec.cardId);
      const index = `${spec.half === 'bottom' ? 'bottom-' : ''}0`;
      c.progress.enhancements = c.progress.enhancements ?? [];
      c.progress.enhancements.push(new Enhancement(spec.cardId, index, spec.slot, enhancement));
      rt.gm.personalQuestManager.trackPersonalQuestProgress(c, PersonalQuestAutotrackType.enhancements);
      if (!spec.record) {
        c.progress.gold -= cost;
        rt.log(`${rt.gm.characterManager.characterName(c)} enhanced card ${spec.cardId} (${spec.enhancement}) for ${cost} gold`);
      }
      rt.gm.stateManager.after();
    }
  ),
  characterCommand('character.removeEnhancement', { index: z.number().int().min(0) }, (rt, c, { index }) => {
    const enhancement = c.progress.enhancements?.[index];
    if (!enhancement) throw new CommandError('No such enhancement', 'invalid_payload');
    rt.gm.stateManager.before('enhanceCard', name(rt, c), enhancement.cardId);
    c.progress.enhancements.splice(index, 1);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.pickCard', { cardId: z.number().int(), force: z.boolean().default(false) }, (rt, c, { cardId, force }, ctx) => {
    const abilities = rt.gm.deckData(c).abilities;
    const index = abilities.findIndex((a) => a.cardId === cardId);
    const card = abilities[index];
    if (!card) throw new CommandError(`${c.name} has no ability card ${cardId}`, 'invalid_payload');
    if (c.progress.deck.includes(index)) throw new CommandError('That card is already in the deck');
    const picks = cardsToPick(c);
    if (!(force && ctx.isAdmin) && (typeof card.level !== 'number' || card.level < 2 || picks.count < 1 || card.level > picks.maxLevel)) {
      throw new CommandError(picks.count < 1 ? 'No card to pick: level up first' : `Pick a card of level ${picks.maxLevel} or lower`);
    }
    rt.gm.stateManager.before('character.cardToDeck', name(rt, c), card.name || card.cardId || '');
    c.progress.deck.push(index);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.unpickCard', { cardId: z.number().int() }, (rt, c, { cardId }) => {
    const abilities = rt.gm.deckData(c).abilities;
    const index = abilities.findIndex((a) => a.cardId === cardId);
    if (!c.progress.deck.includes(index)) throw new CommandError("That card isn't in the deck");
    rt.gm.stateManager.before('character.cardFromDeck', name(rt, c), abilities[index]!.name || cardId);
    c.progress.deck = c.progress.deck.filter((value) => value !== index);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.donate', {}, (rt, c) => {
    const fh = rt.gm.fhRules();
    const cost = fh ? 5 : 10;
    if (rt.game.round > 0) throw new CommandError('Donate between scenarios');
    if (c.progress.gold < cost) throw new CommandError(`Donating costs ${cost} gold`);
    if (fh && rt.game.party.campaignMode && !rt.game.party.buildings.some((b) => b.name === 'temple' && b.level && b.state !== 'wrecked')) {
      throw new CommandError('Donating needs a working temple');
    }
    rt.gm.stateManager.before('donate', name(rt, c));
    c.progress.donations += 1;
    c.donations += 1;
    rt.game.party.donations += 1;
    c.progress.gold -= cost;
    rt.gm.stateManager.after();
    rt.gm.personalQuestManager.trackPersonalQuestProgress(c, PersonalQuestAutotrackType.donations);
    rt.gm.personalQuestManager.trackPersonalQuestProgress(c, PersonalQuestAutotrackType.donatedGold);
  })
];

export const progressionCommands = commands;
