import { useEffect } from 'react';
import { Link, Route, Switch, useRoute } from 'wouter';
import { useCampaign } from '../lib/campaign-store';
import { DataTab } from './campaign/DataTab';
import { LogTab } from './campaign/LogTab';
import { OverviewTab } from './campaign/OverviewTab';
import { ScenarioTab } from './campaign/ScenarioTab';

const tabs = [
  { path: '/', label: 'Campaign' },
  { path: '/scenario', label: 'Scenario' },
  { path: '/log', label: 'Log' },
  { path: '/data', label: 'Data' }
];

export function CampaignPage({ id }: { id: string }) {
  const { connect, disconnect, state, status, presence, lastError, clearError, undo } = useCampaign();

  useEffect(() => {
    connect(id);
    return () => disconnect();
  }, [id, connect, disconnect]);

  useEffect(() => {
    if (lastError) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [lastError, clearError]);

  if (!state) {
    return <p className="text-frost-400">{status === 'closed' ? (lastError ?? 'Disconnected') : 'Connecting…'}</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{state.ghs.party.name || 'Unnamed party'}</h1>
        <span className="rounded-full border border-ink-600 px-2 py-0.5 text-xs uppercase tracking-wide text-frost-400">{state.ext.mode}</span>
        <ConnectionDot status={status} />
        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {presence.map((u) => (
              <span
                key={u.id}
                title={u.displayName}
                className="grid h-7 w-7 place-items-center rounded-full border-2 border-ink-900 bg-ice-500 text-xs font-semibold text-ink-950"
              >
                {u.displayName.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <button className="btn" onClick={() => undo().catch(() => {})} title="Undo the last action">
            Undo
          </button>
        </div>
      </div>
      <nav className="flex gap-1 border-b border-ink-600">
        {tabs.map((tab) => (
          <TabLink key={tab.path} path={tab.path} label={tab.label} />
        ))}
      </nav>
      {lastError && <div className="rounded-lg border border-blood-400/40 bg-blood-400/10 px-3 py-2 text-sm text-blood-400">{lastError}</div>}
      <Switch>
        <Route path="/" component={OverviewTab} />
        <Route path="/scenario" component={ScenarioTab} />
        <Route path="/log">{() => <LogTab campaignId={id} />}</Route>
        <Route path="/data">{() => <DataTab campaignId={id} />}</Route>
      </Switch>
    </div>
  );
}

function TabLink({ path, label }: { path: string; label: string }) {
  const [active] = useRoute(path);
  return (
    <Link
      href={path}
      className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${active ? 'border-ice-400 text-frost-100' : 'border-transparent text-frost-400 hover:text-frost-100'}`}
    >
      {label}
    </Link>
  );
}

function ConnectionDot({ status }: { status: string }) {
  const color = status === 'open' ? 'bg-moss-400' : status === 'reconnecting' || status === 'connecting' ? 'bg-ember-400' : 'bg-blood-400';
  return <span title={status} className={`h-2 w-2 rounded-full ${color}`} />;
}
