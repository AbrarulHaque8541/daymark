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
        continue;
      }
      if (character === templateQuote) {
        index = scanTemplate(index);
        canStartRegex = false;
        continue;
      }
      if (character === "/" && canStartRegex) {
        const end = skipRegularExpression(index);
        if (end > index + 1) {
          blank(index, end);
          index = end;
          canStartRegex = false;
          continue;
        }
      }
      if (/[A-Za-z_$]/.test(character)) {
        let end = index + 1;
        while (end < textValue.length && /[A-Za-z0-9_$]/.test(textValue[end])) end += 1;
        canStartRegex = regexPrefixKeywords.has(textValue.slice(index, end));
        index = end;
        continue;
      }
      if (/[0-9]/.test(character)) {
        let end = index + 1;
        while (end < textValue.length && /[A-Za-z0-9_.]/.test(textValue[end])) end += 1;
        index = end;
        canStartRegex = false;
        continue;
      }
      if (stopAtTemplateBrace && character === "{") {
        braceDepth += 1;
        index += 1;
        canStartRegex = true;
        continue;
      }
      if (stopAtTemplateBrace && character === "}" && braceDepth > 0) {
        braceDepth -= 1;
        index += 1;
        canStartRegex = false;
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

function hasNonEmptyTestCallback(argumentsSource) {
  const arrow = argumentsSource.indexOf("=>");
  if (arrow >= 0) {
    let bodyStart = arrow + 2;
    while (/\s/.test(argumentsSource[bodyStart] || "")) bodyStart += 1;
    if (argumentsSource[bodyStart] === "{") {
      const bodyEnd = findClosingDelimiter(argumentsSource, bodyStart, "{", "}");
      if (bodyEnd < 0) return false;
      const body = argumentsSource.slice(bodyStart + 1, bodyEnd).replace(/[\s;{}]/g, "");
      return body.length > 0 && !/^(?:returnundefined|void0)$/.test(body);
    }
    const expression = argumentsSource.slice(bodyStart).replace(/[\s;,]/g, "");
    return expression.length > 0 && expression !== "undefined" && expression !== "void0";
  }

  const functionMatch = /\bfunction\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*\(/.exec(argumentsSource);
  if (!functionMatch) return false;
  const parameterStart = argumentsSource.indexOf("(", functionMatch.index);
  const parameterEnd = findClosingDelimiter(argumentsSource, parameterStart, "(", ")");
  if (parameterEnd < 0) return false;
  const bodyStart = argumentsSource.indexOf("{", parameterEnd + 1);
  if (bodyStart < 0) return false;
  const bodyEnd = findClosingDelimiter(argumentsSource, bodyStart, "{", "}");
  if (bodyEnd < 0) return false;
  const body = argumentsSource.slice(bodyStart + 1, bodyEnd).replace(/[\s;{}]/g, "");
  return body.length > 0 && !/^(?:returnundefined|void0)$/.test(body);
}

function hasRegisteredTestCase(source) {
  const code = maskJavaScriptNonCode(source);
  const focusedTest = /(^|[^A-Za-z0-9_$.])(?:test|it|describe)\s*\.\s*only\s*\(/m.test(code);
  if (focusedTest) return false;

  const registration = /(^|[^A-Za-z0-9_$.])(?:test|it)\s*\(/gm;
  let match;
  while ((match = registration.exec(code))) {
    const identifierStart = match.index + match[1].length;
    const openIndex = code.indexOf("(", identifierStart);
    const closeIndex = findClosingDelimiter(code, openIndex, "(", ")");
    if (closeIndex < 0) continue;

    let afterCall = closeIndex + 1;
    while (/\s/.test(code[afterCall] || "")) afterCall += 1;
    // A function declaration or object/class method named test()/it() is
    // not a node:test registration; both are followed by a method body.
    if (code[afterCall] === "{") continue;

    if (hasNonEmptyTestCallback(code.slice(openIndex + 1, closeIndex))) return true;
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
  assert.equal(hasRegisteredTestCase("test('valid fixture', () => { assert.equal(1, 1); });"), true,
    'an active named registration with an executable callback must be accepted');
  assert.equal(hasRegisteredTestCase("test(\n  'valid multiline fixture',\n  async () => {\n    assert.equal(await Promise.resolve(1), 1);\n  }\n);"), true,
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
  assert.equal(hasRegisteredTestCase("const example = " + String.fromCharCode(96) + "${test('real', () => {})}" + String.fromCharCode(96) + ";"), true,
    'an actual registration inside a template interpolation remains executable');
  assert.equal(hasRegisteredTestCase("const example = /test(foo)/;"), false,
    'regular-expression literals must not count as executable registrations');
  assert.equal(hasRegisteredTestCase("// test('fake')\\n/* it('fake') */"), false,
    'line and block comments must not count as executable registrations');
  assert.equal(hasRegisteredTestCase("const example = " + String.fromCharCode(96) + "test.only('fake')" + String.fromCharCode(96) + "; test('real', () => {});"), true,
    'focused-test text inside a template literal must not reject a real test');
  assert.equal(hasRegisteredTestCase("const note = \"not test('fake')\";"), false,
    'prose before a test-like phrase inside a quoted string must not count as a registration');
  assert.equal(hasRegisteredTestCase("const note = " + String.fromCharCode(96) + "example test('fake')" + String.fromCharCode(96) + ";"), false,
    'prose before a test-like phrase inside template raw text must not count as a registration');
  assert.equal(hasRegisteredTestCase("const note = \"// test('fake') /* it('fake') */\";"), false,
    'comment markers and test-like text inside strings must remain inert');

  for (const file of testFiles) {
    const relative = path.relative(repositoryRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(hasRegisteredTestCase(source),
      relative + ' must register at least one named test(); a placeholder/helper-only file is not a regression suite');
  }
});
