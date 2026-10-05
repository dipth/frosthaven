/**
 * Downtime item actions, ported from GHS
 * src/app/ui/figures/items/dialog/items-dialog.ts (buy, craft, sell),
 * items/brew/brew.ts and items/character/item-distill.ts (AGPL-3.0).
 */
import { Character } from '@fh/ghs-core';
import { CountIdentifier } from '@fh/ghs-core/vendor/game/model/data/Identifier';
import { herbResourceLootTypes, LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { z } from 'zod';
import { brewingHerbs, brewResult } from '../ghs-ui/brew';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';
import { characterKey } from '../state';
import { assertOwner, characterCommand, name } from './character';

const itemPayload = { id: z.union([z.string(), z.number()]).transform(String), itemEdition: z.string().default('fh') };

function item(rt: Runtime, id: string, edition: string) {
  const data = rt.gm.itemManager.getItem(id, edition, true);
  if (!data) {
    throw new CommandError(`Unknown item ${edition} ${id}`, 'invalid_payload');
  }
  return data;
}

/** Plain name for messages (name() is GHS' undo-info form with an icon placeholder). */
function display(rt: Runtime, c: Character) {
  return rt.gm.characterManager.characterName(c);
}

function owned(c: Character, data: { id: number | string; edition: string }) {
  return c.progress.items.some((i) => i.name === '' + data.id && i.edition === data.edition);
}

function unlocked(rt: Runtime, data: { id: number | string; edition: string }) {
  return !rt.game.party.campaignMode || rt.game.party.unlockedItems.some((i) => i.name === '' + data.id && i.edition === data.edition);
}

const herb = z.enum(herbResourceLootTypes as [LootType, ...LootType[]]);
const herbCounts = z.partialRecord(herb, z.number().int().min(0).max(3));

const commands: CommandDef[] = [
  characterCommand('item.buy', itemPayload, (rt, c, { id, itemEdition }) => {
    const data = item(rt, id, itemEdition);
    if (!unlocked(rt, data)) throw new CommandError(`Item ${data.id} isn't in the item supply`);
    if (!rt.gm.itemManager.canBuy(data, c)) {
      if (rt.gm.itemManager.buyingDisabled() && !c.tags.includes('new-character')) throw new CommandError('Buying needs a working trading post');
      throw new CommandError(`${display(rt, c)} can't buy item ${data.id} (gold, supply or already owned)`);
    }
    rt.gm.stateManager.before('buyItem', name(rt, c), data.id, data.edition);
    rt.gm.itemManager.buyItem(data, c);
    rt.gm.stateManager.after();
  }),
  characterCommand('item.craft', itemPayload, (rt, c, { id, itemEdition }) => {
    const data = item(rt, id, itemEdition);
    if (!unlocked(rt, data)) throw new CommandError(`Item ${data.id} isn't in the item supply`);
    if (!rt.gm.itemManager.canCraft(data, c) || !rt.gm.itemManager.canAdd(data, c)) {
      if (rt.gm.itemManager.craftingDisabled()) throw new CommandError('The craftsman is wrecked');
      throw new CommandError(`${display(rt, c)} can't craft item ${data.id} (resources, supply or already owned)`);
    }
    rt.gm.stateManager.before('craftItem', name(rt, c), data.id, data.edition);
    rt.gm.itemManager.craftItem(data, c);
    rt.gm.stateManager.after();
  }),
  characterCommand('item.sell', itemPayload, (rt, c, { id, itemEdition }) => {
    const data = item(rt, id, itemEdition);
    if (!owned(c, data)) throw new CommandError(`${display(rt, c)} doesn't own item ${data.id}`);
    if (!rt.gm.itemManager.itemSellValue(data)) throw new CommandError(`Item ${data.id} can't be sold`);
    rt.gm.stateManager.before('sellItem', name(rt, c), data.id, data.edition);
    rt.gm.itemManager.sellItem(data, c);
    rt.gm.stateManager.after();
  }),
  characterCommand('item.distill', { ...itemPayload, herb }, (rt, c, { id, itemEdition, herb: resource }) => {
    const data = item(rt, id, itemEdition);
    if (!owned(c, data)) throw new CommandError(`${display(rt, c)} doesn't own item ${data.id}`);
    if (!rt.gm.itemManager.canDistill(data)) throw new CommandError(`Item ${data.id} can't be distilled (needs the alchemist at level 2)`);
    rt.gm.stateManager.before('distillItem', name(rt, c), data.id, data.edition, 'game.loot.' + resource);
    rt.gm.itemManager.removeItem(data, c);
    c.progress.loot[resource] = (c.progress.loot[resource] || 0) + 1;
    rt.gm.stateManager.after();
  }),
  defineCommand({
    type: 'item.brew',
    payload: z.object({
      /** Character whose herbs are used (and who brews). */
      brewer: z.string(),
      /** Character who receives the potion. */
      recipient: z.string(),
      recipe: z.array(herb).min(2).max(3),
      spend: z.object({ character: herbCounts, party: herbCounts })
    }),
    authorize(state, { brewer }, ctx) {
      const [edition = '', name = ''] = brewer.split(':');
      assertOwner(state, { edition, name }, ctx);
    },
    run(rt, { brewer: brewerKey, recipient: recipientKey, recipe, spend }) {
      const characters = rt.game.figures.filter((f): f is Character => f instanceof Character);
      const brewer = characters.find((c) => characterKey(c) === brewerKey);
      const recipient = characters.find((c) => characterKey(c) === recipientKey);
      if (!brewer || !recipient) throw new CommandError('Unknown character', 'invalid_payload');
      const herbs = brewingHerbs();
      if (!herbs || rt.gm.itemManager.brewingDisabled()) throw new CommandError('Brewing needs a working alchemist');
      if (recipe.length !== herbs) throw new CommandError(`The alchemist brews with ${herbs} herbs`);
      for (const type of herbResourceLootTypes) {
        const needed = recipe.filter((h) => h === type).length;
        const fromCharacter = spend.character[type] ?? 0;
        const fromParty = spend.party[type] ?? 0;
        if (fromCharacter + fromParty !== needed) throw new CommandError(`Pay exactly ${needed} ${type}`, 'invalid_payload');
        if (fromCharacter > (brewer.progress.loot[type] || 0)) throw new CommandError(`${display(rt, brewer)} doesn't have ${fromCharacter} ${type}`);
        if (fromParty > (rt.game.party.loot[type] || 0)) throw new CommandError(`The outpost doesn't have ${fromParty} ${type}`);
      }
      const potion = brewResult(recipe);
      if (!potion) throw new CommandError('That recipe makes nothing');
      if (owned(recipient, potion)) throw new CommandError(`${display(rt, recipient)} already has ${potion.name}`);
      rt.gm.stateManager.before(
        brewer === recipient ? 'brewPotion' : 'brewPotionOther',
        name(rt, brewer),
        potion.id,
        potion.edition,
        name(rt, recipient)
      );
      for (const type of herbResourceLootTypes) {
        if (spend.party[type]) rt.game.party.loot[type] = (rt.game.party.loot[type] || 0) - spend.party[type]!;
        if (spend.character[type]) brewer.progress.loot[type] = (brewer.progress.loot[type] || 0) - spend.character[type]!;
      }
      if (!rt.game.party.unlockedItems.some((i) => i.name === '' + potion.id && i.edition === potion.edition)) {
        rt.game.party.unlockedItems.push(new CountIdentifier(potion.id, potion.edition));
        rt.log(`Brewing unlocked ${potion.name} (item ${potion.id})`);
      }
      rt.gm.itemManager.addItem(potion, recipient);
      rt.gm.stateManager.after();
    }
  })
];

export const itemCommands = commands;
