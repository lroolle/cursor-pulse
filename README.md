# Cursor Pulse

**Elegant monitoring for Cursor AI subscription quota with clean status bar integration and rich
analytics**

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](https://github.com/lroolle/cursor-pulse)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)
[![Cursor](https://img.shields.io/badge/Cursor-1.0.0+-blue)](https://cursor.com/)
[![Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse)

![Screenshot](https://raw.githubusercontent.com/lroolle/cursor-pulse/main/images/cursor-pulse-screenshot.png)

## 📢 Important Update - New Cursor Pricing Model (June 17, 2025)

**✨ What's New**: Cursor has introduced updated pricing tiers with enhanced usage models:

- **🚀 Ultra Plan**: $200/month with 20x more usage capacity than Pro
- **⭐ Pro/Team Plans**: Now feature "unlimited usage with smart rate-limits"
- **🔧 Legacy Option**: Existing users can optionally keep the previous 500-request quota model

**Extension Status**: Currently supports traditional quota monitoring. The upcoming v0.5.0 update
will add full support for the new rate-limiting system.

## ✨ Features

- **🔄 Real-time Monitoring** - Track Cursor usage limits and spending in your status bar
- **📊 Rich Analytics** - View usage statistics, lines edited, and recent activity
- **⚡ Smart Caching** - Fast loading with intelligent data refresh
- **🎨 Visual Feedback** - Smooth animations and status indicators
- **🔍 Detailed Tooltips** - Hover for comprehensive usage information
- **🛡️ Privacy-First** - Read-only local access, no third-party data collection

## 🚀 Installation

### Marketplace (Recommended)

**[📦 Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse)**

1. Open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search "Cursor Pulse" → Install

### GitHub Releases

**[📥 Download VSIX](https://github.com/lroolle/cursor-pulse/releases)**

1. Download latest `.vsix` from releases
2. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
3. Select downloaded file

## 💡 Usage

### Commands & Tooltips

**Available Commands** (`Ctrl+Shift+P`):

- `Cursor Pulse: Soft/Hard Reload` - Refresh data (with/without cache)
- `Cursor Pulse: Open Settings` - Configure preferences
- `Cursor Pulse: Show Logs` - View debug output

**Tooltip Information**: Hover the status bar for account details, analytics, recent activity, and
quota information.

## ⚙️ Configuration

**Key Settings**:

- `cursorPulse.refreshInterval` - Auto-refresh interval (default: 120s, min: 60s)
- `cursorPulse.showPercentage` - Show percentage in status bar (default: true)
- `cursorPulse.analyticsTimePeriod` - Analytics window: `1d`, `7d`, `30d` (default: 7d)
- `cursorPulse.enableQuotaAnimation` - Visual animations (default: true)

**Access Settings**: Command Palette → `Cursor Pulse: Open Settings`

## 🔧 Requirements

Cursor ≥1.0.0, internet connection.

## 🛠️ Troubleshooting

**Common Issues**:

- Extension not loading → Check Output panel → "Cursor Pulse"
- Authentication errors → Restart Cursor to refresh tokens
- Status bar not updating → Try "Hard Reload" command

**Debug Mode**: `Cursor Pulse: Set Log Level` → Debug → `Show Logs`

## 🔒 Privacy

- ✅ **Local access only** - Reads Cursor database safely (read-only)
- ✅ **No third-party services** - Direct Cursor API communication only
- ✅ **No data collection** - Zero telemetry or external data sharing

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick Start**: `git clone` → `npm install` → `npm run watch` → Press F5 in VS Code

## 📋 TODO

### v0.5.0 - New Pricing Model Support (Priority)

- **🚀 Ultra Plan Support** - Monitor 20x higher usage limits for $200/month tier
- **⚡ Rate-Limiting Detection** - Support for "unlimited-with-rate-limits" Pro/Team plans
- **🔄 Hybrid Monitoring** - Automatic detection and switching between quota and rate-limit models
- **📊 Enhanced Metrics** - Rate-limit status indicators and throttling notifications

### Future Features

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

**[cursor-stats](https://github.com/Dwtexe/cursor-stats)** - Alternative with team usage tracking
and advanced financial monitoring features.

## 🙏 Acknowledgments

Thanks to Cursor Team, VS Code Team, and all contributors! 🙏

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
