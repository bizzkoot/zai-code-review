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
});