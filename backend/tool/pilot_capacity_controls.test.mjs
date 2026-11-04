import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const script = fileURLToPath(new URL('./pilot_capacity_extended.mjs', import.meta.url));
for (const args of [[], ['https://example.com/owner.json'], ['../package.json'], ['../package.json', '--remote'], ['../package.json', '--sockets', '--extra']]) {
  test(`rejects unsafe or invalid scope ${JSON.stringify(args)} before starting workload`, async () => {
    await assert.rejects(execute(process.execPath, [script, ...args], { timeout: 10000, windowsHide: true }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /pilot-extended-failed/);
      assert.doesNotMatch(error.stdout, /fixtures|storage-ready|result/);
      return true;
    });
  });
}
test('worker without owned configuration fails without opening the API', async () => {
  await assert.rejects(execute(process.execPath, [fileURLToPath(new URL('./pilot_capacity_worker.cjs', import.meta.url))], {
    env: {}, timeout: 10000, windowsHide: true,
  }), (error) => error.code === 1);
});
