import type { CommandLog } from '@fh/engine';
import { undoInfoText } from '@fh/ghs-core';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useCampaign } from '../../lib/campaign-store';

interface EventRow {
  revision: number;
  type: string;
  log: CommandLog;
  userName: string | null;
  undoneAt: string | null;
  createdAt: string;
}

export function describe(type: string, log: CommandLog): string[] {
  const lines = [...log.messages, ...log.ghs.map(undoInfoText).filter(Boolean)];
  return lines.length ? lines : [type];
}

export function LogTab({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<EventRow[]>([]);
  const revision = useCampaign((s) => s.revision);

  useEffect(() => {
    api<EventRow[]>(`/api/campaigns/${campaignId}/events?limit=200`).then(setRows, () => {});
  }, [campaignId, revision]);

  return (
    <section className="panel p-4">
      <ol className="divide-y divide-ink-700 text-sm">
        {rows.map((row) => (
          <li key={row.revision} className={`flex gap-3 py-2 ${row.undoneAt ? 'opacity-50 line-through' : ''}`}>
            <span className="w-10 shrink-0 text-right font-mono text-xs text-frost-400">{row.revision}</span>
            <span className="w-28 shrink-0 truncate text-frost-300">{row.userName ?? 'system'}</span>
            <span className="flex-1">
              {describe(row.type, row.log).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </span>
            <time className="shrink-0 text-xs text-frost-400">{new Date(row.createdAt).toLocaleString()}</time>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-frost-400">Nothing has happened yet.</li>}
      </ol>
    </section>
  );
}
