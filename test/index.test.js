const {
  splitIntoChunks,
  buildChunkPrompt,
  extractActionableSuggestions,
  hashString,
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

describe('hashString', () => {
  test('produces consistent hash for same input', () => {
    const input = 'use const:const value = 1;';
    const hash1 = hashString(input);
    const hash2 = hashString(input);
    expect(hash1).toBe(hash2);
  });

  test('produces different hashes for different inputs', () => {
    const hash1 = hashString('use const:const value = 1;');
    const hash2 = hashString('use let:let value = 1;');
    expect(hash1).not.toBe(hash2);
  });

  test('handles empty string', () => {
    const hash = hashString('');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });

  test('handles special characters', () => {
    const hash1 = hashString('const x = "hello";');
    const hash2 = hashString('const x = "hello";');
    expect(hash1).toBe(hash2);
  });

  test('is case-sensitive by default', () => {
    const hash1 = hashString('UPPERCASE');
    const hash2 = hashString('uppercase');
    expect(hash1).not.toBe(hash2);
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

  test('deduplicates by file:line:body combination', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Add semicolon:value;]]\n[[suggestion:path:src/file.js:line:5:Add semicolon:value;]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      id: 'src/file.js:5:Add semicolon',
      path: 'src/file.js',
      line: 5,
      side: 'RIGHT',
      body: 'Add semicolon',
      suggestion: 'value;',
    });
  });

  test('deduplicates across multiple review chunks', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Use const:const x = 1;]]',
      },
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Use const:const x = 1;]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(1);
  });

  test('deduplicates same content on different lines', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Remove var:const x = 1;]]\n[[suggestion:path:src/file.js:line:10:Remove var:const x = 1;]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].line).toBe(5);
  });

  test('deduplicates with case-insensitive content matching', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Fix:Use CONST;]]\n[[suggestion:path:src/file.js:line:10:Fix:use const;]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(1);
  });

  test('keeps suggestions with different body text on same file/line', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Add semicolon:value;]]\n[[suggestion:path:src/file.js:line:5:Remove spaces:value;]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].body).toBe('Add semicolon');
    expect(suggestions[1].body).toBe('Remove spaces');
  });

  test('deduplicates same content on different lines and files', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/a.js:line:5:Use const:const x = 1;]]\n[[suggestion:path:src/b.js:line:5:Use const:const x = 1;]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].path).toBe('src/a.js');
  });

  test('handles suggestions with colons in suggestion part', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Add comment:// TODO: fix this later]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestion).toBe('// TODO: fix this later');
  });

  test('handles mixed valid and invalid suggestions', () => {
    const reviews = [
      {
        rawReview: [
          '[[suggestion:path:src/valid.js:line:5:Fix:const x = 1;]]',
          '[[suggestion:invalid-format]]',
          '[[suggestion:path:src/valid.js:line:10:Improve:let y = 2;]]',
        ].join('\n'),
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(2);
  });

  test('deduplicates across mix of valid and invalid chunks', () => {
    const reviews = [
      {
        rawReview: '[[suggestion:path:src/file.js:line:5:Fix:use const;]]',
      },
      {
        rawReview: '[[invalid-suggestion]]',
      },
      {
        rawReview: '[[suggestion:path:src/file.js:line:10:Fix:use const;]]',
      },
    ];

    const suggestions = extractActionableSuggestions(reviews);
    expect(suggestions).toHaveLength(1);
  });
});
