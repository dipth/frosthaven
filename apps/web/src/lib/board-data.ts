import type { BoardFile } from '@fh/engine';
import { useEffect, useState } from 'react';
import { api } from './api';

export interface ImageIndex {
  monsters: Record<string, string>;
  icons: Record<string, string>;
  abilityCards: Record<string, Record<string, string>>;
  conditions: Record<string, string>;
}

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let promise = cache.get(path);
  if (!promise) {
    promise = api<{ dataVersion: string }>('/api/meta').then(async ({ dataVersion }) => {
      const res = await fetch(`/game-data/${path}?v=${dataVersion}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return res.json();
    });
    cache.set(path, promise);
  }
  return promise as Promise<T>;
}

function useLoaded<T>(path: string | undefined): T | undefined | null {
  const [value, setValue] = useState<T | null>();
  useEffect(() => {
    if (!path) return;
    let live = true;
    setValue(undefined);
    load<T>(path).then(
      (v) => live && setValue(v),
      () => live && setValue(null)
    );
    return () => {
      live = false;
    };
  }, [path]);
  return value;
}

/** Board layout for a Frosthaven scenario; null when there is none. */
export function useBoard(scenario: string | undefined) {
  return useLoaded<BoardFile>(scenario ? `boards/${scenario}.json` : undefined);
}

export function useImages() {
  return useLoaded<ImageIndex>('images.json') ?? undefined;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
export const assetUrl = (path: string) => `/assets/worldhaven/${path}`;
