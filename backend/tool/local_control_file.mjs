import { readFile } from 'node:fs/promises';

const actions = new Set(['correct', 'solo-on', 'solo-off', 'stop']);

// A text editor can briefly leave control.json empty or incomplete. Such a
// snapshot is not a command: keep the API alive and wait for the next poll.
export function parseLocalControl(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: 'invalid' };
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 1 || !actions.has(value.action)) {
    return { kind: 'invalid' };
  }
  return { kind: 'action', action: value.action };
}

export async function readLocalControl(path, reader = readFile) {
  let text;
  try {
    text = await reader(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'absent' };
    throw error; // Permission and disk failures must still be reported.
  }
  return parseLocalControl(text);
}
