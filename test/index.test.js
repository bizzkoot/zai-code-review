const {
  splitIntoChunks,
  buildChunkPrompt,
  extractActionableSuggestions,
  RETRY_CONFIG,
} = require('../src/index');

describe('splitIntoChunks', () => {
  test('returns empty array for files without patches', () => {
    const files = [{ filename: 'a.txt' }, { filename: 'b.txt' }];
    expect(splitIntoChunks(files)).toEqual([]);
  });

  test('returns single chunk for small files', () => {
    const files = [{ filename: 'a.txt', patch: 'small diff', status: 'modified' }];
    const chunks = splitIntoChunks(files);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(1);
  });

  test('splits when adding file would exceed chunk size', () => {
    const smallPatch = 'x'.repeat(40000);
    const largePatch = 'x'.repeat(40000);
    const files = [
      { filename: 'small1.txt', patch: smallPatch, status: 'modified' },
      { filename: 'small2.txt', patch: largePatch, status: 'modified' },
    ];
    const chunks = splitIntoChunks(files);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(1);
    expect(chunks[1].length).toBe(1);
  });

  test('handles mixed file sizes', () => {
    const files = [
      { filename: 'small.txt', patch: 'diff', status: 'modified' },
      { filename: 'large.txt', patch: 'x'.repeat(60000), status: 'modified' },
    ];
    const chunks = splitIntoChunks(files);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildChunkPrompt', () => {
  test('builds prompt for single file', () => {
    const files = [{ filename: 'test.js', patch: 'const x = 1;', status: 'modified' }];
    const prompt = buildChunkPrompt(files, 0, 1);
    expect(prompt).toContain('### test.js (modified)');
    expect(prompt).toContain('```diff');
    expect(prompt).toContain('const x = 1;');
  });

  test('includes chunk indicator for multi-chunk reviews', () => {
    const files = [{ filename: 'test.js', patch: 'diff', status: 'modified' }];
    const prompt = buildChunkPrompt(files, 0, 3);
    expect(prompt).toContain('part 1 of 3');
  });

  test('excludes files without patches', () => {
    const files = [
      { filename: 'a.txt', patch: 'diff', status: 'modified' },
      { filename: 'b.txt', status: 'deleted' },
    ];
    const prompt = buildChunkPrompt(files, 0, 1);
    expect(prompt).toContain('a.txt');
    expect(prompt).not.toContain('b.txt');
  });
});

describe('RETRY_CONFIG', () => {
  test('has sensible retry values', () => {
    expect(RETRY_CONFIG.maxRetries).toBeGreaterThan(0);
    expect(RETRY_CONFIG.baseDelayMs).toBeGreaterThan(0);
    expect(RETRY_CONFIG.maxDelayMs).toBeGreaterThanOrEqual(RETRY_CONFIG.baseDelayMs);
  });
});

describe('extractActionableSuggestions', () => {
  test('extracts valid unique suggestion markers from raw reviews', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/index.js:line:10:Use const:const value = 1;]]\n[[suggestion:path:src/index.js:line:10:Use const:const value = 1;]]',
      },
    ];

    expect(extractActionableSuggestions(reviews)).toEqual([
      {
        id: 'src/index.js:10:Use const',
        path: 'src/index.js',
        line: 10,
        side: 'RIGHT',
        body: 'Use const',
        suggestion: 'const value = 1;',
      },
    ]);
  });

  test('ignores malformed suggestions and invalid lines', () => {
    const reviews = [
      {
        rawReview: [
          '[[suggestion:path:src/index.js:line:not-a-number:Bad:const value = 1;]]',
          '[[suggestion:path::line:12:Missing path:const value = 2;]]',
          '[[suggestion:path:src/index.js:line:0:Bad line:const value = 3;]]',
        ].join('\n'),
      },
    ];

    expect(extractActionableSuggestions(reviews)).toEqual([]);
  });
});
