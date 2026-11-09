'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('nightly placeholder guard ignores RFC 5545 VTODO identifiers but detects standalone markers', () => {
  const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'nightly-main-audit.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const command = workflow.match(/! grep -rniwE "([^"]+)"([^\n]*)/);
  assert.ok(command, 'nightly audit must use GNU grep whole-word matching for placeholder markers');
  assert.equal(command[1], 'TODO|FIXME|lorem ipsum', 'the guard must keep its complete placeholder vocabulary');
  assert.match(command[2], /--exclude-dir=node_modules/);
  assert.match(command[2], /--exclude-dir=tests/);
  assert.equal(command[2].includes('|'), false, 'directory exclusion must not filter grep output lines');

  const marker = /\b(?:TODO|FIXME|lorem ipsum)\b/i;
  for (const source of ['VTODO', 'BEGIN:VTODO', 'The VTODO component contains a task']) {
    assert.equal(marker.test(source), false, source + ' is an RFC 5545 identifier, not a placeholder');
  }
  for (const source of ['TODO', '// TODO: replace this', 'FIXME', 'lorem ipsum', 'TODO-like placeholder']) {
    assert.equal(marker.test(source), true, source + ' must remain detectable');
  }
  assert.equal(marker.test('someTODOIdentifier'), false, 'embedded identifier fragments are not standalone markers');
});

test('the exact GNU grep guard excludes test/dependency directories without hiding source lines mentioning tests/', {
  skip: process.platform !== 'linux'
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-nightly-placeholder-'));
  try {
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'fixture'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app.js'), [
      'const component = "VTODO";',
      'const marker = "TODO: real placeholder";',
      'const docs = "tests/README.md"; // TODO: this source marker must be caught'
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'tests', 'fixture.js'), '// TODO: test fixture is excluded\n');
    fs.writeFileSync(path.join(root, 'node_modules', 'fixture', 'dep.js'), '// FIXME: dependency is excluded\n');

    const result = spawnSync('grep', [
      '-rniwE',
      '--include=*.js',
      '--include=*.html',
      '--include=*.css',
      '--exclude-dir=node_modules',
      '--exclude-dir=tests',
      'TODO|FIXME|lorem ipsum',
      root
    ], { encoding: 'utf8' });

    assert.equal(result.error, undefined, 'GNU grep must be available on the Ubuntu runner');
    assert.equal(result.status, 0, 'the two real source placeholders must be detected');
    const matches = result.stdout.trimEnd().split(/\r?\n/);
    assert.equal(matches.length, 2, 'VTODO and excluded directories must not be reported');
    assert.match(matches[0], /app\.js:2:const marker = "TODO: real placeholder"/);
    assert.match(matches[1], /app\.js:3:const docs = "tests\/README\.md"; \/\/ TODO: this source marker must be caught/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});



const NODE_TEST_FILE_RE = /^(?:test(?:-.*)?|.*-test|.*\.test)\.(?:js|mjs|cjs)$/i;
const GENERATED_TEST_SCAN_EXCLUSIONS = new Set([
  ".git", ".gradle", ".idea", ".cache", "node_modules",
  "build", "dist", "out", "coverage", "target"
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

function maskJavaScriptNonCode(source) {
  const textValue = String(source);
  const output = textValue.split("");
  const templateQuote = String.fromCharCode(96);
  const blank = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (output[index] !== "\n" && output[index] !== "\r") output[index] = " ";
    }
  };
  const regexPrefixKeywords = new Set([
    "await", "case", "delete", "do", "else", "in", "instanceof",
    "new", "of", "return", "throw", "typeof", "void", "yield",
    "as", "extends"
  ]);
  const controlParenKeywords = new Set(["catch", "for", "if", "switch", "while", "with"]);

  function skipQuoted(start, quote) {
    let index = start + 1;
    while (index < textValue.length) {
      const character = textValue[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === quote) return index + 1;
      if ((character === "\n" || character === "\r") && quote !== templateQuote) return index;
      index += 1;
    }
    return index;
  }

  function skipRegularExpression(start) {
    let index = start + 1;
    let inCharacterClass = false;
    while (index < textValue.length) {
      const character = textValue[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === "\n" || character === "\r") return start + 1;
      if (character === "[" && !inCharacterClass) inCharacterClass = true;
      else if (character === "]" && inCharacterClass) inCharacterClass = false;
      else if (character === "/" && !inCharacterClass) {
        index += 1;
        while (index < textValue.length && /[A-Za-z]/.test(textValue[index])) index += 1;
        return index;
      }
      index += 1;
    }
    return start + 1;
  }

  function scanTemplate(start) {
    blank(start, start + 1);
    let index = start + 1;
    let rawStart = index;
    while (index < textValue.length) {
      const character = textValue[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === templateQuote) {
        blank(rawStart, index + 1);
        return index + 1;
      }
      if (character === "$" && textValue[index + 1] === "{") {
        blank(rawStart, index + 2);
        index = scanCode(index + 2, true);
        rawStart = index;
        continue;
      }
      index += 1;
    }
    blank(rawStart, textValue.length);
    return textValue.length;
  }

  function scanCode(start, stopAtTemplateBrace) {
    let index = start;
    let braceDepth = 0;
    let canStartRegex = true;
    let pendingControlParen = false;
    const controlParenStack = [];
    while (index < textValue.length) {
      const character = textValue[index];
      const next = textValue[index + 1];
      if (/\s/.test(character)) {
        index += 1;
        continue;
      }
      if (stopAtTemplateBrace && character === "}" && braceDepth === 0) {
        blank(index, index + 1);
        return index + 1;
      }
      if (character === "/" && next === "/") {
        let end = index + 2;
        while (end < textValue.length && textValue[end] !== "\n" && textValue[end] !== "\r") end += 1;
        blank(index, end);
        index = end;
        continue;
      }
      if (character === "/" && next === "*") {
        const close = textValue.indexOf("*/", index + 2);
        const end = close < 0 ? textValue.length : close + 2;
        blank(index, end);
        index = end;
        continue;
      }
      if (character === "'" || character === '"') {
        const end = skipQuoted(index, character);
        blank(index, end);
        index = end;
        canStartRegex = false;
        pendingControlParen = false;
        continue;
      }
      if (character === templateQuote) {
        index = scanTemplate(index);
        canStartRegex = false;
        pendingControlParen = false;
        continue;
      }
      if (character === "/" && canStartRegex) {
        const end = skipRegularExpression(index);
        if (end > index + 1) {
          blank(index, end);
          index = end;
          canStartRegex = false;
          pendingControlParen = false;
          continue;
        }
      }
      if (/[A-Za-z_$]/.test(character)) {
        let end = index + 1;
        while (end < textValue.length && /[A-Za-z0-9_$]/.test(textValue[end])) end += 1;
        const word = textValue.slice(index, end);
        pendingControlParen = controlParenKeywords.has(word);
        canStartRegex = regexPrefixKeywords.has(word);
        index = end;
        continue;
      }
      if (/[0-9]/.test(character)) {
        let end = index + 1;
        while (end < textValue.length && /[A-Za-z0-9_.]/.test(textValue[end])) end += 1;
        index = end;
        canStartRegex = false;
        pendingControlParen = false;
        continue;
      }
      if (character === "(") {
        controlParenStack.push(pendingControlParen);
        pendingControlParen = false;
        index += 1;
        canStartRegex = true;
        continue;
      }
      if (character === ")") {
        const closesControlParen = controlParenStack.pop() === true;
        pendingControlParen = false;
        index += 1;
        canStartRegex = closesControlParen;
        continue;
      }
      if (stopAtTemplateBrace && character === "{") {
        braceDepth += 1;
        index += 1;
        canStartRegex = true;
        pendingControlParen = false;
        continue;
      }
      if (stopAtTemplateBrace && character === "}" && braceDepth > 0) {
        braceDepth -= 1;
        index += 1;
        canStartRegex = false;
        pendingControlParen = false;
        continue;
      }
      const three = textValue.slice(index, index + 3);
      const two = textValue.slice(index, index + 2);
      const token = ["===", "!=="].includes(three)
        ? three
        : (["=>", "++", "--", "?.", "&&", "||", "??", "==", "!=", "<=", ">=",
            "+=", "-=", "*=", "/=", "%=", "**", "<<", ">>"].includes(two) ? two : character);
      index += token.length;
      canStartRegex = ![")", "]", "}", ".", "?.", "++", "--"].includes(token);
      if (token === ";") canStartRegex = true;
      pendingControlParen = false;
    }
    return index;
  }

  scanCode(0, false);
  return output.join("");
}

function findClosingDelimiter(source, openIndex, opening, closing) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === opening) depth += 1;
    else if (source[index] === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevelArguments(source) {
  const argumentsList = [];
  let start = 0;
  let parentheses = 0;
  let braces = 0;
  let brackets = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "{") braces += 1;
    else if (character === "}") braces -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (character === "," && parentheses === 0 && braces === 0 && brackets === 0) {
      argumentsList.push(source.slice(start, index));
      start = index + 1;
    }
  }
  argumentsList.push(source.slice(start));
  return argumentsList;
}

function findTopLevelArrow(source) {
  let parentheses = 0;
  let braces = 0;
  let brackets = 0;
  for (let index = 0; index < source.length - 1; index += 1) {
    const character = source[index];
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "{") braces += 1;
    else if (character === "}") braces -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (character === "=" && source[index + 1] === ">" &&
      parentheses === 0 && braces === 0 && brackets === 0) return index;
  }
  return -1;
}

function hasExecutableCallbackBody(bodySource) {
  const body = bodySource.replace(/[\s;{}]/g, "");
  return body.length > 0 && !/^(?:return|returnundefined|void0)$/.test(body);
}

function hasNonEmptyTestCallback(callbackSource) {
  let source = callbackSource.trim();
  if (!source) return false;

  // Permit a parenthesized inline function expression without mistaking a
  // nested function in an options object for the test callback.
  while (source.startsWith("(") && source.endsWith(")") &&
    findClosingDelimiter(source, 0, "(", ")") === source.length - 1) {
    source = source.slice(1, -1).trim();
  }

  const arrow = findTopLevelArrow(source);
  if (arrow >= 0) {
    let bodyStart = arrow + 2;
    while (/\s/.test(source[bodyStart] || "")) bodyStart += 1;
    if (source[bodyStart] === "{") {
      const bodyEnd = findClosingDelimiter(source, bodyStart, "{", "}");
      if (bodyEnd < 0) return false;
      return hasExecutableCallbackBody(source.slice(bodyStart + 1, bodyEnd));
    }
    const expression = source.slice(bodyStart).replace(/[\s;,]/g, "");
    return expression.length > 0 && expression !== "undefined" && expression !== "void0";
  }

  const functionMatch = /^(?:async\s+)?function\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*\(/.exec(source);
  if (!functionMatch) return false;
  const parameterStart = source.indexOf("(", functionMatch.index);
  const parameterEnd = findClosingDelimiter(source, parameterStart, "(", ")");
  if (parameterEnd < 0) return false;
  let bodyStart = parameterEnd + 1;
  while (/\s/.test(source[bodyStart] || "")) bodyStart += 1;
  if (source[bodyStart] !== "{") return false;
  const bodyEnd = findClosingDelimiter(source, bodyStart, "{", "}");
  if (bodyEnd < 0) return false;
  return hasExecutableCallbackBody(source.slice(bodyStart + 1, bodyEnd));
}

function getNodeTestBindings(source, code) {
  // A plausible test()/it() call is not enough: placeholders can define
  // local no-op functions. Track the exact identifiers imported from
  // Node's built-in test module and only accept registrations through them.
  const bindings = new Set();
  const commonJsBinding = /(^|[^A-Za-z0-9_$.])(?:const|let|var)\s+(test|it|\{\s*(?:test|it)(?:\s*,\s*(?:test|it))*\s*\})\s*=\s*require\s*\(/gm;
  let match;
  while ((match = commonJsBinding.exec(code))) {
    const requireIndex = code.indexOf("require", match.index + match[1].length);
    const openIndex = code.indexOf("(", requireIndex + "require".length);
    const closeIndex = findClosingDelimiter(code, openIndex, "(", ")");
    if (closeIndex < 0) continue;
    const moduleArgument = source.slice(openIndex + 1, closeIndex).trim();
    if (!/^(['"])node:test\1$/.test(moduleArgument)) continue;
    if (match[2] === "test" || match[2] === "it") bindings.add(match[2]);
    else for (const name of match[2].match(/\b(?:test|it)\b/g) || []) bindings.add(name);
  }

  const esmBinding = /(^|[^A-Za-z0-9_$.])import\s+(test|it|\{\s*(?:test|it)(?:\s*,\s*(?:test|it))*\s*\})\s+from\s+/gm;
  while ((match = esmBinding.exec(code))) {
    const fromOffset = match[0].lastIndexOf("from") + 4;
    let specifierStart = match.index + fromOffset;
    while (/\s/.test(source[specifierStart] || "")) specifierStart += 1;
    const moduleSpecifier = source.slice(specifierStart);
    if (!/^(['"])node:test\1/.test(moduleSpecifier)) continue;
    if (match[2] === "test" || match[2] === "it") bindings.add(match[2]);
    else for (const name of match[2].match(/\b(?:test|it)\b/g) || []) bindings.add(name);
  }
  return bindings;
}

function maskNodeTestImportDeclarations(source, code) {
  const output = code.split('');
  const blank = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (output[index] !== '\n' && output[index] !== '\r') output[index] = ' ';
    }
  };

  const commonJsBinding = /(^|[^A-Za-z0-9_$.])(?:const|let|var)\s+(test|it|\{\s*(?:test|it)(?:\s*,\s*(?:test|it))*\s*\})\s*=\s*require\s*\(/gm;
  let match;
  while ((match = commonJsBinding.exec(code))) {
    const requireIndex = code.indexOf('require', match.index + match[1].length);
    const openIndex = code.indexOf('(', requireIndex + 'require'.length);
    const closeIndex = findClosingDelimiter(code, openIndex, '(', ')');
    if (closeIndex < 0) continue;
    if (!/^(['"])node:test\1$/.test(source.slice(openIndex + 1, closeIndex).trim())) continue;
    blank(match.index + match[1].length, closeIndex + 1);
  }

  const esmBinding = /(^|[^A-Za-z0-9_$.])import\s+(test|it|\{\s*(?:test|it)(?:\s*,\s*(?:test|it))*\s*\})\s+from\s+/gm;
  while ((match = esmBinding.exec(code))) {
    const fromOffset = match[0].lastIndexOf('from') + 4;
    let specifierStart = match.index + fromOffset;
    while (/\s/.test(source[specifierStart] || '')) specifierStart += 1;
    const quote = source[specifierStart];
    if (quote !== "'" && quote !== '"') continue;
    const specifierEnd = source.indexOf(quote, specifierStart + 1);
    if (specifierEnd < 0 || source.slice(specifierStart + 1, specifierEnd) !== 'node:test') continue;
    blank(match.index + match[1].length, specifierEnd + 1);
  }
  return output.join('');
}

function hasShadowedNodeTestBinding(code, name) {
  // Fail closed when an imported test/it identifier is also declared,
  // shadowed by a parameter/method, or reassigned elsewhere in the file.
  // This deliberately conservative rule prevents a nested no-op helper from
  // impersonating node:test without adding a parser dependency to the guard.
  const escaped = name;
  const patterns = [
    new RegExp('\\b(?:const|let|var)\\s+' + escaped + '\\b'),
    new RegExp('\\b(?:const|let|var)\\s*\\{[^}]*\\b' + escaped + '\\b[^}]*\\}\\s*='),
    new RegExp('\\bfunction\\s+' + escaped + '\\s*\\('),
    new RegExp('\\bclass\\s+' + escaped + '\\b'),
    new RegExp('\\bfunction\\s*(?:[A-Za-z_$][\\w$]*)?\\s*\\([^)]*\\b' + escaped + '\\b[^)]*\\)'),
    new RegExp('\\bcatch\\s*\\(\\s*' + escaped + '\\s*\\)'),
    new RegExp('(?:\\(\\s*' + escaped + '(?:\\s*,[^)]*)?\\)|\\b' + escaped + ')\\s*=>'),
    new RegExp('\\(\\s*\\{[^}]*\\b' + escaped + '\\b[^}]*\\}\\s*\\)\\s*=>'),
    new RegExp('(?:^|[;{}\\n])\\s*(?:async\\s+)?(?!if\\b|for\\b|while\\b|switch\\b|catch\\b|with\\b)[A-Za-z_$][\\w$]*\\s*\\([^)]*\\b' + escaped + '\\b[^)]*\\)\\s*\\{'),
    new RegExp('\\b' + escaped + '\\s*=(?!=|>)')
  ];
  return patterns.some((pattern) => pattern.test(code));
}

function hasRegisteredTestCase(source) {
  const code = maskJavaScriptNonCode(source);
  const nodeTestBindings = getNodeTestBindings(source, code);
  if (nodeTestBindings.size === 0) return false;
  const importMaskedCode = maskNodeTestImportDeclarations(source, code);
  const shadowedBindings = new Set([...nodeTestBindings].filter((name) =>
    hasShadowedNodeTestBinding(importMaskedCode, name)
  ));
  const focusedTest = /(^|[^A-Za-z0-9_$.])(?:test|it|describe)\s*\.\s*only\s*\(/m.test(code);
  if (focusedTest) return false;

  const registration = /(^|[^A-Za-z0-9_$.])(test|it)\s*\(/gm;
  let match;
  while ((match = registration.exec(code))) {
    const identifierStart = match.index + match[1].length;
    if (!nodeTestBindings.has(match[2]) || shadowedBindings.has(match[2])) continue;
    const openIndex = code.indexOf("(", identifierStart + match[2].length);
    const closeIndex = findClosingDelimiter(code, openIndex, "(", ")");
    if (closeIndex < 0) continue;

    let afterCall = closeIndex + 1;
    while (/\s/.test(code[afterCall] || "")) afterCall += 1;
    // A function declaration or object/class method named test()/it() is
    // not a node:test registration; both are followed by a method body.
    if (code[afterCall] === "{") continue;

    const callArguments = splitTopLevelArguments(code.slice(openIndex + 1, closeIndex));
    const callbackSource = callArguments[callArguments.length - 1] || "";
    if (hasNonEmptyTestCallback(callbackSource)) return true;
  }
  return false;
}

test('every repository Node test file registers at least one executable test case', () => {
  const repositoryRoot = path.resolve(__dirname, '..');
  const testFiles = collectNodeTestFiles(repositoryRoot);
  const actualInventory = testFiles
    .map((file) => path.relative(repositoryRoot, file).split(path.sep).join('/'))
    .sort();
  const expectedInventory = fs.readFileSync(path.join(__dirname, 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();

  assert.equal(new Set(expectedInventory).size, expectedInventory.length,
    'the required Node test inventory must not contain duplicate paths');
  assert.deepEqual(actualInventory, expectedInventory,
    'Node test files were added, removed or renamed; review and update REQUIRED_NODE_TEST_FILES.txt explicitly');
  assert.ok(testFiles.length > 0, 'the repository must retain its Node regression suite');
  assert.equal(hasRegisteredTestCase('placeholder'), false, 'literal placeholder files must not count as tests');
  assert.equal(hasRegisteredTestCase('// placeholder\n/* no executable test */'), false,
    'comment-only test files must not count as tests');
  assert.equal(hasRegisteredTestCase("test('placeholder', () => {});"), false,
    'an empty callback must not make a placeholder-only file look like a regression suite');
  assert.equal(hasRegisteredTestCase("test('comment-only', () => { /* no assertions or work */ });"), false,
    'a comment-only callback must not count as an executable test');
  assert.equal(hasRegisteredTestCase("const test = require('node:test');\ntest('valid fixture', () => { assert.equal(1, 1); });"), true,
    'an active named registration with an executable callback must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('node:test');\ntest(\n  'valid multiline fixture',\n  async () => {\n    assert.equal(await Promise.resolve(1), 1);\n  }\n);"), true,
    'a valid multiline registration must be accepted');
  assert.equal(hasRegisteredTestCase("function test() { assert.equal(1, 1); }"), false,
    'a function declaration named test must not count as a node:test registration');
  assert.equal(hasRegisteredTestCase("const suite = { test() { assert.equal(1, 1); } };"), false,
    'an object method named test must not count as a node:test registration');
  assert.equal(hasRegisteredTestCase("test.skip('skipped fixture', () => {});"), false,
    'a skipped test must not make a file look like an executable regression suite');
  assert.equal(hasRegisteredTestCase("test.todo('todo fixture');"), false,
    'a todo-only file must not make a suite look executable');
  assert.equal(hasRegisteredTestCase("test.only('focused fixture', () => {});"), false,
    'committed focused-only test files must be rejected');
  assert.equal(hasRegisteredTestCase("describe.only('focused suite', () => { test('active', () => {}); });"), false,
    'focused-only describe suites must be rejected');
  assert.equal(hasRegisteredTestCase("const example = \"test('fake')\";"), false,
    'a test-like string literal must not count as a test registration');
  assert.equal(hasRegisteredTestCase("const example = 'test(placeholder)';"), false,
    'single-quoted fake registrations must be ignored');
  assert.equal(hasRegisteredTestCase("const example = " + String.fromCharCode(96) + "example test('fake')" + String.fromCharCode(96) + ";"), false,
    'template raw text must not count as an executable registration');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); const example = " + String.fromCharCode(96) + "${test('real', () => assert.ok(true))}" + String.fromCharCode(96) + ";"), true,
    'an actual registration with an executable callback inside a template interpolation remains executable');
  assert.equal(hasRegisteredTestCase("const example = /test(foo)/;"), false,
    'regular-expression literals must not count as executable registrations');
  assert.equal(hasRegisteredTestCase("// test('fake')\\n/* it('fake') */"), false,
    'line and block comments must not count as executable registrations');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); const example = " + String.fromCharCode(96) + "test.only('fake')" + String.fromCharCode(96) + "; test('real', () => assert.ok(true));"), true,
    'focused-test text inside a template literal must not reject a real test');
  assert.equal(hasRegisteredTestCase("const note = \"not test('fake')\";"), false,
    'prose before a test-like phrase inside a quoted string must not count as a registration');
  assert.equal(hasRegisteredTestCase("const note = " + String.fromCharCode(96) + "example test('fake')" + String.fromCharCode(96) + ";"), false,
    'prose before a test-like phrase inside template raw text must not count as a registration');
  assert.equal(hasRegisteredTestCase("const note = \"// test('fake') /* it('fake') */\";"), false,
    'comment markers and test-like text inside strings must remain inert');

  assert.equal(hasRegisteredTestCase("if (enabled) /test('fake', () => assert.ok(true))/.test('x');"), false,
    'a regex literal after a control-flow parenthesis must not count as a registration');
  assert.equal(hasRegisteredTestCase("while (enabled) /it('fake', () => assert.ok(true))/.test('x');"), false,
    'a regex literal after a while condition must not count as a registration');
  assert.equal(hasRegisteredTestCase("test('fake', { setup: () => assert.ok(true) });"), false,
    'an arrow nested inside test options is not the test callback');
  assert.equal(hasRegisteredTestCase("test('fake', { setup: () => assert.ok(true) }, () => {});"), false,
    'an empty final callback must not be rescued by an arrow nested in options');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid async', async () => { await Promise.resolve(); assert.ok(true); });"), true,
    'an async inline callback must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid function', function () { assert.ok(true); });"), true,
    'a non-empty function-expression callback must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid parenthesized function', (function () { assert.ok(true); }));"), true,
    'a parenthesized function-expression callback must be accepted');
  assert.equal(hasRegisteredTestCase("test('empty function', function () { /* no executable body */ });"), false,
    'an empty function-expression callback must not count as an executable test');
  assert.equal(hasRegisteredTestCase("function test() {}\ntest('fake', () => assert.ok(true));"), false,
    'a locally defined no-op test function must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("const test = () => {}; test('fake', () => assert.ok(true));"), false,
    'a locally assigned no-op test function must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("function it() {}\nit('fake', () => assert.ok(true));"), false,
    'a locally defined it() helper must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); const it = () => {}; it('fake', () => assert.ok(true));"), false,
    'an imported test binding must not authorize a locally defined it() helper');
  assert.equal(hasRegisteredTestCase("const { test } = require('node:test'); function helper(test) { test('fake', () => assert.ok(true)); }"), false,
    'a shadowed function parameter must not impersonate the imported node:test binding');
  assert.equal(hasRegisteredTestCase("const { test } = require('node:test'); function helper() { const test = () => {}; test('fake', () => assert.ok(true)); }"), false,
    'a shadowed local declaration must not impersonate the imported node:test binding');
  assert.equal(hasRegisteredTestCase("let { test } = require('node:test'); test = () => {}; test('fake', () => assert.ok(true));"), false,
    'reassigning an imported test binding must not count as a node:test registration');
  assert.equal(hasRegisteredTestCase("import { test } from 'node:test'; function helper(test) { test('fake', () => assert.ok(true)); }"), false,
    'ES module test imports must also reject shadowed registrations');
  assert.equal(hasRegisteredTestCase("const { it } = require('node:test'); it('valid', () => assert.ok(true));"), true,
    'a genuine CommonJS it binding must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('./fake-test'); test('fake', () => assert.ok(true));"), false,
    'a test helper from another module must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid', () => assert.ok(true));"), true,
    'a CommonJS default node:test binding must be accepted');
  assert.equal(hasRegisteredTestCase("const { test } = require('node:test'); test('valid', () => assert.ok(true));"), true,
    'a CommonJS named node:test binding must be accepted');
  assert.equal(hasRegisteredTestCase("import test from 'node:test'; test('valid', () => assert.ok(true));"), true,
    'an ES module default node:test binding must be accepted');
  assert.equal(hasRegisteredTestCase("import { test } from 'node:test'; test('valid', () => assert.ok(true));"), true,
    'an ES module named node:test binding must be accepted');

  for (const file of testFiles) {
    const relative = path.relative(repositoryRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(hasRegisteredTestCase(source),
      relative + ' must register at least one named test(); a placeholder/helper-only file is not a regression suite');
  }
});
