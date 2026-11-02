import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOperation, ownedOperationMarker } from './editorial_file_operations.mjs';
const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
test('operator CLI requires exact explicit commands and confirmation for cleanup', () => {
  assert.equal(parseOperation(['audit', 'owner.json', id]).command, 'audit');
  assert.equal(parseOperation(['audit', 'owner.json', id, id]).id, id);
  assert.equal(parseOperation(['backup', 'owner.json', id, id]).id, id);
  assert.equal(parseOperation(['restore', 'owner.json', id, id]).command, 'restore');
  assert.equal(parseOperation(['cleanup', 'owner.json', id, id, '--confirm-cleanup']).command, 'cleanup');
});
for (const args of [[], ['delete-all', 'owner.json', id], ['cleanup', 'owner.json', id, id], ['backup', 'owner.json', id, '../other'], ['audit', 'owner.json', id, '../other']]) {
  test(`operator CLI rejects invalid command shape ${args[0] ?? 'empty'}`, () => assert.throws(() => parseOperation(args)));
}
test('operator CLI cannot use a repository path as database ownership evidence', async () => {
  await assert.rejects(ownedOperationMarker(new URL('../package.json', import.meta.url)));
});
