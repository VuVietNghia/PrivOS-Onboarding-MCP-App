import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { uiCopyAllowlist, type UiCopyAllowlistEntry } from './ui-copy-allowlist';

export type UiCopyReason = 'jsx-text' | 'jsx-attribute' | 'jsx-expression' | 'error-literal';
export interface UiCopyFinding {
  file: string;
  line: number;
  text: string;
  reason: UiCopyReason;
}

const visibleAttributes = new Set(['aria-label', 'aria-description', 'alt', 'placeholder', 'title']);
const reviewedDevOnlyModules = new Set([
  'src/ui/onboarding/dev/HubContractProbe.tsx',
  'src/ui/onboarding/dev/P02ContractProbe.tsx',
  'src/ui/onboarding/dev/P03LimitsProbe.tsx',
  'src/ui/onboarding/dev/privos-probes.tsx',
  'src/ui/onboarding/dev/DiagnosticsEntry.tsx',
]);

function displayText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function relativeFile(file: string): string {
  return relative(process.cwd(), file).split(sep).join('/');
}

function literalText(node: ts.Expression): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? displayText(node.text) : null;
}

function displayedExpressionLiterals(expression: ts.Expression): readonly ts.StringLiteralLike[] {
  if (ts.isParenthesizedExpression(expression)) return displayedExpressionLiterals(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    return [expression.whenTrue, expression.whenFalse].flatMap((branch) => {
      if (ts.isStringLiteral(branch) || ts.isNoSubstitutionTemplateLiteral(branch)) return [branch];
      return displayedExpressionLiterals(branch);
    });
  }
  if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expression.operatorToken.kind)) {
    const right = expression.right;
    if (ts.isStringLiteral(right) || ts.isNoSubstitutionTemplateLiteral(right)) return [right];
    return displayedExpressionLiterals(right);
  }
  return [];
}

export function scanUiCopy(files: readonly string[]): readonly UiCopyFinding[] {
  const findings: UiCopyFinding[] = [];
  for (const input of files) {
    const file = resolve(input);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (node: ts.Node, text: string, reason: UiCopyReason) => {
      const normalized = displayText(text);
      if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) return;
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push({ file: relativeFile(file), line: line + 1, text: normalized, reason });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node)) add(node, node.text, 'jsx-text');
      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && visibleAttributes.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
        add(node.initializer, node.initializer.text, 'jsx-attribute');
      }
      if (ts.isJsxExpression(node) && node.expression && (!ts.isJsxAttribute(node.parent)
        || (ts.isIdentifier(node.parent.name) && visibleAttributes.has(node.parent.name.text)))) {
        for (const literal of displayedExpressionLiterals(node.expression)) add(literal, literal.text, 'jsx-expression');
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set(?:Error|Message)$/u.test(node.expression.text)) {
        const first = node.arguments[0];
        if (first) {
          const text = literalText(first);
          if (text !== null) add(first, text, 'error-literal');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return findings;
}

export function validateCopyAllowlist(entries: readonly UiCopyAllowlistEntry[]): void {
  for (const entry of entries) {
    if (!entry.file.trim() || !entry.text.trim() || !entry.reason.trim() || entry.file.includes('*') || entry.text === '*') {
      throw new Error('UI copy allowlist entries require exact file, text, and reason');
    }
  }
}

function resolveUiModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile() && (candidate.endsWith('.ts') || candidate.endsWith('.tsx'))) return candidate;
  }
  return null;
}

export function collectUiModules(entry: string): readonly string[] {
  const queued = [resolve(entry)];
  const visited = new Set<string>();
  while (queued.length) {
    const file = queued.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const addSpecifier = (value: string) => {
      const resolved = resolveUiModule(file, value);
      if (resolved && !reviewedDevOnlyModules.has(relativeFile(resolved)) && !visited.has(resolved)) queued.push(resolved);
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        addSpecifier(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const first = node.arguments[0];
        if (first && ts.isStringLiteral(first)) addSpecifier(first.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...visited].sort();
}

function isAllowed(finding: UiCopyFinding, entries: readonly UiCopyAllowlistEntry[]): boolean {
  return entries.some((entry) => entry.file === finding.file && entry.text === finding.text && entry.reason === finding.reason);
}

function main(): void {
  validateCopyAllowlist(uiCopyAllowlist);
  const files = collectUiModules(resolve(process.cwd(), 'src/ui/App.tsx'));
  const findings = scanUiCopy(files).filter((finding) => !isAllowed(finding, uiCopyAllowlist));
  if (findings.length) {
    for (const finding of findings) process.stderr.write(`${finding.file}:${finding.line} ${finding.reason}: ${JSON.stringify(finding.text)}\n`);
    process.stderr.write(`Found ${findings.length} unlocalized UI literal(s).\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`UI copy check passed for ${files.length} reachable modules.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
