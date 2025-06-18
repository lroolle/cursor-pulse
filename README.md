# Cursor Pulse

**Elegant monitoring for Cursor AI subscription quota with clean status bar integration and rich
analytics**

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/lroolle/cursor-pulse)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)
[![Cursor](https://img.shields.io/badge/Cursor-1.0.0+-blue)](https://cursor.com/)
[![Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse)

![Screenshot](https://raw.githubusercontent.com/lroolle/cursor-pulse/main/images/cursor-pulse-screenshot.png)

## 🎉 New in v1.0.0 - Full New Pricing Model Support

**✨ Complete Support for Cursor's Updated Pricing Tiers**:

- **⭐ Pro/Team/Ultra Smart Limits**: Native "unlimited usage with smart rate-limits" detection and monitoring
- **🔄 Hybrid Detection**: Automatic switching between quota and rate-limiting monitoring modes
- **🔧 Legacy Compatibility**: Continued support for traditional 500-request quota models

## ✨ Features

- **🔄 Real-time Monitoring** - Track Cursor usage limits, rate-limits, and spending in your status bar
- **📊 Rich Analytics** - View usage statistics, lines edited, and recent activity across all plan types
- **⚡ Smart Caching** - Fast loading with intelligent data refresh and offline access
- **🎨 Visual Feedback** - Smooth animations and status indicators with rate-limiting alerts
- **🔍 Detailed Tooltips** - Hover for comprehensive usage information and plan-specific metrics
- **🛡️ Privacy-First** - Read-only local access, no third-party data collection
- **🚀 Multi-Plan Support** - Automatic detection of Ultra, Pro, Team, and legacy pricing models
- **📈 Advanced Analytics** - Detailed usage pattern analysis and cost tracking

## 🚀 Installation

### Marketplace (Recommended)

**[📦 Marketplace Link](https://marketplace.visualstudio.com/items?itemName=lroolle.cursor-pulse)**

1. Within Cursor, Open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search "Cursor Pulse" → Install

### GitHub Releases

**[📥 Download VSIX](https://github.com/lroolle/cursor-pulse/releases)**

1. Download latest `.vsix` from releases
2. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
3. Select downloaded file

## 💡 Usage

### Commands & Tooltips

**Available Commands** (`Ctrl+Shift+P` or just click the status bar):

- `Cursor Pulse: Soft/Hard Reload` - Refresh data (with/without cache)
- `Cursor Pulse: Open Settings` - Configure preferences
- `Cursor Pulse: Show Logs` - View debug output
- `Cursor Pulse: Toggle Rate-Limit Mode` - Switch between quota and rate-limit monitoring

**Tooltip Information**: Hover the status bar for account details, analytics, recent activity,
quota/rate-limit information, and plan-specific metrics.

## ⚙️ Configuration

**Key Settings**:

- `cursorPulse.refreshInterval` - Auto-refresh interval (default: 120s, min: 60s)
- `cursorPulse.showPercentage` - Show percentage in status bar (default: true)
- `cursorPulse.analyticsTimePeriod` - Analytics window: `1d`, `7d`, `30d` (default: 7d)
- `cursorPulse.enableQuotaAnimation` - Visual animations (default: true)
- `cursorPulse.rateLimitNotifications` - Enable rate-limit status notifications (default: true)
- `cursorPulse.planDetectionMode` - Plan detection: `auto`, `quota`, `rate-limit` (default: auto)

**Access Settings**: Command Palette → `Cursor Pulse: Open Settings`

## 🔧 Requirements

Cursor ≥1.0.0, internet connection.

## 🛠️ Troubleshooting

**Common Issues**:

- Extension not loading → Check Output panel → "Cursor Pulse"
- Authentication errors → Restart Cursor to refresh tokens
- Status bar not updating → Try "Hard Reload" command
- Plan detection issues → Use "Toggle Rate-Limit Mode" or check settings

**Debug Mode**: `Cursor Pulse: Set Log Level` → Debug → `Show Logs`

## 🔒 Privacy

- ✅ **Local access only** - Reads Cursor database safely (read-only)
- ✅ **No third-party services** - Direct Cursor API communication only
- ✅ **No data collection** - Zero telemetry or external data sharing

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick Start**: `git clone` → `npm install` → `npm run watch` → Press F5 in VS Code

## 📋 Roadmap

### v1.1.0 - Advanced Analytics & Caching

- **📦 Event Caching** - Cache usage events to a local table for offline access and improved performance
- **📈 Advanced Analytics Dashboard** - Detailed usage pattern analysis including:
  - Usage trends and peak hours analysis
  - Code completion acceptance rates
  - Cost per feature breakdown
  - Weekly/monthly usage reports with export options

### Future Considerations

- **🔔 Smart Notifications** - Proactive alerts for usage optimization

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
