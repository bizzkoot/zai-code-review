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

    it('includes format instructions for findings', () => {
      const files = [
        { filename: 'foo.js', patch: 'diff', status: 'modified' }
      ];
      const prompt = ConversationalFeedback.buildPrompt(files, 0, 1);
      expect(prompt).toContain('Format each finding as follows:');
      expect(prompt).toContain('[SEVERITY] File:Line - Brief Title');
      expect(prompt).toContain('**Problem:**');
      expect(prompt).toContain('**Impact:**');
      expect(prompt).toContain('Group findings by severity');
    });
  });

  describe('postProcess', () => {
    it('removes excessive apologies and generic phrases', () => {
      const feedback = 'I have reviewed the changes. Here are my feedback comments: This looks good.';
      const result = ConversationalFeedback.postProcess(feedback);
      expect(result).not.toContain('Here are my feedback');
      expect(result).toContain('This looks good.');
    });

    it('converts dashes to bullet points', () => {
      const feedback = '- First issue\n- Second issue';
      const result = ConversationalFeedback.postProcess(feedback);
      expect(result).toContain('• First issue');
      expect(result).toContain('• Second issue');
    });

    it('returns empty string for empty input', () => {
      expect(ConversationalFeedback.postProcess('')).toBe('');
      expect(ConversationalFeedback.postProcess(null)).toBe('');
    });
  });

  describe('parseFindings', () => {
    it('parses findings with severity headers', () => {
      const rawReview = `## [CRITICAL] Use const instead of let
**Problem:** Using let when const is appropriate
**Impact:** Reduces code clarity

## [MAJOR] Remove unused variable
**Problem:** Variable is declared but never used
**Impact:** Increases code complexity`;
      const findings = ConversationalFeedback.parseFindings(rawReview);
      expect(findings).toHaveLength(2);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].title).toBe('Use const instead of let');
      expect(findings[1].severity).toBe('major');
    });

    it('marks findings as outside diff when specified', () => {
      const rawReview = `## [CRITICAL] (outside diff) Security issue
**Problem:** Potential SQL injection`;
      const findings = ConversationalFeedback.parseFindings(rawReview);
      expect(findings).toHaveLength(1);
      expect(findings[0].isOutsideDiff).toBe(true);
      expect(findings[0].title).not.toContain('outside diff');
    });

    it('returns empty array for null or empty input', () => {
      expect(ConversationalFeedback.parseFindings(null)).toEqual([]);
      expect(ConversationalFeedback.parseFindings('')).toEqual([]);
      expect(ConversationalFeedback.parseFindings(undefined)).toEqual([]);
    });
  });

  describe('groupBySeverity', () => {
    it('groups findings by severity level', () => {
      const findings = [
        { severity: 'critical', title: 'Critical issue' },
        { severity: 'major', title: 'Major issue' },
        { severity: 'minor', title: 'Minor issue' },
        { severity: 'info', title: 'Info' },
        { severity: 'critical', title: 'Another critical' }
      ];
      const grouped = ConversationalFeedback.groupBySeverity(findings);
      expect(grouped.critical).toHaveLength(2);
      expect(grouped.major).toHaveLength(1);
      expect(grouped.minor).toHaveLength(1);
      expect(grouped.info).toHaveLength(1);
    });

    it('treats blocker as critical', () => {
      const findings = [
        { severity: 'blocker', title: 'Blocker issue' }
      ];
      const grouped = ConversationalFeedback.groupBySeverity(findings);
      expect(grouped.critical).toHaveLength(1);
    });
  });

  describe('formatFinding', () => {
    it('formats finding with all details', () => {
      const finding = {
        title: 'Use const instead of let',
        problem: 'Using let when const is appropriate',
        impact: 'Reduces code clarity',
        fix: '```diff\n- let x = 1\n+ const x = 1\n```',
        prompt: 'Verify const usage',
        isOutsideDiff: false
      };
      const formatted = ConversationalFeedback.formatFinding(finding);
      expect(formatted).toContain('**Use const instead of let**');
      expect(formatted).toContain('**Problem:** Using let');
      expect(formatted).toContain('**Impact:** Reduces code');
      expect(formatted).toContain('**Suggested fix:**');
      expect(formatted).toContain('**Prompt for AI Agents:**');
    });

    it('marks findings as outside diff', () => {
      const finding = {
        title: 'Security issue',
        problem: 'Potential vulnerability',
        impact: 'Data breach risk',
        fix: '',
        prompt: '',
        isOutsideDiff: true
      };
      const formatted = ConversationalFeedback.formatFinding(finding);
      expect(formatted).toContain('**(outside diff) Security issue**');
    });

    it('omits empty sections', () => {
      const finding = {
        title: 'Simple issue',
        problem: '',
        impact: '',
        fix: '',
        prompt: '',
        isOutsideDiff: false
      };
      const formatted = ConversationalFeedback.formatFinding(finding);
      expect(formatted).toBe('**Simple issue**');
    });
  });

  describe('formatReview', () => {
    it('returns header with actionable count', () => {
      const review = '';
      const formatted = ConversationalFeedback.formatReview(review, { actionableCount: 5 });
      expect(formatted).toContain('**Actionable comments posted: 5**');
    });

    it('includes NOTE box when actionableCount > 0', () => {
      const review = '';
      const formatted = ConversationalFeedback.formatReview(review, { actionableCount: 3 });
      expect(formatted).toContain('> [!NOTE]');
      expect(formatted).toContain('Critical severity comments were prioritized');
    });

    it('includes CAUTION box when hasCriticalOutsideDiff is true', () => {
      const review = '';
      const formatted = ConversationalFeedback.formatReview(review, { hasCriticalOutsideDiff: true });
      expect(formatted).toContain('> [!CAUTION]');
      expect(formatted).toContain('Some comments are outside the diff');
    });

    it('creates collapsible sections for each severity', () => {
      const rawReview = `## [CRITICAL] Critical issue
**Problem:** This is critical

## [MAJOR] Major issue
**Problem:** This is major

## [MINOR] Minor issue
**Problem:** This is minor`;
      const formatted = ConversationalFeedback.formatReview(rawReview, { actionableCount: 3 });
      expect(formatted).toContain('🔴 Critical/BLOCKER findings (1)');
      expect(formatted).toContain('🟠 Major comments (1)');
      expect(formatted).toContain('🟡 Minor comments (1)');
      expect(formatted).toContain('<details>');
      expect(formatted).toContain('</details>');
    });

    it('uses blockquote for sections', () => {
      const rawReview = `## [CRITICAL] Critical issue
**Problem:** This is critical`;
      const formatted = ConversationalFeedback.formatReview(rawReview);
      expect(formatted).toContain('<blockquote>');
      expect(formatted).toContain('</blockquote>');
    });

    it('omits sections with no findings', () => {
      const rawReview = `## [CRITICAL] Critical issue
**Problem:** This is critical`;
      const formatted = ConversationalFeedback.formatReview(rawReview);
      expect(formatted).toContain('🔴 Critical/BLOCKER');
      expect(formatted).not.toContain('🟠 Major');
      expect(formatted).not.toContain('🟡 Minor');
    });

    it('handles empty review gracefully', () => {
      const formatted = ConversationalFeedback.formatReview('', { actionableCount: 0 });
      expect(formatted).toContain('**Actionable comments posted: 0**');
    });

    it('combines all options correctly', () => {
      const rawReview = `## [CRITICAL] Critical issue
**Problem:** This is critical

## [CRITICAL] (outside diff) Outside issue
**Problem:** This is outside`;
      const formatted = ConversationalFeedback.formatReview(rawReview, {
        actionableCount: 5,
        hasCriticalOutsideDiff: true
      });
      expect(formatted).toContain('**Actionable comments posted: 5**');
      expect(formatted).toContain('> [!NOTE]');
      expect(formatted).toContain('> [!CAUTION]');
      expect(formatted).toContain('🔴 Critical/BLOCKER findings (2)');
    });
  });
});
