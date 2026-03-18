# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - `MAX_CHUNK_SIZE` constant (50K characters per chunk)
  - `splitIntoChunks()` function to divide files by diff size
  - `buildChunkPrompt()` for chunk-aware prompts with progress tracking
  - Partial chunk error handling with graceful degradation
- `AGENTS.md` for AI coding assistants and project contributors
- Comprehensive error logging for multi-chunk processing
- Retry logic with exponential backoff for transient failure handling
- Comprehensive test suite with Jest (8 tests covering core functionality)
- ESLint configuration for code style enforcement
- CI workflow (`.github/workflows/ci.yml`) for automated lint, test, and build
- `AGENTS.md` for AI coding assistants and project contributors

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
