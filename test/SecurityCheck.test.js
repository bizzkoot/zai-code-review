const SecurityCheck = require('../src/review/SecurityCheck');

describe('SecurityCheck', () => {
  it('detects hardcoded secrets', () => {
    const files = [
      { filename: 'foo.js', patch: '+const apiKey = "sk-1234567890abcdef"' },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].message).toMatch(/hardcoded secret/i);
  });

  it('detects eval usage', () => {
    const files = [
      { filename: 'bar.js', patch: '+eval("alert(1)")' },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].message).toMatch(/eval/i);
  });

  it('detects weak password', () => {
    const files = [
      { filename: 'baz.js', patch: '+password = "123"' },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].message).toMatch(/password/i);
  });

  it('detects disabled lint/security checks', () => {
    const files = [
      { filename: 'qux.js', patch: '+// eslint-disable-next-line' },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].message).toMatch(/lint|security/i);
  });

  it('detects dangerous function usage', () => {
    const files = [
      { filename: 'danger.js', patch: '+const cp = require("child_process");' },
      { filename: 'danger2.js', patch: '+exec("rm -rf /")' },
      { filename: 'danger3.js', patch: '+new Function("return 1;")' },
    ];
    for (const file of files) {
      const findings = SecurityCheck.checkSecurity([file]);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].message).toMatch(/dangerous/i);
    }
  });

  it('returns empty for safe code', () => {
    const files = [
      { filename: 'safe.js', patch: '+const x = 1;' },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBe(0);
  });

  it('reports correct line numbers using diff hunk headers', () => {
    const files = [
      {
        filename: 'app.js',
        patch: [
          '@@ -10,5 +15,8 @@ function test() {',
          ' context line',
          ' another context',
          '+const apiKey = "sk-1234567890abcdef"',
          ' more context',
        ].join('\n'),
      },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBeGreaterThan(0);
    // Line should be 17 (start at 15, +2 context lines, +1 for the added line)
    expect(findings[0].line).toBe(17);
  });

  it('tracks line numbers correctly across multiple hunks', () => {
    const files = [
      {
        filename: 'multi.js',
        patch: [
          '@@ -1,3 +1,4 @@',
          ' line1',
          '+const safe = true;',
          ' line3',
          '@@ -10,3 +11,4 @@',
          ' context',
          '+eval("bad")',
          ' more',
        ].join('\n'),
      },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBeGreaterThan(0);
    // eval is in second hunk: starts at new line 11, +1 context, +1 added = line 12
    expect(findings[0].line).toBe(12);
  });

  it('handles patches without hunk headers gracefully', () => {
    const files = [
      { filename: 'no-hunk.js', patch: '+eval("test")' },
    ];
    const findings = SecurityCheck.checkSecurity(files);
    expect(findings.length).toBeGreaterThan(0);
    // Falls back to sequential counting
    expect(findings[0].line).toBe(1);
  });
});