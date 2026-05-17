# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [1.2.0] - 2026-05-17

### Added

- Added `.gitignore` to exclude generated artifacts (`node_modules/`, `dist/`)

### Changed

- Added adaptive middle-ellipsis truncation for long branch names in table headers and feature branch rows
- Updated table rendering to fit within terminal width when available
- Refactored table output generation into dedicated helper methods for readability and maintainability

### Fixed

- Improved behavior in non-TTY contexts where terminal width is unavailable

## [1.1.0] - 2026-03-08

### Changed

- Updated NPM dependencies (`@types/node`, `prettier`, `commander`, `simple-git`, `minimatch`)

## [1.0.1] - 2025-03-29

### Changed

- Updated NPM dependencies

## [1.0.0] - 2025-03-29

### Added

- First official release

### Changed

- Refactoring
- Improved documentation

## [0.0.1 - 0.1.2] - 2025-03-27

### Added

- Initial versions, bugfixes, added documentation