import type { BoardFile, TileOverride } from '@fh/engine';
import { useEffect, useState } from 'react';
import { api } from './api';

export interface ImageIndex {
  monsters: Record<string, string>;
  icons: Record<string, string>;
  elements?: Record<string, string>;
  abilityCards: Record<string, Record<string, string>>;
  /** Monster ability card art by `edition:deck`, then GHS cardId. */
  monsterAbilityCards?: Record<string, Record<string, string>>;
  conditions: Record<string, string>;
  pets: Record<string, string>;
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

/** Admin corrections to tile images (rotate/nudge/scale), shared by all campaigns. */
export function useTileOverrides() {
  const [overrides, setOverrides] = useState<Record<string, TileOverride>>({});
  const reload = () => api<Record<string, TileOverride>>('/api/tile-overrides').then(setOverrides, () => {});
  useEffect(() => {
    reload();
  }, []);
  const save = async (name: string, override: TileOverride | null) => {
    setOverrides((current) => {
      const next = { ...current };
      if (override) next[name] = override;
      else delete next[name];
      return next;
    });
    if (override) await api(`/api/admin/tile-overrides/${name}`, { method: 'PUT', json: override });
    else await api(`/api/admin/tile-overrides/${name}`, { method: 'DELETE' });
  };
  return { overrides, save };
}
