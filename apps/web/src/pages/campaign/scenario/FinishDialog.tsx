import { ScenarioSummary } from '@fh/engine';
import { Character, gameManager, labelText } from '@fh/ghs-core';
import { Modal } from '../../../components/ui';
import { useCampaign } from '../../../lib/campaign-store';
import { lootText } from './helpers';

/** The shared scenario-finish draft (game.finish), like GHS' scenario summary dialog. */
export function FinishDialog() {
  const { send } = useCampaign();
  const summary = ScenarioSummary.fromGame();
  if (!summary) {
    return null;
  }
  const update = (change: object) => send('finish.update', change).catch(() => {});
  const rewards = summary.rewards;
  const lootDeck = gameManager.game.lootDeck;

  return (
    <Modal title={`Scenario ${summary.success ? 'won' : 'lost'}${summary.conclusion ? ` · §${summary.conclusion.index}` : ''}`} onClose={() => send('finish.cancel').catch(() => {})}>
      <table className="mb-4 w-full text-sm">
        <thead className="text-left text-xs text-frost-400">
          <tr>
            <th className="pb-1 font-normal">Character</th>
            <th className="pb-1 font-normal">XP</th>
            <th className="pb-1 font-normal">Loot</th>
            {summary.success && <th className="pb-1 font-normal">Battle goal</th>}
          </tr>
        </thead>
        <tbody>
          {summary.characters.map((character: Character, index: number) => {
            const bonus =
              summary.success && (!rewards?.ignoredBonus?.includes('experience')) ? gameManager.levelManager.experience() : 0;
            const loot = character.lootCards.map((i) => lootText(lootDeck.cards[i])).join(', ');
            return (
              <tr key={character.name} className={`border-t border-ink-700 ${character.absent ? 'opacity-50' : ''}`}>
                <td className="py-1.5">
                  {gameManager.characterManager.characterName(character)}
                  {summary.levelUp[index] && <span className="ml-1 text-xs text-moss-400">level up!</span>}
                </td>
                <td className="py-1.5 font-mono">
                  {character.experience}
                  {bonus ? <span className="text-frost-400"> +{bonus}</span> : null}
                </td>
                <td className="py-1.5 text-xs text-frost-300">{loot || character.loot || '—'}</td>
                {summary.success && (
                  <td className="py-1.5">
                    {[1, 2, 3].map((value) => (
                      <input
                        key={value}
                        type="checkbox"
                        className="mr-1"
                        checked={(summary.battleGoals[index] ?? 0) >= value}
                        onChange={(e) => update({ op: 'battleGoal', index, value, checked: e.target.checked })}
                      />
                    ))}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {rewards && (
        <div className="mb-4 grid gap-3 text-sm">
          <div className="label">Rewards</div>
          {rewards.collectiveGold ? (
            <Distribution
              title={`Split ${rewards.collectiveGold} gold`}
              characters={summary.characters}
              values={summary.collectiveGold}
              onChange={(index, value) => update({ op: 'collectiveGold', index, value })}
            />
          ) : null}
          {rewards.collectiveResources?.map((resource) => (
            <Distribution
              key={resource.type}
              title={`Split ${resource.value} ${labelText('game.loot.' + resource.type)} (rest goes to the outpost)`}
              characters={summary.characters}
              values={summary.collectiveResources.map((r) => r?.[resource.type] ?? 0)}
              onChange={(index, value) => update({ op: 'collectiveResource', index, type: resource.type, value })}
            />
          ))}
          {summary.rewardItems.length > 0 && (
            <div>
              <div className="mb-1 text-frost-300">Items</div>
              {summary.rewardItems.map((item, itemIndex) => (
                <div key={itemIndex} className="flex flex-wrap items-center gap-2 py-0.5">
                  <span>
                    {item.id} {item.name}
                  </span>
                  {summary.characters.map((character, index) => (
                    <label key={character.name} className="flex items-center gap-1 text-xs text-frost-400">
                      <input type="checkbox" checked={summary.items[index]?.includes(itemIndex) ?? false} onChange={() => update({ op: 'item', index, itemIndex })} />
                      {gameManager.characterManager.characterName(character)}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          {!!rewards.chooseLocation?.length && (
            <label>
              <span className="text-frost-300">Unlock location </span>
              <select className="input w-auto" value={summary.chooseLocation ?? ''} onChange={(e) => update({ op: 'chooseLocation', value: e.target.value })}>
                {rewards.chooseLocation.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          )}
          {!!rewards.chooseUnlockCharacter?.length && (
            <label>
              <span className="text-frost-300">Unlock character </span>
              <select className="input w-auto" value={summary.chooseUnlockCharacter ?? ''} onChange={(e) => update({ op: 'chooseUnlockCharacter', value: e.target.value })}>
                {rewards.chooseUnlockCharacter.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {rewards.calendarSectionManual?.map((manual, index) => (
            <label key={index}>
              <span className="text-frost-300">Write §{manual.section} into the calendar in </span>
              <input
                className="input inline w-16"
                inputMode="numeric"
                value={summary.calendarSectionManual[index] ?? 0}
                onChange={(e) => update({ op: 'calendarSectionManual', index, value: Number(e.target.value) || 0 })}
              />
              <span className="text-frost-300"> weeks</span>
            </label>
          ))}
        </div>
      )}
      {summary.numberChallenges > 0 && summary.success && (
        <label className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-frost-300">Town hall challenges completed</span>
          <input
            className="input w-16"
            inputMode="numeric"
            value={summary.challenges}
            onChange={(e) => update({ op: 'challenges', value: Number(e.target.value) || 0 })}
          />
        </label>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn" onClick={() => send('finish.cancel').catch(() => {})}>
          Back to scenario
        </button>
        <button className="btn" onClick={() => confirm('Restart the scenario? Characters keep nothing from this attempt.') && send('finish.apply', { restart: true }).catch(() => {})}>
          Restart
        </button>
        <button className="btn btn-primary" onClick={() => send('finish.apply').catch(() => {})}>
          Finish scenario
        </button>
      </div>
    </Modal>
  );
}

function Distribution({ title, characters, values, onChange }: { title: string; characters: Character[]; values: number[]; onChange(index: number, value: number): void }) {
  return (
    <div>
      <div className="mb-1 text-frost-300">{title}</div>
      <div className="flex flex-wrap gap-3">
        {characters.map((character, index) => (
          <label key={character.name} className="flex items-center gap-1 text-xs">
            {gameManager.characterManager.characterName(character)}
            <input className="input w-14 py-0.5" inputMode="numeric" value={values[index] ?? 0} onChange={(e) => onChange(index, Number(e.target.value) || 0)} />
          </label>
        ))}
      </div>
    </div>
  );
}
