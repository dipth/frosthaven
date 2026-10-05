import { labelText } from '@fh/ghs-core';

export function characterName(c: { edition: string; name: string }) {
  return labelText(`data.character.${c.edition}.${c.name}`);
}

export function monsterName(m: { name: string }) {
  return labelText(`data.monster.${m.name}`);
}
