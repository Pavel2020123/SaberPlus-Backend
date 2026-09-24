import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Avoid a long shell command chain: the same syntax check on Windows and CI.
const files = [
  'public/bank-coverage.mjs', 'demo-bank-coverage.mjs',
  'public/lesson-blocks.mjs',
  'public/institution-approval.mjs', 'demo-institution-approval.mjs',
  'server.mjs', 'demo-api.mjs', 'demo-question-bank.mjs',
  'demo-editorial-review.mjs', 'demo-editorial-tools.mjs', 'public/api.mjs',
  'public/app.mjs', 'public/lesson-fields.mjs', 'public/lesson-editor.mjs',
  'public/question-fields.mjs', 'public/question-editor.mjs',
  'public/editorial-review.mjs', 'public/editorial-tool-fields.mjs',
  'public/editorial-tools.mjs',
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(file, import.meta.url))], { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log(`Sintaxis correcta: ${files.length} módulos.`);
