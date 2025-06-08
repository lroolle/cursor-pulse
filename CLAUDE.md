# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Development Commands

```bash
# Core Build Commands
npm run compile      # Check types, lint, and build
npm run watch       # Watch mode for development
npm run package     # Production build with checks

# Testing and Quality
npm test           # Run tests
npm run lint       # ESLint checks
npm run check-types # TypeScript type checking
```

## Architecture Overview

### Core Components

- **Data Layer** (`src/services/`): API client, database interface, and caching service
- **UI Layer** (`src/ui/`): Status bar integration with quota display
- **State Management**: Centralized quota handling and updates
- **Utils**: Performance-aware logging system

### Key Patterns

```typescript
// Core Update Flow
Data Service → State Management → UI Updates

// Error Handling Pattern
try {
  const data = await service.fetch();
  ui.update(data);
} catch (err) {
  logger.error(err);
  ui.showError(err);
}
```

### Extension Lifecycle

```typescript
activate():
  1. Initialize logger
  2. Setup services
  3. Register commands
  4. Start monitoring
  5. Setup event handlers

deactivate():
  1. Clear timers
  2. Cleanup resources
  3. Close connections
```

## Performance Guidelines

- Minimum 60s refresh interval for updates
- caching with force refresh capability
- Proper cleanup of VS Code resources
- Status bar performance optimization

## Configuration

```json
{
  "cursorPulse.refreshInterval": {
    "type": "number",
    "default": 120,
    "minimum": 60
  },
  "cursorPulse.showPercentage": {
    "type": "boolean",
    "default": true
  },
  "cursorPulse.enableNotifications": {
    "type": "boolean",
    "default": true
  }
}
```
