const fs = require('fs');
const path = require('path');

// Handles security check logic for code review
class SecurityCheck {
  /**
   * Loads custom security patterns from .zai-review.yaml configuration file
   * @param {string} workspaceRoot - Root directory to search for config file
   * @returns {Array} Array of custom pattern objects: { pattern, message, severity }
   */
  static loadCustomPatterns(workspaceRoot) {
    const configPath = path.join(workspaceRoot, '.zai-review.yaml');
    
    if (!fs.existsSync(configPath)) {
      return [];
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const patterns = SecurityCheck.parseYamlSecurityPatterns(configContent);
      return patterns || [];
    } catch (err) {
      // Fail silently if config file cannot be read or parsed
      // This ensures the action continues with built-in patterns only
      return [];
    }
  }

  /**
   * Simple YAML parser for security_patterns section
   * @param {string} yamlContent - Raw YAML content
   * @returns {Array|null} Parsed patterns array or null if not found
   * @private
   */
  static parseYamlSecurityPatterns(yamlContent) {
    if (!yamlContent || typeof yamlContent !== 'string') {
      return null;
    }

    const lines = yamlContent.split('\n');
    const patterns = [];
    let inSecurityPatterns = false;
    let currentItem = null;

    for (const line of lines) {
      // Check for security_patterns section
      if (/^security_patterns:\s*$/.test(line.trim())) {
        inSecurityPatterns = true;
        continue;
      }

      if (!inSecurityPatterns) continue;

      // Check for end of section (new top-level key)
      if (/^[a-z_]+:\s*$/.test(line.trim()) && !line.startsWith(' ')) {
        if (currentItem) {
          patterns.push(currentItem);
          currentItem = null;
        }
        inSecurityPatterns = false;
        continue;
      }

      // Parse list item start (- pattern: ...)
      const patternMatch = line.match(/^\s*-\s*pattern:\s*(.+?)\s*$/);
      if (patternMatch) {
        if (currentItem) {
          patterns.push(currentItem);
        }
        currentItem = {
          pattern: patternMatch[1].replace(/^['"]|['"]$/g, ''),
          message: '',
          severity: 'medium',
        };
        continue;
      }

      // Parse message field
      const messageMatch = line.match(/^\s*message:\s*(.+?)\s*$/);
      if (messageMatch && currentItem) {
        currentItem.message = messageMatch[1].replace(/^['"]|['"]$/g, '');
        continue;
      }

      // Parse severity field
      const severityMatch = line.match(/^\s*severity:\s*(.+?)\s*$/);
      if (severityMatch && currentItem) {
        currentItem.severity = SecurityCheck.categorizeSeverity(severityMatch[1]);
        continue;
      }
    }

    // Don't forget the last item
    if (currentItem) {
      patterns.push(currentItem);
    }

    return patterns.length > 0 ? patterns : null;
  }

  /**
   * Maps severity labels to standard severity levels
   * @param {string} severity - Raw severity string from config
   * @returns {string} Normalized severity: 'high', 'medium', or 'low'
   * @private
   */
  static categorizeSeverity(severity) {
    if (!severity) return 'medium';
    
    const normalized = severity.toLowerCase().trim();
    
    // Map various severity labels to standard levels
    if (['critical', 'blocker', 'high', 'error'].includes(normalized)) {
      return 'high';
    }
    if (['major', 'medium', 'warning', 'warn'].includes(normalized)) {
      return 'medium';
    }
    if (['minor', 'low', 'info', 'information'].includes(normalized)) {
      return 'low';
    }
    
    return 'medium';
  }

  /**
   * Runs static analysis and best-practice checks on diffs
   * @param {Array} files - PR files (with patch, filename, status)
   * @param {Array} customPatterns - Optional array of custom pattern objects
   * @returns {Array} Array of security findings: { path, line, message, severity }
   */
  static checkSecurity(files, customPatterns = []) {
    const findings = [];
    if (!Array.isArray(files)) return findings;

    // Combine built-in and custom patterns
    const allPatterns = [...SecurityCheck.getBuiltInPatterns(), ...customPatterns];

    for (const file of files) {
      if (!file.patch || !file.filename) continue;
      const lines = file.patch.split('\n');
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        // Only analyze added lines
        if (!line.startsWith('+') || line.startsWith('+++')) continue;
        const code = line.slice(1);

        // Check against all patterns
        for (const patternConfig of allPatterns) {
          try {
            const regex = new RegExp(patternConfig.pattern, 'i');
            if (regex.test(code)) {
              findings.push({
                path: file.filename,
                line: lineNum,
                message: patternConfig.message,
                severity: patternConfig.severity,
              });
              // Only report first matching pattern per line
              break;
            }
          } catch (regexErr) {
            // Skip invalid regex patterns silently
          }
        }
      }
    }
    return findings;
  }

  /**
   * Returns built-in security patterns
   * @returns {Array} Array of built-in pattern objects
   * @private
   */
  static getBuiltInPatterns() {
    return [
      {
        pattern: '([\'"]?api[_-]?key[\'"]?\\s*[:=]\\s*[\'"][A-Za-z0-9\\-_]{16,}[\'"]|[\'"]?secret[\'"]?\\s*[:=]\\s*[\'"][A-Za-z0-9\\-_]{8,}[\'"])',
        message: 'Possible hardcoded secret or API key.',
        severity: 'high',
      },
      {
        pattern: '\\beval\\s*\\(',
        message: 'Use of eval() detected. This is unsafe and should be avoided.',
        severity: 'high',
      },
      {
        pattern: 'password\\s*[:=]\\s*[\'"][^\'"]{0,7}[\'"]',
        message: 'Possible weak or hardcoded password.',
        severity: 'high',
      },
      {
        pattern: 'eslint-disable|tslint:disable|security-disable',
        message: 'Lint or security checks disabled in code.',
        severity: 'medium',
      },
      {
        pattern: '\\b(require\\([\'"]child_process[\'"]\\)|exec\\s*\\(|new Function\\s*\\()',
        message: 'Dangerous function usage (exec, Function constructor, child_process).',
        severity: 'high',
      },
    ];
  }
}

module.exports = SecurityCheck;
module.exports.loadCustomPatterns = SecurityCheck.loadCustomPatterns;
module.exports.parseYamlSecurityPatterns = SecurityCheck.parseYamlSecurityPatterns;
module.exports.categorizeSeverity = SecurityCheck.categorizeSeverity;
