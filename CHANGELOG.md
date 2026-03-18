# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-03-18

### Added
- Automatic diff chunking for large PRs that exceed API token limits
  - `MAX_CHUNK_SIZE` constant (50K characters per chunk)
  - `splitIntoChunks()` function to divide files by diff size
  - `buildChunkPrompt()` for chunk-aware prompts with progress tracking
  - Partial chunk error handling with graceful degradation
- `AGENTS.md` for AI coding assistants and project contributors
- Comprehensive error logging for multi-chunk processing

### Changed
- Version reset from 0.3.0 to 0.0.1 (fork initialization from tarmojussila/zai-code-review)
- Repository rebranded to bizzkoot/zai-code-review
- Enhanced error messages with standardized "Z.ai API:" prefix
- Improved defensive programming with empty chunk validation

### Fixed
- **CRITICAL**: API error 1261 (prompt exceeds max length) by implementing automatic chunking
- Edge case where PRs with no patchable files would fail silently
- Total data loss in multi-chunk reviews when individual chunks failed
  - Now provides partial results with error messages for failed chunks

### Security
- Maintained secure secret handling with `core.setSecret()`
- Response size limits enforced (1MB cap)
- Request timeout protection (300 seconds)

[0.0.1]: https://github.com/bizzkoot/zai-code-review/releases/tag/v0.0.1
