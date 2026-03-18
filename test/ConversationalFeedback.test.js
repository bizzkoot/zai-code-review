const ConversationalFeedback = require('../src/review/ConversationalFeedback');

describe('ConversationalFeedback', () => {
  describe('buildPrompt', () => {
    it('generates a prompt for a single file', () => {
      const files = [
        { filename: 'foo.js', patch: 'diff --git...', status: 'modified' }
      ];
      const prompt = ConversationalFeedback.buildPrompt(files, 0, 1);
      expect(prompt).toContain('### foo.js (modified)');
      expect(prompt).toContain('diff --git...');
      expect(prompt).toContain('developer-friendly feedback');
    });

    it('skips files without patches', () => {
      const files = [
        { filename: 'foo.js', status: 'modified' },
        { filename: 'bar.js', patch: 'diff', status: 'modified' }
      ];
      const prompt = ConversationalFeedback.buildPrompt(files, 0, 1);
      expect(prompt).toContain('bar.js');
      expect(prompt).not.toContain('foo.js');
    });

    it('includes chunk indicator for multi-chunk', () => {
      const files = [
        { filename: 'foo.js', patch: 'diff', status: 'modified' }
      ];
      const prompt = ConversationalFeedback.buildPrompt(files, 1, 3);
      expect(prompt).toContain('part 2 of 3');
    });

    it('asks for structured inline suggestion markers for actionable fixes', () => {
      const files = [
        { filename: 'foo.js', patch: '+let value = 1;', status: 'modified' }
      ];

      const prompt = ConversationalFeedback.buildPrompt(files, 0, 1);

      expect(prompt).toContain('[[suggestion:path:');
      expect(prompt).toContain('Only emit a suggestion marker');
    });
  });
});
