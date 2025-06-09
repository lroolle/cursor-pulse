import * as vscode from "vscode";
import { DatabaseService } from "./services/database";
import { DataService } from "./services/dataService";
import { CacheService } from "./services/cacheService";
import { StatusBarProvider } from "./ui/statusBar";
import { initializeLogger, log, showOutputChannel } from "./utils/logger";

let statusBarProvider: StatusBarProvider;
let updateTimer: NodeJS.Timeout | undefined;
let isUpdating = false;

export async function activate(context: vscode.ExtensionContext) {
  initializeLogger();
  log.info("Cursor Pulse extension activating...");

  await CacheService.initialize(context);
  const dbService = DatabaseService.getInstance();
  const dataService = DataService.getInstance();
  statusBarProvider = new StatusBarProvider();

  const softReloadCommand = vscode.commands.registerCommand("cursorPulse.softReload", async () => {
    log.info("Manual soft reload requested");
    await refresh(false);
  });

  const hardReloadCommand = vscode.commands.registerCommand("cursorPulse.hardReload", async () => {
    log.info("Hard reload requested - clearing all caches including permanent");
    await dataService.clearAllCacheIncludingPermanent();
    await refresh(true); // Force refresh
    vscode.window.showInformationMessage(
      "🔄 Hard Reload Completed\n\n" + "✅ All caches cleared\n\n" + "📊 Data refreshed",
    );
  });

  const settingsCommand = vscode.commands.registerCommand("cursorPulse.openSettings", async () => {
    log.debug("Opening extension settings");
    try {
      await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:cursor-pulse.cursor-pulse");
      log.debug("Settings opened using primary method");
    } catch (err) {
      log.warn("Primary settings method failed", err);
      try {
        await vscode.commands.executeCommand("workbench.action.openSettings", "cursorPulse");
        log.debug("Settings opened using fallback method");
      } catch (fallbackError) {
        log.error("Fallback settings method failed", fallbackError);
        await vscode.commands.executeCommand("workbench.action.openSettings");
        vscode.window.showInformationMessage('Settings opened. Search for "cursor pulse" to find extension settings.');
        log.debug("Settings opened using final fallback");
      }
    }
  });

  const showLogsCommand = vscode.commands.registerCommand("cursorPulse.showLogs", () => {
    log.debug("Opening output channel");
    showOutputChannel();
  });

  const setLogLevelCommand = vscode.commands.registerCommand("cursorPulse.setLogLevel", async () => {
    log.debug("Opening log level settings for Cursor Pulse");

    const possibleCommands = [
      "workbench.action.setLogLevel",
      "developer.setLogLevel",
      "workbench.action.openLogViewer",
      "developer.toggleLogLevel",
    ];

    let commandFound = false;
    for (const command of possibleCommands) {
      try {
        await vscode.commands.executeCommand(command);
        commandFound = true;
        vscode.window.showInformationMessage('Select "Cursor Pulse" from the list to change its log level');
        break;
      } catch (err) {
        log.trace(`Command '${command}' not found, trying next...`);
      }
    }

    if (!commandFound) {
      log.error("No working log level command found");
      const result = await vscode.window.showErrorMessage(
        "Could not open log level settings automatically.",
        "Open Command Palette",
      );

      if (result === "Open Command Palette") {
        await vscode.commands.executeCommand("workbench.action.showCommands");
        setTimeout(() => {
          vscode.window.showInformationMessage('Type "Developer: Set Log Level" to change logging verbosity');
        }, 500);
      }
    }
  });

  const clearCacheCommand = vscode.commands.registerCommand("cursorPulse.clearCache", async () => {
    log.info("Manual cache clear requested");
    await dataService.clearAllCache();
    vscode.window.showInformationMessage("Cache cleared successfully");
  });

  const setUsageLimitCommand = vscode.commands.registerCommand("cursorPulse.setUsageLimit", async () => {
    log.debug("Setting usage-based pricing limit");

    try {
      const token = await dataService.getSessionToken();
      if (!token) {
        vscode.window.showErrorMessage(
          `🔐 Authentication Required\n\n` +
            `❌ Could not find Cursor session token\n\n` +
            `💡 Please sign in to Cursor and try again`,
        );
        return;
      }

      const limitInput = await vscode.window.showInputBox({
        prompt: "Enter spending limit in USD (e.g., 20, 50, 100)",
        placeHolder: "20",
        validateInput: (value) => {
          const num = parseFloat(value);
          if (isNaN(num) || num <= 0) {
            return "Please enter a valid positive number";
          }
          return undefined;
        },
      });

      if (!limitInput) {
        return;
      }

      const limitUSD = parseFloat(limitInput);
      const success = await dataService.setUsageBasedLimit(token, limitUSD);

      if (success) {
        vscode.window.showInformationMessage(
          `💳 Usage-Based Limit Updated\n\n` + `💰 New limit: $${limitUSD}\n\n` + `✅ Settings saved`,
        );
        await refresh();
      } else {
        vscode.window.showErrorMessage(
          `❌ Failed to Update Limit\n\n` + `💡 Please check your connection and try again`,
        );
      }
    } catch (err) {
      log.error("Failed to set usage limit", err);
      vscode.window.showErrorMessage(
        `❌ Unexpected Error\n\n` + `💡 Failed to set usage-based pricing limit\n\n` + `🔍 Check logs for more details`,
      );
    }
  });

  const enableUsageBasedCommand = vscode.commands.registerCommand("cursorPulse.enableUsageBased", async () => {
    log.debug("Enabling usage-based pricing");

    try {
      const token = await dataService.getSessionToken();
      if (!token) {
        vscode.window.showErrorMessage(
          `🔐 Authentication Required\n\n` +
            `❌ Could not find Cursor session token\n\n` +
            `💡 Please sign in to Cursor and try again`,
        );
        return;
      }

      const setLimit = await vscode.window.showQuickPick(
        [
          {
            label: "Enable with default limit",
            description: "Use default spending limit($20)",
          },
          {
            label: "Enable with custom limit",
            description: "Set your own spending limit",
          },
        ],
        {
          placeHolder: "Choose how to enable usage-based pricing",
        },
      );

      if (!setLimit) {
        return;
      }

      let limitUSD: number | undefined;
      if (setLimit.label === "Enable with custom limit") {
        const limitInput = await vscode.window.showInputBox({
          prompt: "Enter spending limit in USD (e.g., 20, 50, 100)",
          placeHolder: "20",
          validateInput: (value) => {
            const num = parseFloat(value);
            if (isNaN(num) || num <= 0) {
              return "Please enter a valid positive number";
            }
            return undefined;
          },
        });

        if (!limitInput) {
          return;
        }

        limitUSD = parseFloat(limitInput);
      } else if (setLimit.label === "Enable with default limit") {
        limitUSD = 20;
      } else {
        vscode.window.showErrorMessage("Invalid option selected");
        return;
      }

      const success = await dataService.enableUsageBasedPricing(token, limitUSD);

      if (success) {
        const message = limitUSD
          ? `🚀 Usage-Based Pricing Enabled\n\n💰 Spending limit: $${limitUSD}\n\n✅ You can now use fast requests beyond quota`
          : `🚀 Usage-Based Pricing Enabled\n\n✅ You can now use fast requests beyond quota`;
        vscode.window.showInformationMessage(message);
        await refresh();
      } else {
        vscode.window.showErrorMessage(
          `❌ Failed to Enable Usage-Based Pricing\n\n` + `💡 Please check your connection and try again`,
        );
      }
    } catch (err) {
      log.error("Failed to enable usage-based pricing", err);
      vscode.window.showErrorMessage(
        `❌ Unexpected Error\n\n` + `💡 Failed to enable usage-based pricing\n\n` + `🔍 Check logs for more details`,
      );
    }
  });

  const disableUsageBasedCommand = vscode.commands.registerCommand("cursorPulse.disableUsageBased", async () => {
    log.debug("Disabling usage-based pricing");

    try {
      const token = await dataService.getSessionToken();
      if (!token) {
        vscode.window.showErrorMessage(
          `🔐 Authentication Required\n\n` +
            `❌ Could not find Cursor session token\n\n` +
            `💡 Please sign in to Cursor and try again`,
        );
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        "Are you sure you want to disable usage-based pricing? You will only have access to slow requests when your quota is exceeded.",
        "Disable",
        "Cancel",
      );

      if (confirm !== "Disable") {
        return;
      }

      const success = await dataService.disableUsageBasedPricing(token);

      if (success) {
        vscode.window.showInformationMessage(
          `🔒 Usage-Based Pricing Disabled\n\n` +
            `⚠️ Only slow requests available when quota exceeded\n\n` +
            `✅ Settings saved`,
        );
        await refresh();
      } else {
        vscode.window.showErrorMessage(
          `❌ Failed to Disable Usage-Based Pricing\n\n` + `💡 Please check your connection and try again`,
        );
      }
    } catch (err) {
      log.error("Failed to disable usage-based pricing", err);
      vscode.window.showErrorMessage(
        `❌ Unexpected Error\n\n` + `💡 Failed to disable usage-based pricing\n\n` + `🔍 Check logs for more details`,
      );
    }
  });

  const showActionsCommand = vscode.commands.registerCommand("cursorPulse.showActions", async () => {
    const token = await dbService.getCursorToken();
    let usageBasedEnabled = false;

    if (token) {
      try {
        const usageBasedStatus = await dataService.fetchUsageBasedStatus({ token, forceRefresh: false });
        usageBasedEnabled = usageBasedStatus?.isEnabled || false;
      } catch (error) {
        log.warn("Failed to fetch usage-based status for actions menu", error);
      }
    }

    const actions = [
      "Soft Reload",
      "Hard Reload (Clear All Cache)",
      "Open Settings",
      "Set Log Level",
      "Show Logs",
      "Clear Cache",
    ];

    if (usageBasedEnabled) {
      actions.push("Set Usage Limit", "Disable Usage-Based Pricing");
    } else {
      actions.push("Enable Usage-Based Pricing");
    }

    actions.push("View Details", "Debug Cache Status");

    const selection = await vscode.window.showQuickPick(actions, {
      placeHolder: "Choose an action",
    });

    switch (selection) {
      case "Soft Reload":
        await refresh(false);
        break;
      case "Hard Reload (Clear All Cache)":
        await vscode.commands.executeCommand("cursorPulse.hardReload");
        break;
      case "Open Settings":
        vscode.commands.executeCommand("workbench.action.openSettings", "@ext:cursor-pulse.cursor-pulse");
        break;
      case "Set Log Level":
        vscode.commands.executeCommand("cursorPulse.setLogLevel");
        break;
      case "Show Logs":
        showOutputChannel();
        break;
      case "Clear Cache":
        await dataService.clearAllCache();
        vscode.window.showInformationMessage(
          `🧹 Cache Cleared\n\n` + `✅ Temporary data removed\n\n` + `📊 Fresh data will be loaded on next refresh`,
        );
        break;
      case "Set Usage Limit":
        vscode.commands.executeCommand("cursorPulse.setUsageLimit");
        break;
      case "Enable Usage-Based Pricing":
        vscode.commands.executeCommand("cursorPulse.enableUsageBased");
        break;
      case "Disable Usage-Based Pricing":
        vscode.commands.executeCommand("cursorPulse.disableUsageBased");
        break;
      case "View Details":
        // TODO: Implement details view in future iteration
        vscode.window.showInformationMessage("Detailed view coming soon!");
        break;
    }
  });

  const debugCacheCommand = vscode.commands.registerCommand("cursorPulse.debugCache", async () => {
    log.info("=== CURSOR PULSE DEBUG CACHE STATUS ===");
    await dataService.debugCacheStatus();

    const cacheService = CacheService.getInstance();
    const cacheKeys = ["analytics:1d", "analytics:7d", "analytics:30d", "user:info"];
    for (const key of cacheKeys) {
      await cacheService.debugCacheEntry(key);
    }

    vscode.window.showInformationMessage(
      `🔍 Debug Cache Analysis Complete\n\n` +
        `📊 Detailed cache information available\n\n` +
        `💡 Check the output panel for full report`,
    );
    showOutputChannel();
  });

  const configListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration("cursorPulse.refreshInterval")) {
      log.info("Refresh interval changed, restarting timer...");
      startRefreshTimer();
    }
    if (e.affectsConfiguration("cursorPulse.customDatabasePath")) {
      log.debug("Database path changed, will use new path on next refresh");
    }
    if (e.affectsConfiguration("cursorPulse.analyticsTimePeriod")) {
      log.info("Analytics time period changed, refreshing data...");
      await refresh(false); // Force refresh to load new analytics period
    }
    if (e.affectsConfiguration("cursorPulse.enableQuotaAnimation")) {
      log.debug("Quota animation setting changed");
    }
    if (e.affectsConfiguration("cursorPulse.maxUsageEvents")) {
      log.debug("Max usage events setting changed");
    }
  });

  const config = vscode.workspace.getConfiguration("cursorPulse");
  if (log.isDebugEnabled()) {
    log.debug(
      `Current configuration: refreshInterval=${config.get("refreshInterval")}, customDatabasePath='${config.get("customDatabasePath")}'`,
    );
  }

  await refresh();

  startRefreshTimer();

  context.subscriptions.push(
    statusBarProvider,
    softReloadCommand,
    hardReloadCommand,
    settingsCommand,
    showLogsCommand,
    setLogLevelCommand,
    clearCacheCommand,
    setUsageLimitCommand,
    enableUsageBasedCommand,
    disableUsageBasedCommand,
    showActionsCommand,
    debugCacheCommand,
    configListener,
  );

  log.info("Cursor Pulse extension activated successfully");

  async function refresh(forceRefresh = false) {
    if (isUpdating && !forceRefresh) {
      return;
    }

    isUpdating = true;

    try {
      if (forceRefresh) {
        statusBarProvider.updateLoading();
      }

      const token = await dbService.getCursorToken();
      if (!token) {
        statusBarProvider.updateError({
          type: "auth",
          message: "Please sign in to Cursor",
          retryable: true,
        });
        return;
      }

      const config = vscode.workspace.getConfiguration("cursorPulse");
      const analyticsTimePeriod = config.get<string>("analyticsTimePeriod", "1d");

      const usageData = await dataService.fetchAllUsageData(
        {
          token,
          forceRefresh,
        },
        analyticsTimePeriod,
      );

      if (!usageData) {
        statusBarProvider.updateError({
          type: "network",
          message: "Unable to fetch usage data",
          retryable: true,
        });
        return;
      }

      await statusBarProvider.updateUsageData(usageData);

      if (forceRefresh) {
        const messageParts = [];

        messageParts.push(
          `🔥 Premium: ${usageData.quota.current}/${usageData.quota.limit} (${usageData.quota.percentage}%)`,
        );

        if (usageData.stats.usageBasedPricing?.status.isEnabled) {
          const totalCost =
            usageData.stats.usageBasedPricing.currentMonth.totalCost +
            usageData.stats.usageBasedPricing.lastMonth.totalCost;
          const limit = usageData.stats.usageBasedPricing.status.limit || 0;
          const costPercentage = limit > 0 ? Math.round((totalCost / limit) * 100) : 0;
          const limitDisplay = limit === 0 ? "∞" : limit.toString();
          messageParts.push(`💳 Usage-Based: $${totalCost.toFixed(2)}/${limitDisplay} (${costPercentage}%)`);
        }

        if (usageData.analyticsData) {
          const periodLabels: Record<string, string> = {
            "1d": "Today",
            "7d": "This Week",
            "30d": "This Month",
          };
          const periodLabel = periodLabels[analyticsTimePeriod] || analyticsTimePeriod;
          messageParts.push(`📊 Analytics: ${periodLabel}`);
        }

        messageParts.push(`✅ Cache Refreshed`);

        const formattedMessage = messageParts.join("\n\n");
        vscode.window.showInformationMessage(formattedMessage);
      }
    } catch (err) {
      log.error("Quota update failed", err);

      const apiError = {
        type:
          err instanceof Error && err.name === "TypeError" && err.message.includes("fetch")
            ? ("network" as const)
            : ("unknown" as const),
        message: err instanceof Error ? err.message : "Unknown error occurred",
        retryable: true,
      };

      statusBarProvider.updateError(apiError);

      if (forceRefresh) {
        vscode.window.showErrorMessage(
          `❌ Update Failed\n\n` + `💡 ${apiError.message}\n\n` + `🔄 Try again or check your connection`,
        );
      }
    } finally {
      isUpdating = false;
    }
  }

  function startRefreshTimer() {
    if (updateTimer) {
      clearInterval(updateTimer);
    }

    const config = vscode.workspace.getConfiguration("cursorPulse");
    const refreshInterval = config.get<number>("refreshInterval", 120);
    const intervalMs = Math.max(refreshInterval, 60) * 1000; // Minimum 60 seconds

    updateTimer = setInterval(() => refresh(), intervalMs);
    log.debug(`Refresh timer started with ${refreshInterval}s interval`);
  }
}

export function deactivate() {
  log.info("Cursor Pulse extension deactivating...");
  if (updateTimer) {
    clearInterval(updateTimer);
  }
}
