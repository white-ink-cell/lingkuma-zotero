import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATCH_PATH = path.join(ROOT, 'adapter', 'sentence_patch.js');
const UPSTREAM_PATH = path.join(ROOT, 'upstream', 'src', 'content.js');

const NodeConstants = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
const NodeFilterConstants = { SHOW_ALL: -1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };

const rect = (left = 0, top = 0, width = 100, height = 10) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

class TextNode {
  constructor(text, box = rect()) {
    this.nodeType = NodeConstants.TEXT_NODE;
    this.textContent = text;
    this.parentElement = null;
    this.box = box;
  }
}

class ElementNode {
  constructor(tagName, { className = '', position = 'static', display, box = rect() } = {}) {
    this.nodeType = NodeConstants.ELEMENT_NODE;
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.position = position;
    this.display = display || (this.tagName === 'SPAN' ? 'inline' : 'block');
    this.box = box;
    this.children = [];
    this.childNodes = [];
    this.parentElement = null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.childNodes.push(node);
      if (node.nodeType === NodeConstants.ELEMENT_NODE) this.children.push(node);
    }
    return this;
  }

  get textContent() { return this.childNodes.map(node => node.textContent || '').join(''); }
  get innerText() { return this.textContent; }
  get firstChild() { return this.childNodes[0] || null; }
  contains(target) {
    if (target === this) return true;
    return this.childNodes.some(node => node === target || node.contains?.(target));
  }
  closest(selector) {
    let cursor = this;
    while (cursor) {
      if (selector.includes('.textLayer') && String(cursor.className).split(/\s+/).includes('textLayer')) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }
  getBoundingClientRect() { return this.box; }
}

const textDescendants = root => {
  const result = [];
  const visit = node => {
    if (node.nodeType === NodeConstants.TEXT_NODE) result.push(node);
    for (const child of node.childNodes || []) visit(child);
  };
  visit(root);
  return result;
};

const allDescendants = root => {
  const result = [];
  const visit = node => {
    result.push(node);
    for (const child of node.childNodes || []) visit(child);
  };
  for (const child of root.childNodes || []) visit(child);
  return result;
};

const makeDom = root => {
  const html = new ElementNode('html');
  const body = new ElementNode('body');
  html.append(body);
  body.append(root);
  return {
    body,
    documentElement: html,
    createTreeWalker(walkRoot, whatToShow, filter) {
      const nodes = whatToShow === NodeFilterConstants.SHOW_TEXT
        ? textDescendants(walkRoot)
        : allDescendants(walkRoot);
      let index = 0;
      return {
        nextNode() {
          while (index < nodes.length) {
            const candidate = nodes[index++];
            if (!filter || filter.acceptNode(candidate) === NodeFilterConstants.FILTER_ACCEPT) return candidate;
          }
          return null;
        },
      };
    },
    createRange() {
      return {
        selectNodeContents(node) { this.selected = node; },
        getClientRects() { return this.selected ? [this.selected.box || this.selected.parentElement?.box || rect()] : []; },
        setStart(node, offset) { this.startContainer = node; this.startOffset = offset; },
        setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; },
      };
    },
  };
};

const computedStyle = element => ({
  display: element?.display || 'inline',
  visibility: 'visible',
  opacity: '1',
  position: element?.position || 'static',
});

const installPatchedSentenceFunction = (document, storage = {}) => {
  globalThis.Node = NodeConstants;
  globalThis.NodeFilter = NodeFilterConstants;
  globalThis.document = document;
  globalThis.window = { location: { hostname: '' }, getComputedStyle: computedStyle };
  globalThis.chrome = {
    storage: {
      local: { get(_keys, callback) { callback(storage); } },
      onChanged: { addListener() {} },
    },
  };
  globalThis.getComputedStyle = computedStyle;
  globalThis.getSentenceForWord = () => ({ sentence: '__UPSTREAM_FALLBACK__', range: null });
  delete globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__;
  vm.runInThisContext(fs.readFileSync(PATCH_PATH, 'utf8'), { filename: PATCH_PATH });
  return globalThis.getSentenceForWord;
};

const htmlFragmentsCase = (fragments, targetIndex, target, storage = {}) => {
  const container = new ElementNode('div');
  const texts = fragments.map(({ text, box }) => {
    const node = new TextNode(text, box);
    container.append(new ElementNode('span', { box }).append(node));
    return node;
  });
  const document = makeDom(container);
  const sentenceFunction = installPatchedSentenceFunction(document, storage);
  return sentenceFunction({
    word: target,
    range: { startContainer: texts[targetIndex], startOffset: texts[targetIndex].textContent.indexOf(target) },
  }).sentence;
};

const loadUpstreamSentenceFunction = document => {
  const source = fs.readFileSync(UPSTREAM_PATH, 'utf8');
  const start = source.indexOf('function getSentenceForWord(detail)');
  const end = source.indexOf('\nfunction isBlockElement', start);
  assert.ok(start >= 0 && end > start, 'actual upstream sentence function must be extractable');
  const factory = new Function(
    'Node', 'NodeFilter', 'document', 'window',
    'getSentenceTraversalParentFromRange', 'isAllowedYouTubeElement', 'isBlockElement',
    `${source.slice(start, end)}\n; return getSentenceForWord;`,
  );
  return factory(
    NodeConstants,
    NodeFilterConstants,
    document,
    { location: { hostname: '' }, getComputedStyle: computedStyle },
    (_range, fallbackParent) => fallbackParent,
    () => true,
    element => ['block', 'flex', 'grid'].includes(computedStyle(element).display),
  );
};

const paragraphCase = (textValue, target, implementation = 'patched') => {
  const text = new TextNode(textValue);
  const paragraph = new ElementNode('p').append(text);
  const document = makeDom(paragraph);
  const sentenceFunction = implementation === 'upstream'
    ? loadUpstreamSentenceFunction(document)
    : installPatchedSentenceFunction(document);
  return sentenceFunction({
    word: target,
    range: { startContainer: text, startOffset: textValue.indexOf(target) },
  }).sentence;
};

const separatedParagraphCase = (firstText, secondText, target) => {
  const first = new TextNode(firstText);
  const second = new TextNode(secondText);
  const container = new ElementNode('div').append(
    new ElementNode('p').append(first),
    new ElementNode('p').append(second),
  );
  const document = makeDom(container);
  const sentenceFunction = installPatchedSentenceFunction(document);
  return sentenceFunction({
    word: target,
    range: { startContainer: second, startOffset: secondText.indexOf(target) },
  }).sentence;
};

const positionedCase = (fragments, targetIndex, target) => {
  const layer = new ElementNode('div', { className: 'textLayer' });
  const texts = fragments.map(({ text, box }) => {
    const node = new TextNode(text, box);
    layer.append(new ElementNode('span', { position: 'absolute', box }).append(node));
    return node;
  });
  const document = makeDom(layer);
  const sentenceFunction = installPatchedSentenceFunction(document);
  return sentenceFunction({
    word: target,
    range: { startContainer: texts[targetIndex], startOffset: texts[targetIndex].textContent.indexOf(target) },
  }).sentence;
};

const positionedResultCase = (fragments, targetIndex, target) => {
  const layer = new ElementNode('div', { className: 'textLayer' });
  const texts = fragments.map(({ text, box }) => {
    const node = new TextNode(text, box);
    layer.append(new ElementNode('span', { position: 'absolute', box }).append(node));
    return node;
  });
  const document = makeDom(layer);
  const sentenceFunction = installPatchedSentenceFunction(document);
  return sentenceFunction({
    word: target,
    range: { startContainer: texts[targetIndex], startOffset: texts[targetIndex].textContent.indexOf(target) },
  });
};

const upstreamMode = process.env.LINGKUMA_SENTENCE_TARGET === 'upstream';

test('upstream 1.1.1 truncates the parenthetical sentence and proves the adapter is still required', { skip: !upstreamMode }, () => {
  const text = 'Today, artificial intelligence (AI) is transforming research.';
  assert.equal(paragraphCase(text, 'transforming', 'upstream'), text);
});

test('keeps a parenthetical phrase inside the current sentence', { skip: upstreamMode }, () => {
  const text = 'Today, artificial intelligence (AI) is transforming research. Next sentence.';
  assert.equal(paragraphCase(text, 'transforming'), 'Today, artificial intelligence (AI) is transforming research.');
});

test('does not split abbreviations, initials, decimals, semicolons, or colons', { skip: upstreamMode }, () => {
  const text = 'Dr. A. Smith measured 3.14 units; the result: target remained stable. Next sentence.';
  const expected = 'Dr. A. Smith measured 3.14 units; the result: target remained stable.';
  assert.equal(paragraphCase(text, 'target'), expected);
  assert.equal(paragraphCase(text, 'Dr'), expected);
  assert.equal(paragraphCase(text, 'A.'), expected);
  assert.equal(paragraphCase('This is option A. Next sentence.', 'Next'), 'Next sentence.');
  assert.equal(paragraphCase('Please consult Dr. Next sentence.', 'Next'), 'Next sentence.');
});

test('distinguishes a terminal acronym from an acronym inside a sentence', { skip: upstreamMode }, () => {
  assert.equal(paragraphCase('I moved to the U.S. Next sentence.', 'moved'), 'I moved to the U.S.');
  assert.equal(
    paragraphCase('The U.S. market remains stable. Next sentence.', 'market'),
    'The U.S. market remains stable.',
  );
  assert.equal(
    paragraphCase('I moved to the U.S. Researchers documented the change.', 'moved'),
    'I moved to the U.S.',
  );
  assert.equal(
    paragraphCase('She earned a Ph.D. Researchers documented the change.', 'Researchers'),
    'Researchers documented the change.',
  );
});

test('uses a conservative hard fallback when Intl.Segmenter is unavailable', { skip: upstreamMode }, () => {
  const value = 'I moved to the U.S. Next sentence.';
  const text = new TextNode(value);
  installPatchedSentenceFunction(makeDom(new ElementNode('p').append(text)));
  const originalSegmenter = Intl.Segmenter;
  try {
    Intl.Segmenter = undefined;
    const bounds = globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.test.findSentenceBounds(value, value.indexOf('moved'));
    assert.equal(value.slice(bounds.start, bounds.end), 'I moved to the U.S.');
    assert.equal(bounds.method, 'hard');
  } finally {
    Intl.Segmenter = originalSegmenter;
  }
});

test('keeps terminal quotes and brackets with the sentence', { skip: upstreamMode }, () => {
  const text = 'The report states "Done." Next sentence.';
  assert.equal(paragraphCase(text, 'Done'), 'The report states "Done."');
  assert.equal(paragraphCase('The report states (Done.) Next sentence.', 'Done'), 'The report states (Done.)');
});

test('repairs a positioned line-end typesetting hyphen', { skip: upstreamMode }, () => {
  const sentence = positionedCase([
    { text: 'The inter-', box: rect(0, 0, 70, 10) },
    { text: 'national study ends here. Next sentence.', box: rect(0, 15, 220, 10) },
  ], 1, 'national');
  assert.equal(sentence, 'The international study ends here.');
});

test('returns the clicked offset in the same normalized coordinate space as a positioned sentence', { skip: upstreamMode }, () => {
  const spaced = positionedResultCase([
    { text: 'A robust', box: rect(0, 0, 55, 10) },
    { text: 'out-of-sample estimate.', box: rect(65, 0, 150, 10) },
  ], 1, 'out');
  assert.equal(spaced.sentence, 'A robust out-of-sample estimate.');
  assert.equal(spaced.clickedSurfaceStart, 9);

  const repaired = positionedResultCase([
    { text: 'The inter-', box: rect(0, 0, 70, 10) },
    { text: 'national study ends here.', box: rect(0, 15, 180, 10) },
  ], 1, 'national');
  assert.equal(repaired.sentence, 'The international study ends here.');
  assert.equal(repaired.clickedSurfaceStart, 9);
});

test('EPUB text repair settings control only HTML soft-hyphen cleanup and line-break repair', { skip: upstreamMode }, () => {
  const enabled = { epubSoftHyphenCleanup: true, epubHyphenRepair: true };
  const disabled = { epubSoftHyphenCleanup: false, epubHyphenRepair: false };
  assert.equal(paragraphCase('An inter\u00adnational example ends here.', 'national'), 'An international example ends here.');

  const fragments = [
    { text: 'The inter-', box: rect(0, 0, 70, 10) },
    { text: 'national study ends here.', box: rect(0, 15, 180, 10) },
  ];
  assert.equal(htmlFragmentsCase(fragments, 1, 'national', enabled), 'The international study ends here.');
  assert.equal(htmlFragmentsCase(fragments, 1, 'national', disabled), 'The inter- national study ends here.');

  const softHyphen = new TextNode('An inter\u00adnational example ends here.');
  const document = makeDom(new ElementNode('p').append(softHyphen));
  const sentenceFunction = installPatchedSentenceFunction(document, disabled);
  assert.equal(sentenceFunction({
    word: 'national',
    range: { startContainer: softHyphen, startOffset: softHyphen.textContent.indexOf('national') },
  }).sentence, 'An inter\u00adnational example ends here.');
});

test('does not cross a positioned column or detached block boundary', { skip: upstreamMode }, () => {
  const sentence = positionedCase([
    { text: 'Previous column has no terminal punctuation', box: rect(400, 100, 240, 10) },
    { text: 'Target sentence ends here. Next sentence.', box: rect(40, 40, 220, 10) },
  ], 1, 'Target');
  assert.equal(sentence, 'Target sentence ends here.');
});

test('does not cross semantic paragraph boundaries', { skip: upstreamMode }, () => {
  assert.equal(
    separatedParagraphCase(
      'Previous paragraph deliberately has no terminal punctuation',
      'Target paragraph ends here. Next sentence.',
      'Target',
    ),
    'Target paragraph ends here.',
  );
});

test('supports meaningful short Japanese and Korean phrases', { skip: upstreamMode }, () => {
  assert.equal(paragraphCase('\u4eca\u65e5\u306f\u6674\u308c\u3067\u3059\u3002\u6b21\u3067\u3059\u3002', '\u6674\u308c'), '\u4eca\u65e5\u306f\u6674\u308c\u3067\u3059\u3002');
  assert.equal(paragraphCase('\uc624\ub298\uc740 \ub9d1\uc2b5\ub2c8\ub2e4. \ub2e4\uc74c\uc785\ub2c8\ub2e4.', '\ub9d1\uc2b5\ub2c8\ub2e4'), '\uc624\ub298\uc740 \ub9d1\uc2b5\ub2c8\ub2e4.');
});


test('preserves Zotero sentence-panel range and sentence diagnostics', { skip: upstreamMode }, () => {
  const value = 'Target sentence ends here. Next sentence.';
  const text = new TextNode(value);
  const document = makeDom(new ElementNode('p').append(text));
  const sentenceFunction = installPatchedSentenceFunction(document);
  const result = sentenceFunction({
    word: 'Target',
    range: { startContainer: text, startOffset: 0 },
  });

  assert.equal(result.sentence, 'Target sentence ends here.');
  assert.equal(globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.lastRange, result.range);
  assert.equal(globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.lastSentence, result.sentence);
});
