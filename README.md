# Frosthaven

A private, realtime, browser-based companion and virtual tabletop for our Frosthaven campaign. One shared campaign state, two kinds of session:

- **Physical**: a Gloomhaven Secretariat replacement at the table.
- **Online**: an assisted virtual tabletop for remote sessions.

Campaigns can be imported from and exported back to [Gloomhaven Secretariat](https://github.com/Lurkars/gloomhavensecretariat). This repository is private and the app is invite-only. Do not publish either; see [Licensing and data sources](#licensing-and-data-sources).

## Architecture

```
apps/server       Fastify + WebSocket campaign hub, invite-only auth, Drizzle/Postgres (Neon in prod)
apps/web          React + Vite + Tailwind client
packages/engine   command layer: validates and runs actions against the GHS runtime + our extensions
packages/ghs-core Gloomhaven Secretariat's game logic, vendored and shimmed to run in Node and the browser
packages/data     pinned upstream data sources -> packages/data/generated (gitignored)
```

- **Canonical state** is `{ ghs: GameModel, ext }`. `ghs` is exactly Secretariat's serialized game, so exporting back to Secretariat is lossless. `ext` holds what Secretariat doesn't model: player ownership, session mode, event drafts and follow-ups, outpost attacks, the outpost phase, narration cues, and in online mode the board and card hands.
- **Hidden information**: in online sessions each client gets `projectFor(state, user)`, which hides other players' hands, unrevealed card choices, battle goals and personal quests.
- **Physical sync**: the server keeps a baseline of what the physical box looks like (set on create/import and whenever the group marks the box as in sync). The **Box sync** tab lists the changes to make after online play.
- **Backups**: every few hours each changed campaign is written to `$BACKUP_DIR` as a Secretariat data dump plus the app's full state (newest 30 kept); admins can download them from the Admin page.
- **Commands** run server-side. The current state is loaded into the GHS managers, the action runs the same way Secretariat's UI performs it (`before()` → manager calls → `after()`), and the result is serialized and persisted as an event. Then each client is sent its own projected view of the state.
- **Undo** restores `state_before` from the most recent event (the last 100 events keep it).
- **Session log**: every event stores Secretariat's own undo-info strings plus our messages. The log renders them as text.

## Local development

You need [mise](https://mise.jdx.dev) and Docker.

```bash
mise install
```

```bash
cp .env.example .env
```

```bash
mise run setup
```

```bash
mise run dev:seed
```

```bash
mise run dev
```

- `mise install` installs the pinned Node and pnpm.
- `.env` gets its values from `.env.example`. Set `DEV_ADMIN_PASSWORD` in it before running `dev:seed`.
- `mise run setup` installs dependencies, starts Postgres in Docker (port 5433), syncs the game data and runs the migrations.
- `mise run dev:seed` creates the local `admin` user.
- `mise run dev` starts the server on :3000 and Vite on :5173. Open http://localhost:5173.

Other tasks: `mise run test`, `mise run typecheck`, `mise run db:generate` (after schema changes), `mise run db:studio`, `mise run assets:sync`.

### Game data and images

- `pnpm data:sync` fetches the pinned commits listed in `packages/data/sources.json` and writes the results to `packages/data/generated/`. It pulls:
  - Secretariat edition data (fh, fh-crossover, gh, fc, jotl);
  - fhtts scenario layouts;
  - Worldhaven image indexes.
- `pnpm assets:sync` downloads about 6,300 Worldhaven images into `$ASSETS_DIR/worldhaven`. They are served only to signed-in users.
- Online boards: `data:sync` also writes `generated/boards/<scenario>.json` (fhtts layouts in axial hex coordinates) and `generated/images.json`; `pnpm --filter @fh/data boards` rebuilds just those. Tile images are placed with `packages/data/tile-calibration.json` (committed). It was fitted with the Python tools in `packages/data/scripts/calibration/` (needs Pillow and numpy, and the synced images): `calibrate_tiles.py` finds each image's hex grid, `fit_content.py` aligns it using every scenario's content on that tile, and `render_board.py <scenario> out.png` renders a board to check the result.
- To update Secretariat:
  1. Bump `ghs.commit` in `sources.json`.
  2. Run `pnpm data:sync`.
  3. Run `pnpm --filter @fh/ghs-core vendor`, which re-copies the game logic with its imports rewritten.
  4. Run the tests.

## Deployment (Fly.io + Neon)

1. Create a Neon project in a region close to the Fly region, e.g. `aws-eu-central-1` with Fly `fra`. Copy the **pooled** connection string.
2. Set `app` in `fly.toml`, then create the app, a volume and the secrets:

   ```bash
   fly apps create <name>
   ```

   ```bash
   fly volumes create frosthaven_data --size 5 --region fra
   ```

   ```bash
   fly secrets set DATABASE_URL='<neon pooled url>' SESSION_SECRET="$(openssl rand -hex 32)"
   ```

3. Deploy. The release command runs the migrations.

   ```bash
   fly deploy
   ```

4. Create your admin account, either with a password or as a one-time invite link:

   ```bash
   fly ssh console -C "sh -c 'cd /app/apps/server && node --import tsx src/scripts/create-admin.ts <username> <Your Name>'"
   ```

   ```bash
   fly ssh console -C "sh -c 'cd /app/apps/server && node --import tsx src/scripts/create-admin.ts --invite https://<name>.fly.dev'"
   ```

5. Download the images to the volume (once, and again after bumping Worldhaven):

   ```bash
   fly ssh console -C "sh -c 'cd /app/apps/server && node --import tsx ../../packages/data/scripts/sync-assets.ts'"
   ```

6. Invite players from the **Admin** page. Invite links are single-use and expire after 7 days.

## Privacy

- There is no signup. Accounts come only from invites.
- Everything except `/login`, `/invite/:token`, `/robots.txt` and `/healthz` requires a session: the SPA, the API, the WebSocket, game data and images.
- Sessions are httpOnly, signed cookies stored hashed in Postgres. Passwords are hashed with argon2id. Login and invite acceptance are rate-limited.
- All responses send `X-Robots-Tag: noindex`.

## Licensing and data sources

- **Gloomhaven Secretariat** (`packages/ghs-core/src/vendor`, plus data via `data:sync`) is AGPL-3.0 © Lurkars. We run a modified copy as a network service, so players must be able to get the source; the group has access to this repository. See `packages/ghs-core/src/vendor/LICENSE`.
- **fhtts** scenario layouts are CC BY-NC-SA 4.0 © gudyfr.
- **Worldhaven** images are licensed by Cephalofair to the Worldhaven maintainer only. We fetch them for strictly private use, never commit or redistribute them, and serve them only behind auth.
- Frosthaven, Gloomhaven and all related content are © Cephalofair Games.
- **Forteller** narration is not accessed by this app. It only shows cues for the narrator to play the right track on forteller.gg.
