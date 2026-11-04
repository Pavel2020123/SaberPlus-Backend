// Read-only source inventory; does not prove that a controller is registered.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const { politicaHttpLicencia } = require('./dist/institucion/licencia-http.policy');
const cwd = fileURLToPath(new URL('../', import.meta.url));
// Controllers can also be declared in module files; do not assume a filename.
const files = execFileSync('rg', ['--files', 'src', '-g', '*.ts', '-g', '!*.spec.ts'], { cwd, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
const rows = [];
const decorators = node => ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
const named = (node, name) => decorators(node).find(d => ts.isCallExpression(d.expression) && d.expression.expression.getText() === name);
const guards = node => [
  ...(named(node, 'UseGuards')?.expression.arguments.map(a => a.getText()) ?? []),
  // Verified composite in src/admin/legacy-editorial-write.guard.ts:
  // RetiredEditorialWrite uses applyDecorators + UseGuards, always returning410.
  ...(named(node, 'RetiredEditorialWrite') ? ['LegacyEditorialWriteGuard'] : []),
];
for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../${file.replaceAll('\\', '/')}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  for (const cls of source.statements.filter(ts.isClassDeclaration)) {
    const controller = named(cls, 'Controller');
    if (!controller || !cls.name) continue;
    for (const method of cls.members.filter(ts.isMethodDeclaration)) {
      const verb = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head'].find(v => named(method, v));
      if (!verb) continue;
      const allGuards = [...guards(cls), ...guards(method)];
      rows.push({ file, controller: cls.name.text, method: method.name.getText(), verb,
        prefix: controller.expression.arguments[0]?.getText() ?? "''", path: named(method, verb).expression.arguments[0]?.getText() ?? "''",
        guards: allGuards, auth: allGuards.includes('AdminGuard') ? 'ADMIN' : allGuards.includes('JwtGuard') ? 'JWT' : 'REVIEW_PUBLIC',
        license: allGuards.includes('JwtGuard') ? politicaHttpLicencia(cls.name.text, method.name.getText()) : null });
    }
  }
}
console.log(JSON.stringify({ sourceOnly: true, registeredControllersNotProven: true, total: rows.length, rows }, null, 2));
