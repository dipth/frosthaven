/** Reviewing a retirement before it's applied, after GHS retirement-dialog (AGPL-3.0). */
import type { ItemRef, RetirementDraft, ScenarioRef } from '@fh/engine';
import { gameManager, labelText } from '@fh/ghs-core';
import { useState } from 'react';
import { Modal } from '../../components/ui';
import { useCampaign } from '../../lib/campaign-store';
import { buildingName } from '../../lib/labels';

function scenarioText(ref: ScenarioRef | 'manual' | undefined, kind: string) {
  if (ref === 'manual') return `Draw a random ${kind} from the box`;
  if (!ref) return `None left: +1 inspiration`;
  const data = gameManager.scenarioManager.getScenario(ref.index, ref.edition, ref.group) ?? gameManager.sectionData(ref.edition).find((s) => s.index === ref.index);
  return `${kind} ${ref.index}${data?.name ? ` ${data.name}` : ''}`;
}

function itemText(ref: ItemRef | 'manual' | undefined, kind: string) {
  if (ref === 'manual') return `Draw a random ${kind} from the box`;
  if (!ref) return `None left: +1 inspiration`;
  const item = gameManager.itemManager.getItem(ref.id, ref.edition, true);
  return `${kind} ${ref.id}${item ? ` ${item.name}` : ''}`;
}

export function RetirementDialog({ draft }: { draft: RetirementDraft }) {
  const { send } = useCampaign();
  const [moveResources, setMoveResources] = useState(true);
  const characterName = labelText(`data.character.${draft.character.replace(':', '.')}`);
  const pqName = draft.personalQuest ? labelText(`data.personalQuest.fh.${draft.personalQuest}`) : undefined;
  const lines: string[] = [];
  if (draft.unlockCharacter) lines.push(`Unlock the ${labelText(`data.character.${draft.unlockCharacter.replace(':', '.')}`)} class`);
  if (draft.unlockPQ) lines.push(`Unlock personal quest ${draft.unlockPQ}`);
  if (draft.characterReward) {
    lines.push(scenarioText(draft.characterReward.scenario, 'Scenario'));
    lines.push(itemText(draft.characterReward.item, 'Item design'));
  }
  if (draft.envelopeBuilding) lines.push(`Unlock the ${buildingName(draft.envelopeBuilding)} building`);
  if (draft.envelopeReward) {
    lines.push(scenarioText(draft.envelopeReward.section, 'Section'));
    lines.push(itemText(draft.envelopeReward.item, 'Item blueprint'));
  }
  return (
    <Modal title={`Retire ${characterName}`} onClose={() => send('character.retireCancel').catch(() => {})}>
      <div className="grid gap-3 text-sm">
        {pqName && (
          <p>
            Personal quest <b>{pqName}</b> ({draft.personalQuest})
          </p>
        )}
        {draft.alreadyRetired && <p className="text-ember-400">This class has retired before.</p>}
        {lines.length > 0 && (
          <ul className="grid gap-1">
            {lines.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        )}
        {draft.conclusions.length > 0 && (
          <p>
            Then read {draft.conclusions.map((c) => `§${c.section}`).join(' and ')} (added to the sections to read).
          </p>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={moveResources} onChange={(e) => setMoveResources(e.target.checked)} />
          Move the character's resources to the outpost supply
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={() => send('character.retireCancel').catch(() => {})}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={() => send('character.retireConfirm', { moveResources }).catch(() => {})}>
          Retire
        </button>
      </div>
    </Modal>
  );
}
