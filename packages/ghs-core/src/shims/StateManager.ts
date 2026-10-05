/**
 * Replacement for GHS businesslogic/StateManager. The original persists to
 * IndexedDB and syncs over its own WebSocket protocol; here persistence, undo
 * and sync are owned by our server, so this only records the undo-info
 * strings GHS passes to before() (used for the session log) and bumps the
 * revision in after().
 */
import type { Game, GameModel } from '../vendor/game/model/Game';
import type { Permissions } from '../vendor/game/model/Permissions';

export class StateManager {
  game: Game;
  permissions: Permissions | undefined;
  ws: WebSocket | undefined;

  undos: GameModel[] = [];
  redos: GameModel[] = [];
  undoInfos: string[][] = [];

  /** Undo-info entries recorded by before() since the last drainActionLog(). */
  actionLog: string[][] = [];

  lastSaveTimestamp: number = Date.now();
  hasUpdate: boolean = false;
  installPrompt: any = null;
  lastAction: 'update' | 'undo' | 'redo' = 'update';
  updateBlocked: boolean = false;
  serverError: string = '';
  errorLog: any[] = [];
  backupError: number | undefined;
  permissionBackup: Permissions | undefined;
  connectionTries: number = 0;
  gameOffsetWarning: boolean = true;
  standeeDialogCanceled: boolean = false;
  keyboardSelecting: 's' | 'w' | false = false;
  keyboardSelect: number = -1;
  undoPermission: boolean = false;
  redoPermission: boolean = false;
  characterPermissions: Record<string, boolean> = {};
  monsterPermissions: Record<string, boolean> = {};
  wakeLock: any = null;
  scenarioSummary: boolean = false;
  serverVersion: string = '';
  storageBlocked: boolean = false;
  autoBackupTimeout: any = null;
  ready: boolean = true;
  automaticTheme: boolean = true;

  constructor(game: Game) {
    this.game = game;
  }

  async init(_tool: boolean = false) {}
  async install() {}
  async loadStorage() {}
  async saveStorage() {}

  before(...info: (string | number | boolean)[]) {
    this.actionLog.push((info || []).map((value) => '' + value));
  }

  async after(_timeout: number = 1, _autoBackup: boolean = false, revisionChange: number = 1) {
    this.game.revision += revisionChange;
  }

  drainActionLog(): string[][] {
    const log = this.actionLog;
    this.actionLog = [];
    return log;
  }

  addToUndo(info: string[]) {
    this.actionLog.push(info);
  }

  revertLastUndo() {
    this.actionLog.pop();
  }

  hasUndo(): boolean {
    return false;
  }
  undo(_sync: boolean = true) {}
  fixedUndo(_undolength: number, _sync: boolean = true) {}
  hasRedo(): boolean {
    return false;
  }
  redo(_sync: boolean = true) {}
  fixedRedo(_redolength: number, _sync: boolean = true) {}
  clearUndos() {}
  clearRedos() {}

  buildWsUrl(_protocol: string, _serverUrl: string, _port: number | string) {
    return '';
  }
  connect() {}
  disconnect() {}
  onMessage(_ev: any): any {}
  onOpen(_ev: Event) {}
  onClose(_ev: Event) {}
  onError(_ev: Event) {}
  forceUpdateState() {}
  requestSettings() {}
  sendPing() {}
  wsState(): number {
    return 3;
  }
  reset() {
    this.actionLog = [];
  }
  saveLocal() {}
  saveSettings() {}
  updatePermissions() {}
  savePermissions(_code: string, _permissions: Permissions | undefined) {}
}
