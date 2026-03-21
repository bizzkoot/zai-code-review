# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2026-03-21

### Fixed
- Multi-chunk review summaries now preserve severity grouping across all chunks
  - Combined summary parsing now uses raw chunk output instead of post-processed text
  - Severity parsing now tolerates bullet-prefixed headings from chunk formatting
- Inline suggestion threading now replies to an existing thread at most once per run
  - Additional findings at the same file and line are posted as separate review comments
  - Prevents unrelated inline suggestions from nesting under the first matching thread

## [0.0.4] - 2026-03-20

### Added
- Enhanced review formatting with Coderabbit-style collapsible severity sections
  - `formatReview()` groups findings by severity (Critical, Major, Minor, Info)
  - Collapsible `<details>` sections for cleaner PR comments
  - Actionable comment count in review header
- Outside-diff comment separation and grouping
  - `separateOutsideDiffComments()` identifies comments outside diff range
  - Grouped by file in collapsible section
- Smart deduplication (cross-chunk)
  - `hashString()` for content-based deduplication
  - Prevents duplicate suggestions across PR review chunks
  - File:line:body deduplication logic
- Comment threading support
  - `getExistingCommentThreads()` fetches existing review threads
  - `findSimilarThread()` with configurable similarity threshold (0.6)
  - `calculateSimilarity()` for thread matching
- Custom security patterns system
  - `loadCustomPatterns()` reads `.zai-review.yaml` config file
  - Simple YAML parser for `security_patterns` section
  - `categorizeSeverity()` maps patterns to severity levels
  - Custom patterns merged with built-in checks
  - Example config file: `.zai-review.yaml.example`
- Configurable thread similarity threshold
  - New input: `ZAI_THREAD_SIMILARITY_THRESHOLD` (default: 0.6)
  - Allows tuning of thread matching sensitivity
- Outside-diff separation
  - `separateOutsideDiffComments()` identifies outside-diff markers
  - `formatOutsideDiffSection()` creates grouped collapsible sections
  - Groups comments by file for organization
  - Preserves full comment content
- Resolved comment filtering
  - `filterResolvedSuggestions()` prevents reposting resolved issues
  - Checks `comment.state === 'RESOLVED'`
  - Builds file:line key set of resolved IDs
  - Graceful fallback if API call fails
- Improved system prompt with format instructions
  - Instructs AI to use severity markers
  - Requests (outside diff) marking for appropriate comments
  - Clear structured output guidance
- Comprehensive integration test suite
  - Tests for custom patterns loading and YAML parsing
  - Threading integration tests with similarity matching
  - Suggestion deduplication across chunks
  - Resolved comment filtering
  - Security check integration with custom patterns

### Fixed
- **Wired up dead code**: `formatReview()` and `separateOutsideDiffComments()` are now called in the main flow
- Resolved comment filtering now properly integrated before posting suggestions
- CHANGELOG v0.0.1 section: removed duplicate entries

### Changed
- Security patterns refactored into configurable system
  - Built-in patterns extracted to `getBuiltInPatterns()` method
  - `checkSecurity()` now accepts optional custom patterns array
  - Invalid regex patterns in custom config are silently skipped

## [0.0.3] - 2026-03-19

### Added
- review helper modules for conversational feedback, static security checks, inline suggestions, and feedback filtering
- unit coverage for the new helper modules and inline suggestion extraction

### Fixed
- inline suggestions are now best-effort so invalid GitHub review anchors no longer fail the entire action run
- release automation now requests `contents: write` before creating releases and pushing changelog updates
- package, lockfile, changelog, and usage examples are aligned for the `v0.0.3` release

## [0.0.2] - 2026-03-19

### Changed
- fix: remove dist/ from gitignore and add to git for GitHub Actions releases
- docs: simplify README with unified workflow example

## [0.0.1] - 2026-03-18

### Added
- Automatic diff chunking for large PRs that exceed API token limits
  - `MAX_CHUNK_SIZE` constant (50K characters per chunk)
  - `splitIntoChunks()` function to divide files by diff size
  - `buildChunkPrompt()` for chunk-aware prompts with progress tracking
  - Partial chunk error handling with graceful degradation
- Retry logic with exponential backoff (`callZaiApiWithRetry()`)
  - Configurable via `RETRY_CONFIG` constant (3 retries, 1-8s delays)
- Comprehensive test suite with Jest (8 tests covering core functionality)
- ESLint configuration for code style enforcement
- CI workflow (`.github/workflows/ci.yml`) for automated lint, test, and build
- `AGENTS.md` for AI coding assistants and project contributors
- Comprehensive error logging for multi-chunk processing

### Changed
- **CRITICAL**: Error messages no longer expose API response data (security hardening)
- Standardized all error messages with `ERR_PREFIX` constant
- Extracted magic numbers as named constants (`PER_PAGE`, `MAX_CHUNK_SIZE`)
- Pinned `@vercel/ncc` to exact version `0.38.1`
- Removed hardcoded model validation - users can use any Z.ai model via `ZAI_MODEL` input
- Version reset from 0.3.0 to 0.0.1 (fork initialization from tarmojussila/zai-code-review)
- Repository rebranded to bizzkoot/zai-code-review
- Enhanced error messages with standardized prefix
- Improved defensive programming with empty chunk validation

### Fixed
- **CRITICAL**: API error 1261 (prompt exceeds max length) by implementing automatic chunking
- Edge case where PRs with no patchable files would fail silently
- Total data loss in multi-chunk reviews when individual chunks failed
  - Now provides partial results with error messages for failed chunks

### Security
- **CRITICAL**: Error messages no longer expose API response data (prevents information disclosure)
- Retry logic for transient failure handling
- Maintained secure secret handling with `core.setSecret()`
- Response size limits enforced (1MB cap)
- Request timeout protection (300 seconds)

[0.0.1]: https://github.com/bizzkoot/zai-code-review/releases/tag/v0.0.1

[0.0.2]: https://github.com/bizzkoot/zai-code-review/releases/tag/v0.0.2

[0.0.3]: https://github.com/bizzkoot/zai-code-review/releases/tag/v0.0.3
