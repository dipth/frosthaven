import { useEffect, useState } from 'react';
import { Route, Switch } from 'wouter';
import { Layout } from './components/Layout';
import { api, type Me } from './lib/api';
import { ghsReady } from './lib/ghs';
import { MeContext } from './lib/me';
import { AdminPage } from './pages/AdminPage';
import { CampaignPage } from './pages/CampaignPage';
import { CampaignsPage } from './pages/CampaignsPage';

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([api<Me>('/api/auth/me'), ghsReady()])
      .then(([user]) => setMe(user))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <div className="p-8 text-blood-400">Failed to start: {error}</div>;
  }
  if (!me) {
    return <div className="grid min-h-screen place-items-center text-frost-400">Gathering supplies…</div>;
  }

  return (
    <MeContext.Provider value={me}>
      <Layout>
        <Switch>
          <Route path="/" component={CampaignsPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/campaigns/:id" nest>
            {(params) => <CampaignPage id={params.id} />}
          </Route>
          <Route>
            <div className="text-frost-400">Not found.</div>
          </Route>
        </Switch>
      </Layout>
    </MeContext.Provider>
  );
}
