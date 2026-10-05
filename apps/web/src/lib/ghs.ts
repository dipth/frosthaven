import { bootstrapGhs } from '@fh/ghs-core';
import { api } from './api';

let ready: Promise<void> | undefined;

/** Loads GHS edition data into the in-browser GHS runtime (labels, stats, decks...). */
export function ghsReady(): Promise<void> {
  ready ??= api<{ dataVersion: string }>('/api/meta').then(({ dataVersion }) =>
    bootstrapGhs(async (file) => {
      const res = await fetch(`/game-data/ghs/${file}?v=${dataVersion}`, { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`Failed to load game data ${file}: ${res.status}`);
      }
      return res.json();
    })
  );
  return ready;
}
