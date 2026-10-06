import { loadGhs, type CampaignState, type ClientMessage, type LogLine, type PresenceUser, type ServerMessage, sessionRules } from '@fh/engine';
import { create } from 'zustand';

type Status = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

interface Pending {
  resolve(revision: number): void;
  reject(error: Error): void;
}

interface CampaignStore {
  campaignId?: string;
  status: Status;
  state?: CampaignState;
  revision: number;
  presence: PresenceUser[];
  /** Log lines received live since connecting (newest last). */
  liveLog: LogLine[];
  lastError?: string;
  connect(campaignId: string): void;
  disconnect(): void;
  send(type: string, payload?: unknown): Promise<number>;
  undo(): Promise<number>;
  clearError(): void;
}

let socket: WebSocket | undefined;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
const pending = new Map<string, Pending>();
let seq = 0;

export class CommandRejected extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

export const useCampaign = create<CampaignStore>((set, get) => {
  function open(campaignId: string) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/api/campaigns/${campaignId}/ws`);
    socket = ws;

    ws.onopen = () => {
      retry = 0;
      set({ status: 'open' });
      clearInterval(pingTimer);
      pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'ping' })), 25000);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      switch (message.t) {
        case 'state': {
          if (message.revision < get().revision && get().state) {
            return;
          }
          // Keep the in-browser GHS runtime in sync so components can use GHS helpers.
          loadGhs(message.state.ghs, sessionRules(message.state.ext));
          set((s) => ({
            state: message.state,
            revision: message.revision,
            liveLog: message.log ? [...s.liveLog.slice(-199), message.log] : s.liveLog
          }));
          break;
        }
        case 'ack':
          pending.get(message.id)?.resolve(message.revision);
          pending.delete(message.id);
          break;
        case 'reject': {
          const entry = pending.get(message.id);
          pending.delete(message.id);
          set({ lastError: message.error });
          entry?.reject(new CommandRejected(message.error, message.code));
          break;
        }
        case 'presence':
          set({ presence: message.users });
          break;
        case 'pong':
          break;
      }
    };

    ws.onclose = (event) => {
      clearInterval(pingTimer);
      for (const [id, entry] of pending) {
        entry.reject(new Error('Connection lost'));
        pending.delete(id);
      }
      if (socket !== ws) {
        return;
      }
      if (event.code === 4404) {
        set({ status: 'closed', lastError: 'Campaign not found' });
        return;
      }
      set({ status: 'reconnecting' });
      const delay = Math.min(1000 * 2 ** retry++, 15000);
      retryTimer = setTimeout(() => get().campaignId === campaignId && open(campaignId), delay);
    };
  }

  function sendMessage(message: Extract<ClientMessage, { id: string }>): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      pending.set(message.id, { resolve, reject });
      socket.send(JSON.stringify(message));
    });
  }

  return {
    status: 'idle',
    revision: 0,
    presence: [],
    liveLog: [],
    connect(campaignId) {
      if (get().campaignId === campaignId && socket) {
        return;
      }
      get().disconnect();
      set({ campaignId, status: 'connecting', state: undefined, revision: 0, presence: [], liveLog: [], lastError: undefined });
      open(campaignId);
    },
    disconnect() {
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      const ws = socket;
      socket = undefined;
      ws?.close();
      set({ campaignId: undefined, status: 'idle' });
    },
    send(type, payload = {}) {
      return sendMessage({ t: 'cmd', id: `c${++seq}`, type, payload });
    },
    undo() {
      return sendMessage({ t: 'undo', id: `u${++seq}` });
    },
    clearError() {
      set({ lastError: undefined });
    }
  };
});

if (import.meta.env.DEV) {
  (window as unknown as { __campaign: typeof useCampaign }).__campaign = useCampaign;
}
