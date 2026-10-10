import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLocalControl, readLocalControl } from './local_control_file.mjs';

test('accepts only the four explicit local commands', () => {
  for (const action of ['correct', 'solo-on', 'solo-off', 'stop']) {
    assert.deepEqual(parseLocalControl(JSON.stringify({ action })), { kind: 'action', action });
  }
});

test('incomplete, malformed, ambiguous or unknown input is not a command', () => {
  for (const text of ['', ' ', '{', '{"action":', '{"action":"stop"',
    'null', '[]', 'true', '"stop"', '{}', '{"action":true}',
    '{"action":"unknown"}', '{"action":"stop","extra":true}']) {
    assert.deepEqual(parseLocalControl(text), { kind: 'invalid' });
  }
});

test('missing file is idle; disk and permission errors are not suppressed', async () => {
  const reader = code => async () => { throw Object.assign(new Error('read failed'), { code }); };
  assert.deepEqual(await readLocalControl('unused', reader('ENOENT')), { kind: 'absent' });
  for (const code of ['EACCES', 'EIO']) {
    await assert.rejects(readLocalControl('unused', reader(code)), { code });
  }
});

test('real editor truncation can recover to ON/OFF without a fatal parse error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'saberplus-control-test-'));
  const path = join(directory, 'control.json');
  try {
    assert.deepEqual(await readLocalControl(path), { kind: 'absent' });
    for (const text of ['', '{"action":', '{"action":"stop"']) {
      await writeFile(path, text);
      assert.deepEqual(await readLocalControl(path), { kind: 'invalid' });
    }
    for (const action of ['solo-on', 'solo-off']) {
      await writeFile(path, JSON.stringify({ action }));
      assert.deepEqual(await readLocalControl(path), { kind: 'action', action });
    }
  } finally {
    await rm(directory, { recursive: true }); // Only this test's own mkdtemp.
  }
});
