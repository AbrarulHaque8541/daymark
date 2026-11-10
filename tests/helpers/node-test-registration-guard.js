'use strict';

const acorn = require('acorn');
const fs = require('node:fs');
const path = require('node:path');

const NODE_TEST_FILE_RE = /^(?:test(?:-.*)?|.*-test|.*\.test)\.(?:js|mjs|cjs)$/i;
const GENERATED_TEST_SCAN_EXCLUSIONS = new Set([
  '.git', '.gradle', '.idea', '.cache', 'node_modules',
  'build', 'dist', 'out', 'coverage', 'target'
]);

function collectNodeTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return GENERATED_TEST_SCAN_EXCLUSIONS.has(entry.name) ? [] : collectNodeTestFiles(fullPath);
    }
    return entry.isFile() && NODE_TEST_FILE_RE.test(entry.name) ? [fullPath] : [];
  }).sort();
}

function makeScope(parent, type) {
  return { parent, type, bindings: new Map() };
}

function declareBinding(scope, name) {
  if (!scope || !name) return null;
  let binding = scope.bindings.get(name);
  if (!binding) {
    binding = { name, scope, kind: 'ordinary', importedName: null, reassigned: false };
    scope.bindings.set(name, binding);
  }
  return binding;
}

function bindPattern(pattern, scope) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier':
      declareBinding(scope, pattern.name);
      break;
    case 'RestElement':
      bindPattern(pattern.argument, scope);
      break;
    case 'AssignmentPattern':
      bindPattern(pattern.left, scope);
      break;
    case 'ArrayPattern':
      for (const element of pattern.elements) bindPattern(element, scope);
      break;
    case 'ObjectPattern':
      for (const property of pattern.properties) {
        bindPattern(property.type === 'RestElement' ? property.argument : property.value, scope);
      }
      break;
    default:
      break;
  }
}

function nearestVarScope(scope) {
  for (let current = scope; current; current = current.parent) {
    if (current.type === 'function' || current.type === 'program') return current;
  }
  return scope;
}

function resolveBinding(scope, name) {
  for (let current = scope; current; current = current.parent) {
    const binding = current.bindings.get(name);
    if (binding) return binding;
  }
  return null;
}

function staticPropertyName(member) {
  if (!member || member.type !== 'MemberExpression') return null;
  if (!member.computed && member.property.type === 'Identifier') return member.property.name;
  if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') {
    return member.property.value;
  }
  return null;
}

function isNodeTestRequireCall(node, nodeScopes) {
  if (!node || node.type !== 'CallExpression' || node.optional ||
      node.callee.type !== 'Identifier' || node.callee.name !== 'require' ||
      node.arguments.length !== 1) return false;
  if (resolveBinding(nodeScopes.get(node.callee), 'require')) return false;
  const argument = node.arguments[0];
  return argument.type === 'Literal' && argument.value === 'node:test';
}

function markNodeTestBinding(scope, localName, importedName) {
  const binding = scope && scope.bindings.get(localName);
  if (!binding) return;
  binding.kind = importedName === '*' ? 'node-test-namespace'
    : (importedName === 'default' ? 'node-test-default' : 'node-test-function');
  binding.importedName = importedName === 'default' ? 'test' : importedName;
}

function markRequirePattern(pattern, scope) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    markNodeTestBinding(scope, pattern.name, 'default');
    return;
  }
  if (pattern.type !== 'ObjectPattern') return;
  for (const property of pattern.properties) {
    if (property.type !== 'Property' || property.computed) continue;
    const importedName = property.key.type === 'Identifier'
      ? property.key.name
      : (property.key.type === 'Literal' ? property.key.value : null);
    if (!['test', 'it', 'describe'].includes(importedName)) continue;
    if (property.value.type === 'Identifier') {
      markNodeTestBinding(scope, property.value.name, importedName);
    }
  }
}

function buildScopes(ast) {
  const nodeScopes = new WeakMap();
  const declarators = [];

  function visit(node, inheritedScope) {
    if (!node || typeof node.type !== 'string') return;
    let scope = inheritedScope;

    if (node.type === 'Program') {
      scope = makeScope(null, 'program');
    } else if (node.type === 'FunctionDeclaration' ||
               node.type === 'FunctionExpression' ||
               node.type === 'ArrowFunctionExpression') {
      if (node.type === 'FunctionDeclaration' && node.id) {
        declareBinding(inheritedScope, node.id.name);
      }
      scope = makeScope(inheritedScope, 'function');
      if (node.type === 'FunctionExpression' && node.id) declareBinding(scope, node.id.name);
      for (const parameter of node.params) bindPattern(parameter, scope);
    } else if (node.type === 'BlockStatement') {
      scope = makeScope(inheritedScope, 'block');
    } else if (node.type === 'CatchClause') {
      scope = makeScope(inheritedScope, 'catch');
      bindPattern(node.param, scope);
    } else if (node.type === 'ForStatement' || node.type === 'ForInStatement' ||
               node.type === 'ForOfStatement' || node.type === 'SwitchStatement') {
      scope = makeScope(inheritedScope, 'block');
    } else if (node.type === 'ClassExpression') {
      scope = makeScope(inheritedScope, 'class');
      if (node.id) declareBinding(scope, node.id.name);
    }

    nodeScopes.set(node, scope);

    if (node.type === 'ClassDeclaration' && node.id) declareBinding(scope, node.id.name);

    if (node.type === 'ImportDeclaration' && node.source.value === 'node:test') {
      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportDefaultSpecifier') {
          declareBinding(scope, specifier.local.name);
          markNodeTestBinding(scope, specifier.local.name, 'default');
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          declareBinding(scope, specifier.local.name);
          markNodeTestBinding(scope, specifier.local.name, '*');
        } else if (specifier.type === 'ImportSpecifier') {
          const importedName = specifier.imported.name || specifier.imported.value;
          if (['test', 'it', 'describe'].includes(importedName)) {
            declareBinding(scope, specifier.local.name);
            markNodeTestBinding(scope, specifier.local.name, importedName);
          }
        }
      }
    }

    if (node.type === 'VariableDeclaration') {
      const targetScope = node.kind === 'var' ? nearestVarScope(scope) : scope;
      for (const declarator of node.declarations) {
        bindPattern(declarator.id, targetScope);
        declarators.push({ declarator, scope: targetScope });
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child, scope);
      } else if (value && typeof value.type === 'string') {
        visit(value, scope);
      }
    }
  }

  visit(ast, null);

  for (const { declarator, scope } of declarators) {
    if (isNodeTestRequireCall(declarator.init, nodeScopes)) markRequirePattern(declarator.id, scope);
  }
  return nodeScopes;
}

function memberChain(node) {
  const properties = [];
  let current = node;
  while (current && current.type === 'MemberExpression') {
    const property = staticPropertyName(current);
    if (!property) return null;
    properties.unshift(property);
    current = current.object;
  }
  if (!current || current.type !== 'Identifier') return null;
  return { base: current, properties };
}

function markAssignedTarget(target, scope) {
  if (!target) return;
  if (target.type === 'Identifier') {
    const binding = resolveBinding(scope, target.name);
    if (binding && binding.kind.startsWith('node-test-')) binding.reassigned = true;
    return;
  }
  if (target.type === 'MemberExpression') {
    // A write through any computed/static property mutates the imported
    // CommonJS module/function object. Do not require the property name to
    // be statically resolvable: dynamic keys can still replace test/it.
    let root = target;
    while (root && root.type === 'MemberExpression') root = root.object;
    if (root && root.type === 'Identifier') {
      const binding = resolveBinding(scope, root.name);
      if (binding && binding.kind.startsWith('node-test-')) binding.reassigned = true;
    }
    return;
  }
  if (target.type === 'RestElement') return markAssignedTarget(target.argument, scope);
  if (target.type === 'AssignmentPattern') return markAssignedTarget(target.left, scope);
  if (target.type === 'ArrayPattern') {
    for (const element of target.elements) markAssignedTarget(element, scope);
    return;
  }
  if (target.type === 'ObjectPattern') {
    for (const property of target.properties) {
      markAssignedTarget(property.type === 'RestElement' ? property.argument : property.value, scope);
    }
  }
}

function resolveTestApiCallee(callee, scope) {
  if (callee.type === 'Identifier') {
    const binding = resolveBinding(scope, callee.name);
    if (binding && ['node-test-function', 'node-test-default'].includes(binding.kind) && !binding.reassigned) {
      return { binding, apiName: binding.importedName, member: null };
    }
    return null;
  }
  if (callee.type !== 'MemberExpression') return null;
  const chain = memberChain(callee);
  if (!chain) return null;
  const binding = resolveBinding(scope, chain.base.name);
  if (!binding || binding.reassigned) return null;

  if (binding.kind === 'node-test-function' && chain.properties.length === 1 &&
      ['only', 'skip', 'todo'].includes(chain.properties[0])) {
    return { binding, apiName: binding.importedName, member: chain.properties[0] };
  }
  if (binding.kind === 'node-test-default') {
    if (chain.properties.length === 1 && ['only', 'skip', 'todo'].includes(chain.properties[0])) {
      return { binding, apiName: 'test', member: chain.properties[0] };
    }
    if (chain.properties.length === 1 && ['test', 'it', 'describe'].includes(chain.properties[0])) {
      return { binding, apiName: chain.properties[0], member: null };
    }
    if (chain.properties.length === 2 && ['test', 'it', 'describe'].includes(chain.properties[0]) &&
        ['only', 'skip', 'todo'].includes(chain.properties[1])) {
      return { binding, apiName: chain.properties[0], member: chain.properties[1] };
    }
  }
  if (binding.kind === 'node-test-namespace') {
    if (chain.properties.length === 1 && ['test', 'it', 'describe'].includes(chain.properties[0])) {
      return { binding, apiName: chain.properties[0], member: null };
    }
    if (chain.properties.length === 2 && ['test', 'it', 'describe'].includes(chain.properties[0]) &&
        ['only', 'skip', 'todo'].includes(chain.properties[1])) {
      return { binding, apiName: chain.properties[0], member: chain.properties[1] };
    }
  }
  return null;
}

function isFunctionNode(node) {
  return !!node && (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression');
}

function isNoopExpression(node) {
  if (!node) return true;
  if (node.type === 'Identifier' && node.name === 'undefined') return true;
  return node.type === 'UnaryExpression' && node.operator === 'void' &&
    node.argument.type === 'Literal' && node.argument.value === 0;
}

function hasExecutableCallback(callback) {
  if (!isFunctionNode(callback)) return false;
  if (callback.body.type !== 'BlockStatement') return !isNoopExpression(callback.body);
  return callback.body.body.some((statement) => {
    if (statement.type === 'EmptyStatement') return false;
    if (statement.type === 'ReturnStatement' && isNoopExpression(statement.argument)) return false;
    return true;
  });
}

function isStaticallySkipped(call) {
  for (const argument of call.arguments.slice(1, -1)) {
    if (argument.type !== 'ObjectExpression') continue;
    for (const property of argument.properties) {
      if (property.type !== 'Property' || property.computed) continue;
      const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
      if ((key === 'skip' || key === 'todo') &&
          property.value.type === 'Literal' &&
          (property.value.value === true || typeof property.value.value === 'string')) return true;
    }
  }
  return false;
}

function parseJavaScript(source) {
  const text = String(source);
  try {
    return acorn.parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
      allowAwaitOutsideFunction: true
    });
  } catch {
    try {
      return acorn.parse(text, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        allowHashBang: true,
        allowReturnOutsideFunction: true
      });
    } catch {
      return null;
    }
  }
}

function containsWithStatement(root) {
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    // WithStatement creates a dynamic object environment that this static
    // lexical resolver intentionally does not model. Reject the file rather
    // than credit a potentially intercepted identifier as node:test.
    if (node.type === 'WithStatement') return true;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') pending.push(child);
      } else if (value && typeof value.type === 'string') {
        pending.push(value);
      }
    }
  }
  return false;
}

function hasRegisteredTestCase(source) {
  const ast = parseJavaScript(source);
  if (!ast || containsWithStatement(ast)) return false;
  const nodeScopes = buildScopes(ast);
  const calls = [];
  const skippedSuiteRanges = [];
  let focusedTest = false;

  function visit(node) {
    if (!node || typeof node.type !== 'string') return;
    const scope = nodeScopes.get(node);

    if (node.type === 'AssignmentExpression') markAssignedTarget(node.left, scope);
    else if (node.type === 'UpdateExpression') markAssignedTarget(node.argument, scope);
    else if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') &&
        node.left.type !== 'VariableDeclaration') markAssignedTarget(node.left, scope);

    if (node.type === 'CallExpression') calls.push({ node, scope });

    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child);
      } else if (value && typeof value.type === 'string') visit(value);
    }
  }
  visit(ast);

  for (const { node, scope } of calls) {
    const api = resolveTestApiCallee(node.callee, scope);
    if (!api) continue;
    if (api.member === 'only' && ['test', 'it', 'describe'].includes(api.apiName)) focusedTest = true;
    if (api.apiName === 'describe' &&
        (['skip', 'todo'].includes(api.member) || isStaticallySkipped(node))) {
      const callback = node.arguments[node.arguments.length - 1];
      if (isFunctionNode(callback)) skippedSuiteRanges.push([callback.start, callback.end]);
    }
  }
  if (focusedTest) return false;

  for (const { node, scope } of calls) {
    const api = resolveTestApiCallee(node.callee, scope);
    if (!api || api.member || !['test', 'it'].includes(api.apiName)) continue;
    const callback = node.arguments[node.arguments.length - 1];
    if (!hasExecutableCallback(callback) || isStaticallySkipped(node)) continue;
    if (skippedSuiteRanges.some(([start, end]) => node.start > start && node.end < end)) continue;
    return true;
  }
  return false;
}

module.exports = { collectNodeTestFiles, hasRegisteredTestCase };
