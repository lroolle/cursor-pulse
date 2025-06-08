# Cursor Pulse

![Cursor Pulse Logo](https://raw.githubusercontent.com/lroolle/cursor-pulse/main/images/icon.png)

**Elegant monitoring for Cursor AI subscription quota with clean status bar integration and rich
analytics**

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/lroolle/cursor-pulse)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)
[![VSCode](https://img.shields.io/badge/VSCode-1.96.0+-blue)](https://code.visualstudio.com/)
[![Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse)

![Screenshot](https://raw.githubusercontent.com/lroolle/cursor-pulse/main/images/cursor-pulse-screenshot.png)

## ✨ Features

- **🔄 Real-time Quota Monitoring** - Track GPT-4 usage limits and usage-based pricing in your
  status bar
- **📊 Rich Analytics Dashboard** - View detailed usage statistics, lines edited, and tabs accepted
- **⚡ Caching System** - Efficient data fetching with intelligent refresh intervals (minimum 60s)
- **🎨 Visual Feedback** - Smooth animations and intuitive status indicators
- **🔍 Comprehensive Tooltips** - Hover for detailed quota information and recent activity
- **⚙️ Flexible Configuration** - Customize refresh intervals, display options, and notification
  preferences
- **🛡️ Privacy-First Design** - Read-only local database access, no third-party data collection

## 🚀 Installation

### From VS Code / Cursor Marketplace

**[📦 Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse)**

1. Open VS Code Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search for "Cursor Pulse"
3. Click **Install**

Or install directly from the
[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse).

### Alternative: GitHub Releases

**[📥 Download VSIX from GitHub Releases](https://github.com/lroolle/cursor-pulse/releases)**

1. Go to the [Releases page](https://github.com/lroolle/cursor-pulse/releases)
2. Download the latest `.vsix` file from the assets section
3. In Cursor: `Ctrl+Shift+P` / `Cmd+Shift+P`
4. Run command: `Extensions: Install from VSIX...`
5. Select the downloaded `.vsix` file

This method is useful when:

- 🔄 You want to install a specific version
- 🏢 Your organization restricts marketplace access
- 🧪 You want to test pre-release versions

### Manual Installation

```bash
git clone https://github.com/lroolle/cursor-pulse.git
cd cursor-pulse
npm install
npm run package
# Install the generated .vsix file
```

## 💡 Usage

### Status Bar Display

The extension displays your quota status directly in the VS Code status bar:

| Plan Type                | Display Format                | Example               |
| ------------------------ | ----------------------------- | --------------------- |
| **Premium Subscription** | `⚡ used/limit (percentage)`  | `⚡ 45/100 (45%)`     |
| **Usage-Based Pricing**  | `💳 spent/limit (percentage)` | `💳 $12.50/$50 (25%)` |
| **Loading State**        | `🔄 Loading...`               | `🔄 Loading...`       |
| **Error State**          | `❌ Error`                    | `❌ API Error`        |

### Available Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                         | Description                           | Shortcut |
| ------------------------------- | ------------------------------------- | -------- |
| `Cursor Pulse: Refresh Quota`   | Quick refresh from cache              | -        |
| `Cursor Pulse: Soft Reload`     | Refresh with cache validation         | -        |
| `Cursor Pulse: Hard Reload`     | Clear all caches and fetch fresh data | -        |
| `Cursor Pulse: Open Settings`   | Configure extension preferences       | -        |
| `Cursor Pulse: Show Logs`       | View debug output and diagnostics     | -        |
| `Cursor Pulse: Set Log Level`   | Change logging verbosity              | -        |
| `Cursor Pulse: Set Usage Limit` | Configure usage-based spending limits | -        |

### Rich Tooltip Information

Hover over the status bar icon to see comprehensive usage details:

- **Account Information** - User details and subscription plan
- **Usage Analytics** - Lines edited, tabs accepted, and productivity metrics
- **Recent Activity** - Latest usage events and charges
- **Quota Details** - Current limits, reset periods, and usage trends
- **Performance Stats** - API response times and cache hit rates

## ⚙️ Configuration

Customize Cursor Pulse behavior through VS Code settings:

### Core Settings

| Setting                            | Type      | Default | Description                                 |
| ---------------------------------- | --------- | ------- | ------------------------------------------- |
| `cursorPulse.showPercentage`       | `boolean` | `true`  | Display usage percentage in status bar      |
| `cursorPulse.enableQuotaAnimation` | `boolean` | `true`  | Enable visual animations when quota updates |
| `cursorPulse.refreshInterval`      | `number`  | `120`   | Auto-refresh interval in seconds (min: 60)  |
| `cursorPulse.enableNotifications`  | `boolean` | `true`  | Show quota usage notifications              |

### Analytics & Display

| Setting                            | Type      | Default | Description                               |
| ---------------------------------- | --------- | ------- | ----------------------------------------- |
| `cursorPulse.analyticsTimePeriod`  | `string`  | `"1d"`  | Analytics time window (`1d`, `7d`, `30d`) |
| `cursorPulse.maxUsageEvents`       | `number`  | `5`     | Max usage events in tooltip (1-20)        |
| `cursorPulse.showChargesCollapsed` | `boolean` | `true`  | Collapse charges section in tooltip       |

### Advanced Settings

| Setting                          | Type     | Default | Description                                        |
| -------------------------------- | -------- | ------- | -------------------------------------------------- |
| `cursorPulse.customDatabasePath` | `string` | `""`    | Custom Cursor database path (auto-detect if empty) |

### Quick Settings Access

1. **Command Palette**: `Cursor Pulse: Open Settings`
2. **Settings UI**: Go to File → Preferences → Settings → Extensions → Cursor Pulse
3. **Settings JSON**: Add configuration to your `settings.json`

```json
{
  "cursorPulse.refreshInterval": 180,
  "cursorPulse.showPercentage": true,
  "cursorPulse.analyticsTimePeriod": "7d",
  "cursorPulse.enableNotifications": false
}
```

## 🔧 Requirements

- **VS Code**: Version 1.96.0 or higher
- **Cursor AI**: Active installation with valid session
- **System**: Read access to Cursor's local database
- **Network**: Internet connection for API calls

## 🛠️ Troubleshooting

### Common Issues

| Problem                        | Solution                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| **Extension not loading**      | Check Output panel → "Cursor Pulse" for error details        |
| **Database connection failed** | Ensure Cursor is installed and has been opened at least once |
| **API authentication errors**  | Restart Cursor to refresh session tokens                     |
| **Status bar not updating**    | Try "Hard Reload" to clear caches                            |
| **High CPU usage**             | Increase refresh interval in settings                        |

### Debug Mode

Enable detailed logging for troubleshooting:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Cursor Pulse: Set Log Level`
3. Select **Debug** level
4. Run `Cursor Pulse: Show Logs` to view output

### Performance Optimization

- **Minimum refresh interval**: 60 seconds (enforced for API rate limiting)
- **Cache strategy**: Intelligent caching with automatic invalidation
- **Resource cleanup**: Proper disposal of timers and event listeners

## 🔒 Privacy & Security

Cursor Pulse is designed with privacy as a core principle:

- **✅ Local Data Only** - Reads from your local Cursor database
- **✅ No Third-Party Services** - Direct communication with Cursor APIs only
- **✅ Read-Only Access** - Never modifies your Cursor data or settings
- **✅ Session Token Reuse** - Uses your existing Cursor authentication
- **✅ No Data Collection** - No telemetry or usage data sent anywhere

### Data Access

The extension accesses:

- Local Cursor SQLite database (read-only)
- Cursor API endpoints for quota information
- VS Code workspace settings for configuration

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Development Setup

```bash
# Clone and setup
git clone https://github.com/lroolle/cursor-pulse.git
cd cursor-pulse
npm install

# Development workflow
npm run watch          # Start development mode
npm test              # Run test suite
npm run lint          # Check code style
npm run package       # Build production version

# Debug in VS Code
# Press F5 to launch Extension Development Host
```

### Project Structure

```
src/
├── extension.ts          # Main extension entry point
├── services/
│   ├── api.ts           # Cursor API client
│   ├── database.ts      # Local database interface
│   └── dataService.ts   # Data aggregation and caching
├── ui/
│   └── statusBar.ts     # Status bar integration
├── utils/
│   ├── logger.ts        # Logging utilities
│   └── dateUtils.ts     # Date formatting helpers
└── types/
    └── index.ts         # TypeScript type definitions
```

## 📋 TODO

### Upcoming Features

- **📦 Event Caching** - Cache usage events to a local table for offline access and improved
  performance
- **📈 Enhanced Analytics** - Support more detailed analytics on usage events including:
  - Usage patterns and trends over time
  - Code completion acceptance rates
  - Peak usage hours analysis
  - Cost per feature breakdown
  - Weekly/monthly usage reports
- **👥 Team Support** - Multi-user and team usage monitoring capabilities:
  - Team quota aggregation and tracking

## 🔗 Related Projects

If you're looking for alternatives or additional functionality, you might also be interested in:

**[cursor-stats](https://github.com/Dwtexe/cursor-stats)** - A comprehensive VS Code extension for
Cursor subscription monitoring with advanced features like team usage tracking, multi-currency
support, spending alerts, and extensive customization options. While Cursor Pulse focuses on elegant
simplicity and performance, cursor-stats offers more detailed financial tracking and team-oriented
features.

Thank you to the cursor-stats project for inspiring innovation in the Cursor monitoring space and
providing users with excellent alternatives to choose from! 🙏

## 🙏 Acknowledgments

- **Cursor Team** - For building an amazing AI-powered code editor
- **VS Code Team** - For the excellent extension APIs
- **Contributors** - Thank you for your improvements and bug reports

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**📊 Monitor your Cursor usage with style! ⚡**

[📦 Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse)
• [Report Bug](https://github.com/lroolle/cursor-pulse/issues) •
[Request Feature](https://github.com/lroolle/cursor-pulse/issues) •
[Discussions](https://github.com/lroolle/cursor-pulse/discussions)

</div>

---
