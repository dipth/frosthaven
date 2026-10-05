/**
 * Plain-text rendering of GHS labels. GHS' Angular label directive turns
 * `%game.condition.poison%`-style placeholders into icons; here they become
 * their text labels so they can be shown in logs and simple UI.
 */
import { settingsManager } from './vendor/game/businesslogic/SettingsManager';

const placeholder = /%([\w\s.,:+()|[\]{}$/\\\-​]+)%/g;

export function plainText(text: string, depth = 0): string {
  if (depth > 5) {
    return text;
  }
  return text
    .replace(placeholder, (_match, key: string) => {
      const label = settingsManager.getLabel(key);
      if (label === key) {
        return humanizeKey(key);
      }
      return plainText(label, depth + 1);
    })
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/<[^>]+>/g, '');
}

function humanizeKey(key: string) {
  const last = key.split('.').filter(Boolean).pop() ?? key;
  const [name, value] = last.split(':');
  const words = name!.replace(/[-_]/g, ' ');
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
  return plainText(label);
}
