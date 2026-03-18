const FeedbackLearning = require('../src/review/FeedbackLearning');
const fs = require('fs');
const path = require('path');

describe('FeedbackLearning', () => {
  const repoId = 'test/repo';
  const dataFile = path.resolve(process.cwd(), '.zai-feedback.json');

  beforeEach(() => {
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  });

  afterAll(() => {
    if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  });

  it('records accepted feedback', () => {
    FeedbackLearning.learnFromFeedback(repoId, 'foo.js:10:Replace', true);
    const learner = new FeedbackLearning(repoId);
    expect(learner.getPreference('foo.js:10:Replace')).toBe('accepted');
  });

  it('records rejected feedback', () => {
    FeedbackLearning.learnFromFeedback(repoId, 'foo.js:10:Replace', false);
    const learner = new FeedbackLearning(repoId);
    expect(learner.getPreference('foo.js:10:Replace')).toBe('rejected');
  });

  it('adapts suggestions by filtering rejected', () => {
    FeedbackLearning.learnFromFeedback(repoId, 'foo.js:10:Replace', false);
    const suggestions = [
      { id: 'foo.js:10:Replace', path: 'foo.js', line: 10, body: 'Replace', suggestion: 'const x = 1;' },
      { id: 'bar.js:5:Fix', path: 'bar.js', line: 5, body: 'Fix', suggestion: 'let y = 2;' },
    ];
    const adapted = FeedbackLearning.adapt(repoId, suggestions);
    expect(adapted.length).toBe(1);
    expect(adapted[0].id).toBe('bar.js:5:Fix');
  });
});
