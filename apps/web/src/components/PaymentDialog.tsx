/** Paying for construction, repairs and soldiers, after GHS upgrade-dialog (AGPL-3.0). */
import { MATERIALS, partyCharacters, paymentProblems, suggestedPayment, type Costs, type Payment } from '@fh/engine';
import { gameManager, labelText } from '@fh/ghs-core';
import { Fragment, useState } from 'react';
import { Modal } from './ui';

export function PaymentDialog({
  title,
  costs,
  discount,
  allowMorale,
  onPay,
  onMorale,
  onClose
}: {
  title: string;
  costs: Costs;
  discount: boolean;
  allowMorale?: boolean;
  onPay(payment: Payment): Promise<unknown>;
  onMorale?(): Promise<unknown>;
  onClose(): void;
}) {
  const [payment, setPayment] = useState<Payment>(() => suggestedPayment(costs, discount));
  const characters = partyCharacters();
  const party = gameManager.game.party;
  const problems = paymentProblems(costs, discount, payment);

  const setParty = (key: keyof Payment['party'], value: number) => setPayment({ ...payment, party: { ...payment.party, [key]: Math.max(0, value) } });
  const setCharacter = (index: number, key: 'gold' | (typeof MATERIALS)[number], value: number) =>
    setPayment({ ...payment, characters: payment.characters.map((c, i) => (i === index ? { ...c, [key]: Math.max(0, value) } : c)) });

  const costText = [
    ...MATERIALS.filter((type) => costs[type]).map((type) => `${costs[type]} ${labelText('game.loot.' + type).toLowerCase()}`),
    costs.any ? `any ${costs.any} material${costs.any === 1 ? '' : 's'}` : '',
    costs.gold ? `${costs.gold} gold` : ''
  ]
    .filter(Boolean)
    .join(', ');

  const field = (value: number, onChange: (value: number) => void, available: number) => (
    <td className="py-1 pr-2">
      <input className="input w-14 py-0.5" inputMode="numeric" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      <span className="ml-1 text-xs text-frost-400">/{available}</span>
    </td>
  );

  return (
    <Modal wide title={title} onClose={onClose}>
      <p className="mb-3 text-sm">
        Costs: <b>{costText || 'nothing'}</b>
        {discount && <span className="text-moss-400"> (carpenter: one material free)</span>}
        {costs.prosperity ? <span className="text-frost-400"> · needs prosperity {costs.prosperity}</span> : null}
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-frost-400">
          <tr>
            <th className="pb-1 font-normal" />
            <th className="pb-1 font-normal">Gold</th>
            {MATERIALS.map((type) => (
              <th key={type} className="pb-1 font-normal">
                {labelText('game.loot.' + type)}
              </th>
            ))}
            <th className="pb-1 font-normal">Inspiration</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-ink-700">
            <td className="py-1 pr-2">Outpost supply</td>
            <td />
            {MATERIALS.map((type) => (
              <Fragment key={type}>{field(payment.party[type], (v) => setParty(type, v), party.loot[type] || 0)}</Fragment>
            ))}
            {field(payment.party.inspiration, (v) => setParty('inspiration', v), party.inspiration)}
          </tr>
          {payment.characters.map((entry, index) => {
            const character = characters[index]!;
            return (
              <tr key={entry.character} className="border-t border-ink-700">
                <td className="py-1 pr-2">{gameManager.characterManager.characterName(character)}</td>
                {field(entry.gold, (v) => setCharacter(index, 'gold', v), character.progress.gold)}
                {MATERIALS.map((type) => (
                  <Fragment key={type}>{field(entry[type], (v) => setCharacter(index, type, v), character.progress.loot[type] || 0)}</Fragment>
                ))}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
      {problems.length > 0 && (
        <ul className="mt-3 text-sm text-ember-400">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        {allowMorale && onMorale && (
          <button className="btn" disabled={party.morale < 1} onClick={() => onMorale().then(onClose).catch(() => {})}>
            Pay 1 morale instead
          </button>
        )}
        <button className="btn btn-primary" disabled={problems.length > 0} onClick={() => onPay(payment).then(onClose).catch(() => {})}>
          Pay
        </button>
      </div>
    </Modal>
  );
}
