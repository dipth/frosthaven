/**
 * Cross-campaign (crossover) characters.
 *
 * A Gloomhaven / Forgotten Circles / Jaws of the Lion class in our Frosthaven
 * campaign is stored the way Secretariat stores it, with its own edition
 * (e.g. `gh:sun`). The data sync gives those base classes the official
 * crossover sheet's perks, masteries and traits (see
 * packages/data/scripts/crossover.ts), so in this app `progress.perks` indexes
 * the official crossover perk list.
 *
 * Secretariat shows the original Gloomhaven perk list for such characters. So
 * on export the checked-box total is filled into the original list from the
 * top, and the exact official perks are written into the character's notes,
 * from which an import restores them.
 */
import { gameManager, labelText, type GameModel } from '@fh/ghs-core';
import type { GameCharacterModel } from '@fh/ghs-core';

const NOTE_START = '--- Frosthaven crossover perks (official sheet) ---';
const NOTE_END = '--- end crossover perks ---';
const NOTE_DATA = /^fh-crossover-perks:\s*([\d,\s]*)$/m;
const NOTE_UNVERIFIED = 'fh-crossover-perks-unverified';

interface RawPerkCard {
  count?: number;
  attackModifier: { type: string; rolling?: boolean; effects?: { type: string; value?: unknown; effects?: { type: string; value?: unknown }[] }[] };
}
interface RawPerk {
  type: string;
  count?: number;
  custom?: string;
  cards?: RawPerkCard[];
}
interface RawClass {
  name: string;
  edition: string;
  crossover?: boolean;
  ghsPerkCounts?: number[];
  perks?: RawPerk[];
}

/** The raw edition-data entry for a class (keeps fields CharacterData drops). */
export function rawClassData(ref: { edition: string; name: string }): RawClass | undefined {
  for (const edition of gameManager.editionData) {
    const found = (edition.characters as unknown as RawClass[]).find((c) => c.name === ref.name && c.edition === ref.edition);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function isCrossoverCharacter(ref: { edition: string; name: string }): boolean {
  return !!rawClassData(ref)?.crossover;
}

/** Fills `total` checkmarks into perks with the given box counts, from the top. */
export function fillPerksFromTop(counts: number[], total: number): number[] {
  let remaining = total;
  return counts.map((count) => {
    const take = Math.min(count, remaining);
    remaining -= take;
    return take;
  });
}

function sum(values: number[] | undefined) {
  return (values ?? []).reduce((a, b) => a + (b || 0), 0);
}

const amNames: Record<string, string> = {
  plus0: '+0', plus1: '+1', plus2: '+2', plus3: '+3', plus4: '+4', minus1: '-1', minus2: '-2', null: 'Null', double: '2x', bless: 'Bless', curse: 'Curse'
};

function describeCard(card: RawPerkCard): string {
  const am = card.attackModifier;
  const effects = (am.effects ?? []).map((e) => {
    if (e.type === 'condition' || e.type === 'element') {
      return String(e.value);
    }
    if (e.type === 'custom') {
      return labelText(String(e.value).replace(/^%|%$/g, ''));
    }
    const inner = e.effects?.map((x) => (x.type === 'specialTarget' ? String(x.value) : `${x.type} ${x.value ?? ''}`.trim())).join(', ');
    return [`${e.type} ${e.value ?? ''}`.trim(), inner].filter(Boolean).join(', ');
  });
  const text = [amNames[am.type] ?? am.type, ...effects].join(' ');
  return `${card.count ?? 1}x ${text}${am.rolling ? ' (rolling)' : ''}`;
}

/** Plain-text description of a perk, for notes and the checklist. */
export function describePerk(perk: RawPerk): string {
  const cards = perk.cards ?? [];
  const custom = perk.custom ? labelText(perk.custom.replace(/^%|%$/g, '')) : '';
  switch (perk.type) {
    case 'add':
      return [`Add ${cards.map(describeCard).join(' and ')}`, custom].filter(Boolean).join('; ');
    case 'remove':
      return [`Remove ${cards.map(describeCard).join(' and ')}`, custom].filter(Boolean).join('; ');
    case 'replace': {
      const [from, ...to] = cards;
      return [`Replace ${from ? describeCard(from) : '?'} with ${to.map(describeCard).join(' and ')}`, custom].filter(Boolean).join('; ');
    }
    default:
      return custom || perk.type;
  }
}

function stripNote(notes: string): string {
  const start = notes.indexOf(NOTE_START);
  if (start < 0) {
    return notes;
  }
  const end = notes.indexOf(NOTE_END, start);
  const tail = end < 0 ? '' : notes.slice(end + NOTE_END.length);
  return (notes.slice(0, start) + tail).replace(/\n{3,}/g, '\n\n').trim();
}

function buildNote(raw: RawClass, perks: number[], unverified: boolean): string {
  const lines = (raw.perks ?? [])
    .map((perk, i) => ({ perk, checked: perks[i] ?? 0 }))
    .filter(({ checked }) => checked > 0)
    .map(({ perk, checked }) => `${'[x]'.repeat(checked)} ${describePerk(perk)}`);
  return [
    NOTE_START,
    ...(lines.length ? lines : ['(no perks)']),
    `fh-crossover-perks: ${perks.join(',')}`,
    ...(unverified ? [NOTE_UNVERIFIED] : []),
    NOTE_END
  ].join('\n');
}

/** Every character model in a game (in play, in party rosters, retired), each object once. */
function characterModels(game: GameModel): GameCharacterModel[] {
  const parties = [game.party, ...(game.parties ?? [])].filter(Boolean);
  const all = [...game.characters, ...parties.flatMap((p) => [...(p.characters ?? []), ...(p.availableCharacters ?? []), ...(p.retirements ?? [])])];
  return [...new Set(all)];
}

/**
 * Converts crossover characters' perks to Secretariat's representation
 * (mutates). `unverified` lists characters whose perks are still a guess.
 */
export function crossoverToGhs(game: GameModel, unverified: string[] = []) {
  for (const character of characterModels(game)) {
    const raw = rawClassData(character);
    if (!raw?.crossover || !raw.ghsPerkCounts || !character.progress) {
      continue;
    }
    const official = character.progress.perks ?? [];
    const ghsPerks = fillPerksFromTop(raw.ghsPerkCounts, sum(official));
    character.progress.perks = ghsPerks.concat(new Array(Math.max(0, official.length - ghsPerks.length)).fill(0));
    const notes = stripNote(character.progress.notes ?? '');
    const key = `${character.edition}:${character.name}`;
    character.progress.notes = [notes, buildNote(raw, official, unverified.includes(key))].filter(Boolean).join('\n\n');
  }
}

/**
 * Converts crossover characters' perks from Secretariat's representation
 * (mutates). Returns keys of characters whose perks were guessed and should be
 * verified against the physical sheet.
 */
export function crossoverFromGhs(game: GameModel): string[] {
  const unverified: string[] = [];
  for (const character of characterModels(game)) {
    const raw = rawClassData(character);
    if (!raw?.crossover || !character.progress) {
      continue;
    }
    const counts = (raw.perks ?? []).map((p) => p.count ?? 1);
    const notes = character.progress.notes ?? '';
    const match = notes.includes(NOTE_START) ? NOTE_DATA.exec(notes) : null;
    const parsed = match?.[1]
      ?.split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map(Number);
    if (parsed && parsed.every((n, i) => Number.isInteger(n) && n >= 0 && n <= (counts[i] ?? 0))) {
      character.progress.perks = counts.map((_, i) => parsed[i] ?? 0);
      if (notes.includes(NOTE_UNVERIFIED)) {
        unverified.push(`${character.edition}:${character.name}`);
      }
    } else {
      character.progress.perks = fillPerksFromTop(counts, sum(character.progress.perks));
      unverified.push(`${character.edition}:${character.name}`);
    }
    character.progress.notes = stripNote(notes);
  }
  return [...new Set(unverified)];
}
