const { test } = require("node:test");
const assert = require("node:assert/strict");
const { applyLocalCompetitiveControl } = require("./local_competitive_control.cjs");
const requestId = "12345678-1234-1234-1234-123456789abc";
test("local IPC: explicit enable and disable, preserving unrelated environment", () => {
  const environment = { NODE_ENV: "test" };
  for (const enabled of [true, false]) {
    assert.deepEqual(applyLocalCompetitiveControl({ type: "local-solo-admission", enabled, requestId }, environment),
      { type: "local-solo-admission-ack", enabled, requestId });
    assert.equal(environment.COMPETITIVE_SOLO_ENABLED, String(enabled));
    assert.equal(environment.NODE_ENV, "test");
  }
});
for (const message of [null, [], "true",
  { type: "local-solo-admission", enabled: "true", requestId },
  { type: "local-solo-admission", enabled: true, requestId: "invalid" },
  { type: "other", enabled: true, requestId },
  { type: "local-solo-admission", enabled: true, requestId, DATABASE_URL: "forbidden" }]) {
  test(`local IPC rejects malformed control ${JSON.stringify(message)}`, () => {
    const environment = { COMPETITIVE_SOLO_ENABLED: "false" };
    assert.equal(applyLocalCompetitiveControl(message, environment), null);
    assert.deepEqual(environment, { COMPETITIVE_SOLO_ENABLED: "false" });
  });
}
