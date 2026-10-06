/**
 * Plain-text rendering of GHS labels. GHS' Angular label directive turns
 * `%game.condition.poison%`-style placeholders into icons; here they become
 * their text labels so they can be shown in logs and simple UI.
 */
import { settingsManager } from './vendor/game/businesslogic/SettingsManager';

const placeholder = /%([\w\s.,:+()|[\]{}$/\\\-​]+)%/g;

const attackModifiers: Record<string, string> = {
  plus0: '+0',
  plus1: '+1',
  plus2: '+2',
  plus3: '+3',
  plus4: '+4',
  minus1: '-1',
  minus2: '-2',
  null: 'Null',
  double: '2x',
  bless: 'Bless',
  curse: 'Curse'
};

/** Text for placeholders GHS renders as icons with values (e.g. `game.action.attack.valueSign:1`). */
function placeholderText(key: string, depth: number): string | undefined {
  const [path, value] = key.split(':') as [string, string | undefined];
  if (/^(data|game)\.characterIcon(Colored)?\./.test(path)) {
    return '';
  }
  const signed = path.endsWith('.valueSign');
  const base = signed ? path.slice(0, -'.valueSign'.length) : path;
  if (base === 'game' && signed && value !== undefined) {
    const n = Number(value);
    return `${Number.isNaN(n) || n < 0 ? '' : '+'}${value}`;
  }
  const itemNumber = /^game\.item(?:Fh)?\.(\d+)$/.exec(base);
  if (itemNumber) {
    return `(item ${itemNumber[1]})`;
  }
  const modifier = /^game\.(attackModifier|card)\.(\w+)$/.exec(base);
  if (modifier && attackModifiers[modifier[2]!]) {
    return attackModifiers[modifier[2]!];
  }
  if (base === 'game.damage' && value !== undefined) {
    return `${value} damage`;
  }
  if (base.startsWith('game.element.consume.')) {
    return `consume ${base.slice('game.element.consume.'.length).replace(/\|/g, ' or ')}`;
  }
  if (value === undefined) {
    return undefined;
  }
  const label = settingsManager.getLabel(base);
  const name = label === base ? humanizeKey(base) : plainText(label, depth + 1).toLowerCase();
  if (signed) {
    const n = Number(value);
    return `${Number.isNaN(n) || n < 0 ? '' : '+'}${value} ${name}`;
  }
  return `${name} ${value}`;
}

export function plainText(text: string, depth = 0): string {
  if (depth > 5) {
    return text;
  }
  return text
    .replace(placeholder, (_match, key: string) => {
      const special = placeholderText(key, depth);
      if (special !== undefined) {
        return special;
      }
      if (!settingsManager.labelExists(key)) {
        return humanizeKey(key);
      }
      return plainText(settingsManager.getLabel(key), depth + 1);
    })
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

const knownWords: Record<string, string> = { onehand: 'one-hand', twohand: 'two-hand', smallhand: 'small' };

function humanizeKey(key: string) {
  const last = key.split('.').filter(Boolean).pop() ?? key;
  const [name, value] = last.split(':');
  const bare = name!.replace(/^(fh|gh|jotl|fc)-/, '');
  const words = knownWords[bare] ?? bare.replace(/[-_]/g, ' ');
  return value ? `${words} ${value}` : words;
}

/** Text for a label key, with `{0}`-style arguments (themselves label keys). */
export function labelText(key: string, args: (string | number)[] = []): string {
  return plainText(settingsManager.getLabel(key, args.map(String)));
}

/** Renders a GHS undo-info entry (as recorded by StateManager.before) as text. */
export function undoInfoText(info: string[]): string {
  if (!info.length) {
    return '';
  }
  const [key, ...args] = info;
  const label = settingsManager.getLabel('state.info.' + key, args);
  if (label === 'state.info.' + key || label === key) {
    return [key, ...args].join(' ');
  }
  return plainText(label).trim();
}
