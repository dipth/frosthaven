import {
  attackOptionIndex,
  attackText,
  conditionText,
  draftCard,
  effectAutomated,
  effectText,
  eventLabel,
  resolvableOutcomes,
  type EventDraft,
  type EventFollowUp
} from '@fh/engine';
import { gameManager, labelText } from '@fh/ghs-core';
import type { EventCard, EventCardEffect } from '@fh/ghs-core/vendor/game/model/data/EventCard';
import { useState } from 'react';
import { useCampaign } from '../lib/campaign-store';
import { eventCardImage, eventDeckName } from '../lib/labels';
import { DistributionDialog } from './EventDistribution';
import { OutpostAttackDialog } from './OutpostAttack';
import { Modal } from './ui';

/**
 * Event cards in progress, shown on every campaign screen: the prompt to draw
 * (scenario start, "draw another event"), the card being resolved, and the
 * follow-ups the app couldn't apply by itself.
 */
export function EventFlow() {
  const { state, send } = useCampaign();
  const ext = state!.ext;
  const eventDraw = state!.ghs.eventDraw;
  return (
    <>
      {eventDraw && !ext.eventDraft && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ember-400/40 bg-ember-400/10 px-4 py-3 text-sm">
          <span>
            Draw a <b>{eventDeckName(eventDraw)}</b> event
            {(state!.ghs.party.eventDecks[eventDraw]?.length ?? 0) === 0 && <span className="text-blood-400"> (the deck is empty)</span>}
          </span>
          <span className="ml-auto flex gap-2">
            <button className="btn btn-primary" onClick={() => send('eventDraw.start', { type: eventDraw }).catch(() => {})}>
              Draw
            </button>
            <button className="btn" onClick={() => send('eventDraw.cancel').catch(() => {})}>
              Skip
            </button>
          </span>
        </div>
      )}
      {ext.eventFollowUps?.map((followUp, index) => <FollowUp key={`${followUp.type}-${followUp.cardId}-${index}`} followUp={followUp} index={index} />)}
      {ext.eventDraft && <EventDraftDialog draft={ext.eventDraft} />}
      {ext.outpostAttack && <OutpostAttackDialog attack={ext.outpostAttack} />}
    </>
  );
}

function CardImage({ type, cardId }: { type: string; cardId: string }) {
  const [side, setSide] = useState<'f' | 'b'>('f');
  const [missing, setMissing] = useState(false);
  const src = eventCardImage(type, cardId, side);
  if (!src || missing) return null;
  return (
    <button className="shrink-0" title="Flip card" onClick={() => setSide(side === 'f' ? 'b' : 'f')}>
      <img src={src} alt={`${cardId} ${side === 'f' ? 'front' : 'back'}`} className="w-40 rounded-lg sm:w-52" onError={() => setMissing(true)} />
    </button>
  );
}

function Text({ value, className = '' }: { value: string; className?: string }) {
  return value ? <p className={`whitespace-pre-line ${className}`}>{value}</p> : null;
}

function EventDraftDialog({ draft }: { draft: EventDraft }) {
  const { send } = useCampaign();
  const card = draftCard({ gm: gameManager }, draft);
  if (!card) return null;
  const run = (command: string, payload: object = {}) => send(command, payload).catch(() => {});
  const resolvable = resolvableOutcomes(card);
  const attackIndex = attackOptionIndex(card);
  const requirement = card.requirement?.partyAchievement;
  const requirementMissing = !!requirement && !gameManager.game.party.achievementsList.includes(requirement);
  const selected = card.options[draft.selected];

  return (
    <Modal wide title={`${eventDeckName(card.type)} ${card.cardId}`} onClose={() => run('eventDraw.cancel')}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <CardImage type={card.type} cardId={card.cardId} />
        <div className="grid content-start gap-3 text-sm">
          <Text value={eventLabel(card.narrative)} className="text-frost-200" />
          {requirementMissing && (
            <p className="rounded-lg border border-ember-400/40 bg-ember-400/10 px-3 py-2 text-ember-400">
              Requires “{labelText('data.partyAchievements.' + requirement)}”. Draw another card instead.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {card.options.map((option, optionIndex) =>
          optionIndex === attackIndex ? null : (
            <div
              key={optionIndex}
              className={`rounded-xl border px-3 py-2 text-sm ${draft.selected === optionIndex ? 'border-ice-400 bg-ice-500/10' : 'border-ink-600'}`}
            >
              <button className="w-full text-left" onClick={() => run('eventDraw.select', { option: optionIndex })}>
                <span className="mr-2 font-semibold">{option.label}</span>
                <span className="text-frost-200">{eventLabel(option.narrative)}</span>
              </button>
              {draft.selected === optionIndex && (
                <ul className="mt-2 grid gap-2">
                  {option.outcomes.map((outcome, outcomeIndex) => (
                    <Outcome
                      key={outcomeIndex}
                      card={card}
                      draft={draft}
                      optionIndex={optionIndex}
                      outcomeIndex={outcomeIndex}
                      resolvable={resolvable[optionIndex]?.[outcomeIndex] ?? false}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        )}
        {attackIndex !== -1 && <AttackOption card={card} draft={draft} attackIndex={attackIndex} />}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="btn" title="Put this card back into the deck and draw the next one" onClick={() => run('eventDraw.redraw')}>
          Draw another
        </button>
        <button className="btn" onClick={() => run('eventDraw.cancel')}>
          Cancel
        </button>
        <button
          className="btn"
          title="Record the card as resolved (removed or returned to the deck) without applying its effects"
          onClick={() => confirm('Resolve this event without applying any effects?') && run('eventDraw.accept', { apply: false })}
        >
          Resolve, don't apply
        </button>
        <button className="btn btn-primary" disabled={!selected} onClick={() => run('eventDraw.accept')}>
          Resolve
        </button>
      </div>
    </Modal>
  );
}

function Outcome({
  card,
  draft,
  optionIndex,
  outcomeIndex,
  resolvable
}: {
  card: EventCard;
  draft: EventDraft;
  optionIndex: number;
  outcomeIndex: number;
  resolvable: boolean;
}) {
  const { send } = useCampaign();
  const outcome = card.options[optionIndex]!.outcomes[outcomeIndex]!;
  const active = draft.subSelections.includes(outcomeIndex);
  const toggle = (force: boolean) => send('eventDraw.toggleOutcome', { option: optionIndex, outcome: outcomeIndex, force }).catch(() => {});
  return (
    <li className={`rounded-lg border px-3 py-2 ${active ? 'border-moss-400/60 bg-moss-400/10' : 'border-ink-700'} ${!resolvable && !active ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={active} onChange={() => toggle(!resolvable)} title={resolvable ? undefined : "Doesn't apply automatically — tick to use it anyway"} />
        <div className="grid gap-1">
          {outcome.condition && <div className="font-medium text-ember-400">{conditionText(outcome.condition, card.edition)}</div>}
          <Text value={eventLabel(outcome.narrative)} className="text-frost-300" />
          {(outcome.effects ?? []).map((effect, effectIndex) => (
            <Effect key={effectIndex} effect={effect} edition={card.edition} index={effectIndex} draft={draft} active={active} />
          ))}
          {(outcome.returnToDeck || outcome.removeFromDeck) && (
            <div className="text-xs text-frost-400">{outcome.returnToDeck ? 'Return the card to the bottom of the deck.' : 'Remove the card from the game.'}</div>
          )}
        </div>
      </div>
    </li>
  );
}

function Effect({ effect, edition, index, draft, active }: { effect: string | EventCardEffect; edition: string; index: number; draft: EventDraft; active: boolean }) {
  const { send } = useCampaign();
  if (typeof effect === 'object' && effect.type === 'checkbox') {
    const boxes = effect.values.filter((v) => typeof v !== 'number');
    const checks = draft.checks[index] ?? 0;
    return (
      <div className="grid gap-1">
        {boxes.map((box, i) => (
          <label key={i} className="flex items-center gap-2 text-ice-300">
            <input
              type="checkbox"
              disabled={!active}
              checked={checks > i}
              onChange={() => send('eventDraw.check', { index, checks: checks === i + 1 ? i : i + 1 }).catch(() => {})}
            />
            {box ? effectText(box as EventCardEffect, edition) : ''}
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="text-ice-300">
      {effectText(effect, edition)}
      {effectAutomated(effect) && <span className="ml-1 rounded bg-ink-700 px-1 text-[10px] uppercase text-frost-400">auto</span>}
    </div>
  );
}

function AttackOption({ card, draft, attackIndex }: { card: EventCard; draft: EventDraft; attackIndex: number }) {
  const { send } = useCampaign();
  const outcomes = card.options[attackIndex]!.outcomes.filter((o) => o.attack);
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${draft.attack ? 'border-blood-400/60 bg-blood-400/10' : 'border-ink-600 opacity-70'}`}>
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" checked={draft.attack} onChange={(e) => send('eventDraw.toggleAttack', { attack: e.target.checked }).catch(() => {})} />
        Outpost attack
      </label>
      {outcomes.map((outcome, i) => (
        <div key={i} className="mt-1 grid gap-1">
          <div className="text-blood-400">{attackText(outcome.attack!)}</div>
          <Text value={eventLabel(outcome.attack!.narrative)} className="text-frost-300" />
          {(outcome.attack!.effects ?? []).map((effect, j) => (
            <div key={j} className="text-ice-300">
              {effectText(effect, card.edition)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FollowUp({ followUp, index }: { followUp: EventFollowUp; index: number }) {
  const { send } = useCampaign();
  const [distributing, setDistributing] = useState(false);
  const dismiss = (part: string) => send('eventFollowUp.dismiss', { index, part }).catch(() => {});
  return (
    <div className="rounded-xl border border-ember-400/40 bg-ember-400/10 px-4 py-3 text-sm">
      <div className="mb-2 font-medium text-ember-400">
        {eventDeckName(followUp.type)} {followUp.cardId}: still to do
      </div>
      <div className="grid gap-3">
        {followUp.manual.length > 0 && (
          <div className="flex flex-wrap items-start gap-2">
            <ul className="grid flex-1 gap-0.5">
              {followUp.manual.map((entry, i) => (
                <li key={i}>
                  • {entry.kind === 'condition' ? conditionText(entry.value as never, followUp.edition) : effectText(entry.value as EventCardEffect, followUp.edition)}
                </li>
              ))}
            </ul>
            <button className="btn" onClick={() => dismiss('manual')}>
              Done
            </button>
          </div>
        )}
        {followUp.distribution.length > 0 && (
          <div className="flex flex-wrap items-start gap-2">
            <ul className="grid flex-1 gap-0.5">
              {followUp.distribution.map((effect, i) => (
                <li key={i}>• {effectText(effect, followUp.edition)}</li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={() => setDistributing(true)}>
              Distribute…
            </button>
            <button className="btn" title="Already handled at the table" onClick={() => dismiss('distribution')}>
              Skip
            </button>
          </div>
        )}
        {followUp.outpostAttack && (
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex-1">
              {followUp.outpostAttack.attack ? attackText(followUp.outpostAttack.attack) : 'Outpost attack'}
              {followUp.outpostAttack.effects.map((effect, i) => (
                <span key={i} className="ml-2 text-ice-300">
                  {effectText(effect, followUp.edition)}
                </span>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => send('outpostAttack.start', { followUp: index }).catch(() => {})}>
              Start outpost attack
            </button>
            <button className="btn" title="Already handled at the table" onClick={() => dismiss('outpostAttack')}>
              Skip
            </button>
          </div>
        )}
      </div>
      {distributing && <DistributionDialog followUp={followUp} index={index} onClose={() => setDistributing(false)} />}
    </div>
  );
}
