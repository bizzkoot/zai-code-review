const InlineSuggestion = require('../src/review/InlineSuggestion');

// Mocks for octokit and context
const mockOctokit = {
  rest: {
    pulls: {
      createReview: jest.fn(),
    },
  },
};

describe('InlineSuggestion', () => {
  beforeEach(() => {
    mockOctokit.rest.pulls.createReview.mockClear();
  });

  describe('postSuggestions', () => {
    it('posts actionable, line-specific suggestions', async () => {
      const suggestions = [
        {
          path: 'foo.js',
          body: 'Replace with const',
          line: 10,
          start_line: 10,
          end_line: 10,
          side: 'RIGHT',
          suggestion: 'const x = 1;',
        },
      ];
      await InlineSuggestion.postSuggestions(mockOctokit, {
        owner: 'test',
        repo: 'repo',
        pullNumber: 1,
        suggestions,
      });
      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        event: 'COMMENT',
        comments: [
          {
            path: 'foo.js',
            body: 'Replace with const\n```suggestion\nconst x = 1;\n```',
            line: 10,
            side: 'RIGHT',
          },
        ],
      });
    });

    it('skips suggestions without suggestion text', async () => {
      const suggestions = [
        {
          path: 'foo.js',
          body: 'No suggestion',
          line: 5,
          side: 'RIGHT',
        },
      ];
      await expect(InlineSuggestion.postSuggestions(mockOctokit, {
        owner: 'test',
        repo: 'repo',
        pullNumber: 1,
        suggestions,
      })).resolves.toBe(0);
      expect(mockOctokit.rest.pulls.createReview).not.toHaveBeenCalled();
    });

    it('skips suggestions with invalid line numbers', async () => {
      const suggestions = [
        {
          path: 'foo.js',
          body: 'Bad line',
          line: 0,
          side: 'RIGHT',
          suggestion: 'const x = 1;',
        },
      ];

      await expect(InlineSuggestion.postSuggestions(mockOctokit, {
        owner: 'test',
        repo: 'repo',
        pullNumber: 1,
        suggestions,
      })).resolves.toBe(0);
      expect(mockOctokit.rest.pulls.createReview).not.toHaveBeenCalled();
    });

    it('falls back to posting suggestions individually when batch creation fails', async () => {
      const suggestions = [
        {
          path: 'foo.js',
          body: 'Use const',
          line: 10,
          side: 'RIGHT',
          suggestion: 'const x = 1;',
        },
        {
          path: 'bar.js',
          body: 'Use let',
          line: 4,
          side: 'RIGHT',
          suggestion: 'let y = 2;',
        },
      ];

      mockOctokit.rest.pulls.createReview
        .mockRejectedValueOnce(new Error('Validation failed'))
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Validation failed'));

      await expect(InlineSuggestion.postSuggestions(mockOctokit, {
        owner: 'test',
        repo: 'repo',
        pullNumber: 1,
        suggestions,
      })).resolves.toBe(1);

      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledTimes(3);
      expect(mockOctokit.rest.pulls.createReview).toHaveBeenNthCalledWith(2, {
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        event: 'COMMENT',
        comments: [
          {
            path: 'foo.js',
            body: 'Use const\n```suggestion\nconst x = 1;\n```',
            line: 10,
            side: 'RIGHT',
          },
        ],
      });
      expect(mockOctokit.rest.pulls.createReview).toHaveBeenNthCalledWith(3, {
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        event: 'COMMENT',
        comments: [
          {
            path: 'bar.js',
            body: 'Use let\n```suggestion\nlet y = 2;\n```',
            line: 4,
            side: 'RIGHT',
          },
        ],
      });
    });
  });
});
