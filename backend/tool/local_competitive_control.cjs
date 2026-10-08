// IPC only, loaded exclusively by the owned disposable API (never main.ts).
function applyLocalCompetitiveControl(message, environment) {
  if (!message || typeof message !== "object" || Array.isArray(message) ||
      message.type !== "local-solo-admission" || typeof message.enabled !== "boolean" ||
      typeof message.requestId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(message.requestId) ||
      Object.keys(message).some(key => !["type", "enabled", "requestId"].includes(key))) {
    return null;
  }
  environment.COMPETITIVE_SOLO_ENABLED = String(message.enabled);
  return { type: "local-solo-admission-ack", requestId: message.requestId, enabled: message.enabled };
}
module.exports = { applyLocalCompetitiveControl };
