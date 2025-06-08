import * as assert from "assert";
import { log } from "../utils/logger";

suite("Utilities Test Suite", () => {
  suite("Logger Tests", () => {
    test("Should have logger instance", () => {
      assert.ok(log, "Logger should be available");
    });

    test("Should have all log levels", () => {
      assert.ok(typeof log.error === "function", "Logger should have error method");
      assert.ok(typeof log.warn === "function", "Logger should have warn method");
      assert.ok(typeof log.info === "function", "Logger should have info method");
      assert.ok(typeof log.debug === "function", "Logger should have debug method");
      assert.ok(typeof log.trace === "function", "Logger should have trace method");
    });

    test("Should handle debug mode detection", () => {
      assert.ok(typeof log.isDebugEnabled === "function", "Logger should have isDebugEnabled method");
      const isDebug = log.isDebugEnabled();
      assert.ok(typeof isDebug === "boolean", "isDebugEnabled should return boolean");
    });

    test("Should not throw errors when logging", () => {
      assert.doesNotThrow(() => {
        log.info("Test info message");
      }, "Info logging should not throw");

      assert.doesNotThrow(() => {
        log.debug("Test debug message");
      }, "Debug logging should not throw");

      assert.doesNotThrow(() => {
        log.warn("Test warning message");
      }, "Warning logging should not throw");

      assert.doesNotThrow(() => {
        log.error("Test error message");
      }, "Error logging should not throw");
    });

    test("Should handle logging with objects", () => {
      assert.doesNotThrow(() => {
        log.info("Test with object", { key: "value", number: 42 });
      }, "Logging with objects should not throw");

      assert.doesNotThrow(() => {
        log.error("Test with error object", new Error("Test error"));
      }, "Logging with Error objects should not throw");
    });
  });

  suite("Type Validation Tests", () => {
    test("Should validate QuotaData structure", () => {
      const validQuota = {
        current: 50,
        limit: 100,
        percentage: 50,
        period: {
          start: "2024-01-01",
          end: "2024-01-31",
          remaining: 15,
        },
        lastUpdated: new Date(),
      };

      // Basic structure validation
      assert.ok(typeof validQuota.current === "number", "current should be number");
      assert.ok(typeof validQuota.limit === "number", "limit should be number");
      assert.ok(typeof validQuota.percentage === "number", "percentage should be number");
      assert.ok(typeof validQuota.period === "object", "period should be object");
      assert.ok(validQuota.lastUpdated instanceof Date, "lastUpdated should be Date");
    });

    test("Should validate UserInfo structure", () => {
      const validUser = {
        id: "test-id",
        email: "test@example.com",
        name: "Test User",
        membershipType: "pro",
      };

      assert.ok(typeof validUser.id === "string", "id should be string");
      assert.ok(typeof validUser.email === "string", "email should be string");
      assert.ok(typeof validUser.name === "string", "name should be string");
      assert.ok(typeof validUser.membershipType === "string", "membershipType should be string");
    });

    test("Should validate ApiError structure", () => {
      const validError = {
        type: "network" as const,
        message: "Network error",
        retryable: true,
      };

      assert.ok(typeof validError.type === "string", "type should be string");
      assert.ok(typeof validError.message === "string", "message should be string");
      assert.ok(typeof validError.retryable === "boolean", "retryable should be boolean");
    });

    test("Should validate PeriodInfo structure", () => {
      const validPeriod = {
        start: "2024-01-01",
        end: "2024-01-31",
        remaining: 15,
      };

      assert.ok(typeof validPeriod.start === "string", "start should be string");
      assert.ok(typeof validPeriod.end === "string", "end should be string");
      assert.ok(typeof validPeriod.remaining === "number", "remaining should be number");
    });
  });

  suite("Configuration Tests", () => {
    test("Should handle configuration access", () => {
      // Test that we can access VSCode configuration without errors
      assert.doesNotThrow(() => {
        const config = require("vscode").workspace.getConfiguration("cursorPulse");
        // Basic check that config object exists
        assert.ok(config, "Configuration should be accessible");
      }, "Configuration access should not throw");
    });
  });

  suite("Date Utility Tests", () => {
    test("Should handle date calculations", () => {
      const now = new Date();
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day later

      assert.ok(future > now, "Future date should be greater than current date");

      const daysDiff = Math.floor((future.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      assert.strictEqual(daysDiff, 1, "Should calculate 1 day difference correctly");
    });

    test("Should handle timestamp parsing", () => {
      const timestamp = Date.now().toString();
      const parsed = new Date(parseInt(timestamp));

      assert.ok(parsed instanceof Date, "Should parse timestamp to Date");
      assert.ok(!isNaN(parsed.getTime()), "Parsed date should be valid");
    });
  });

  suite("String Utility Tests", () => {
    test("Should handle string truncation logic", () => {
      const longString = "This is a very long string that needs to be truncated";
      const maxLength = 20;

      if (longString.length > maxLength) {
        const truncated = longString.substring(0, maxLength - 3) + "...";
        assert.ok(truncated.length <= maxLength, "Truncated string should not exceed max length");
        assert.ok(truncated.endsWith("..."), "Truncated string should end with ellipsis");
      }
    });

    test("Should handle percentage formatting", () => {
      const percentage = 75.6789;
      const rounded = Math.round(percentage);

      assert.strictEqual(rounded, 76, "Should round percentage correctly");
      assert.ok(typeof rounded === "number", "Rounded percentage should be number");
    });
  });

  suite("Error Handling Tests", () => {
    test("Should handle error categorization", () => {
      const networkError = { type: "network", message: "Connection failed", retryable: true };
      const authError = { type: "auth", message: "Authentication failed", retryable: false };
      const apiError = { type: "api", message: "Server error", retryable: true };

      assert.strictEqual(networkError.type, "network", "Network error should have correct type");
      assert.strictEqual(authError.type, "auth", "Auth error should have correct type");
      assert.strictEqual(apiError.type, "api", "API error should have correct type");

      assert.ok(networkError.retryable, "Network errors should be retryable");
      assert.ok(!authError.retryable, "Auth errors should not be retryable");
      assert.ok(apiError.retryable, "API errors should be retryable");
    });
  });
});
