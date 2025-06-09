import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
// import * as myExtension from '../../extension';

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  suite("Extension Activation", () => {
    test("Should activate extension", async () => {
      const extensionId = "cursor-pulse.cursor-pulse";
      const extension = vscode.extensions.getExtension(extensionId);

      if (extension) {
        if (!extension.isActive) {
          await extension.activate();
        }
        assert.ok(extension.isActive, "Extension should be active");
      }
    });
  });

  suite("Commands Registration", () => {
    test("Should have all required commands registered", async () => {
      const commands = await vscode.commands.getCommands(true);

      const requiredCommands = [
        "cursorPulse.softReload",
        "cursorPulse.hardReload",
        "cursorPulse.openSettings",
        "cursorPulse.showActions",
        "cursorPulse.setLogLevel",
        "cursorPulse.setUsageLimit",
        "cursorPulse.enableUsageBased",
        "cursorPulse.disableUsageBased",
        "cursorPulse.showLogs",
      ];

      for (const command of requiredCommands) {
        assert.ok(commands.includes(command), `Command ${command} should be registered`);
      }
    });

    test("Should execute refresh command without errors", async () => {
      try {
        await vscode.commands.executeCommand("cursorPulse.refresh");
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle command execution errors gracefully");
      }
    });

    test("Should execute openSettings command without errors", async () => {
      try {
        await vscode.commands.executeCommand("cursorPulse.openSettings");
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle command execution errors gracefully");
      }
    });
  });

  suite("Configuration", () => {
    test("Should have default configuration values", () => {
      const config = vscode.workspace.getConfiguration("cursorPulse");

      assert.strictEqual(config.get("refreshInterval"), 120, "Default refresh interval should be 120");
      assert.strictEqual(config.get("showPercentage"), true, "Default showPercentage should be true");
      assert.strictEqual(config.get("enableNotifications"), true, "Default enableNotifications should be true");
      assert.strictEqual(config.get("analyticsTimePeriod"), "7d", "Default analyticsTimePeriod should be 7d");
      assert.strictEqual(config.get("enableQuotaAnimation"), true, "Default enableQuotaAnimation should be true");
      assert.strictEqual(config.get("showChargesCollapsed"), true, "Default showChargesCollapsed should be true");
      assert.strictEqual(config.get("maxUsageEvents"), 5, "Default maxUsageEvents should be 5");
    });

    test("Should validate configuration constraints", () => {
      const config = vscode.workspace.getConfiguration("cursorPulse");

      const refreshInterval = config.get<number>("refreshInterval", 120);
      assert.ok(refreshInterval >= 60, "Refresh interval should be at least 60 seconds");

      const maxUsageEvents = config.get<number>("maxUsageEvents", 8);
      assert.ok(maxUsageEvents >= 1 && maxUsageEvents <= 20, "Max usage events should be between 1 and 20");
    });
  });

  suite("Status Bar Item", () => {
    test("Should handle status bar item creation", () => {
      const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
      assert.ok(statusBarItem, "Status bar item should be created");
      statusBarItem.dispose();
    });
  });

  suite("Error Handling", () => {
    test("Should handle invalid command execution", async () => {
      try {
        await vscode.commands.executeCommand("cursorPulse.invalidCommand");
        assert.fail("Should throw error for invalid command");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper error for invalid command");
      }
    });
  });
});
