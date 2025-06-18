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

## New Pricing Model Support (June 2025)

### Unlimited-with-Rate-Limits Model

- **Pro Plan**: Unlimited requests with rate-limit buckets (burst + local)
- **Ultra Plan**: 20x larger rate limits than Pro ($200/month)
- **Rate Limit Detection**: Monitor 429 responses and bucket exhaustion
- **Usage-Based Billing**: Optional overflow pricing when limits hit

### API Endpoints for New Model

```typescript
// Check if user is on new pricing model
GET https://www.cursor.com/api/dashboard/is-on-new-pricing
// Returns: {"isOnNewPricing": true}

// Current usage still works for quota tracking
GET https://www.cursor.com/api/auth/usage
// Legacy quota system for users not on new model
```

### Implementation Considerations

- **Dual Mode Support**: Handle both legacy quota and new rate-limit users
- **Context-Aware Caching**: Different TTL strategies based on rate-limit status
- **UI Adaptation**: Status bar must handle both quota exhaustion and rate-limiting
- **Analytics Enhancement**: Track usage patterns for rate-limit optimization

## Upcoming Features: Usage Analytics & Reporting

### Analytics Data Pipeline

```typescript
// Current analytics foundation (ready to extend)
DataService.fetchAnalyticsData(options, "1d" | "7d" | "30d"); // Daily metrics
DataService.fetchUsageEvents(options, daysBack, pageSize); // Event filtering

// Planned analytics enhancements
AnalyticsService.generateUsageReport(events, period); // Report generation
AnalyticsService.calculateUsagePatterns(analytics); // Pattern analysis
AnalyticsService.exportAnalyticsData(format); // Data export
```

### Usage Event Processing

- **Event Filtering**: Track paid vs. free requests, error states
- **Model Analysis**: Usage breakdown by GPT-4, Claude, other models
- **Cost Attribution**: Link usage events to billing charges
- **Pattern Detection**: Identify usage spikes, optimize workflows

### Reporting Features (Planned)

- **Usage Reports**: Daily/weekly/monthly consumption summaries
- **Cost Analysis**: Spending trends and budget projections
- **Performance Metrics**: Response times, error rates by model
- **Export Options**: JSON, CSV formats for external analysis

## Performance Guidelines

- Minimum 60s refresh interval for updates
- Context-aware caching with force refresh capability
- Proper cleanup of VS Code resources
- Status bar performance optimization
- Analytics data caching with period-specific TTL

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
  },
  "cursorPulse.analyticsTimePeriod": {
    "type": "string",
    "default": "1d",
    "enum": ["1d", "7d", "30d"]
  },
  "cursorPulse.maxUsageEvents": {
    "type": "number",
    "default": 8,
    "description": "Max usage events shown in tooltip"
  }
}
```

## Current State Assessment

### Well-Architected Services ✅

- **DataService** (`src/services/dataService.ts`, 840 lines): Robust business logic with
  context-aware caching
- **ApiService** (`src/services/api.ts`, 326 lines): Clean HTTP operations layer
- **CacheService** (`src/services/cacheService.ts`, 311 lines): Intelligent caching with multiple
  strategies
- **DatabaseService** (`src/services/database.ts`, 435 lines): Reliable data persistence

### Areas Needing Refactoring for Analytics 🔄

- **StatusBarProvider** (`src/ui/statusBar.ts`, 928 lines): God class requiring decomposition
  - Extract `TooltipBuilder` for analytics display logic
  - Extract `EventFormatter` for reusable formatting
  - Extract `AnimationManager` for quota animations
- **Extension.ts** (`src/extension.ts`, 540 lines): Needs command modularization for analytics
  features

### Ready for Analytics Extension ✅

- Usage event processing pipeline
- Analytics data caching with period-specific TTL
- Event filtering by cost and error status
- Foundation for report generation and export features
