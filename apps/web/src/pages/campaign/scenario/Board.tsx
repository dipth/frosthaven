/**
 * Online mode: the hex map. Tiles are Worldhaven map tiles placed with the
 * calibration from packages/data; overlays, tokens and spawn points come from
 * the fhtts scenario layouts. Figures are dragged freely between hexes.
 */
import { boardKey, hexCorners, hexKey, hexToPixel, pixelToHex, type BoardFile, type BoardItem, type EntityRef, type Hex, type TileOverride } from '@fh/engine';
import { Character, gameManager, labelText, Monster } from '@fh/ghs-core';
import type { Entity } from '@fh/ghs-core/vendor/game/model/Entity';
import type { Figure } from '@fh/ghs-core/vendor/game/model/Figure';
import { ObjectiveContainer } from '@fh/ghs-core/vendor/game/model/ObjectiveContainer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl, slug, useBoard, useImages, useTileOverrides, type ImageIndex } from '../../../lib/board-data';
import { useMe } from '../../../lib/me';
import { useCampaign } from '../../../lib/campaign-store';
import { entityRef, maxHealth } from './helpers';

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
  return out;
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

  const boardState = state!.ext.board?.scenario === scenario?.index ? state!.ext.board : undefined;
  const positions = boardState?.positions ?? {};
  const removed = new Set(boardState?.removed ?? []);
  const all = pieces(images);
  const unnumbered = gameManager.game.figures
    .filter((f): f is Monster => f instanceof Monster)
    .reduce((n, m) => n + m.entities.filter((e) => !e.dead && e.health > 0 && e.number < 0).length, 0);
  const [autoPlace, setAutoPlace] = useState(false);
  const numbering = useRef(false);
  const placed = all.filter((p) => positions[p.key]);
  const unplaced = all.filter((p) => !positions[p.key]);

  const maps = useMemo(() => (board ? visibleMaps(board) : []), [board, state!.ghs.sections?.length]);
  const tiles = useMemo(() => {
    if (!board) return [];
    const names = new Set(maps.flatMap(({ map }) => map.tiles));
    return board.tiles.filter((t) => names.has(t.name) && t.image);
  }, [board, maps]);
  const items = maps.flatMap(({ map, index }) => map.items.map((item, i) => ({ id: `${index}:${i}`, item })));

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

  const onWheel = (e: React.WheelEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const k = Math.min(3, Math.max(0.1, v.k * factor));
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });
  };

  const placeOnSpawns = () => {
    if (!board) return;
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
        const spawns = items
          .map(({ item }) => item)
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
    placeOnSpawns();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const clickItem = (id: string, item: BoardItem) => {
    if (item.kind === 'overlay' && /door/i.test(item.name + item.type)) {
      const section = item.trigger?.action === 'reveal' && item.trigger.what?.name;
      const isRemoved = removed.has(id);
      if (section && !gameManager.game.sections.some((s) => s.index === section) && !isRemoved) {
        if (confirm(`Open the door and reveal section ${section}?`)) {
          send('board.toggleItem', { id, removed: true })
            .then(() => send('scenario.addSection', { index: section }))
            .then(() => setAutoPlace(true))
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
          onWheel={onWheel}
          onPointerDown={(e) => setPan({ x: e.clientX, y: e.clientY, vx: view.x, vy: view.y })}
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
              <BoardItemView key={id} item={item} removed={removed.has(id)} showStarts={showStarts} images={images} onClick={() => clickItem(id, item)} />
            ))}
            {placed.map((piece) =>
              drag?.piece.key === piece.key && drag.moved ? null : (
                <PieceView key={piece.key} piece={piece} at={hexToPixel(positions[piece.key]!, SIZE)} onPointerDown={(e) => startDrag(piece, e)} />
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
          </g>
        </svg>
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
          <button className="btn ml-auto px-2 py-1 text-xs" onClick={placeOnSpawns}>
            Place on start and spawn hexes
          </button>
        </div>
      )}
    </div>
  );
}

const OVERLAY_ICON: Record<string, string> = {
  Obstacle: 'overlaytileobstacle',
  'Difficult Terrain': 'overlaytiledifficultterrain',
  'Hazardous Terrain': 'overlaytilehazardousterrain',
  'Icy Terrain': 'overlaytileicyterrain',
  Trap: 'overlaytiletrap',
  Treasure: 'treasurechest',
  Objective: 'overlaytileobjective',
  'Pressure Plate': 'overlaytilepressureplate',
  Wall: 'overlaytilewall'
};

const OVERLAY_FILL: Record<string, string> = {
  Obstacle: 'rgba(120,113,108,0.55)',
  'Difficult Terrain': 'rgba(56,189,248,0.25)',
  'Hazardous Terrain': 'rgba(249,115,22,0.35)',
  'Icy Terrain': 'rgba(186,230,253,0.35)',
  Trap: 'rgba(239,68,68,0.4)',
  Treasure: 'rgba(250,204,21,0.45)',
  Objective: 'rgba(192,132,252,0.4)',
  'Pressure Plate': 'rgba(163,230,53,0.35)',
  Wall: 'rgba(30,30,30,0.7)'
};

function BoardItemView({
  item,
  removed,
  showStarts,
  images,
  onClick
}: {
  item: BoardItem;
  removed: boolean;
  showStarts: boolean;
  images: ImageIndex | undefined;
  onClick(): void;
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
      <g onPointerDown={(e) => e.stopPropagation()} onClick={onClick} className="cursor-pointer">
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
  const corridor = /corridor/i.test(item.name + item.type);
  if (removed && !door) return null;
  const fill = door ? (removed ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.45)') : corridor ? 'rgba(255,255,255,0.08)' : (OVERLAY_FILL[item.type] ?? 'rgba(148,163,184,0.3)');
  const interactive = door;
  return (
    <g onPointerDown={interactive ? (e) => e.stopPropagation() : undefined} onClick={interactive ? onClick : undefined} className={interactive ? 'cursor-pointer' : ''}>
      <title>{`${item.name}${item.type ? ` (${item.type})` : ''}${door && item.trigger?.what?.name ? ` · section ${item.trigger.what.name}` : ''}`}</title>
      {item.hexes.map((h) => (
        <polygon key={hexKey(h)} points={hexCorners(h, SIZE, 0.92)} fill={fill} stroke={door ? '#22c55e' : 'none'} strokeWidth={door ? 4 : 0} />
      ))}
      {!door && !corridor && images && OVERLAY_ICON[item.type] && images.icons[OVERLAY_ICON[item.type]!] && (
        <image
          href={assetUrl(images.icons[OVERLAY_ICON[item.type]!]!)}
          x={hexToPixel(item.hexes[0]!, SIZE).x - R * 0.35}
          y={hexToPixel(item.hexes[0]!, SIZE).y - R * 0.35}
          width={R * 0.7}
          height={R * 0.7}
          opacity={0.85}
          pointerEvents="none"
        />
      )}
      {door && !removed && (
        <text x={hexToPixel(item.hexes[0]!, SIZE).x} y={hexToPixel(item.hexes[0]!, SIZE).y + 8} textAnchor="middle" fontSize={22} fill="#dcfce7" pointerEvents="none">
          door
        </text>
      )}
    </g>
  );
}

function PieceView({ piece, at, ghost, onPointerDown }: { piece: Piece; at: { x: number; y: number }; ghost?: boolean; onPointerDown?(e: React.PointerEvent): void }) {
  const r = (piece.small ? 0.3 : 0.4) * SIZE;
  const hp = piece.entity.health;
  const max = maxHealth(piece.entity);
  return (
    <g transform={`translate(${at.x} ${at.y})`} opacity={ghost ? 0.75 : 1} onPointerDown={onPointerDown} className={ghost ? 'pointer-events-none' : 'cursor-grab'}>
      <title>{`${piece.label}${piece.number ? ` ${piece.number}` : ''} · ${hp}/${max} HP`}</title>
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
      <rect x={-r} y={r + 4} width={2 * r} height={8} rx={4} fill="#1e293b" />
      <rect x={-r} y={r + 4} width={(2 * r * Math.max(0, hp)) / Math.max(1, max)} height={8} rx={4} fill={hp / max > 0.5 ? '#4ade80' : hp / max > 0.25 ? '#facc15' : '#f87171'} />
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
