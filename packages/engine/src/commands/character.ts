/**
 * Character sheet actions, ported from GHS
 * src/app/ui/figures/character/sheet/character-sheet.ts and
 * src/app/ui/figures/items (AGPL-3.0). Same undo-info keys and manager calls.
 * Only the character's owner (or an admin) may run these.
 */
import { Character, GameState } from '@fh/ghs-core';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { z } from 'zod';
import { CommandError, defineCommand, type CommandContext, type CommandDef, type Runtime } from '../runtime';
import { characterKey, type CampaignState } from '../state';

const ref = z.object({ edition: z.string(), name: z.string() });
type Ref = z.infer<typeof ref>;

export function assertOwner(state: CampaignState, payload: Ref, ctx: CommandContext) {
  const owner = state.ext.characterOwners[characterKey(payload)];
  if (!ctx.isAdmin && owner && owner !== ctx.userId) {
    throw new CommandError(`Character ${characterKey(payload)} belongs to another player`, 'forbidden');
  }
}

function find(rt: Runtime, payload: Ref): Character {
  const character = rt.game.figures.find((f): f is Character => f instanceof Character && f.edition === payload.edition && f.name === payload.name);
  if (!character) {
    throw new CommandError(`No character ${payload.edition}:${payload.name} in the party`);
  }
  return character;
}

export function name(rt: Runtime, c: Character) {
  return rt.gm.characterManager.characterName(c, true, true);
}

/** Perk checkmarks still available to spend (GHS character sheet formula). */
export function availablePerks(c: Character): number {
  const spent = c.progress.perks?.length ? c.progress.perks.reduce((a, b) => a + b, 0) : 0;
  return (
    c.level +
    Math.min(6, Math.floor(c.progress.battleGoals / 3)) -
    spent -
    1 +
    c.progress.extraPerks +
    c.progress.retirements +
    (c.progress.masteries?.length ?? 0)
  );
}

/** A character command: validated ref + owner check + live Character. */
export function characterCommand<S extends z.ZodRawShape>(
  type: string,
  shape: S,
  run: (rt: Runtime, character: Character, payload: z.infer<z.ZodObject<S>> & Ref, ctx: CommandContext) => void
): CommandDef {
  return defineCommand({
    type,
    payload: ref.extend(shape),
    authorize: (state, payload, ctx) => assertOwner(state, payload as Ref, ctx),
    run: (rt, payload, ctx) => run(rt, find(rt, payload as Ref), payload as never, ctx)
  });
}

const lootTypes = z.enum(Object.values(LootType) as [LootType, ...LootType[]]);

const commands: CommandDef[] = [
  characterCommand('character.setTitle', { title: z.string().max(80) }, (rt, c, { title }) => {
    const defaultName = rt.gm.characterManager.characterName(c);
    const next = title.trim() === defaultName ? '' : title.trim();
    if (next === c.title) {
      return;
    }
    rt.gm.entityManager.before(c, c, next ? 'setTitle' : 'unsetTitle', next || c.title);
    c.title = next;
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setLevel', { level: z.number().int().min(1).max(9) }, (rt, c, { level }) => {
    rt.gm.entityManager.before(c, c, 'setLevel', level);
    rt.gm.characterManager.setLevel(c, level);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setXP', { experience: z.number().int().min(0).max(9999) }, (rt, c, { experience }) => {
    const delta = experience - c.progress.experience;
    if (delta === 0) {
      return;
    }
    rt.gm.entityManager.before(c, c, 'changeXP', (delta > 0 ? '+' : '') + delta);
    rt.gm.characterManager.addXP(c, delta, !rt.game.scenario && rt.gm.roundManager.firstRound);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setGold', { gold: z.number().int().min(0).max(99999) }, (rt, c, { gold }) => {
    rt.gm.stateManager.before('setGold', name(rt, c), gold);
    c.progress.gold = gold;
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setResource', { type: lootTypes, value: z.number().int().min(0).max(999) }, (rt, c, { type, value }) => {
    rt.gm.stateManager.before('setResource', name(rt, c), 'game.loot.' + type, value);
    c.progress.loot[type] = value;
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setBattleGoals', { battleGoals: z.number().int().min(0).max(18) }, (rt, c, { battleGoals }) => {
    rt.gm.stateManager.before('setBG', name(rt, c), battleGoals);
    c.progress.battleGoals = battleGoals;
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setExtraPerks', { value: z.number().int().min(0).max(99) }, (rt, c, { value }) => {
    rt.gm.stateManager.before('setExtraPerks', name(rt, c), value);
    c.progress.extraPerks = value;
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setRetirements', { value: z.number().int().min(0).max(99) }, (rt, c, { value }) => {
    rt.gm.stateManager.before('setRetirements', name(rt, c), value);
    c.progress.retirements = value;
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setNotes', { notes: z.string().max(20000) }, (rt, c, { notes }) => {
    rt.gm.stateManager.before('setNotes', name(rt, c), notes);
    c.progress.notes = notes;
    rt.gm.stateManager.after();
  }),
  characterCommand('character.toggleMastery', { index: z.number().int().min(0).max(5) }, (rt, c, { index }) => {
    c.progress.masteries = c.progress.masteries ?? [];
    if (!c.masteries?.[index]) {
      throw new CommandError(`${name(rt, c)} has no mastery ${index + 1}`, 'invalid_payload');
    }
    if (!c.progress.masteries.includes(index)) {
      rt.gm.stateManager.before('addMastery', name(rt, c), index);
      c.progress.masteries.push(index);
    } else {
      rt.gm.stateManager.before('removeMastery', name(rt, c), index);
      c.progress.masteries.splice(c.progress.masteries.indexOf(index), 1);
    }
    rt.gm.stateManager.after();
  }),
  characterCommand(
    'character.setPerk',
    { index: z.number().int().min(0).max(30), value: z.number().int().min(0).max(5), force: z.boolean().default(false) },
    (rt, c, { index, value, force }, ctx) => {
      const perk = c.perks[index];
      if (!perk) {
        throw new CommandError(`${name(rt, c)} has no perk ${index + 1}`, 'invalid_payload');
      }
      if (value > perk.count) {
        throw new CommandError(`Perk ${index + 1} has only ${perk.count} box(es)`, 'invalid_payload');
      }
      const current = c.progress.perks[index] ?? 0;
      const inScenario = rt.game.state !== GameState.draw || rt.game.round > 0;
      if (!(force && ctx.isAdmin)) {
        if (inScenario) {
          throw new CommandError('Perks can only be changed outside a scenario round');
        }
        if (value > current && availablePerks(c) < value - current) {
          throw new CommandError('No perk checkmarks available');
        }
      }
      rt.gm.stateManager.before('setPerk', name(rt, c), index, value);
      for (let i = 0; i < Math.max(15, c.perks.length); i++) {
        c.progress.perks[i] = c.progress.perks[i] ?? 0;
      }
      const lowerShacklesHP = c.name === 'shackles' && c.edition === 'fh' && index === 11 && current === 2;
      c.progress.perks[index] = value;
      if (perk.monsterDeck) {
        rt.game.monsterAttackModifierDeck = rt.gm.attackModifierManager.buildMonsterAttackModifierDeck();
        rt.gm.attackModifierManager.shuffleModifiers(rt.game.monsterAttackModifierDeck);
      } else {
        rt.gm.attackModifierManager.mergeAttackModifierDeck(c.attackModifierDeck, rt.gm.attackModifierManager.buildCharacterAttackModifierDeck(c));
        rt.gm.attackModifierManager.shuffleModifiers(c.attackModifierDeck);
        if (c.name === 'shackles' && c.edition === 'fh' && index === 11) {
          if (value === 2) {
            c.maxHealth += 5;
          } else if (lowerShacklesHP) {
            c.maxHealth -= 5;
          }
          c.health = c.maxHealth;
        }
      }
      rt.gm.stateManager.after();
    }
  ),
  characterCommand('character.confirmCrossoverPerks', {}, (rt, c) => {
    const key = characterKey(c);
    rt.ext.crossoverPerksToVerify = (rt.ext.crossoverPerksToVerify ?? []).filter((k) => k !== key);
    rt.log(`Confirmed ${name(rt, c)}'s perks match the official crossover sheet`);
  }),
  characterCommand('character.setPersonalQuest', { cardId: z.string().max(20) }, (rt, c, { cardId }) => {
    rt.gm.stateManager.before('setPQ', name(rt, c), cardId);
    c.progress.personalQuest = cardId;
    c.progress.personalQuestProgress = [];
    c.progress.personalQuestAutotrack = false;
    const pq = rt.gm.personalQuestManager.personalQuestByCard(rt.gm.currentEdition(), cardId);
    if (pq) {
      c.progress.personalQuest = pq.cardId;
    }
    rt.gm.stateManager.after();
  }),
  characterCommand(
    'character.setPersonalQuestProgress',
    { index: z.number().int().min(0).max(10), value: z.number().int().min(0).max(9999) },
    (rt, c, { index, value }) => {
      for (let i = 0; i <= index; i++) {
        c.progress.personalQuestProgress[i] = c.progress.personalQuestProgress[i] ?? 0;
      }
      rt.gm.stateManager.before('setPQProgress', name(rt, c), index + 1, value);
      c.progress.personalQuestProgress[index] = value;
      rt.gm.stateManager.after();
    }
  ),
  characterCommand('character.toggleAbsent', {}, (rt, c) => {
    if (!c.absent && rt.gm.characterManager.characterCount() <= 1) {
      throw new CommandError('At least one character must be present');
    }
    rt.gm.entityManager.before(c, c, c.absent ? 'unsetAbsent' : 'setAbsent');
    c.absent = !c.absent;
    if (c.absent && c.active) {
      rt.gm.roundManager.toggleFigure(c);
    }
    rt.gm.stateManager.after();
  }),
  characterCommand('character.addItem', { id: z.union([z.string(), z.number()]).transform(String), itemEdition: z.string().default('fh') }, (rt, c, { id, itemEdition }) => {
    const item = rt.gm.itemManager.getItem(id, itemEdition, true);
    if (!item) {
      throw new CommandError(`Unknown item ${itemEdition} ${id}`, 'invalid_payload');
    }
    rt.gm.stateManager.before('addItem', name(rt, c), item.id, item.edition);
    rt.gm.itemManager.addItem(item, c);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.removeItem', { id: z.union([z.string(), z.number()]).transform(String), itemEdition: z.string().default('fh') }, (rt, c, { id, itemEdition }) => {
    const item = rt.gm.itemManager.getItem(id, itemEdition, true);
    if (!item || !c.progress.items.some((i) => i.name === '' + item.id && i.edition === item.edition)) {
      throw new CommandError(`${name(rt, c)} doesn't own item ${id}`);
    }
    rt.gm.stateManager.before('removeItem', name(rt, c), item.id, item.edition);
    rt.gm.itemManager.removeItem(item, c);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.toggleEquippedItem', { id: z.union([z.string(), z.number()]).transform(String), itemEdition: z.string().default('fh') }, (rt, c, { id, itemEdition }) => {
    const item = rt.gm.itemManager.getItem(id, itemEdition, true);
    if (!item) {
      throw new CommandError(`Unknown item ${itemEdition} ${id}`, 'invalid_payload');
    }
    const equipped = c.progress.equippedItems.some((i) => i.name === '' + item.id && i.edition === item.edition);
    rt.gm.stateManager.before(equipped ? 'unequipItem' : 'equipItem', name(rt, c), item.id, item.edition);
    rt.gm.itemManager.toggleEquippedItem(item, c, false);
    rt.gm.stateManager.after();
  }),
  characterCommand('character.retire', {}, (rt, c) => {
    // The guided retirement (personal quest rewards, new character) is part of
    // the outpost flow; this is GHS' direct retirement.
    rt.gm.stateManager.before('setRetired', name(rt, c));
    c.progress.retired = true;
    if (rt.game.party.campaignMode) {
      rt.game.party.retirements.push(c.toModel());
      rt.gm.characterManager.removeCharacter(c, true);
    }
    rt.gm.stateManager.after();
  }),
  characterCommand('character.setAside', {}, (rt, c) => {
    rt.gm.stateManager.before('characterSetAside', name(rt, c), rt.game.party.players[c.number - 1] || c.number);
    rt.game.party.availableCharacters = rt.game.party.availableCharacters || [];
    rt.game.party.availableCharacters.push(c.toModel());
    rt.gm.characterManager.removeCharacter(c);
    rt.gm.stateManager.after();
  }),
  defineCommand({
    type: 'character.bringBack',
    payload: ref,
    run(rt, { edition, name: charName }) {
      // GHS replay(): an available (set aside) character takes its player's seat again.
      const model = rt.game.party.availableCharacters.find((c) => c.name === charName && c.edition === edition);
      if (!model) {
        throw new CommandError(`${edition}:${charName} is not set aside`);
      }
      const character = new Character(rt.gm.getCharacterData(charName, edition), model.level);
      character.fromModel(model);
      rt.gm.stateManager.before('characterReplay', rt.gm.characterManager.characterName(character, true, true), rt.game.party.players[character.number - 1] || character.number);
      rt.game.party.availableCharacters = rt.game.party.availableCharacters.filter(
        (c) => c.name !== character.name || c.edition !== character.edition || c.number !== character.number
      );
      rt.game.figures.forEach((figure) => {
        if (figure instanceof Character && figure.number === character.number) {
          rt.game.party.availableCharacters.push(figure.toModel());
          rt.gm.characterManager.removeCharacter(figure);
        }
      });
      rt.game.figures.push(character);
      rt.gm.stateManager.after();
    }
  })
];

export const characterCommands = commands;
