import { beforeAll, expect, it } from 'vitest';
import { bootstrapGhsNode, labelText, undoInfoText } from '../src/node';

beforeAll(async () => {
  await bootstrapGhsNode();
});

it('renders labels and undo infos as plain text', () => {
  expect(labelText('data.character.fh.drifter')).toBe('Drifter');
  expect(undoInfoText(['addChar', 'data.character.fh.drifter'])).toBe('Add character Drifter');
  expect(undoInfoText(['draw'])).not.toBe('');
});
