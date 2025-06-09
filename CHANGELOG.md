# Change Log

All notable changes to the "cursor-pulse" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.3.0] - 2025-06-09

### 🛠️ Fixed SQLite Issues
- Replace native SQLite3 with sql.js - no more installation failures
- Extension now works on all platforms without additional setup

### ⚡ Better Caching
- Use VSCode's storage instead of writing files
- Faster loading and fewer API calls

### 🔄 Breaking Changes
- Old cache will be cleared automatically
- Some internal APIs changed

## 0.2.4 - 2025-06-09

- Initial release
