// P3-A policy only. This function grants NO permission and is not an endpoint.
// Call only after backend account/context/resource authorization succeeds.
export const PRIVATE_OFFLINE_WINDOW_SECONDS = 72 * 60 * 60;

export function privateOfflineGrantPolicy(input: {
  ownerId: string;
  contextId: string;
  requestNonce: string;
  validatedAt: Date;
}) {
  if (
    !input.ownerId?.trim() ||
    !input.contextId?.trim() ||
    !/^[a-f0-9]{64}$/.test(input.requestNonce) ||
    !(input.validatedAt instanceof Date) ||
    !Number.isFinite(input.validatedAt.getTime())
  )
    throw new Error('Invalid private offline validation policy input.');
  const expiresAt = new Date(
    input.validatedAt.getTime() + PRIVATE_OFFLINE_WINDOW_SECONDS * 1000,
  );
  if (!Number.isFinite(expiresAt.getTime())) throw new Error('Invalid expiry.');
  return {
    policyVersion: 1,
    ownerId: input.ownerId,
    contextId: input.contextId,
    requestNonce: input.requestNonce,
    validatedAt: input.validatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
