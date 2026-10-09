/**
 * Online mode: the hex map. Tiles are Worldhaven map tiles placed with the
 * calibration from packages/data; overlays, tokens and spawn points come from
 * the fhtts scenario layouts. Figures are dragged freely between hexes.
 */
import { boardKey, characterKey, hexCorners, hexKey, hexToPixel, pixelToHex, type BoardFile, type BoardItem, type CharacterToken, type EntityRef, type Hex, type TileOverride } from '@fh/engine';
import { Character, gameManager, labelText, Monster } from '@fh/ghs-core';
import type { Entity } from '@fh/ghs-core/vendor/game/model/Entity';
import type { Figure } from '@fh/ghs-core/vendor/game/model/Figure';
import { ObjectiveContainer } from '@fh/ghs-core/vendor/game/model/ObjectiveContainer';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assetUrl, slug, useBoard, useImages, useTileOverrides, type ImageIndex } from '../../../lib/board-data';
import { TipCard } from '../../../components/Tooltip';
import { useMe } from '../../../lib/me';
import { useCampaign } from '../../../lib/campaign-store';
import { Conditions } from './FigureCards';
import { displayName, entityMarkers, entityRef, maxHealth } from './helpers';

const SIZE = 100;
const R = SIZE / Math.sqrt(3);

interface Piece {
  key: string;
  ref: EntityRef;
  figure: Figure;
  entity: Entity;
  label: string;
  image?: string;
  number?: number;
  ring: string;
  /** Light background (black-and-white character icons). */
  light?: boolean;
  small?: boolean;
  active: boolean;
  /** Character tokens on the figure. */
  markers?: { key: string; color: string; icon?: string }[];
}

function pieces(images: ImageIndex | undefined): Piece[] {
  const out: Piece[] = [];
  for (const figure of gameManager.game.figures) {
    if (figure instanceof Character) {
      if (figure.absent || figure.exhausted) continue;
      out.push({
        key: boardKey(entityRef(figure, figure)),
        ref: entityRef(figure, figure),
        figure,
        entity: figure,
        label: gameManager.characterManager.characterName(figure),
        image: images?.icons[slug(figure.name)],
        ring: '#7dd3fc',
        light: true,
        active: figure.active
      });
      for (const summon of figure.summons.filter((s) => !s.dead && s.health > 0)) {
        out.push({
          key: boardKey(entityRef(figure, summon)),
          ref: entityRef(figure, summon),
          figure,
          entity: summon,
          label: summon.title || summon.name.replace(/-/g, ' '),
          number: summon.number,
          ring: '#86efac',
          small: true,
          active: summon.active
        });
      }
    } else if (figure instanceof Monster) {
      for (const entity of figure.entities.filter((e) => !e.dead && e.health > 0 && e.number > 0)) {
        out.push({
          key: boardKey(entityRef(figure, entity)),
          ref: entityRef(figure, entity),
          figure,
          entity,
          label: labelText('data.monster.' + figure.name),
          image: images?.monsters[slug(figure.name)],
          number: entity.number,
          ring: entity.type === 'elite' ? '#facc15' : entity.type === 'boss' ? '#f87171' : '#f1f5f9',
          active: entity.active || figure.active
        });
      }
    } else if (figure instanceof ObjectiveContainer) {
      for (const entity of figure.entities.filter((e) => !e.dead && e.health > 0)) {
        out.push({
          key: boardKey(entityRef(figure, entity)),
          ref: entityRef(figure, entity),
          figure,
          entity,
          label: figure.title || figure.name || (figure.escort ? 'Escort' : 'Objective'),
          number: entity.number,
          ring: figure.escort ? '#86efac' : '#c084fc',
          active: figure.active
        });
      }
    }
  }
  for (const piece of out) {
    piece.markers = entityMarkers(piece.entity).map((c) => ({ key: c.name, color: c.color, icon: images?.icons[slug(c.name)] }));
  }
  return out;
}

/** A large character token as drawn: the owner's colour and icon. */
interface TokenLook {
  label: string;
  color: string;
  icon?: string;
}

function tokenLook(token: { edition: string; name: string }, images: ImageIndex | undefined): TokenLook {
  const character = gameManager.game.figures.find((f): f is Character => f instanceof Character && f.edition === token.edition && f.name === token.name);
  return { label: character ? displayName(character) : token.name, color: character?.color ?? '#94a3b8', icon: images?.icons[slug(token.name)] };
}

/** Board maps on the table: the scenario map plus revealed sections. */
function visibleMaps(board: BoardFile) {
  const sections = new Set(gameManager.game.sections.map((s) => s.index));
  return board.maps
    .map((map, index) => ({ map, index }))
    .filter(({ map }) => map.type === 'scenario' || (map.type.startsWith('section') && sections.has(map.name)));
}

function tileTransform(tile: BoardFile['tiles'][number], override?: TileOverride) {
  const im = tile.image!;
  const k = SIZE / im.spacing;
  const p = hexToPixel(tile.origin, SIZE);
  const base = `translate(${p.x} ${p.y}) rotate(${-(im.rotation + tile.orientation)}) scale(${k}) translate(${-im.origin.x} ${-im.origin.y})`;
  if (!override) return base;
  // Corrections in the image's own pixels: about the image centre.
  const cx = im.width / 2;
  const cy = im.height / 2;
  return `${base} translate(${cx + (override.dx ?? 0)} ${cy + (override.dy ?? 0)}) rotate(${override.rotate180 ? 180 : 0}) scale(${override.scale ?? 1}) translate(${-cx} ${-cy})`;
}

function tileBounds(tile: BoardFile['tiles'][number]) {
  const im = tile.image!;
  const k = SIZE / im.spacing;
  const a = ((im.rotation + tile.orientation) * Math.PI) / 180;
  const p = hexToPixel(tile.origin, SIZE);
  return [
    [0, 0],
    [im.width, 0],
    [im.width, im.height],
    [0, im.height]
  ].map(([x, y]) => {
    const dx = (x! - im.origin.x) * k;
    const dy = (y! - im.origin.y) * k;
    return { x: p.x + dx * Math.cos(a) + dy * Math.sin(a), y: p.y - dx * Math.sin(a) + dy * Math.cos(a) };
  });
}

/** Which spawn hexes are used at this player count: levels string is per 2/3/4 players. */
function spawnType(levels: string, players: number): 'normal' | 'elite' | 'boss' | undefined {
  const c = levels[Math.min(2, Math.max(0, players - 2))] ?? 'n';
  return c === 'n' ? 'normal' : c === 'e' ? 'elite' : c === 'b' ? 'boss' : undefined;
}

export function Board({ onMenu }: { onMenu(refs: EntityRef[]): void }) {
  const { state, send } = useCampaign();
  const scenario = gameManager.game.scenario;
  const board = useBoard(scenario && scenario.edition === 'fh' && !scenario.custom ? scenario.index : undefined);
  const images = useImages();
  const me = useMe();
  const { overrides, save: saveOverride } = useTileOverrides();
  const [editTiles, setEditTiles] = useState(false);
  const [selectedTile, setSelectedTile] = useState<string>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0.5 });
  const [drag, setDrag] = useState<{ piece: Piece; at: { x: number; y: number }; moved: boolean; start: { x: number; y: number } }>();
  const [pan, setPan] = useState<{ x: number; y: number; vx: number; vy: number }>();
  /** Dragging a large character token: a placed one (id) or a new one from the tray. */
  const [tokenDrag, setTokenDrag] = useState<{ id?: string; edition: string; name: string; at: { x: number; y: number }; moved: boolean; start: { x: number; y: number } }>();
  /** Map tooltip ('item:<id>' or 'piece:<key>'): shown on mouse hover, or pinned by tapping an overlay. */
  const [tip, setTip] = useState<{ key: string; pinned: boolean }>();
  const hover = (key: string) => (on: boolean) => setTip((t) => (t?.pinned ? t : on ? { key, pinned: false } : t?.key === key ? undefined : t));
  const pressedAt = useRef<{ x: number; y: number }>(undefined);
  const tapped = (e: React.MouseEvent) => !pressedAt.current || Math.hypot(e.clientX - pressedAt.current.x, e.clientY - pressedAt.current.y) < 6;

  const boardState = state!.ext.board?.scenario === scenario?.index ? state!.ext.board : undefined;
  const positions = boardState?.positions ?? {};
  const removed = new Set(boardState?.removed ?? []);
  const all = pieces(images);
  const unnumbered = gameManager.game.figures
    .filter((f): f is Monster => f instanceof Monster)
    .reduce((n, m) => n + m.entities.filter((e) => !e.dead && e.health > 0 && e.number < 0).length, 0);
  /** Section whose monsters to put on the map once they have standee numbers. */
  const [autoPlace, setAutoPlace] = useState<string | false>(false);
  const numbering = useRef(false);
  const placed = all.filter((p) => positions[p.key]);
  const tokens = boardState?.characterTokens ?? [];
  const owners = state!.ext.characterOwners;
  // Characters whose tokens this player can put on the map.
  const tokenCharacters = gameManager.game.figures.filter(
    (f): f is Character => f instanceof Character && !f.absent && (!owners[characterKey(f)] || owners[characterKey(f)] === me.id || me.role === 'admin')
  );
  const unplaced = all.filter((p) => !positions[p.key]);

  const maps = useMemo(() => (board ? visibleMaps(board) : []), [board, state!.ghs.sections?.length]);
  const tiles = useMemo(() => {
    if (!board) return [];
    const names = new Set(maps.flatMap(({ map }) => map.tiles));
    return board.tiles.filter((t) => names.has(t.name) && t.image);
  }, [board, maps]);
  const items = [
    ...maps.flatMap(({ map, index }) => map.items.map((item, i) => ({ id: `${index}:${i}`, item }))),
    // Loot dropped by dead monsters.
    ...(boardState?.loot ?? []).map((hex, i) => ({ id: `loot:${i}`, item: { kind: 'token', name: 'loot', hex } as BoardItem }))
  ];

  // Fit the view to the visible tiles when the layout changes.
  const fitKey = tiles.map((t) => t.name).join();
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !tiles.length) return;
    const corners = tiles.flatMap(tileBounds);
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const { width, height } = svg.getBoundingClientRect();
    const k = Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.95;
    setView({ k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
  };

  const startDrag = (piece: Piece, e: React.PointerEvent) => {
    e.stopPropagation();
    const at = toWorld(e.clientX, e.clientY);
    setDrag({ piece, at, moved: false, start: { x: e.clientX, y: e.clientY } });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const moved = drag.moved || Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > 5;
      setDrag({ ...drag, at: toWorld(e.clientX, e.clientY), moved });
    };
    const up = (e: PointerEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!drag.moved && positions[drag.piece.key]) {
        onMenu([drag.piece.ref]);
      } else if (drag.moved && inside) {
        const hex = pixelToHex(toWorld(e.clientX, e.clientY), SIZE);
        send('board.move', { ref: drag.piece.ref, hex }).catch(() => {});
      } else if (drag.moved && positions[drag.piece.key]) {
        send('board.move', { ref: drag.piece.ref, hex: null }).catch(() => {});
      }
      setDrag(undefined);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  const startTokenDrag = (token: { id?: string; edition: string; name: string }, e: React.PointerEvent) => {
    e.stopPropagation();
    setTokenDrag({ ...token, at: toWorld(e.clientX, e.clientY), moved: false, start: { x: e.clientX, y: e.clientY } });
  };

  useEffect(() => {
    if (!tokenDrag) return;
    const move = (e: PointerEvent) => {
      const moved = tokenDrag.moved || Math.hypot(e.clientX - tokenDrag.start.x, e.clientY - tokenDrag.start.y) > 5;
      setTokenDrag({ ...tokenDrag, at: toWorld(e.clientX, e.clientY), moved });
    };
    const up = (e: PointerEvent) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const { id, edition, name } = tokenDrag;
      const hex = pixelToHex(toWorld(e.clientX, e.clientY), SIZE);
      if (id && !tokenDrag.moved) {
        if (confirm(`Remove this ${tokenLook(tokenDrag, images).label} token from the map?`)) send('board.moveCharacterToken', { id, hex: null }).catch(() => {});
      } else if (tokenDrag.moved && inside) {
        if (id) send('board.moveCharacterToken', { id, hex }).catch(() => {});
        else send('board.addCharacterToken', { character: { edition, name }, hex }).catch(() => {});
      } else if (tokenDrag.moved && id) {
        // Dropped off the map.
        send('board.moveCharacterToken', { id, hex: null }).catch(() => {});
      }
      setTokenDrag(undefined);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  useEffect(() => {
    if (!pan) return;
    const move = (e: PointerEvent) => setView((v) => ({ ...v, x: pan.vx + e.clientX - pan.x, y: pan.vy + e.clientY - pan.y }));
    const up = () => setPan(undefined);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [pan]);

  // Wheel zoom needs Ctrl/⌘ held (trackpad pinch sends ctrlKey too), so scrolling
  // the page past the map doesn't zoom it. Native listener: React's is passive and
  // can't stop the browser's own Ctrl+wheel page zoom.
  const [zoomHint, setZoomHint] = useState(false);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setZoomHint(true);
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => setZoomHint(false), 1200);
        return;
      }
      e.preventDefault();
      setZoomHint(false);
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const k = Math.min(3, Math.max(0.1, v.k * factor));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
      clearTimeout(hintTimer);
    };
  }, [board]);

  /** Put unplaced figures on start and spawn hexes: only `section`'s spawns, or the most recently revealed map's first. */
  const placeOnSpawns = (section?: string) => {
    if (!board) return;
    // Spawn points of rooms that are already open would be free again once their monsters die.
    const revealed = gameManager.game.sections.map((s) => s.index);
    const rank = (map: BoardFile['maps'][number]) => (map.type === 'scenario' ? -1 : revealed.indexOf(map.name));
    const spawnMaps = maps
      .filter(({ map }) => !section || (map.type !== 'scenario' && map.name === section))
      .sort((a, b) => rank(b.map) - rank(a.map));
    const players = gameManager.game.figures.filter((f) => f instanceof Character && !f.absent).length;
    const taken = new Set(Object.values(positions).map(hexKey));
    const placements: { ref: EntityRef; hex: Hex }[] = [];
    const take = (hex: Hex) => {
      if (taken.has(hexKey(hex))) return false;
      taken.add(hexKey(hex));
      return true;
    };
    const starts = items.filter(({ item }) => item.kind === 'token' && item.name === 'start').map(({ item }) => (item as Extract<BoardItem, { kind: 'token' }>).hex);
    for (const piece of unplaced) {
      if (piece.ref.kind === 'character') {
        const hex = starts.find((h) => !taken.has(hexKey(h)));
        if (hex && take(hex)) placements.push({ ref: piece.ref, hex });
      } else if (piece.ref.kind === 'monster') {
        const ref = piece.ref;
        const type = (piece.entity as { type?: string }).type;
        const spawns = spawnMaps
          .flatMap(({ map }) => map.items)
          .filter((item): item is Extract<BoardItem, { kind: 'monster' }> => item.kind === 'monster' && item.name === ref.name && spawnType(item.levels, players) === type);
        const exact = spawns.find((s) => s.standee === ref.number && !taken.has(hexKey(s.hex)));
        const spawn = exact ?? spawns.find((s) => !s.standee && !taken.has(hexKey(s.hex))) ?? spawns.find((s) => !taken.has(hexKey(s.hex)));
        if (spawn && take(spawn.hex)) placements.push({ ref: piece.ref, hex: spawn.hex });
      }
    }
    if (placements.length) send('board.place', { placements }).catch(() => {});
  };

  // After opening a door: put the newly revealed monsters on their spawn hexes.
  useEffect(() => {
    if (!autoPlace) return;
    if (unnumbered) {
      if (!numbering.current) {
        numbering.current = true;
        send('board.numberStandees')
          .catch(() => setAutoPlace(false))
          .finally(() => (numbering.current = false));
      }
      return;
    }
    setAutoPlace(false);
    placeOnSpawns(autoPlace);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const clickItem = (id: string, item: BoardItem) => {
    if (id.startsWith('loot:')) {
      send('board.pickUpLoot', { index: Number(id.slice(5)) }).catch(() => {});
      return;
    }
    if (item.kind === 'overlay' && /door/i.test(item.name + item.type)) {
      const section = item.trigger?.action === 'reveal' && item.trigger.what?.name;
      const isRemoved = removed.has(id);
      if (section && !gameManager.game.sections.some((s) => s.index === section) && !isRemoved) {
        if (confirm(`Open the door and reveal section ${section}?`)) {
          send('board.toggleItem', { id, removed: true })
            .then(() => send('scenario.addSection', { index: section }))
            .then(() => setAutoPlace(section))
            .catch(() => {});
        }
      } else {
        send('board.toggleItem', { id, removed: !isRemoved }).catch(() => {});
      }
    } else if (item.kind === 'token' && item.name !== 'start') {
      send('board.toggleItem', { id, removed: !removed.has(id) }).catch(() => {});
    }
  };

  if (board === undefined) return <div className="panel grid h-96 place-items-center text-sm text-frost-400">Loading the map…</div>;
  if (board === null) return <div className="panel p-4 text-sm text-frost-400">No map layout for this scenario; use the scenario book.</div>;

  const occupied = new Set(placed.map((p) => hexKey(positions[p.key]!)));
  const showStarts = gameManager.game.round === 0;

  return (
    <div className="grid gap-2">
      <div className="relative overflow-hidden rounded-xl border border-ink-600 bg-ink-950" style={{ height: '70vh' }}>
        <svg
          ref={svgRef}
          className="h-full w-full touch-none select-none"
          onPointerDown={(e) => {
            pressedAt.current = { x: e.clientX, y: e.clientY };
            setPan({ x: e.clientX, y: e.clientY, vx: view.x, vy: view.y });
          }}
          onClick={(e) => tapped(e) && setTip(undefined)}
        >
          <defs>
            <clipPath id="piece-clip" clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {tiles.map((tile) => (
              <image
                key={tile.name}
                href={assetUrl(tile.image!.path)}
                width={tile.image!.width}
                height={tile.image!.height}
                transform={tileTransform(tile, overrides[tile.name])}
                opacity={editTiles && selectedTile && selectedTile !== tile.name ? 0.45 : 1}
                className={editTiles ? 'cursor-pointer' : ''}
                onPointerDown={editTiles ? (e) => e.stopPropagation() : undefined}
                onClick={editTiles ? () => setSelectedTile(tile.name) : undefined}
              />
            ))}
            {items.map(({ id, item }) => (
              <BoardItemView
                key={id}
                item={item}
                removed={removed.has(id)}
                showStarts={showStarts}
                images={images}
                onClick={() => clickItem(id, item)}
                onHover={hover(`item:${id}`)}
                onTap={(e) => tapped(e) && setTip((t) => (t?.pinned && t.key === `item:${id}` ? undefined : { key: `item:${id}`, pinned: true }))}
              />
            ))}
            {tokens.map((token) =>
              tokenDrag?.id === token.id && tokenDrag.moved ? null : (
                <CharacterTokenView
                  key={token.id}
                  look={tokenLook(token, images)}
                  at={hexToPixel(token.hex, SIZE)}
                  onPointerDown={(e) => startTokenDrag(token, e)}
                  onHover={hover(`token:${token.id}`)}
                />
              )
            )}
            {placed.map((piece) =>
              drag?.piece.key === piece.key && drag.moved ? null : (
                <PieceView key={piece.key} piece={piece} at={hexToPixel(positions[piece.key]!, SIZE)} onPointerDown={(e) => startDrag(piece, e)} onHover={hover(`piece:${piece.key}`)} />
              )
            )}
            {drag?.moved && (
              <>
                <polygon
                  points={hexCorners(pixelToHex(drag.at, SIZE), SIZE, 0.95)}
                  fill={occupied.has(hexKey(pixelToHex(drag.at, SIZE))) ? 'rgba(248,113,113,0.35)' : 'rgba(125,211,252,0.35)'}
                  pointerEvents="none"
                />
                <PieceView piece={drag.piece} at={drag.at} ghost />
              </>
            )}
            {tokenDrag?.moved && (
              <>
                <polygon points={hexCorners(pixelToHex(tokenDrag.at, SIZE), SIZE, 0.95)} fill="rgba(125,211,252,0.35)" pointerEvents="none" />
                <CharacterTokenView look={tokenLook(tokenDrag, images)} at={tokenDrag.at} ghost />
              </>
            )}
          </g>
        </svg>
        {tip && !drag?.moved && !tokenDrag?.moved && (
          <BoardTip
            token={tokens.find((t) => `token:${t.id}` === tip.key)}
            images={images}
            entry={items.find((i) => `item:${i.id}` === tip.key)}
            piece={placed.find((p) => `piece:${p.key}` === tip.key)}
            at={positions}
            removed={tip.key.startsWith('item:') && removed.has(tip.key.slice(5))}
            view={view}
          />
        )}
        {zoomHint && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink-950/40">
            <span className="rounded-lg bg-ink-900/90 px-3 py-1.5 text-sm text-frost-100">
              Hold {/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} and scroll to zoom the map
            </span>
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1">
          {me.role === 'admin' && (
            <button
              className={`btn px-2 py-1 text-xs ${editTiles ? 'border-ice-400' : ''}`}
              onClick={() => {
                setEditTiles(!editTiles);
                setSelectedTile(undefined);
              }}
            >
              {editTiles ? 'Done editing' : 'Edit tiles'}
            </button>
          )}
          <button className="btn px-2 py-1 text-xs" onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.25) }))}>
            +
          </button>
          <button className="btn px-2 py-1 text-xs" onClick={() => setView((v) => ({ ...v, k: Math.max(0.1, v.k / 1.25) }))}>
            −
          </button>
        </div>
      </div>
      {editTiles && (
        <TileEditor
          name={selectedTile}
          override={selectedTile ? overrides[selectedTile] : undefined}
          onChange={(o) => selectedTile && saveOverride(selectedTile, o).catch(() => {})}
        />
      )}
      {unnumbered > 0 && (
        <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="text-frost-400">
            {unnumbered} monster standee{unnumbered === 1 ? ' has' : 's have'} no number yet.
          </span>
          <button className="btn ml-auto px-2 py-1 text-xs" onClick={() => send('board.numberStandees').catch(() => {})}>
            Draw standee numbers
          </button>
        </div>
      )}
      {tokenCharacters.length > 0 && (
        <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="text-frost-400">Character tokens:</span>
          {tokenCharacters.map((c) => (
            <button
              key={characterKey(c)}
              className="flex touch-none items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 text-xs hover:border-ice-400"
              onPointerDown={(e) => startTokenDrag({ edition: c.edition, name: c.name }, e)}
              title="Drag onto the map to place a token"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              {displayName(c)}
            </button>
          ))}
          <span className="text-xs text-frost-500">Drag onto a hex. Drag a placed token to move it, or off the map to remove it.</span>
        </div>
      )}
      {unplaced.length > 0 && (
        <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="text-frost-400">Not on the map:</span>
          {unplaced.map((piece) => (
            <button
              key={piece.key}
              className="flex touch-none items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 text-xs hover:border-ice-400"
              onPointerDown={(e) => startDrag(piece, e)}
              title="Drag onto the map"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: piece.ring }} />
              {piece.label}
              {piece.number ? ` ${piece.number}` : ''}
            </button>
          ))}
          <button className="btn ml-auto px-2 py-1 text-xs" onClick={() => placeOnSpawns()}>
            Place on start and spawn hexes
          </button>
        </div>
      )}
    </div>
  );
}

/** Overlays are drawn with their token art, outlined in a colour per overlay type. */
const OVERLAY_BORDER: Record<string, string> = {
  Obstacle: '#d6d3d1',
  'Difficult Terrain': '#38bdf8',
  'Hazardous Terrain': '#f97316',
  'Icy Terrain': '#e0f2fe',
  Trap: '#ef4444',
  Treasure: '#facc15',
  Objective: '#c084fc',
  'Pressure Plate': '#a3e635',
  Wall: '#57534e',
  Door: '#22c55e'
};

/**
 * Token art for a 1-, 2- or 3-hex overlay. The art is drawn for the unrotated
 * shape in boards.ts (hex 0 at the origin, then west, then north-west) and
 * turned counter-clockwise by the overlay's orientation about hex 0.
 */
function TerrainImage({ item, href }: { item: Extract<BoardItem, { kind: 'overlay' }>; href: string }) {
  const shape = [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }].slice(0, Math.min(3, item.hexes.length)).map((h) => hexToPixel(h, SIZE));
  const x0 = Math.min(...shape.map((p) => p.x)) - SIZE / 2;
  const x1 = Math.max(...shape.map((p) => p.x)) + SIZE / 2;
  const y0 = Math.min(...shape.map((p) => p.y)) - R;
  const y1 = Math.max(...shape.map((p) => p.y)) + R;
  const at = hexToPixel(item.hexes[0]!, SIZE);
  return (
    <image
      href={href}
      x={x0}
      y={y0}
      width={x1 - x0}
      height={y1 - y0}
      transform={`translate(${at.x} ${at.y}) rotate(${-item.orientation})`}
      pointerEvents="none"
    />
  );
}

function BoardItemView({
  item,
  removed,
  showStarts,
  images,
  onClick,
  onHover,
  onTap
}: {
  item: BoardItem;
  removed: boolean;
  showStarts: boolean;
  images: ImageIndex | undefined;
  onClick(): void;
  onHover(on: boolean): void;
  onTap(e: React.MouseEvent): void;
}) {
  if (item.kind === 'monster') {
    return null; // spawn points are only used for placement
  }
  if (item.kind === 'token') {
    if (removed) return null;
    const c = hexToPixel(item.hex, SIZE);
    if (item.name === 'start') {
      return showStarts ? <polygon points={hexCorners(item.hex, SIZE, 0.9)} fill="none" stroke="#7dd3fc" strokeDasharray="8 6" strokeWidth={3} pointerEvents="none" /> : null;
    }
    const loot = item.name === 'loot';
    return (
      <g
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(false)}
        onClick={onClick}
        className="cursor-pointer"
      >
        <circle cx={c.x} cy={c.y} r={R * 0.45} fill={loot ? '#fde68a' : '#1e293b'} stroke="#fef3c7" strokeWidth={3} />
        {loot && images?.icons['loot'] ? (
          <image href={assetUrl(images.icons['loot'])} x={c.x - R * 0.32} y={c.y - R * 0.32} width={R * 0.64} height={R * 0.64} />
        ) : (
          <text x={c.x} y={c.y + 9} textAnchor="middle" fontSize={26} fontWeight={700} fill="#fef3c7">
            {loot ? '$' : item.name === 'goal' ? '★' : item.name.toUpperCase()}
          </text>
        )}
      </g>
    );
  }
  const door = /door/i.test(item.name + item.type);
  if (removed && !door) return null;
  const border = door ? OVERLAY_BORDER['Door']! : (OVERLAY_BORDER[item.type] ?? '#94a3b8');
  // An opened door shows its open art where there is one, otherwise it is faded.
  const image = item.image && removed ? item.image.replace('-closed', '-open') : item.image;
  const faded = removed && image === item.image;
  return (
    <g
      onPointerDown={door ? (e) => e.stopPropagation() : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (door) onClick();
        else onTap(e);
      }}
      className={door ? 'cursor-pointer' : 'cursor-help'}
    >
      <g opacity={faded ? 0.4 : 1}>
        {image ? (
          <TerrainImage item={item} href={assetUrl(image)} />
        ) : (
          item.hexes.map((h) => <polygon key={hexKey(h)} points={hexCorners(h, SIZE, 0.9)} fill={border} fillOpacity={0.35} />)
        )}
      </g>
      {item.hexes.map((h) => (
        <polygon
          key={hexKey(h)}
          points={hexCorners(h, SIZE, 0.9)}
          fill="transparent"
          stroke={border}
          strokeWidth={5}
          strokeOpacity={removed ? 0.4 : 0.9}
          strokeDasharray={removed ? '10 8' : undefined}
        />
      ))}
    </g>
  );
}

type Overlay = Extract<BoardItem, { kind: 'overlay' }>;

/** What an overlay is and a short reminder of its rules. */
function overlayInfo(item: Overlay, removed: boolean): { kind: string; text: string } {
  const trap = gameManager.levelManager.trap();
  const hazard = gameManager.levelManager.terrain();
  if (/door/i.test(item.name + item.type)) {
    const section = item.trigger?.action === 'reveal' ? item.trigger.what?.name : undefined;
    return removed
      ? { kind: 'Open door', text: 'A normal hex now. Click to close it again.' }
      : {
          kind: 'Closed door',
          text: `Blocks line of sight, and monsters can't move through it. A character entering it opens it${section ? ` and reveals section ${section}` : ''}. Click to open.`
        };
  }
  switch (item.type) {
    case 'Obstacle':
      return { kind: item.type, text: "Can't be entered unless flying or jumping. Doesn't block line of sight." };
    case 'Difficult Terrain':
      return { kind: item.type, text: 'Entering it costs 2 movement points. Flying ignores it; a jump only pays for the hex it ends in.' };
    case 'Hazardous Terrain':
      return { kind: item.type, text: `A figure entering it without flying or jumping suffers ${hazard} damage (half trap damage).` };
    case 'Icy Terrain':
      return { kind: item.type, text: 'A figure entering it with a move (not flying or jumping) slides one more hex in the same direction, if it can.' };
    case 'Trap':
      return { kind: item.type, text: `Springs when a figure enters it without flying or jumping: ${trap} damage plus any effects the scenario lists. Then it's removed.` };
    case 'Treasure':
      return { kind: item.type, text: "A character loots it by ending a move here or with a loot ability. See the scenario's treasure list." };
    case 'Objective':
      return { kind: item.type, text: "Scenario objective. See the scenario's special rules." };
    case 'Pressure Plate':
      return { kind: item.type, text: "Triggers when a figure occupies it. See the scenario's special rules." };
    case 'Wall':
      return { kind: item.type, text: "Can't be entered and blocks line of sight." };
  }
  if (/corridor/i.test(item.name + item.type)) return { kind: 'Corridor', text: 'A normal hex that joins map tiles.' };
  return { kind: item.type || 'Overlay', text: 'See the scenario book for how this tile works.' };
}

/**
 * Shared look for every tooltip on the map: above the element (world
 * coordinates), or below it when it would be clipped at the top of the map,
 * and kept inside the map horizontally.
 */
function MapTip({
  at,
  view,
  title,
  kind,
  color,
  children
}: {
  at: { x: number; top: number; bottom: number };
  view: { x: number; y: number; k: number };
  title: string;
  kind: string;
  color: string;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ below: false, dx: 0 });
  const x = view.x + view.k * at.x;
  const top = view.y + view.k * at.top;
  const bottom = view.y + view.k * at.bottom;
  useLayoutEffect(() => {
    const el = ref.current;
    const map = el?.offsetParent as HTMLElement | null;
    if (!el || !map) return;
    const below = top - el.offsetHeight < 0;
    const half = el.offsetWidth / 2;
    const dx = Math.max(half - x, Math.min(0, map.clientWidth - half - x));
    if (below !== fit.below || dx !== fit.dx) setFit({ below, dx });
  });
  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute z-10 w-60 -translate-x-1/2 ${fit.below ? 'pt-2' : '-translate-y-full pb-2'}`}
      style={{ left: x + fit.dx, top: fit.below ? bottom : top }}
    >
      <TipCard title={title} kind={kind} color={color}>
        {children}
      </TipCard>
    </div>
  );
}

function pieceKind(piece: Piece): string {
  if (piece.ref.kind === 'character') return 'Character';
  if (piece.figure instanceof Character) return 'Summon';
  if (piece.figure instanceof ObjectiveContainer) return piece.figure.escort ? 'Escort' : 'Objective';
  const type = (piece.entity as { type?: string }).type ?? 'normal';
  return `${type[0]!.toUpperCase()}${type.slice(1)} monster`;
}

function BoardTip({
  token,
  images,
  entry,
  piece,
  at,
  removed,
  view
}: {
  token?: CharacterToken;
  images: ImageIndex | undefined;
  entry?: { item: BoardItem };
  piece?: Piece;
  at: Record<string, Hex>;
  removed: boolean;
  view: { x: number; y: number; k: number };
}) {
  if (token) {
    const c = hexToPixel(token.hex, SIZE);
    const look = tokenLook(token, images);
    return (
      <MapTip at={{ x: c.x, top: c.y - R, bottom: c.y + R }} view={view} title={`${look.label} token`} kind="Character token" color={look.color}>
        Stays until removed. Drag it to move it; click it or drag it off the map to remove it.
      </MapTip>
    );
  }
  if (piece && at[piece.key]) {
    const c = hexToPixel(at[piece.key]!, SIZE);
    const hp = piece.entity.health;
    const max = maxHealth(piece.entity);
    return (
      <MapTip at={{ x: c.x, top: c.y - R, bottom: c.y + R }} view={view} title={`${piece.label}${piece.number ? ` ${piece.number}` : ''}`} kind={pieceKind(piece)} color={piece.ring}>
        <span>
          {hp}/{max} HP{piece.active ? ' · taking its turn' : ''}
        </span>
        <Conditions entity={piece.entity} />
      </MapTip>
    );
  }
  const item = entry?.item;
  if (item?.kind === 'token') {
    const c = hexToPixel(item.hex, SIZE);
    const loot = item.name === 'loot';
    return (
      <MapTip at={{ x: c.x, top: c.y - R * 0.5, bottom: c.y + R * 0.5 }} view={view} title={loot ? 'Loot' : item.name === 'goal' ? 'Goal' : `Token ${item.name.toUpperCase()}`} kind={loot ? 'Loot token' : 'Scenario token'} color="#fef3c7">
        {loot ? 'A character picks it up by ending a move here or with a loot ability. Click to remove it.' : "See the scenario's special rules. Click to remove it."}
      </MapTip>
    );
  }
  if (item?.kind !== 'overlay') return null;
  const points = item.hexes.map((h) => hexToPixel(h, SIZE));
  const { kind, text } = overlayInfo(item, removed);
  const door = /door/i.test(item.name + item.type);
  return (
    <MapTip
      at={{ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, top: Math.min(...points.map((p) => p.y)) - R, bottom: Math.max(...points.map((p) => p.y)) + R }}
      view={view}
      title={item.name}
      kind={kind}
      color={door ? OVERLAY_BORDER['Door']! : (OVERLAY_BORDER[item.type] ?? '#94a3b8')}
    >
      {text}
    </MapTip>
  );
}

function PieceView({
  piece,
  at,
  ghost,
  onPointerDown,
  onHover
}: {
  piece: Piece;
  at: { x: number; y: number };
  ghost?: boolean;
  onPointerDown?(e: React.PointerEvent): void;
  onHover?(on: boolean): void;
}) {
  const r = (piece.small ? 0.3 : 0.4) * SIZE;
  const hp = piece.entity.health;
  const max = maxHealth(piece.entity);
  return (
    <g
      transform={`translate(${at.x} ${at.y})`}
      opacity={ghost ? 0.75 : 1}
      aria-label={`${piece.label}${piece.number ? ` ${piece.number}` : ''}`}
      onPointerDown={onPointerDown}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover?.(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover?.(false)}
      className={ghost ? 'pointer-events-none' : 'cursor-grab'}
    >
      {piece.active && <circle r={r + 10} fill="none" stroke="#fde047" strokeWidth={6} opacity={0.9} />}
      <circle r={r} fill={piece.light ? '#e0f2fe' : '#0f172a'} />
      {piece.image ? (
        piece.light ? (
          <image href={assetUrl(piece.image)} x={-r * 0.7} y={-r * 0.7} width={1.4 * r} height={1.4 * r} />
        ) : (
          <image href={assetUrl(piece.image)} x={-r} y={-r} width={2 * r} height={2 * r} preserveAspectRatio="xMidYMid slice" clipPath="url(#piece-clip)" />
        )
      ) : (
        <text y={10} textAnchor="middle" fontSize={piece.small ? 20 : 28} fontWeight={700} fill="#e2e8f0">
          {piece.label.slice(0, 2)}
        </text>
      )}
      <circle r={r} fill="none" stroke={piece.ring} strokeWidth={6} />
      {piece.number !== undefined && (
        <g transform={`translate(${r * 0.75} ${-r * 0.75})`}>
          <circle r={15} fill={piece.ring} />
          <text y={7} textAnchor="middle" fontSize={20} fontWeight={700} fill="#0f172a">
            {piece.number}
          </text>
        </g>
      )}
      {piece.markers?.map((m, i) => {
        // Around the lower-left edge, clockwise from the bottom.
        const a = ((135 + i * 40) * Math.PI) / 180;
        return (
          <g key={m.key} transform={`translate(${Math.cos(a) * r} ${Math.sin(a) * r})`}>
            <circle r={14} fill={m.color} stroke="#0f172a" strokeWidth={3} />
            {m.icon && <image href={assetUrl(m.icon)} x={-9} y={-9} width={18} height={18} />}
          </g>
        );
      })}
      <rect x={-r} y={r + 4} width={2 * r} height={8} rx={4} fill="#1e293b" />
      <rect x={-r} y={r + 4} width={(2 * r * Math.max(0, hp)) / Math.max(1, max)} height={8} rx={4} fill={hp / max > 0.5 ? '#4ade80' : hp / max > 0.25 ? '#facc15' : '#f87171'} />
    </g>
  );
}

/** A large character token in a hex: drawn under figures, so a standee on it leaves its rim showing. */
function CharacterTokenView({
  look,
  at,
  ghost,
  onPointerDown,
  onHover
}: {
  look: TokenLook;
  at: { x: number; y: number };
  ghost?: boolean;
  onPointerDown?(e: React.PointerEvent): void;
  onHover?(on: boolean): void;
}) {
  const r = R * 0.82;
  return (
    <g
      transform={`translate(${at.x} ${at.y})`}
      opacity={ghost ? 0.75 : 1}
      onPointerDown={onPointerDown}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover?.(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover?.(false)}
      className={ghost ? 'pointer-events-none' : 'cursor-grab'}
    >
      <circle r={r} fill={look.color} fillOpacity={0.55} stroke={look.color} strokeWidth={8} />
      <circle r={r - 4} fill="none" stroke="#0f172a" strokeWidth={2} strokeOpacity={0.6} />
      {look.icon && <image href={assetUrl(look.icon)} x={-r * 0.6} y={-r * 0.6} width={r * 1.2} height={r * 1.2} opacity={0.85} />}
    </g>
  );
}

/** Admin: correct a tile image that is placed wrongly (shared by every scenario and campaign). */
function TileEditor({ name, override, onChange }: { name?: string; override?: TileOverride; onChange(o: TileOverride | null): void }) {
  if (!name) return <div className="panel px-3 py-2 text-sm text-frost-400">Click a tile to correct its image. Corrections apply to every scenario.</div>;
  const o = override ?? {};
  const set = (change: Partial<TileOverride>) => onChange({ ...o, ...change });
  const nudge = (dx: number, dy: number) => set({ dx: (o.dx ?? 0) + dx, dy: (o.dy ?? 0) + dy });
  return (
    <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span className="font-medium">Tile {name}</span>
      <button className="btn px-2 py-1 text-xs" onClick={() => set({ rotate180: !o.rotate180 })}>
        Turn art 180°
      </button>
      <span className="text-xs text-frost-400">Nudge</span>
      {(
        [
          ['←', -2, 0],
          ['→', 2, 0],
          ['↑', 0, -2],
          ['↓', 0, 2]
        ] as const
      ).map(([label, dx, dy]) => (
        <button key={label} className="btn px-2 py-1 text-xs" onClick={() => nudge(dx, dy)}>
          {label}
        </button>
      ))}
      <span className="text-xs text-frost-400">Size</span>
      <button className="btn px-2 py-1 text-xs" onClick={() => set({ scale: Math.round(((o.scale ?? 1) - 0.01) * 100) / 100 })}>
        −
      </button>
      <span className="w-10 text-center font-mono text-xs">{Math.round((o.scale ?? 1) * 100)}%</span>
      <button className="btn px-2 py-1 text-xs" onClick={() => set({ scale: Math.round(((o.scale ?? 1) + 0.01) * 100) / 100 })}>
        +
      </button>
      <button className="btn ml-auto px-2 py-1 text-xs" disabled={!override} onClick={() => onChange(null)}>
        Reset
      </button>
    </div>
  );
}
