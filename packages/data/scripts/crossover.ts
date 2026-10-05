/**
 * Official crossover character sheets (Cephalofair, Drew Penn & Dennis Vögele,
 * Dec 2022 / Feb 2023: https://cephalofair.com/pages/frosthaven).
 *
 * GHS' fh-crossover edition was checked sheet-by-sheet against all 23 official
 * sheets (2026-10-05). It matches apart from the corrections below. The
 * corrected crossover perks, masteries and traits are then copied onto the base
 * Gloomhaven / Forgotten Circles / Jaws of the Lion classes, because a GH class
 * played in a Frosthaven campaign is stored with its own edition (e.g.
 * `gh:sun`), exactly as Secretariat stores it.
 */

type Json = Record<string, any>;

/** Corrections to GHS fh-crossover data, verified against the official sheets. */
const characterCorrections: Record<string, (c: Json) => void> = {
  // Sheet: "Replace one +0 card with one +1 STUN card" (GHS has +0 STUN).
  spellweaver: (c) => {
    const perk = c['perks'][6];
    assert(perk.type === 'replace' && perk.cards[1].attackModifier.effects?.[0]?.value === 'stun', 'spellweaver perk 6');
    perk.cards[1].attackModifier.type = 'plus1';
  },
  // Sheet traits: Educated - Nimble - Persuasive (GHS has "night").
  'music-note': (c) => {
    c['traits'] = ['educated', 'nimble', 'persuasive'];
  }
};

/** Label text corrections (data.custom.fh.<class>.<n>). */
const labelCorrections: Record<string, Record<string, [string, string]>> = {
  spellweaver: { '1': ['Etheric Bound', 'Etheric Bond'] },
  tinkerer: { '1': ['%game.action.heal%, ', '%game.action.heal:2%, '] },
  triangles: { '4': ['Formless Power of Shaping in Ether', 'Formless Power or Shaping the Ether'] },
  squidface: { '1': ['to duffer', 'to suffer'] },
  'music-note': { '3': ['Havel all', 'Have all'] },
  'two-mini': { '2': ['%gamae.action.heal%3', '%game.action.heal:3%'] },
  circles: { '4': ['haven been revealed', 'have been revealed'] }
};

function assert(condition: unknown, what: string): asserts condition {
  if (!condition) {
    throw new Error(`Crossover correction no longer applies (${what}); re-check GHS data against the official sheets`);
  }
}

/** Base edition of an official crossover class, from its GHS icon (`gh-brute`), or undefined if unofficial. */
export function officialBaseEdition(c: Json): string | undefined {
  const match = /^(gh|fc|jotl)-/.exec(c['icon'] ?? '');
  return match && !c['perkWarning'] ? match[1] : undefined;
}

/**
 * Applies the corrections to fh-crossover and copies official crossover data
 * onto the base classes. Mutates the edition JSON objects in place.
 */
export function applyOfficialCrossover(editions: Record<string, Json>) {
  const crossover = editions['fh-crossover'];
  if (!crossover) {
    throw new Error('fh-crossover edition missing');
  }
  for (const c of crossover['characters'] as Json[]) {
    characterCorrections[c['name']]?.(c);
  }
  // Locked classes' texts live in the spoiler label set.
  const labelSets = [crossover['label']?.['en'], crossover['labelSpoiler']?.['en']].map((l) => l?.['custom']?.['fh'] ?? {});
  for (const [name, entries] of Object.entries(labelCorrections)) {
    for (const [key, [from, to]] of Object.entries(entries)) {
      const labels = labelSets.find((set) => typeof set[name]?.[key] === 'string' && set[name][key].includes(from));
      assert(labels, `label ${name}.${key}`);
      labels[name][key] = labels[name][key].replace(from, to);
    }
  }

  let copied = 0;
  for (const c of crossover['characters'] as Json[]) {
    const edition = officialBaseEdition(c);
    if (!edition) {
      continue;
    }
    // Bladeswarm (gh-envx) lives in its own GHS content edition.
    const base = Object.entries(editions)
      .filter(([name]) => name === edition || name.startsWith(`${edition}-`))
      .flatMap(([, data]) => data['characters'] as Json[])
      .find((b) => b['name'] === c['name']);
    assert(base, `base class ${edition}:${c['name']}`);
    // Keep the original perk box counts: GHS exports fill this list from the top.
    base['ghsPerkCounts'] = (base['perks'] as Json[]).map((p) => p['count'] ?? 1);
    base['perks'] = c['perks'];
    base['masteries'] = c['masteries'];
    base['traits'] = c['traits'];
    base['crossover'] = true;
    copied++;
  }
  return copied;
}
