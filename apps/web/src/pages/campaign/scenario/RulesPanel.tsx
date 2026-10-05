import { describeRule, ruleApplicable, ruleVisible } from '@fh/engine';
import { gameManager } from '@fh/ghs-core';
import { useCampaign } from '../../../lib/campaign-store';

/** Pending scenario rules (special rules, spawns, door sections) and sections that can be added. */
export function RulesPanel() {
  const { send } = useCampaign();
  const rules = gameManager.game.scenarioRules.map((model, index) => ({ model, index })).filter(({ index }) => ruleVisible(index));
  const closedRooms = gameManager.scenarioManager.closedRooms();
  const sections = gameManager.scenarioManager.availableSections().filter((s) => !s.conclusion);

  if (!rules.length && !closedRooms.length && !sections.length) {
    return null;
  }

  return (
    <div className="grid gap-2">
      {rules.map(({ model, index }) => (
        <div key={`${model.identifier.scenario}-${model.identifier.section}-${model.identifier.index}`} className="rounded-xl border border-ember-400/40 bg-ember-400/10 px-4 py-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ember-400">Scenario rule</div>
          {describeRule(index).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          <div className="mt-2 flex gap-2">
            {ruleApplicable(model.rule) && (
              <button className="btn btn-primary" onClick={() => send('scenario.applyRule', { index }).catch(() => {})}>
                Apply
              </button>
            )}
            <button className="btn" onClick={() => send('scenario.dismissRule', { index }).catch(() => {})}>
              {ruleApplicable(model.rule) ? 'Dismiss' : 'OK'}
            </button>
          </div>
        </div>
      ))}
      {(closedRooms.length > 0 || sections.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 px-4 py-2 text-sm">
          <span className="text-frost-400">Reveal:</span>
          {closedRooms.map((room) => (
            <button key={room.roomNumber} className="btn" onClick={() => send('scenario.openRoom', { roomNumber: room.roomNumber }).catch(() => {})}>
              Open {room.marker ? `door ${room.marker}` : `room ${room.ref}`}
            </button>
          ))}
          {sections.map((section) => (
            <button
              key={section.index}
              className="btn"
              onClick={() => confirm(`Add section ${section.index}?`) && send('scenario.addSection', { index: section.index }).catch(() => {})}
            >
              Section {section.index}
              {section.marker ? ` (${section.marker})` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
