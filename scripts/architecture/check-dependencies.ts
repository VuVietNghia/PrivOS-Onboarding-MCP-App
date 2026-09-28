import path from 'node:path';
import ts from 'typescript';
import { boundaryFor } from './boundaries';

export interface SourceModule { path: string; text: string }
export interface Violation { path: string; line: number; rule: 'SDK_BOUNDARY' | 'AMBIENT_EFFECT' | 'MODULE_STATE' | 'IMPORT_BOUNDARY'; target: string }

const ambientNames = new Set([
  'globalThis', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'crypto', 'fetch', 'FileReader', 'performance', 'process', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'WebSocket', 'Worker',
]);

function isSdk(specifier: string): boolean {
  return specifier.startsWith('@privos_ai/') || specifier.startsWith('node:');
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
    || ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)
    || ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isBindingElement(parent)) && parent.name === node;
}

function rootName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) return rootName(expression.expression);
  return undefined;
}

function bindingHasName(binding: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some((element) => ts.isBindingElement(element) && bindingHasName(element.name, name));
}

function scopeDefines(scope: ts.Node, name: string): boolean {
  if ((ts.isForOfStatement(scope) || ts.isForInStatement(scope)) && ts.isVariableDeclarationList(scope.initializer)
    && scope.initializer.declarations.some((declaration) => bindingHasName(declaration.name, name))) return true;
  if (ts.isCatchClause(scope) && scope.variableDeclaration && bindingHasName(scope.variableDeclaration.name, name)) return true;
  if ((ts.isArrowFunction(scope) || ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope)
    || ts.isMethodDeclaration(scope) || ts.isConstructorDeclaration(scope))
    && scope.parameters.some((parameter) => bindingHasName(parameter.name, name))) return true;
  if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) return false;
  return scope.statements.some((statement) => {
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some((declaration) => bindingHasName(declaration.name, name));
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) return true;
    if (ts.isImportDeclaration(statement)) {
      const imports = statement.importClause;
      return imports?.name?.text === name || Boolean(imports?.namedBindings && (
        ts.isNamespaceImport(imports.namedBindings) ? imports.namedBindings.name.text === name
          : imports.namedBindings.elements.some((item) => item.name.text === name)));
    }
    return false;
  });
}

function isShadowed(node: ts.Node, name: string): boolean {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (scopeDefines(parent, name)) return true;
  }
  return false;
}

export function checkDependencies(sources: readonly SourceModule[]): Violation[] {
  const violations: Violation[] = [];
  const sourcePaths = new Set(sources.map((source) => source.path.replace(/\\/g, '/')));
  for (const source of sources) {
    const boundary = boundaryFor(source.path);
    if (boundary.allowedEffects.length > 0) continue;
    const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true,
      source.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const aliases = new Map<string, string>();
    const add = (node: ts.Node, rule: Violation['rule'], target: string) => {
      violations.push({ path: boundary.path, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, rule, target });
    };
    const checkImport = (node: ts.Node, specifier: string, typeOnly: boolean): void => {
      if (!specifier.startsWith('.') || typeOnly) return;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(boundary.path), specifier));
      const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
      const target = candidates.find((candidate) => sourcePaths.has(candidate)) ?? candidates[1];
      const targetBoundary = boundaryFor(target);
      if (['domain', 'port', 'flow'].includes(boundary.role)
        && ['adapter', 'composition', 'entry'].includes(targetBoundary.role)) add(node, 'IMPORT_BOUNDARY', target);
    };
    const collect = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name)) {
          if (node.initializer) {
            const root = rootName(node.initializer);
            if (root && (ambientNames.has(root) || aliases.has(root)) && !isShadowed(node.initializer, root)) {
              aliases.set(node.name.text, aliases.get(root) ?? root);
            }
          }
        } else if (ts.isObjectBindingPattern(node.name) && node.initializer) {
          const root = rootName(node.initializer);
          if (root && (ambientNames.has(root) || aliases.has(root)) && !isShadowed(node.initializer, root)) {
            for (const element of node.name.elements) {
              if (ts.isIdentifier(element.name)) aliases.set(element.name.text, aliases.get(root) ?? root);
            }
          }
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(file);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier) && isSdk(node.moduleSpecifier.text)) {
        if (!(boundary.path === 'src/server-core/ports.ts' && ts.isImportDeclaration(node) && node.importClause?.isTypeOnly)) {
          add(node, 'SDK_BOUNDARY', node.moduleSpecifier.text);
        }
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)) {
        checkImport(node, node.moduleSpecifier.text,
          ts.isImportDeclaration(node) ? Boolean(node.importClause?.isTypeOnly) : node.isTypeOnly);
      }
      if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
        const target = node.arguments[0].text;
        if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && isSdk(target)) {
          add(node, 'SDK_BOUNDARY', target);
        }
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          checkImport(node, target, false);
        }
      }
      if (ts.isVariableStatement(node) && node.parent === file
        && (node.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== ts.NodeFlags.Const) {
        add(node, 'MODULE_STATE', node.declarationList.declarations.map((decl) => decl.name.getText(file)).join(','));
      }
      if (ts.isVariableStatement(node) && node.parent === file) {
        for (const declaration of node.declarationList.declarations) {
          const initializer = declaration.initializer;
          if (initializer && ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression)
            && ['Map', 'WeakMap', 'WeakSet'].includes(initializer.expression.text)) {
            add(declaration, 'MODULE_STATE', declaration.name.getText(file));
          }
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date'
        && (node.arguments?.length ?? 0) === 0 && !isShadowed(node.expression, 'Date')) add(node, 'AMBIENT_EFFECT', 'Date');
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === 'Date' && node.name.text === 'now' && !isShadowed(node.expression, 'Date')) {
        add(node, 'AMBIENT_EFFECT', 'Date.now');
      }
      if (ts.isIdentifier(node) && !isDeclarationName(node)
        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
        && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
        && (ambientNames.has(node.text) && !isShadowed(node, node.text) || aliases.has(node.text))) {
        const parent = node.parent;
        if (!ts.isTypeReferenceNode(parent) && !ts.isImportSpecifier(parent) && !ts.isExportSpecifier(parent)) {
          const root = aliases.get(node.text) ?? node.text;
          add(node, 'AMBIENT_EFFECT', ts.isPropertyAccessExpression(parent) && parent.expression === node
            ? `${root}.${parent.name.text}` : root);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return violations;
}
