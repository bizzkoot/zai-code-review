// Handles inline suggestion logic for code review
class InlineSuggestion {
  static buildComments(suggestions) {
    return (suggestions || [])
      .filter(s => s.suggestion && Number.isInteger(s.line) && s.line > 0)
      .map(s => ({
        path: s.path,
        body: `${s.body}\n\u0060\u0060\u0060suggestion\n${s.suggestion}\n\u0060\u0060\u0060`,
        line: s.line,
        side: s.side || 'RIGHT',
      }));
  }

  static isValidationError(err) {
    return err?.status === 422 || /validation/i.test(err?.message || '');
  }

  /**
   * Posts actionable, line-specific suggestions as a GitHub review
   * @param {object} octokit - Authenticated Octokit instance
   * @param {object} params
   *   owner: repo owner
   *   repo: repo name
   *   pullNumber: PR number
   *   suggestions: Array<{ path, body, line, side, suggestion }>
   */
  static async postSuggestions(octokit, { owner, repo, pullNumber, suggestions }) {
    const comments = InlineSuggestion.buildComments(suggestions);

    if (comments.length === 0) {
      return 0;
    }

    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        event: 'COMMENT',
        comments,
      });

      return comments.length;
    } catch (err) {
      if (comments.length === 1 || !InlineSuggestion.isValidationError(err)) {
        throw err;
      }
    }

    let postedCount = 0;
    for (const comment of comments) {
      try {
        await octokit.rest.pulls.createReview({
          owner,
          repo,
          pull_number: pullNumber,
          event: 'COMMENT',
          comments: [comment],
        });
        postedCount++;
      } catch (err) {
        if (!InlineSuggestion.isValidationError(err)) {
          throw err;
        }
      }
    }

    return postedCount;
  }
}

module.exports = InlineSuggestion;
