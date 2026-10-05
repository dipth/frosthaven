import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, describe, expect, it } from 'vitest';
import { gameManager } from '@fh/ghs-core';
import { CommandError, executeCommand, loadGhs, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;
const drifter = { kind: 'character' as const, edition: 'fh', name: 'drifter' };
const spear = { kind: 'character' as const, edition: 'fh', name: 'banner-spear' };

let start: CampaignState;
beforeAll(async () => {
  await bootstrapGhsNode();
  let s = newCampaignState('x');
  s = run(s, 'character.add', { edition: 'fh', name: 'drifter' });
  s = run(s, 'character.add', { edition: 'fh', name: 'banner-spear' });
  s = run(s, 'scenario.set', { index: '1' });
  start = s;
});

function drawRound(s: CampaignState) {
  s = run(s, 'character.initiative', { edition: 'fh', name: 'drifter', initiative: 10 });
  s = run(s, 'character.initiative', { edition: 'fh', name: 'banner-spear', initiative: 50 });
  return run(s, 'round.next');
}

describe('scenario play', () => {
  it('sets up scenario 1 with standees, loot deck and modifier decks', () => {
    expect(start.ghs.monsters.flatMap((m) => m.entities).length).toBeGreaterThan(0);
    expect(start.ghs.lootDeck.cards.length).toBeGreaterThan(0);
    expect(start.ghs.monsterAttackModifierDeck.cards.length).toBe(20);
  });

  it('runs turns in initiative order', () => {
    let s = drawRound(start);
    expect(s.ghs.state).toBe('next');
    s = run(s, 'figure.next');
    const active = s.ghs.figures.find((_f, i) => {
      const c = s.ghs.characters.find((ch) => `${ch.edition}-${ch.name}` === s.ghs.figures[i]);
      const m = s.ghs.monsters.find((mo) => `${mo.edition}-${mo.name}` === s.ghs.figures[i]);
      return c?.active || m?.active;
    });
    expect(active).toBeDefined();
  });

  it('damages and kills monster standees', () => {
    let s = drawRound(start);
    const monster = s.ghs.monsters.find((m) => m.entities.length > 0)!;
    const entity = monster.entities[0]!;
    const ref = { kind: 'monster' as const, edition: monster.edition, name: monster.name, number: entity.number };
    s = run(s, 'entity.changeHealth', { targets: [ref], delta: -1 });
    const after = s.ghs.monsters.find((m) => m.name === monster.name)!.entities.find((e) => e.number === entity.number)!;
    expect(after.health).toBe(entity.health - 1);
    s = run(s, 'entity.addCondition', { targets: [ref], condition: 'poison' });
    expect(s.ghs.monsters.find((m) => m.name === monster.name)!.entities.find((e) => e.number === entity.number)!.entityConditions.map((c) => c.name)).toContain('poison');
    s = run(s, 'entity.changeHealth', { targets: [ref], delta: -99 });
    expect(s.ghs.monsters.find((m) => m.name === monster.name)?.entities.find((e) => e.number === entity.number && !e.dead)).toBeUndefined();
  });

  it('adds standees and refuses duplicates', () => {
    const monster = start.ghs.monsters[0]!;
    let s = run(start, 'monster.addStandee', { edition: monster.edition, name: monster.name, type: 'elite' });
    const numbers = s.ghs.monsters.find((m) => m.name === monster.name)!.entities.map((e) => e.number);
    expect(numbers.length).toBe(monster.entities.length + 1);
    expect(() => run(s, 'monster.addStandee', { edition: monster.edition, name: monster.name, type: 'normal', number: numbers[0] })).toThrow(CommandError);
  });

  it('tracks character HP, XP, conditions and long rest', () => {
    let s = run(start, 'entity.changeHealth', { targets: [drifter], delta: -3 });
    s = run(s, 'character.changeScenarioXP', { edition: 'fh', name: 'drifter', delta: 2 });
    s = run(s, 'entity.addCondition', { targets: [drifter, spear], condition: 'strengthen' });
    s = run(s, 'character.longRest', { edition: 'fh', name: 'banner-spear', on: true });
    const d = s.ghs.characters.find((c) => c.name === 'drifter')!;
    expect(d.health).toBe(d.maxHealth - 3);
    expect(d.experience).toBe(2);
    expect(d.entityConditions.map((c) => c.name)).toContain('strengthen');
    expect(s.ghs.characters.find((c) => c.name === 'banner-spear')!.initiative).toBe(99);
  });

  it('draws modifiers, adds curses and cycles elements', () => {
    let s = drawRound(start);
    s = run(s, 'am.draw', { deck: 'monster' });
    expect(s.ghs.monsterAttackModifierDeck.current).toBe(0);
    s = run(s, 'am.changeCount', { deck: 'monster', type: 'curse', delta: 2 });
    expect(s.ghs.monsterAttackModifierDeck.cards.length).toBe(22);
    s = run(s, 'am.draw', { deck: { kind: 'character', edition: 'fh', name: 'drifter' }, state: 'advantage' });
    s = run(s, 'element.set', { element: 'fire' });
    expect(s.ghs.elementBoard.find((e) => e.type === 'fire')!.state).not.toBe('inert');
  });

  it('draws loot for the active character', () => {
    let s = drawRound(start);
    s = run(s, 'figure.next');
    s = run(s, 'loot.draw', { character: { edition: 'fh', name: 'drifter' } });
    expect(s.ghs.lootDeck.current).toBe(0);
    expect(s.ghs.characters.find((c) => c.name === 'drifter')!.lootCards).toEqual([0]);
  });

  it('opens rooms', () => {
    // Frosthaven reveals rooms through sections; the only closed room in GHS' FH data is in a solo scenario.
    const withDoors = gameManager.editionData.find((e) => e.edition === 'fh')!.scenarios.find((d) => d.rooms?.some((r) => !r.initial))!;
    let s = run(start, 'scenario.set', { index: withDoors.index, group: withDoors.group });
    const before = s.ghs.scenario!.revealedRooms?.length ?? 0;
    s = drawRound(s);
    loadGhs(s.ghs);
    const room = gameManager.scenarioManager.closedRooms()[0]!;
    expect(room).toBeDefined();
    s = run(s, 'scenario.openRoom', { roomNumber: room.roomNumber });
    expect(s.ghs.scenario!.revealedRooms!.length).toBeGreaterThan(before);
  });

  it('finishes the scenario with rewards', () => {
    let s = drawRound(start);
    s = run(s, 'character.changeScenarioXP', { edition: 'fh', name: 'drifter', delta: 4 });
    s = run(s, 'finish.start', { success: true });
    expect(s.ghs.finish).toBeDefined();
    s = run(s, 'finish.update', { op: 'battleGoal', index: 0, value: 1, checked: true });
    s = run(s, 'finish.apply');
    expect(s.ghs.scenario).toBeUndefined();
    expect(s.ghs.party.scenarios.map((sc) => sc.index)).toContain('1');
    const d = s.ghs.characters.find((c) => c.name === 'drifter')!;
    // 4 scenario XP + scenario level bonus (level 1: 4 XP... per GHS LevelManager)
    expect(d.progress!.experience).toBeGreaterThanOrEqual(8);
    expect(s.ghs.party.weeks).toBe(1);
  });
});
