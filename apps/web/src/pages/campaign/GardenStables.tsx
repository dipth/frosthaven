/** Outpost garden and stables (pets), after GHS buildings/garden and stables (AGPL-3.0). */
import { characterKey, gardenSlots } from '@fh/engine';
import { Character, gameManager, labelText } from '@fh/ghs-core';
import { herbResourceLootTypes, type LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { useState } from 'react';
import { Panel } from '../../components/ui';
import { assetUrl, useImages } from '../../lib/board-data';
import { useCampaign } from '../../lib/campaign-store';

export function GardenPanel() {
  const { state, send } = useCampaign();
  const building = state!.ghs.party.buildings.find((b) => b.name === 'garden' && b.level);
  const [source, setSource] = useState('party');
  if (!building) return null;
  const garden = state!.ghs.party.garden ?? { flipped: false, automated: true, plots: [] as LootType[] };
  const slots = gardenSlots(building.level);
  const characters = gameManager.game.figures.filter((f): f is Character => f instanceof Character);
  const available = (herb: LootType) =>
    source === 'party'
      ? (state!.ghs.party.loot[herb] ?? 0)
      : (characters.find((c) => characterKey(c) === source)?.progress.loot[herb] ?? 0);
  const run = (type: string, payload: object = {}) => send(type, payload).catch(() => {});
  const canPlant = !state!.ghs.scenario && (building.level >= 3 || !garden.flipped);
  return (
    <Panel
      title={`Garden · level ${building.level}`}
      actions={
        <>
          {building.level < 3 && (
            <button className="btn px-2 py-1 text-xs" onClick={() => run('garden.flip')}>
              Flip to {garden.flipped ? 'planting' : 'harvest'} side
            </button>
          )}
          <button className="btn px-2 py-1 text-xs" disabled={!garden.plots.length} onClick={() => run('garden.harvest')}>
            Harvest now
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-frost-400">
        {building.level < 3 ? `Showing the ${garden.flipped ? 'harvest' : 'planting'} side. ` : ''}
        {garden.automated ? 'Harvests automatically when a week passes on the harvest side.' : 'Harvest by hand.'}{' '}
        <button className="underline" onClick={() => run('garden.toggleAutomation')}>
          {garden.automated ? 'Turn off' : 'Turn on'}
        </button>
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-frost-300">Plant from</span>
        <select className="input w-auto py-1" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="party">Frosthaven supply</option>
          {characters.map((c) => (
            <option key={c.name} value={characterKey(c)}>
              {gameManager.characterManager.characterName(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        {Array.from({ length: slots }, (_, slot) => (
          <div key={slot} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-16 text-frost-400">Plot {slot + 1}</span>
            <span className="w-24 font-medium">{garden.plots[slot] ? labelText('game.loot.' + garden.plots[slot]) : 'empty'}</span>
            <select
              className="input w-auto py-1 text-xs"
              disabled={!canPlant}
              value=""
              onChange={(e) => e.target.value && run('garden.plant', { slot, herb: e.target.value, source })}
            >
              <option value="">Plant…</option>
              {herbResourceLootTypes.map((herb) => (
                <option key={herb} value={herb} disabled={!available(herb)}>
                  {labelText('game.loot.' + herb)} ({available(herb)})
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function StablesPanel() {
  const { state, send } = useCampaign();
  const images = useImages();
  const building = state!.ghs.party.buildings.find((b) => b.name === 'stables' && b.level);
  if (!building) return null;
  const capacity = 4 + Math.floor(building.level / 2) * 4;
  const active = building.level < 3 ? 1 : 2;
  const pets = state!.ghs.party.pets ?? [];
  const cards = gameManager.editionData.find((e) => e.edition === 'fh')?.pets ?? [];
  const missing = cards.filter((card) => !pets.some((p) => p.name === card.id));
  const run = (type: string, payload: object) => send(type, payload).catch(() => {});
  return (
    <Panel title={`Stables · ${pets.length}/${capacity} pets, ${active} active per scenario`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {pets.map((pet) => (
          <div key={pet.name} className={`grid gap-1 rounded-lg border p-2 text-sm ${pet.active ? 'border-ice-400' : 'border-ink-600'} ${pet.lost ? 'opacity-60' : ''}`}>
            {images?.pets[pet.name] && <img src={assetUrl(images.pets[pet.name]!)} alt="" className="w-full rounded" loading="lazy" />}
            <div className="font-medium">
              {pet.petname || labelText(`data.pets.fh-${pet.name}`)} <span className="text-xs text-frost-400">#{pet.name}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <button className="btn px-2 py-0.5 text-xs" onClick={() => run('pets.toggleActive', { id: pet.name, edition: pet.edition })}>
                {pet.active ? 'Leave home' : 'Bring along'}
              </button>
              <button className="btn px-2 py-0.5 text-xs" onClick={() => run('pets.toggleLost', { id: pet.name, edition: pet.edition })}>
                {pet.lost ? 'Restore' : 'Used'}
              </button>
              <button
                className="btn px-2 py-0.5 text-xs"
                onClick={() => {
                  const name = prompt('Name your pet', pet.petname);
                  if (name !== null) run('pets.rename', { id: pet.name, edition: pet.edition, petname: name });
                }}
              >
                Name
              </button>
              <button
                className="btn px-2 py-0.5 text-xs"
                onClick={() => confirm('Release this pet?') && run('pets.remove', { id: pet.name, edition: pet.edition })}
              >
                Release
              </button>
            </div>
          </div>
        ))}
      </div>
      {missing.length > 0 && pets.length < capacity && (
        <select
          className="input mt-3 w-auto"
          value=""
          onChange={(e) => e.target.value && run('pets.add', { id: e.target.value, edition: 'fh' })}
        >
          <option value="">Add a captured pet…</option>
          {missing.map((card) => (
            <option key={card.id} value={card.id}>
              {card.id} {labelText(`data.pets.fh-${card.id}`)}
            </option>
          ))}
        </select>
      )}
    </Panel>
  );
}
