/**
 * Forteller narration cues. Forteller has no public API or stable deep links,
 * so a cue tells the narrator what to play (title + search text) and links to
 * forteller.gg; they play it from their own account. Cues are detected by
 * comparing the state before and after each command, so every way of
 * starting a scenario, revealing a section or drawing an event is covered.
 */
import type { GameModel } from '@fh/ghs-core';
import { narrationOverrides } from './narration-overrides';
import type { CampaignState, ExtState } from './state';

export type NarrationKind = 'scenario-intro' | 'scenario-conclusion' | 'section' | 'event';

export interface NarrationCue {
  id: string;
  kind: NarrationKind;
  /** Scenario index, section index, or `type:cardId` for events. */
  ref: string;
  title: string;
  /** What to search for in the Forteller app. */
  search: string;
  /** Direct link, when one is known (narration-overrides.json). */
  url?: string;
}

export const FORTELLER_URL = 'https://forteller.gg';
const MAX_CUES = 8;

const EVENT_NAMES: Record<string, string> = {
  'summer-road': 'Summer Road Event',
  'winter-road': 'Winter Road Event',
  'summer-outpost': 'Summer Outpost Event',
  'winter-outpost': 'Winter Outpost Event',
  boat: 'Boat Event'
};

export function narrationCue(kind: NarrationKind, ref: string, name?: string): NarrationCue {
  let title: string;
  let search: string;
  switch (kind) {
    case 'scenario-intro':
      title = `Scenario ${ref}${name ? ` – ${name}` : ''}: introduction`;
      search = `Scenario ${ref.padStart(3, '0')} Introduction`;
      break;
    case 'scenario-conclusion':
      title = `Scenario ${ref}${name ? ` – ${name}` : ''}: conclusion`;
      search = `Scenario ${ref.padStart(3, '0')} Conclusion`;
      break;
    case 'section':
      title = `Section ${ref}`;
      search = `Section ${ref}`;
      break;
    case 'event': {
      const [type = '', cardId = ''] = ref.split(':');
      const number = cardId.replace(/^\D+-?/, '');
      title = `${EVENT_NAMES[type] ?? type} ${cardId}`;
      search = `${EVENT_NAMES[type] ?? type} ${number}`;
      break;
    }
  }
  const override = narrationOverrides[`${kind}:${ref}`] ?? {};
  return {
    id: `${kind}:${ref}:${Date.now().toString(36)}`,
    kind,
    ref,
    title: override.title ?? title,
    search: override.search ?? search,
    ...(override.url ? { url: override.url } : {})
  };
}

function sectionKeys(ghs: GameModel): Set<string> {
  return new Set((ghs.sections ?? []).map((s) => `${s.edition}:${s.group ?? ''}:${s.index}`));
}

/** Cues for what a command just revealed. */
export function detectNarration(before: CampaignState, after: CampaignState, names: (kind: 'scenario', index: string) => string | undefined): NarrationCue[] {
  const cues: NarrationCue[] = [];
  const b = before.ghs;
  const a = after.ghs;
  const scenarioKey = (g: GameModel) => (g.scenario ? `${g.scenario.edition}:${g.scenario.group ?? ''}:${g.scenario.index}` : '');
  if (a.scenario && scenarioKey(a) !== scenarioKey(b) && !a.scenario.custom) {
    cues.push(narrationCue('scenario-intro', a.scenario.index, names('scenario', a.scenario.index)));
  }
  if (a.scenario && scenarioKey(a) === scenarioKey(b)) {
    const known = sectionKeys(b);
    for (const section of a.sections ?? []) {
      if (!known.has(`${section.edition}:${section.group ?? ''}:${section.index}`)) cues.push(narrationCue('section', section.index));
    }
  }
  const completed = (a.party.scenarios ?? []).length > (b.party.scenarios ?? []).length ? a.party.scenarios.at(-1) : undefined;
  if (completed) {
    cues.push(narrationCue('scenario-conclusion', completed.index, names('scenario', completed.index)));
  }
  const draft = after.ext.eventDraft;
  if (draft && (draft.cardId !== before.ext.eventDraft?.cardId || draft.type !== before.ext.eventDraft?.type)) {
    cues.push(narrationCue('event', `${draft.type}:${draft.cardId}`));
  }
  const pendingBefore = new Set((before.ext.pendingConclusions ?? []).map((p) => p.section));
  for (const pending of after.ext.pendingConclusions ?? []) {
    if (!pendingBefore.has(pending.section)) cues.push(narrationCue('section', pending.section));
  }
  return cues;
}

export function addCues(ext: ExtState, cues: NarrationCue[]) {
  if (!cues.length) return;
  ext.narration = [...(ext.narration ?? []), ...cues].slice(-MAX_CUES);
}
