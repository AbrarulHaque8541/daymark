'use strict';

const acorn = require('acorn');
const fs = require('node:fs');
const path = require('node:path');

const NODE_TEST_FILE_RE = /^(?:test(?:-.*)?|.*-test|.*\.test)\.(?:js|mjs|cjs)$/i;
const NODE_TEST_MUTATOR_METHODS = {
  Object: ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'],
  Reflect: ['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf', 'apply']
};
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
    binding = { name, scope, kind: 'ordinary', importedName: null, reassigned: false, aliasOf: null, aliases: new Set() };
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

function markNodeTestMutatorBinding(scope, localName, rootName, methodName) {
  const binding = scope && scope.bindings.get(localName);
  if (!binding) return;
  binding.kind = 'node-test-mutator';
  binding.importedName = `${rootName}.${methodName}`;
}

function markNodeTestMutatorInvokerBinding(scope, localName, mutatorName, invocationName) {
  const binding = scope && scope.bindings.get(localName);
  if (!binding) return;
  binding.kind = 'node-test-mutator-invoker';
  binding.importedName = `${mutatorName}.${invocationName}`;
}

function markNodeTestMutatorPattern(pattern, scope, rootName) {
  if (!pattern || pattern.type !== 'ObjectPattern' ||
      !NODE_TEST_MUTATOR_METHODS[rootName]) return;
  for (const property of pattern.properties) {
    if (property.type !== 'Property' || property.computed) continue;
    const methodName = property.key.type === 'Identifier'
      ? property.key.name
      : (property.key.type === 'Literal' ? property.key.value : null);
    if (!NODE_TEST_MUTATOR_METHODS[rootName].includes(methodName)) continue;
    const local = property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
    if (local.type === 'Identifier') markNodeTestMutatorBinding(scope, local.name, rootName, methodName);
  }
}

function markNodeTestAlias(scope, localName, sourceBinding) {
  const binding = scope && scope.bindings.get(localName);
  if (!binding || !sourceBinding || !sourceBinding.kind.startsWith('node-test-')) return;
  binding.kind = sourceBinding.kind;
  binding.importedName = sourceBinding.importedName;
  binding.reassigned = sourceBinding.reassigned;
  binding.aliasOf = sourceBinding;
  sourceBinding.aliases.add(binding);
}

function unwrapAwait(node) {
  let current = node;
  while (current && current.type === 'AwaitExpression') current = current.argument;
  return current;
}

function isNodeTestImportExpression(node) {
  const expression = unwrapAwait(node);
  return !!expression && expression.type === 'ImportExpression' &&
    expression.source.type === 'Literal' && expression.source.value === 'node:test';
}

function markDynamicImportPattern(pattern, scope) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    // import() resolves to the module namespace, not the callable default.
    markNodeTestBinding(scope, pattern.name, '*');
    return;
  }
  if (pattern.type !== 'ObjectPattern') return;
  for (const property of pattern.properties) {
    if (property.type !== 'Property' || property.computed) continue;
    const importedName = property.key.type === 'Identifier'
      ? property.key.name
      : (property.key.type === 'Literal' ? property.key.value : null);
    if (!['default', 'test', 'it', 'describe'].includes(importedName)) continue;
    const local = property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
    if (local.type === 'Identifier') {
      markNodeTestBinding(scope, local.name, importedName);
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
    const init = declarator.init;
    if (isNodeTestRequireCall(init, nodeScopes)) {
      markRequirePattern(declarator.id, scope);
      continue;
    }
    if (isNodeTestImportExpression(init)) {
      markDynamicImportPattern(declarator.id, scope);
      continue;
    }
    if (init && init.type === 'Identifier') {
      const sourceBinding = resolveBinding(scope, init.name);
      if (declarator.id.type === 'Identifier' && sourceBinding &&
          sourceBinding.kind.startsWith('node-test-')) {
        markNodeTestAlias(scope, declarator.id.name, sourceBinding);
        continue;
      }
      if (declarator.id.type === 'ObjectPattern' && sourceBinding &&
          ['node-test-namespace', 'node-test-default'].includes(sourceBinding.kind)) {
        markRequirePattern(declarator.id, scope);
        continue;
      }
      if (declarator.id.type === 'ObjectPattern' &&
          ['Object', 'Reflect'].includes(init.name)) {
        markNodeTestMutatorPattern(declarator.id, scope, init.name);
        continue;
      }
    }
    if (init && init.type === 'MemberExpression') {
      const importedName = staticPropertyName(init);
      const chain = memberChain(init);
      if (declarator.id.type === 'Identifier' && chain && chain.properties.length === 1 &&
          ['test', 'it', 'describe'].includes(chain.properties[0])) {
        const sourceBinding = resolveBinding(scope, chain.base.name);
        if (sourceBinding && ['node-test-default', 'node-test-namespace'].includes(sourceBinding.kind)) {
          markNodeTestBinding(scope, declarator.id.name, chain.properties[0]);
          continue;
        }
      }
      const mutator = mutationIntrinsicName(init);
      if (declarator.id.type === 'Identifier' && mutator) {
        const [rootName, methodName] = mutator.split('.');
        markNodeTestMutatorBinding(scope, declarator.id.name, rootName, methodName);
        continue;
      }
      const invocationName = staticPropertyName(init);
      if (declarator.id.type === 'Identifier' && ['call', 'apply', 'bind'].includes(invocationName)) {
        const baseMutator = resolveMutationIntrinsic(init.object, scope);
        if (baseMutator) {
          markNodeTestMutatorInvokerBinding(scope, declarator.id.name, baseMutator, invocationName);
          continue;
        }
      }
      const mutatorRoot = mutationIntrinsicNamespaceRoot(init);
      if (declarator.id.type === 'ObjectPattern' && mutatorRoot) {
        markNodeTestMutatorPattern(declarator.id, scope, mutatorRoot);
        continue;
      }
      if (['test', 'it', 'describe'].includes(importedName) &&
          isNodeTestRequireCall(init.object, nodeScopes) &&
          declarator.id.type === 'Identifier') {
        markNodeTestBinding(scope, declarator.id.name, importedName);
        continue;
      }
      if (['test', 'it', 'describe'].includes(importedName) &&
          isNodeTestImportExpression(init.object) &&
          declarator.id.type === 'Identifier') {
        markNodeTestBinding(scope, declarator.id.name, importedName);
      }
    }
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

function mutationIntrinsicNamespaceRoot(expression) {
  if (!expression) return null;
  if (expression.type === 'Identifier' && ['Object', 'Reflect'].includes(expression.name)) {
    return expression.name;
  }
  const chain = memberChain(expression);
  if (chain && chain.base.name === 'globalThis' && chain.properties.length === 1 &&
      ['Object', 'Reflect'].includes(chain.properties[0])) return chain.properties[0];
  return null;
}

function mutationIntrinsicName(expression) {
  const chain = memberChain(expression);
  if (chain && chain.properties.length === 1 &&
      NODE_TEST_MUTATOR_METHODS[chain.base.name] &&
      NODE_TEST_MUTATOR_METHODS[chain.base.name].includes(chain.properties[0])) {
    return `${chain.base.name}.${chain.properties[0]}`;
  }
  if (chain && chain.base.name === 'globalThis' && chain.properties.length === 2 &&
      NODE_TEST_MUTATOR_METHODS[chain.properties[0]] &&
      NODE_TEST_MUTATOR_METHODS[chain.properties[0]].includes(chain.properties[1])) {
    return `${chain.properties[0]}.${chain.properties[1]}`;
  }
  if (expression && expression.type === 'MemberExpression' &&
      expression.computed && staticPropertyName(expression) === null) {
    const root = mutationIntrinsicNamespaceRoot(expression.object);
    if (root) return `${root}.*`;
  }
  return null;
}

function resolveMutationIntrinsic(callee, scope) {
  if (callee && callee.type === 'Identifier') {
    const binding = resolveBinding(scope, callee.name);
    if (binding && ['node-test-mutator', 'node-test-mutator-invoker'].includes(binding.kind)) return binding.importedName;
    return null;
  }
  return mutationIntrinsicName(callee);
}

function mutationTargetForInvocation(mutatorName, args, scope, depth = 0) {
  if (!mutatorName || depth > 3) return null;
  if (mutatorName === 'Reflect.apply') {
    const targetMutator = resolveMutationIntrinsic(args[0], scope);
    const argumentList = args[2];
    if (!targetMutator || !argumentList || argumentList.type !== 'ArrayExpression') return null;
    return mutationTargetForInvocation(targetMutator, argumentList.elements, scope, depth + 1);
  }
  if (mutatorName.endsWith('.call')) return args[1] || null;
  if (mutatorName.endsWith('.apply')) {
    const argumentList = args[1];
    return argumentList && argumentList.type === 'ArrayExpression' ? (argumentList.elements[0] || null) : null;
  }
  if (mutatorName.endsWith('.bind')) return args[1] || null;
  return args[0] || null;
}

function nodeTestBindingForTarget(target, scope) {
  let root = target;
  while (root && root.type === 'MemberExpression') root = root.object;
  if (!root || root.type !== 'Identifier') return null;
  const binding = resolveBinding(scope, root.name);
  return binding && binding.kind.startsWith('node-test-') ? binding : null;
}

function markBindingObjectMutated(binding) {
  const pending = [binding];
  const seen = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    current.reassigned = true;
    if (current.aliasOf) pending.push(current.aliasOf);
    for (const alias of current.aliases) pending.push(alias);
  }
}

function markReflectiveMutation(node, scope) {
  if (!node || node.type !== 'CallExpression' || !node.callee) return;
  let mutator = resolveMutationIntrinsic(node.callee, scope);
  if (!mutator && node.callee.type === 'MemberExpression') {
    const invocationName = staticPropertyName(node.callee);
    if (['call', 'apply', 'bind'].includes(invocationName)) {
      const baseMutator = resolveMutationIntrinsic(node.callee.object, scope);
      if (baseMutator) mutator = `${baseMutator}.${invocationName}`;
    }
  }
  if (!mutator) return;
  const target = mutationTargetForInvocation(mutator, node.arguments, scope);
  const binding = nodeTestBindingForTarget(target, scope);
  if (binding) markBindingObjectMutated(binding);
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
      if (binding && binding.kind.startsWith('node-test-')) markBindingObjectMutated(binding);
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

function staticPrimitiveValue(node) {
  if (!node || typeof node.type !== 'string') return { known: false };
  if (node.type === 'Literal') {
    const value = node.value;
    if (value === null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return { known: true, value };
    return { known: false };
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return { known: true, value: node.quasis.map((part) => part.value.cooked ?? part.value.raw).join('') };
  }
  if (node.type === 'SequenceExpression' && node.expressions.length > 0) {
    return staticPrimitiveValue(node.expressions[node.expressions.length - 1]);
  }
  if (node.type === 'UnaryExpression') {
    const argument = staticPrimitiveValue(node.argument);
    if (!argument.known) return { known: false };
    try {
      switch (node.operator) {
        case '!': return { known: true, value: !argument.value };
        case 'void': return { known: true, value: undefined };
        case '+': return { known: true, value: +argument.value };
        case '-': return { known: true, value: -argument.value };
        case '~': return { known: true, value: ~argument.value };
        case 'typeof': return { known: true, value: typeof argument.value };
        default: return { known: false };
      }
    } catch { return { known: false }; }
  }
  if (node.type === 'BinaryExpression') {
    const left = staticPrimitiveValue(node.left);
    const right = staticPrimitiveValue(node.right);
    if (!left.known || !right.known) return { known: false };
    try {
      switch (node.operator) {
        case '===': return { known: true, value: left.value === right.value };
        case '!==': return { known: true, value: left.value !== right.value };
        case '==': return { known: true, value: left.value == right.value };
        case '!=': return { known: true, value: left.value != right.value };
        case '<': return { known: true, value: left.value < right.value };
        case '<=': return { known: true, value: left.value <= right.value };
        case '>': return { known: true, value: left.value > right.value };
        case '>=': return { known: true, value: left.value >= right.value };
        case '+': return { known: true, value: left.value + right.value };
        case '-': return { known: true, value: left.value - right.value };
        case '*': return { known: true, value: left.value * right.value };
        case '/': return { known: true, value: left.value / right.value };
        case '%': return { known: true, value: left.value % right.value };
        case '**': return { known: true, value: left.value ** right.value };
        case '&': return { known: true, value: left.value & right.value };
        case '|': return { known: true, value: left.value | right.value };
        case '^': return { known: true, value: left.value ^ right.value };
        case '<<': return { known: true, value: left.value << right.value };
        case '>>': return { known: true, value: left.value >> right.value };
        case '>>>': return { known: true, value: left.value >>> right.value };
        default: return { known: false };
      }
    } catch { return { known: false }; }
  }
  if (node.type === 'LogicalExpression') {
    const left = staticPrimitiveValue(node.left);
    if (!left.known) return { known: false };
    if (node.operator === '&&' && !Boolean(left.value)) return left;
    if (node.operator === '||' && Boolean(left.value)) return left;
    if (node.operator === '??' && left.value !== null && left.value !== undefined) return left;
    if (['&&', '||', '??'].includes(node.operator)) return staticPrimitiveValue(node.right);
    return { known: false };
  }
  if (node.type === 'ConditionalExpression') {
    const test = staticPrimitiveValue(node.test);
    return test.known ? staticPrimitiveValue(test.value ? node.consequent : node.alternate) : { known: false };
  }
  return { known: false };
}

function isStaticFalse(node) {
  const value = staticPrimitiveValue(node);
  return value.known && !Boolean(value.value);
}

function isStaticTrue(node) {
  const value = staticPrimitiveValue(node);
  return value.known && Boolean(value.value);
}

function hasExecutedOperation(node) {
  if (!node || typeof node.type !== 'string') return false;

  // A declaration does not execute the function body it contains. In
  // particular, an unused helper/arrow must not make a placeholder test pass.
  if (node.type === 'FunctionDeclaration'
      || node.type === 'FunctionExpression'
      || node.type === 'ArrowFunctionExpression'
      || node.type === 'ClassDeclaration'
      || node.type === 'ClassExpression') return false;

  if (node.type === 'IfStatement') {
    if (isStaticFalse(node.test)) return hasExecutedOperation(node.alternate);
    if (isStaticTrue(node.test)) return hasExecutedOperation(node.consequent);
    return hasExecutedOperation(node.test)
      || hasExecutedOperation(node.consequent)
      || hasExecutedOperation(node.alternate);
  }

  if (node.type === 'WhileStatement' && isStaticFalse(node.test)) return false;
  if (node.type === 'ForStatement' && isStaticFalse(node.test)) {
    return hasExecutedOperation(node.init);
  }

  if (node.type === 'ConditionalExpression') {
    if (isStaticFalse(node.test)) return hasExecutedOperation(node.alternate);
    if (isStaticTrue(node.test)) return hasExecutedOperation(node.consequent);
    return hasExecutedOperation(node.test)
      || hasExecutedOperation(node.consequent)
      || hasExecutedOperation(node.alternate);
  }

  if (node.type === 'LogicalExpression') {
    if (node.operator === '&&' && isStaticFalse(node.left)) return hasExecutedOperation(node.left);
    if (node.operator === '||' && isStaticTrue(node.left)) return hasExecutedOperation(node.left);
  }

  if (node.type === 'SwitchStatement' && node.discriminant.type === 'Literal') {
    let selectedIndex = -1;
    let defaultIndex = -1;
    for (let index = 0; index < node.cases.length; index++) {
      const branch = node.cases[index];
      if (branch.test === null) {
        defaultIndex = index;
      } else if (branch.test.type === 'Literal'
          && Object.is(branch.test.value, node.discriminant.value)) {
        selectedIndex = index;
        break;
      } else if (hasExecutedOperation(branch.test)) {
        return true;
      }
    }
    if (selectedIndex < 0) selectedIndex = defaultIndex;
    if (selectedIndex < 0) return false;
    for (let index = selectedIndex; index < node.cases.length; index++) {
      const branch = node.cases[index];
      if (hasExecutedOperation(branch.consequent)) return true;
      if (branch.consequent.some((statement) => statement.type === 'BreakStatement')) break;
    }
    return false;
  }

  if (node.type === 'CallExpression'
      || node.type === 'NewExpression'
      || node.type === 'AwaitExpression'
      || node.type === 'YieldExpression'
      || node.type === 'ThrowStatement'
      || node.type === 'AssignmentExpression'
      || node.type === 'UpdateExpression'
      || node.type === 'ImportExpression'
      || node.type === 'TaggedTemplateExpression'
      || (node.type === 'UnaryExpression' && node.operator === 'delete')) return true;

  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw') continue;
    if (Array.isArray(value)) {
      if (value.some((child) => hasExecutedOperation(child))) return true;
    } else if (value && typeof value === 'object' && hasExecutedOperation(value)) {
      return true;
    }
  }
  return false;
}

function hasExecutableCallback(callback) {
  if (!isFunctionNode(callback)) return false;
  return hasExecutedOperation(callback.body);
}

function isStaticallySkipped(call) {
  // Node's test/describe options can disable execution through skip or todo.
  // A test-integrity guard must not assume an opaque options value is safe:
  // variables, spreads, accessors and dynamic computed keys can all hide one
  // of these flags. Accept only an inline object whose relevant values are
  // statically known to be false.
  for (const argument of call.arguments.slice(1, -1)) {
    if (argument.type !== 'ObjectExpression') return true;
    for (const property of argument.properties) {
      if (property.type === 'SpreadElement') return true;
      if (property.type !== 'Property') return true;

      let key = null;
      if (!property.computed) {
        key = property.key.type === 'Identifier'
          ? property.key.name
          : (property.key.type === 'Literal' ? property.key.value : null);
      } else if (property.key.type === 'Literal') {
        key = property.key.value;
      } else {
        // A computed key may evaluate to "skip" or "todo".
        return true;
      }

      // Object-literal __proto__ can inherit a skip/todo flag from the prototype.
      if (key === '__proto__') return true;
      if (key !== 'skip' && key !== 'todo') continue;
      const value = property.value;
      if (value.type === 'Literal' &&
          (value.value === false || value.value === null || value.value === '')) continue;
      return true;
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

function isWithinSubtree(node, ancestor, parents) {
  for (let current = node; current; current = parents.get(current)) {
    if (current === ancestor) return true;
  }
  return false;
}

function isUnreachableSwitchCase(caseNode, parents) {
  const switchNode = parents.get(caseNode);
  if (!switchNode || switchNode.type !== 'SwitchStatement') return false;
  const discriminant = staticPrimitiveValue(switchNode.discriminant);
  if (!discriminant.known) return false;
  let selectedIndex = -1;
  let defaultIndex = -1;
  for (let index = 0; index < switchNode.cases.length; index++) {
    const branch = switchNode.cases[index];
    if (branch.test === null) { defaultIndex = index; continue; }
    const value = staticPrimitiveValue(branch.test);
    if (!value.known) return false;
    if (value.value === discriminant.value) { selectedIndex = index; break; }
  }
  if (selectedIndex < 0) selectedIndex = defaultIndex;
  if (selectedIndex < 0) return true;
  const targetIndex = switchNode.cases.indexOf(caseNode);
  if (targetIndex < selectedIndex) return true;
  for (let index = selectedIndex; index < targetIndex; index++) {
    if (switchNode.cases[index].consequent.some((statement) =>
      ['BreakStatement', 'ReturnStatement', 'ThrowStatement'].includes(statement.type))) return true;
  }
  return false;
}

function isStaticallyUnreachableCall(node, parents) {
  let child = node;
  for (let parent = parents.get(child); parent; child = parent, parent = parents.get(parent)) {
    if (parent.type === 'IfStatement') {
      if (isStaticFalse(parent.test) && isWithinSubtree(child, parent.consequent, parents)) return true;
      if (parent.alternate && isStaticTrue(parent.test) && isWithinSubtree(child, parent.alternate, parents)) return true;
    } else if (parent.type === 'WhileStatement' && isStaticFalse(parent.test) && isWithinSubtree(child, parent.body, parents)) return true;
    else if (parent.type === 'ForStatement' && parent.test && isStaticFalse(parent.test) && isWithinSubtree(child, parent.body, parents)) return true;
    else if (parent.type === 'LogicalExpression' && isWithinSubtree(child, parent.right, parents)) {
      if (parent.operator === '&&' && isStaticFalse(parent.left)) return true;
      if (parent.operator === '||' && isStaticTrue(parent.left)) return true;
    } else if (parent.type === 'ConditionalExpression') {
      if (isStaticFalse(parent.test) && isWithinSubtree(child, parent.consequent, parents)) return true;
      if (isStaticTrue(parent.test) && isWithinSubtree(child, parent.alternate, parents)) return true;
    } else if (parent.type === 'SwitchCase' && isWithinSubtree(child, parent.consequent, parents) &&
        isUnreachableSwitchCase(parent, parents)) return true;
  }
  return false;
}

function isExecutedFunctionContainer(fn, parents, nodeScopes) {
  const owner = parents.get(fn);
  if (!owner || owner.type !== 'CallExpression') return false;
  if (owner.callee === fn) return true;
  if (owner.arguments[owner.arguments.length - 1] !== fn) return false;
  const api = resolveTestApiCallee(owner.callee, nodeScopes.get(owner));
  return Boolean(api && !api.member && ['test', 'it', 'describe'].includes(api.apiName) && !isStaticallySkipped(owner));
}

function isExecutedRegistrationCall(node, parents, nodeScopes) {
  if (isStaticallyUnreachableCall(node, parents)) return false;
  for (let current = parents.get(node); current; current = parents.get(current)) {
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(current.type) &&
        !isExecutedFunctionContainer(current, parents, nodeScopes)) return false;
  }
  return true;
}

function hasRegisteredTestCase(source) {
  const ast = parseJavaScript(source);
  if (!ast || containsWithStatement(ast)) return false;
  const nodeScopes = buildScopes(ast);
  const calls = [];
  const nodeParents = new WeakMap();
  const skippedSuiteRanges = [];
  let focusedTest = false;

  function visit(node, parent) {
    if (!node || typeof node.type !== 'string') return;
    if (parent) nodeParents.set(node, parent);
    const scope = nodeScopes.get(node);

    if (node.type === 'AssignmentExpression') markAssignedTarget(node.left, scope);
    else if (node.type === 'UpdateExpression') markAssignedTarget(node.argument, scope);
    else if (node.type === 'UnaryExpression' && node.operator === 'delete') markAssignedTarget(node.argument, scope);
    else if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') &&
        node.left.type !== 'VariableDeclaration') markAssignedTarget(node.left, scope);

    if (node.type === 'CallExpression') {
      markReflectiveMutation(node, scope);
      calls.push({ node, scope });
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child, node);
      } else if (value && typeof value.type === 'string') visit(value, node);
    }
  }
  visit(ast, null);

  for (const { node, scope } of calls) {
    if (!isExecutedRegistrationCall(node, nodeParents, nodeScopes)) continue;
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
    if (!isExecutedRegistrationCall(node, nodeParents, nodeScopes)) continue;
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
