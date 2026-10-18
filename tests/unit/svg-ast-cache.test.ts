import assert from 'node:assert/strict';
import test from 'node:test';

function mockModule(specifier: string, exports: Record<string, unknown>): void {
  const filename = require.resolve(specifier);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

let parseCalls = 0;
const parsedByXml = new Map<string, { props: { xml: string } }>();

mockModule('react-native-svg', {
  parse: (xml: string) => {
    parseCalls += 1;
    if (xml.includes('broken')) {
      throw new Error('unparseable svg');
    }
    if (!parsedByXml.has(xml)) {
      parsedByXml.set(xml, { props: { xml } });
    }
    return parsedByXml.get(xml);
  },
});

test('getParsedSvgAst parses each asset once per process', async () => {
  const { getParsedSvgAst, clearParsedSvgAstCache } = await import('../../src/utils/svgAstCache');
  clearParsedSvgAstCache();
  parseCalls = 0;

  const first = getParsedSvgAst('plank', '<svg><rect /></svg>');
  const second = getParsedSvgAst('plank', '<svg><rect /></svg>');

  assert.equal(parseCalls, 1, 'second lookup is served from the cache');
  assert.equal(first, second, 'the same AST instance is reused');
  assert.ok(first);
});

test('different assets are parsed independently', async () => {
  const { getParsedSvgAst, clearParsedSvgAstCache } = await import('../../src/utils/svgAstCache');
  clearParsedSvgAstCache();
  parseCalls = 0;

  getParsedSvgAst('plank', '<svg><rect /></svg>');
  getParsedSvgAst('guide', '<svg><circle /></svg>');

  assert.equal(parseCalls, 2);
});

test('a failed parse is cached as null and reported once', async () => {
  const { getParsedSvgAst, clearParsedSvgAstCache } = await import('../../src/utils/svgAstCache');
  clearParsedSvgAstCache();
  parseCalls = 0;

  assert.equal(getParsedSvgAst('broken-asset', '<svg>broken</svg>'), null);
  assert.equal(getParsedSvgAst('broken-asset', '<svg>broken</svg>'), null);

  assert.equal(parseCalls, 1, 'a broken asset is not re-parsed on every mount');
});

test('clearing the cache forces a fresh parse', async () => {
  const { getParsedSvgAst, clearParsedSvgAstCache } = await import('../../src/utils/svgAstCache');
  clearParsedSvgAstCache();
  parseCalls = 0;

  getParsedSvgAst('plank', '<svg><rect /></svg>');
  clearParsedSvgAstCache();
  getParsedSvgAst('plank', '<svg><rect /></svg>');

  assert.equal(parseCalls, 2);
});
