import './globals';
import { gameManager } from './vendor/game/businesslogic/GameManager';
import { settingsManager } from './vendor/game/businesslogic/SettingsManager';
import { Settings } from './vendor/game/model/Settings';

/** Editions loaded into the GHS runtime: Frosthaven plus official crossover classes. */
export const EDITIONS = ['fh', 'fh-crossover', 'gh', 'fc', 'jotl'] as const;
/** Editions enabled in GHS settings (fh-crossover is a 'content' edition extending fh). */
export const ENABLED_EDITIONS = ['fh', 'fh-crossover', 'gh', 'fc', 'jotl'];

/** Resolves a data file name (e.g. `fh.json`, `locale-en.json`) to its parsed JSON. */
export type DataLoader = (file: string) => Promise<unknown>;

let bootstrapped: Promise<void> | undefined;

/** Our fixed GHS settings. Display-only settings are irrelevant; these affect game logic. */
export function defaultSettings(): Settings {
  const settings = new Settings();
  settings.locale = 'en';
  settings.editions = [...ENABLED_EDITIONS];
  settings.editionDataUrls = EDITIONS.map((edition) => `./assets/data/${edition}.json`);
  settings.excludeEditionDataUrls = [];
  settings.fhStyle = true;
  settings.theme = 'fh';
  settings.animations = false;
  settings.serverAutoconnect = false;
  return settings;
}

/**
 * Loads edition data and labels into the GHS singletons. GHS fetches
 * `./assets/data/<edition>.json` and `./assets/locales/en.json`; those
 * requests are routed to `load` while bootstrapping.
 */
export function bootstrapGhs(load: DataLoader): Promise<void> {
  bootstrapped ??= doBootstrap(load);
  return bootstrapped;
}

async function doBootstrap(load: DataLoader) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const data = url.match(/assets\/data\/([^/]+\.json)$/);
    const locale = url.match(/assets\/locales\/([^/]+)\.json$/);
    if (data || locale) {
      const file = data ? data[1]! : `locale-${locale![1]}.json`;
      const json = await load(file);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    settingsManager.settings = defaultSettings();
    gameManager.editionData = [];
    for (const url of settingsManager.settings.editionDataUrls) {
      const result = await settingsManager.loadEditionData(url);
      if (!result) {
        throw new Error(`Failed to load GHS edition data ${url}`);
      }
    }
    await settingsManager.updateLocale('en');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
