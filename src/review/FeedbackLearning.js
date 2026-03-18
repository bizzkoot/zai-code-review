
const fs = require('fs');
const path = require('path');

// FeedbackLearning: Tracks user responses to suggestions and adapts future reviews
// Stores preferences per repo/team in .zai-feedback.json in project root
class FeedbackLearning {
  constructor(repoId) {
    this.repoId = repoId;
    this.dataFile = path.resolve(process.cwd(), '.zai-feedback.json');
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        this.data = {};
      }
    } catch (e) {
      this.data = {};
    }
    if (!this.data[this.repoId]) this.data[this.repoId] = { accepted: {}, rejected: {} };
  }

  _save() {
    fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
  }

  recordFeedback(suggestionId, accepted) {
    if (!suggestionId) return;
    const pref = this.data[this.repoId];
    if (accepted) {
      pref.accepted[suggestionId] = (pref.accepted[suggestionId] || 0) + 1;
      delete pref.rejected[suggestionId];
    } else {
      pref.rejected[suggestionId] = (pref.rejected[suggestionId] || 0) + 1;
      delete pref.accepted[suggestionId];
    }
    this._save();
  }

  getPreference(suggestionId) {
    const pref = this.data[this.repoId];
    if (pref.accepted[suggestionId]) return 'accepted';
    if (pref.rejected[suggestionId]) return 'rejected';
    return null;
  }

  // Optionally: adapt suggestions based on feedback
  adaptSuggestions(suggestions) {
    return suggestions.filter(s => this.getPreference(s.id) !== 'rejected');
  }

  static learnFromFeedback(repoId, suggestionId, accepted) {
    const learner = new FeedbackLearning(repoId);
    learner.recordFeedback(suggestionId, accepted);
  }

  static adapt(repoId, suggestions) {
    const learner = new FeedbackLearning(repoId);
    return learner.adaptSuggestions(suggestions);
  }
}

module.exports = FeedbackLearning;
