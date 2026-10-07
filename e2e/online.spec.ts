/**
 * Online play with two players in two browsers: secret card choices, shared
 * board moves, and resync after a dropped connection.
 */
import { expect, test, type Page, type WebSocket } from '@playwright/test';
import { api, sendCommands, signIn } from './helpers';

const drifter = { edition: 'fh', name: 'drifter' };
const blinkblade = { edition: 'fh', name: 'blinkblade' };

/** Collects the campaign state frames a page receives. */
function stateFrames(page: Page) {
  const states: { revision: number; state: { ext: { hands?: Record<string, { selected: number[] }>; board?: { positions: Record<string, unknown> } } } }[] = [];
  page.on('websocket', (ws: WebSocket) => {
    if (!ws.url().includes('/ws')) return;
    ws.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.t === 'state') states.push(message);
    });
  });
  return states;
}

test('card choices stay secret until revealed, moves sync, reconnects resync', async ({ browser }) => {
  const alice = await signIn(browser, 'alice');
  const bob = await signIn(browser, 'bob');
  const me = await api<{ id: string }>(bob, '/api/auth/me');
  const { id } = await api<{ id: string }>(alice, '/api/campaigns', { method: 'POST', json: { name: 'E2E' } });
  await api(alice, `/api/campaigns/${id}/sessions`, { method: 'POST', json: { mode: 'online' } });

  const decks = (await alice.evaluate(async () => (await fetch('/game-data/ghs/fh.json')).json())) as {
    decks: { name: string; abilities: { cardId: number; level: number | string; initiative: number }[] }[];
  };
  const level1 = (name: string) => decks.decks.find((d) => d.name === name)!.abilities.filter((a) => a.level === 1).map((a) => a.cardId);
  const meUser = await api<{ id: string }>(alice, '/api/auth/me');
  await sendCommands(alice, id, [
    ['character.add', drifter],
    ['character.add', blinkblade],
    ['character.setOwner', { ...drifter, userId: meUser.id }],
    ['character.setOwner', { ...blinkblade, userId: me.id }],
    ['scenario.set', { index: '1' }],
    ['hands.setup', { ...drifter, cards: level1('drifter') }],
    ['hands.setup', { ...blinkblade, cards: level1('blinkblade') }]
  ]);

  const bobStates = stateFrames(bob);
  await alice.goto(`/campaigns/${id}/scenario`);
  await bob.goto(`/campaigns/${id}/scenario`);
  const waiting = bob.getByText(/^Waiting for /);
  await expect(waiting).toContainText('Drifter');
  await expect(waiting).toContainText('Blinkblade');

  // Alice secretly picks two cards in the UI.
  const choose = alice.locator('section', { hasText: /choose two cards/i });
  const cards = choose.locator('button:has(img), button:has(.font-mono)');
  await cards.nth(0).click();
  await cards.nth(1).click();
  await expect(waiting).not.toContainText('Drifter');
  await expect(waiting).toContainText('Blinkblade');
  const seen = bobStates.at(-1)!.state.ext.hands!['fh:drifter']!.selected;
  expect(seen).toEqual([-1, -1]);

  // Bob picks, everyone reveals; now Bob sees Alice's cards.
  await sendCommands(bob, id, [['hands.select', { ...blinkblade, cards: level1('blinkblade').slice(0, 2) }]]);
  await bob.getByRole('button', { name: 'Reveal cards' }).click();
  await expect.poll(() => bobStates.at(-1)?.state.ext.hands?.['fh:drifter']?.selected.every((c) => c > 0)).toBe(true);

  // A standee moved by Bob shows up for Alice.
  await sendCommands(bob, id, [['board.move', { ref: { kind: 'character', ...blinkblade }, hex: { x: 3, y: -2 } }]]);
  await expect(alice.locator('svg g[aria-label^="Blinkblade"]')).toHaveCount(1);

  // Alice drops offline; Bob keeps playing; Alice catches up on reconnect.
  await alice.context().setOffline(true);
  await sendCommands(bob, id, [['board.move', { ref: { kind: 'character', ...blinkblade }, hex: { x: 4, y: -2 } }]]);
  await alice.context().setOffline(false);
  await alice.reload();
  const aliceBoard = await alice.evaluate(async (campaignId) => {
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/api/campaigns/${campaignId}/ws`);
    const state = await new Promise<{ state: { ext: { board: { positions: Record<string, { x: number; y: number }> } } } }>((resolve) => {
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.t === 'state') resolve(message);
      };
    });
    ws.close();
    return state.state.ext.board.positions;
  }, id);
  expect(aliceBoard['character:fh:blinkblade']).toEqual({ x: 4, y: -2 });
});
