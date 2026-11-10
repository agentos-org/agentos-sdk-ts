// TypeScript emits extensionless relative references in declarations built in
// bundler mode. Make the published types resolvable by Node16/NodeNext too.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function declarationFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? declarationFiles(name) : name.endsWith('.d.ts') ? [name] : [];
  });
}

for (const file of declarationFiles('dist')) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  function rewrite(literal) {
    if (!literal || !ts.isStringLiteral(literal)) return;
    const specifier = literal.text;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return;
    if (/\.(?:js|mjs|cjs|json)$/.test(specifier)) return;
    const target = path.resolve(path.dirname(file), specifier);
    const suffix = existsSync(`${target}.d.ts`) ? '.js'
      : existsSync(path.join(target, 'index.d.ts')) ? '/index.js'
      : null;
    if (!suffix) throw new Error(`Cannot resolve declaration import ${specifier} in ${file}`);
    edits.push({ start: literal.getStart(source) + 1, end: literal.end - 1, value: `${specifier}${suffix}` });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) rewrite(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) rewrite(node.argument.literal);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      rewrite(node.moduleReference.expression);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  let next = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.value + next.slice(edit.end);
  }
  if (next !== text) writeFileSync(file, next);
}
