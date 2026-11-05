import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivateOperation } from './private_file_operations.mjs';
const actor = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
test('private operations accept only exact backup/restore contracts', () => {
  for (const command of ['backup', 'restore']) {
    assert.deepEqual(parsePrivateOperation([command, 'owner.json', actor, id]),
      { command, ownerFile: 'owner.json', actor, id });
  }
});
test('private operations reject arbitrary commands, missing ids and extra paths', () => {
  for (const args of [[], ['cleanup', 'owner.json', actor, id],
    ['backup', 'owner.json', actor], ['restore', 'owner.json', actor, '../file'],
    ['backup', '', actor, id], ['backup', 'owner.json', actor, id, 'path'],
    ['backup', 'owner.json', 'not-admin-id', id]]) assert.throws(() => parsePrivateOperation(args));
});
