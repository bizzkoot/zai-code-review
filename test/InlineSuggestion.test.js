const InlineSuggestion = require('../src/review/InlineSuggestion');

// Mocks for octokit and context
const mockOctokit = {
  rest: {
    pulls: {
      createReview: jest.fn(),
      createReplyForReviewComment: jest.fn(),
    },
  },
};

describe('InlineSuggestion', () => {
  beforeEach(() => {
    mockOctokit.rest.pulls.createReview.mockClear();
    mockOctokit.rest.pulls.createReplyForReviewComment.mockClear();
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

    it('replies to a matching existing thread only once per batch', async () => {
      const suggestions = [
        {
          path: 'foo.js',
          body: 'Use const instead of var',
          line: 10,
          side: 'RIGHT',
          suggestion: 'const value = 1;',
        },
        {
          path: 'foo.js',
          body: 'Use const instead of var declaration',
          line: 10,
          side: 'RIGHT',
          suggestion: 'const count = 2;',
        },
      ];

      const existingThreads = new Map([
        ['foo.js:10', [{ id: 99, body: 'Use const instead of var' }]],
      ]);

      mockOctokit.rest.pulls.createReplyForReviewComment.mockResolvedValue({});
      mockOctokit.rest.pulls.createReview.mockResolvedValue({});

      const posted = await InlineSuggestion.postSuggestions(mockOctokit, {
        owner: 'test',
        repo: 'repo',
        pullNumber: 1,
        suggestions,
        existingThreads,
        headSha: 'abc123',
      });

      expect(posted).toBe(2);
      expect(mockOctokit.rest.pulls.createReplyForReviewComment).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.pulls.createReplyForReviewComment).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        comment_id: 99,
        body: 'Additional context: Use const instead of var\n```suggestion\nconst value = 1;\n```',
      });
      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledTimes(1);
      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        event: 'COMMENT',
        comments: [
          {
            path: 'foo.js',
            body: 'Use const instead of var declaration\n```suggestion\nconst count = 2;\n```',
            line: 10,
            side: 'RIGHT',
          },
        ],
      });
    });
  });
});
