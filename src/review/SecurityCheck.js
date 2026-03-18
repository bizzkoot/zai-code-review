// Handles security check logic for code review (stub for future extension)

// Handles security check logic for code review
class SecurityCheck {
  /**
   * Runs static analysis and best-practice checks on diffs
   * @param {Array} files - PR files (with patch, filename, status)
   * @returns {Array} Array of security findings: { path, line, message, severity }
   */
  static checkSecurity(files) {
    const findings = [];
    if (!Array.isArray(files)) return findings;

    for (const file of files) {
      if (!file.patch || !file.filename) continue;
      const lines = file.patch.split('\n');
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        // Only analyze added lines
        if (!line.startsWith('+') || line.startsWith('+++')) continue;
        const code = line.slice(1);

        // Simple static checks (expand as needed)
        // 1. Hardcoded secrets
        if (/(['"]?api[_-]?key['"]?\s*[:=]\s*['"][A-Za-z0-9\-_]{16,}['"]|['"]?secret['"]?\s*[:=]\s*['"][A-Za-z0-9\-_]{8,}['"])/i.test(code)) {
          findings.push({
            path: file.filename,
            line: lineNum,
            message: 'Possible hardcoded secret or API key.',
            severity: 'high',
          });
        }
        // 2. Insecure eval usage
        if (/\beval\s*\(/.test(code)) {
          findings.push({
            path: file.filename,
            line: lineNum,
            message: 'Use of eval() detected. This is unsafe and should be avoided.',
            severity: 'high',
          });
        }
        // 3. Insecure regex for password
        if (/password\s*[:=]\s*['"][^'"]{0,7}['"]/.test(code)) {
          findings.push({
            path: file.filename,
            line: lineNum,
            message: 'Possible weak or hardcoded password.',
            severity: 'high',
          });
        }
        // 4. Disabled lint/security checks
        if (/eslint-disable|tslint:disable|security-disable/i.test(code)) {
          findings.push({
            path: file.filename,
            line: lineNum,
            message: 'Lint or security checks disabled in code.',
            severity: 'medium',
          });
        }
        // 5. Dangerous function usage (exec, Function)
        if (/\b(require\(['"]child_process['"]\)|exec\s*\(|new Function\s*\()/i.test(code)) {
          findings.push({
            path: file.filename,
            line: lineNum,
            message: 'Dangerous function usage (exec, Function constructor, child_process).',
            severity: 'high',
          });
        }
        // 6. TODO: Add more rules as needed
      }
    }
    return findings;
  }
}

module.exports = SecurityCheck;
