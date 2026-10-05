/**
 * Replacement for GHS businesslogic/StorageManager (IndexedDB). Persistence is
 * handled by our server, so reads fail (callers fall back to defaults) and
 * writes are no-ops.
 */
import type { GameModel } from '../vendor/game/model/Game';

export class StorageManager {
  db: IDBDatabase | undefined = undefined;

  writeGameModel(_gameModel: GameModel): Promise<void> {
    return Promise.resolve();
  }

  readGameModel(): Promise<GameModel> {
    return Promise.reject(new Error('storage disabled'));
  }

  addBackup(_gameModel: GameModel) {}

  read<T>(_store: string, _key: string = 'default'): Promise<T> {
    return Promise.reject(new Error('storage disabled'));
  }

  readAll<T>(_store: string): Promise<T[]> {
    return Promise.reject(new Error('storage disabled'));
  }

  write(_store: string, _key: string | undefined, _object: any): Promise<void> {
    return Promise.resolve();
  }

  writeArray(_store: string, _array: any[]): Promise<void> {
    return Promise.resolve();
  }

  remove(_store: string, _key: string = 'default') {}

  clear(_store: string | undefined = undefined): Promise<void> {
    return Promise.resolve();
  }

  async datadump(): Promise<any> {
    return {};
  }
}

export const storageManager: StorageManager = new StorageManager();
