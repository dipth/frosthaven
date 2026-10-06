import { expect, type Browser, type Page } from '@playwright/test';
import { PASSWORD } from './global-setup';

export async function signIn(browser: Browser, username: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** Runs campaign commands in order through the page's own (authenticated) WebSocket connection. */
export async function sendCommands(page: Page, campaignId: string, commands: [string, unknown][]) {
  return page.evaluate(
    async ({ campaignId, commands }) => {
      const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/api/campaigns/${campaignId}/ws`);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });
      const results: unknown[] = [];
      for (const [i, [type, payload]] of commands.entries()) {
        const id = `e2e-${i}`;
        const reply = await new Promise((resolve) => {
          const handler = (event: MessageEvent) => {
            const message = JSON.parse(event.data);
            if ((message.t === 'ack' || message.t === 'reject') && message.id === id) {
              ws.removeEventListener('message', handler);
              resolve(message);
            }
          };
          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ t: 'cmd', id, type, payload }));
        });
        results.push(reply);
        if ((reply as { t: string }).t === 'reject') throw new Error(`${type}: ${JSON.stringify(reply)}`);
      }
      ws.close();
      return results;
    },
    { campaignId, commands }
  );
}

export async function api<T>(page: Page, path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init?.method ?? 'GET',
        headers: init?.json ? { 'content-type': 'application/json' } : {},
        body: init?.json ? JSON.stringify(init.json) : null
      });
      if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
      return res.json();
    },
    { path, init }
  );
}
