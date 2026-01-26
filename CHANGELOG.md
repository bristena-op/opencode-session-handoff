# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- `goal` parameter for session handoffs - when user says "handoff do X", the goal "do X" is now extracted and passed to the new session
- New `**Goal:**` section in handoff prompt to display the user's intended next task

## [1.0.6] - 2025-01-25

### Changed

- Format markdown files

## [1.0.5] - 2025-01-24

### Added

- Amp inspiration credit in docs

## [1.0.4] - 2025-01-24

### Added

- CI auto-tag on merge to main based on package.json version
- Comparison table vs built-in handoff in README
- Auto-update check on session start
- CONTRIBUTING.md

### Changed

- Simplified PR guide in docs
- Updated README with auto-update and current API
- Require agent-provided summary for compact handoffs

## [1.0.3] - 2025-01-23

### Fixed

- Prevent OpenCode startup hang by removing named export

## [1.0.2] - 2025-01-23

### Changed

- Reduce function complexity to satisfy oxlint rules

### Fixed

- Extract version from git tag in release workflow
- Remove unused error parameters in catch blocks
- Use args instead of parameters for plugin API compatibility

## [1.0.1] - 2025-01-22

### Fixed

- Remove any types, add proper interfaces, document catch blocks
- Update lockfile with zod dependency
- Mark zod as external dependency to fix CI build

## [1.0.0] - 2025-01-22

### Added

- Initial release
- `session_handoff` tool for creating continuation sessions
- `read_session` tool for fetching previous session context
- Auto-fetches todo state from current session
- Preserves model config and agent mode across sessions
- Minimal handoff prompts (~100-200 tokens)
