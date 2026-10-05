/** Forteller narration cues: actionable for the narrator, a heads-up for everyone else. */
import { FORTELLER_URL } from '@fh/engine';
import { useState } from 'react';
import { useCampaign } from '../lib/campaign-store';
import { useMe } from '../lib/me';

export function NarrationBanner() {
  const { state, send } = useCampaign();
  const me = useMe();
  const [copied, setCopied] = useState<string>();
  const cues = state!.ext.narration ?? [];
  if (!cues.length) return null;
  const narrator = state!.ext.narratorUserId;
  const isNarrator = !narrator || narrator === me.id;
  if (!isNarrator) {
    const latest = cues[cues.length - 1]!;
    return (
      <div className="rounded-xl border border-ink-600 bg-ink-850 px-4 py-2 text-sm text-frost-300">
        🎧 Narration: <b>{latest.title}</b>
      </div>
    );
  }
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied(undefined);
    }
  };
  return (
    <div className="grid gap-2 rounded-xl border border-ice-500/40 bg-ice-500/10 px-4 py-3 text-sm">
      {cues.map((cue) => (
        <div key={cue.id} className="flex flex-wrap items-center gap-2">
          <span>
            🎧 Play <b>{cue.title}</b> <span className="text-frost-400">· search “{cue.search}”</span>
          </span>
          <span className="ml-auto flex gap-2">
            <button className="btn px-2 py-1 text-xs" onClick={() => copy(cue.id, cue.search)}>
              {copied === cue.id ? 'Copied' : 'Copy search'}
            </button>
            <a className="btn px-2 py-1 text-xs" href={cue.url ?? FORTELLER_URL} target="_blank" rel="noreferrer">
              Open Forteller
            </a>
            <button className="btn px-2 py-1 text-xs" onClick={() => send('narration.dismiss', { id: cue.id }).catch(() => {})}>
              Done
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
