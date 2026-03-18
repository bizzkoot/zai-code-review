// Handles conversational feedback logic for code review
class ConversationalFeedback {
  /**
   * Builds a context-aware, developer-friendly review prompt for Z.ai
   * @param {Array} files - PR files (with patch, filename, status)
   * @param {number} chunkIndex - Index of this chunk
   * @param {number} totalChunks - Total number of chunks
   * @returns {string} Prompt for Z.ai
   */
  static buildPrompt(files, chunkIndex, totalChunks) {
    const diffs = files
      .filter(f => f.patch)
      .map(f => `### ${f.filename} (${f.status})\n\u0060\u0060\u0060diff\n${f.patch}\n\u0060\u0060\u0060`)
      .join('\n\n');

    let prompt = [
      'You are a friendly, expert code reviewer. Review the following pull request changes and provide clear, actionable, and developer-friendly feedback.',
      'Focus on bugs, logic errors, security issues, and meaningful improvements. Skip trivial style comments.',
      'Write in a conversational, encouraging tone. Use bullet points for clarity. Suggest concrete next steps where possible.',
      'Only emit a suggestion marker when you have a high-confidence, line-specific replacement for code shown in the diff.',
      'Use this exact format for each actionable inline fix: [[suggestion:path:<file path>:line:<new file line>:<short summary>:<replacement code>]].',
      'Do not emit suggestion markers for uncertain advice, general feedback, or code that is not visible in the diff.',
      '',
    ].join(' ');

    if (totalChunks > 1) {
      prompt += `\n[This is part ${chunkIndex + 1} of ${totalChunks} in a large code review. Focus only on this section.]\n`;
    }

    prompt += '\n' + diffs;
    return prompt;
  }

  /**
   * Post-processes Z.ai feedback for clarity and developer-friendliness
   * @param {string} feedback - Raw Z.ai response
   * @returns {string} Cleaned, actionable feedback
   */
  static postProcess(feedback) {
    if (!feedback) return '';
    // Remove excessive apologies, generic phrases, and ensure bullet points
    let result = feedback
      .replace(/(?:(?:I\s+)?(?:have|has) reviewed(?: the)? changes?\.?|Here(?: are| is) (?:my|the)? feedback:?|Below (?:are|is) (?:my|the)? (?:feedback|comments):?)/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^-\s*/gm, '• ')
      .trim();
    // Ensure at least one actionable suggestion
    if (!/• /.test(result)) {
      result = '• ' + result;
    }
    return result;
  }
}

module.exports = ConversationalFeedback;
