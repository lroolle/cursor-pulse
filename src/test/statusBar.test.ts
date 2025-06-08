import * as assert from "assert";
import * as vscode from "vscode";
import { StatusBarProvider } from "../ui/statusBar";
import { QuotaData, CursorStats, UserInfo, FilteredUsageResponse, AnalyticsData, UsageEvent } from "../types";

suite("StatusBarProvider Test Suite", () => {
  let statusBarProvider: StatusBarProvider;

  setup(() => {
    statusBarProvider = new StatusBarProvider();
  });

  teardown(() => {
    statusBarProvider.dispose();
  });

  suite("Initialization Tests", () => {
    test("Should create status bar provider without errors", () => {
      assert.ok(statusBarProvider, "StatusBarProvider should be created successfully");
    });

    test("Should have animation configuration constants", () => {
      const config = (StatusBarProvider as any).ANIMATION_CONFIG;
      assert.ok(config, "ANIMATION_CONFIG should exist");
      assert.ok(typeof config.BOOST_THRESHOLD === "number", "BOOST_THRESHOLD should be a number");
      assert.ok(typeof config.MAGIC_THRESHOLD === "number", "MAGIC_THRESHOLD should be a number");
      assert.ok(config.FRAME_DURATION, "FRAME_DURATION should exist");
      assert.ok(config.COLORS, "COLORS should exist");
    });
  });

  suite("Animation Configuration Tests", () => {
    test("Should have valid animation thresholds", () => {
      const config = (StatusBarProvider as any).ANIMATION_CONFIG;
      assert.ok(config.BOOST_THRESHOLD > 0, "BOOST_THRESHOLD should be positive");
      assert.ok(
        config.MAGIC_THRESHOLD > config.BOOST_THRESHOLD,
        "MAGIC_THRESHOLD should be greater than BOOST_THRESHOLD",
      );
    });

    test("Should have valid frame durations", () => {
      const config = (StatusBarProvider as any).ANIMATION_CONFIG;
      const durations = config.FRAME_DURATION;

      assert.ok(typeof durations.BASIC === "number", "BASIC duration should be a number");
      assert.ok(typeof durations.BOOST === "number", "BOOST duration should be a number");
      assert.ok(typeof durations.MAGIC === "number", "MAGIC duration should be a number");

      assert.ok(durations.BASIC > 0, "BASIC duration should be positive");
      assert.ok(durations.BOOST > 0, "BOOST duration should be positive");
      assert.ok(durations.MAGIC > 0, "MAGIC duration should be positive");
    });

    test("Should have valid color configuration", () => {
      const config = (StatusBarProvider as any).ANIMATION_CONFIG;
      const colors = config.COLORS;

      assert.ok(typeof colors.BLUE === "string", "BLUE color should be a string");
      assert.ok(typeof colors.PURPLE === "string", "PURPLE color should be a string");
      assert.ok(typeof colors.MAGIC_PURPLE === "string", "MAGIC_PURPLE color should be a string");
      assert.ok(typeof colors.MAGIC_BLUE === "string", "MAGIC_BLUE color should be a string");

      // Check that colors are valid hex codes
      assert.ok(colors.BLUE.startsWith("#"), "BLUE should be a hex color");
      assert.ok(colors.PURPLE.startsWith("#"), "PURPLE should be a hex color");
    });
  });

  suite("Status Display Tests", () => {
    test("Should handle updateQuota without errors", () => {
      const mockQuotaData: QuotaData = {
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

      assert.doesNotThrow(() => {
        statusBarProvider.updateQuota(mockQuotaData);
      }, "updateQuota should not throw errors");
    });

    test("Should handle updateLoading without errors", () => {
      assert.doesNotThrow(() => {
        statusBarProvider.updateLoading();
      }, "updateLoading should not throw errors");
    });

    test("Should handle updateError without errors", () => {
      const mockError = {
        type: "network" as const,
        message: "Test error",
        retryable: true,
      };

      assert.doesNotThrow(() => {
        statusBarProvider.updateError(mockError);
      }, "updateError should not throw errors");
    });

    test("Should handle hide without errors", () => {
      assert.doesNotThrow(() => {
        statusBarProvider.hide();
      }, "hide should not throw errors");
    });
  });

  suite("Color Calculation", () => {
    test("Should return correct colors for different usage percentages", () => {
      const getUsageColor = (statusBarProvider as any).getUsageColor.bind(statusBarProvider);

      const lowColor = getUsageColor(25);
      assert.ok(typeof lowColor === "string", "Low usage color should be a string");

      const mediumColor = getUsageColor(60);
      assert.ok(typeof mediumColor === "string", "Medium usage color should be a string");

      const highColor = getUsageColor(80);
      assert.ok(typeof highColor === "string", "High usage color should be a string");

      const criticalColor = getUsageColor(95);
      assert.ok(typeof criticalColor === "string", "Critical usage color should be a string");
    });

    test("Should use different colors for different thresholds", () => {
      const getUsageColor = (statusBarProvider as any).getUsageColor.bind(statusBarProvider);

      const lowColor = getUsageColor(25);
      const mediumColor = getUsageColor(60);
      const highColor = getUsageColor(80);
      const criticalColor = getUsageColor(95);

      assert.notStrictEqual(lowColor, mediumColor, "Low and medium colors should be different");
      assert.notStrictEqual(mediumColor, highColor, "Medium and high colors should be different");
      assert.notStrictEqual(highColor, criticalColor, "High and critical colors should be different");
    });
  });

  suite("Animation Type Detection", () => {
    test("Should correctly identify animation types", () => {
      const getAnimationType = (statusBarProvider as any).getAnimationType.bind(statusBarProvider);
      const config = (StatusBarProvider as any).ANIMATION_CONFIG;

      const basicType = getAnimationType(1);
      assert.strictEqual(basicType, "basic", "Small delta should trigger basic animation");

      const boostType = getAnimationType(config.BOOST_THRESHOLD);
      assert.strictEqual(boostType, "boost", "Boost threshold should trigger boost animation");

      const magicType = getAnimationType(config.MAGIC_THRESHOLD);
      assert.strictEqual(magicType, "magic", "Magic threshold should trigger magic animation");
    });

    test("Should handle edge cases in animation type detection", () => {
      const getAnimationType = (statusBarProvider as any).getAnimationType.bind(statusBarProvider);
      const config = (StatusBarProvider as any).ANIMATION_CONFIG;

      const zeroType = getAnimationType(0);
      assert.strictEqual(zeroType, "basic", "Zero delta should trigger basic animation");

      const justBelowBoost = getAnimationType(config.BOOST_THRESHOLD - 1);
      assert.strictEqual(justBelowBoost, "basic", "Just below boost threshold should be basic");

      const justBelowMagic = getAnimationType(config.MAGIC_THRESHOLD - 1);
      assert.strictEqual(justBelowMagic, "boost", "Just below magic threshold should be boost");
    });
  });

  suite("Utility Methods", () => {
    test("Should trim descriptions correctly", () => {
      const trimDescription = (statusBarProvider as any).trimDescription.bind(statusBarProvider);

      const shortText = "short";
      const trimmedShort = trimDescription(shortText, 10);
      assert.strictEqual(trimmedShort, shortText, "Short text should not be trimmed");

      const longText = "this is a very long description that should be trimmed";
      const trimmedLong = trimDescription(longText, 20);
      assert.ok(trimmedLong.length <= 20, "Long text should be trimmed to max length");
      assert.ok(trimmedLong.endsWith("..."), "Trimmed text should end with ellipsis");
    });

    test("Should format event time correctly", () => {
      const formatEventTime = (statusBarProvider as any).formatEventTime.bind(statusBarProvider);

      const timestamp = Date.now().toString();
      const formattedTime = formatEventTime(timestamp);

      assert.ok(typeof formattedTime === "string", "Formatted time should be a string");
      assert.ok(formattedTime.includes(":"), "Formatted time should contain colon separator");
    });

    test("Should calculate request count correctly", () => {
      const calculateRequestCount = (statusBarProvider as any).calculateRequestCount.bind(statusBarProvider);

      const count1 = calculateRequestCount(4);
      assert.strictEqual(count1, "1", "4 cents should equal 1 request");

      const count2 = calculateRequestCount(8);
      assert.strictEqual(count2, "2", "8 cents should equal 2 requests");

      const count3 = calculateRequestCount(0);
      assert.strictEqual(count3, "0", "0 cents should equal 0 requests");
    });

    test("Should escape HTML attributes correctly", () => {
      const escapeHtmlAttribute = (statusBarProvider as any).escapeHtmlAttribute.bind(statusBarProvider);

      const normalText = "normal text";
      const escapedNormal = escapeHtmlAttribute(normalText);
      assert.strictEqual(escapedNormal, normalText, "Normal text should not be changed");

      const htmlText = '<script>alert("xss")</script>';
      const escapedHtml = escapeHtmlAttribute(htmlText);
      assert.ok(!escapedHtml.includes("<script>"), "HTML tags should be escaped");
      assert.ok(!escapedHtml.includes("</script>"), "HTML tags should be escaped");
    });
  });

  suite("Plan Type Detection", () => {
    test("Should determine plan type correctly", () => {
      const determinePlanType = (statusBarProvider as any).determinePlanType.bind(statusBarProvider);

      const proUser: UserInfo = {
        id: "test-id",
        email: "test@example.com",
        name: "Test User",
        membershipType: "pro",
      };

      const planType = determinePlanType({}, proUser);
      assert.strictEqual(planType, "Pro", "Should detect Pro plan from user info");

      const usageBasedStats = {
        usageBasedPricing: {
          status: { isEnabled: true },
        },
      };

      const usageBasedPlan = determinePlanType(usageBasedStats, null);
      assert.strictEqual(usageBasedPlan, "Pro Plan", "Should detect Pro plan from usage-based pricing");

      const freePlan = determinePlanType({}, null);
      assert.strictEqual(freePlan, "Free Plan", "Should default to Free plan");
    });

    test("Should handle edge cases in plan detection", () => {
      const determinePlanType = (statusBarProvider as any).determinePlanType.bind(statusBarProvider);

      const freeUser: UserInfo = {
        id: "test-id",
        email: "test@example.com",
        name: "Test User",
        membershipType: "free",
      };

      const planType = determinePlanType({}, freeUser);
      assert.strictEqual(planType, "Free", "Should detect Free plan from user info");

      const disabledUsageBased = {
        usageBasedPricing: {
          status: { isEnabled: false },
        },
      };

      const disabledPlan = determinePlanType(disabledUsageBased, null);
      assert.strictEqual(disabledPlan, "Free Plan", "Should default to Free when usage-based disabled");
    });
  });

  suite("Usage-Based Display Logic", () => {
    test("Should determine when to flip to usage-based display", () => {
      const shouldFlip = (statusBarProvider as any).shouldFlipToUsageBasedDisplay.bind(statusBarProvider);

      const quotaData: QuotaData = {
        current: 50,
        limit: 100,
        percentage: 50,
        period: { start: "2024-01-01", end: "2024-01-31", remaining: 15 },
        lastUpdated: new Date(),
      };

      const usageBasedStats: CursorStats = {
        premiumRequests: {
          current: 50,
          limit: 100,
          percentage: 50,
          startOfMonth: "2024-01-01",
        },
        usageBasedPricing: {
          status: { isEnabled: true, limit: 100 },
          currentMonth: { totalCost: 25.5, items: [], hasUnpaidInvoice: false },
          lastMonth: { totalCost: 15.25, items: [], hasUnpaidInvoice: false },
        },
      };

      const result = shouldFlip(quotaData, usageBasedStats);
      assert.ok(typeof result === "boolean", "Should return boolean");
    });

    test("Should handle missing usage-based data", () => {
      const shouldFlip = (statusBarProvider as any).shouldFlipToUsageBasedDisplay.bind(statusBarProvider);

      const quotaData: QuotaData = {
        current: 50,
        limit: 100,
        percentage: 50,
        period: { start: "2024-01-01", end: "2024-01-31", remaining: 15 },
        lastUpdated: new Date(),
      };

      const result = shouldFlip(quotaData, {});
      assert.strictEqual(result, false, "Should return false when no usage-based data");
    });
  });

  suite("Event Info Extraction", () => {
    test("Should extract event info correctly", () => {
      const extractEventInfo = (statusBarProvider as any).extractEventInfo.bind(statusBarProvider);

      const mockEvent: UsageEvent = {
        timestamp: Date.now().toString(),
        details: {
          composer: {
            modelIntent: "gpt-4",
            isHeadless: false,
            maxMode: false,
          },
        },
        status: "completed",
        owningUser: "test-user",
        priceCents: 400,
      };

      const result = extractEventInfo(mockEvent);
      assert.ok(typeof result === "object", "Should return object");
      assert.ok(typeof result.model === "string", "Should extract model");
      assert.ok(typeof result.isMaxMode === "boolean", "Should determine max mode");
      assert.ok(typeof result.isUsageBased === "boolean", "Should determine usage-based");
      assert.ok(typeof result.includedInPro === "boolean", "Should determine if included in pro");
      assert.ok(typeof result.isSlow === "boolean", "Should determine if slow");
    });

    test("Should handle different event types", () => {
      const extractEventInfo = (statusBarProvider as any).extractEventInfo.bind(statusBarProvider);

      const gpt4Event: UsageEvent = {
        timestamp: Date.now().toString(),
        details: {
          composer: {
            modelIntent: "gpt-4",
            isHeadless: false,
            maxMode: false,
          },
        },
        status: "completed",
        owningUser: "test-user",
        priceCents: 400,
      };

      const claudeEvent: UsageEvent = {
        timestamp: Date.now().toString(),
        details: {
          composer: {
            modelIntent: "claude-3.5-sonnet",
            isHeadless: false,
            maxMode: false,
          },
        },
        status: "completed",
        owningUser: "test-user",
        priceCents: 200,
      };

      const gpt4Result = extractEventInfo(gpt4Event);
      const claudeResult = extractEventInfo(claudeEvent);

      assert.strictEqual(gpt4Result.model, "gpt-4", "Should extract GPT-4 model");
      assert.strictEqual(claudeResult.model, "claude-3.5-sonnet", "Should extract Claude model");
    });
  });

  suite("Progress Bar Generation", () => {
    test("Should create progress bar correctly", () => {
      const createProgressBar = (statusBarProvider as any).createProgressBar.bind(statusBarProvider);

      const progressBar = createProgressBar(75);
      assert.ok(typeof progressBar === "string", "Progress bar should be a string");
      assert.ok(progressBar.includes("svg"), "Progress bar should contain SVG");
      assert.ok(progressBar.includes("75%"), "Progress bar should show percentage");
    });

    test("Should handle edge cases in progress bar", () => {
      const createProgressBar = (statusBarProvider as any).createProgressBar.bind(statusBarProvider);

      const zeroProgress = createProgressBar(0);
      assert.ok(zeroProgress.includes("0%"), "Should handle 0% progress");

      const fullProgress = createProgressBar(100);
      assert.ok(fullProgress.includes("100%"), "Should handle 100% progress");

      const overProgress = createProgressBar(150);
      assert.ok(typeof overProgress === "string", "Should handle over 100% progress");
    });
  });

  suite("SVG Generation", () => {
    test("Should create max mode SVG", () => {
      const createMaxModeSvg = (statusBarProvider as any).createMaxModeSvg.bind(statusBarProvider);

      const svg = createMaxModeSvg();
      assert.ok(typeof svg === "string", "SVG should be a string");
      assert.ok(svg.includes("<img"), "Should contain img tag");
      assert.ok(svg.includes("data:image/svg+xml"), "Should contain SVG data");
    });

    test("Should create dollar SVG", () => {
      const createDollarSvg = (statusBarProvider as any).createDollarSvg.bind(statusBarProvider);

      const svg = createDollarSvg();
      assert.ok(typeof svg === "string", "SVG should be a string");
      assert.ok(svg.includes("<img"), "Should contain img tag");
      assert.ok(svg.includes("data:image/svg+xml"), "Should contain SVG data");
    });

    test("Should create slow mode SVG", () => {
      const createSlowModeSvg = (statusBarProvider as any).createSlowModeSvg.bind(statusBarProvider);

      const svg = createSlowModeSvg();
      assert.ok(typeof svg === "string", "SVG should be a string");
      assert.ok(svg.includes("<img"), "Should contain img tag");
      assert.ok(svg.includes("data:image/svg+xml"), "Should contain SVG data");
    });
  });

  suite("Animation State Management", () => {
    test("Should check if animation is enabled", () => {
      const isAnimationEnabled = (statusBarProvider as any).isAnimationEnabled.bind(statusBarProvider);

      const result = isAnimationEnabled();
      assert.ok(typeof result === "boolean", "Should return boolean");
    });

    test("Should clear animation timers", () => {
      const clearAnimationTimers = (statusBarProvider as any).clearAnimationTimers.bind(statusBarProvider);

      assert.doesNotThrow(() => {
        clearAnimationTimers();
      }, "Should clear timers without errors");
    });

    test("Should restore original state", () => {
      const restoreOriginalState = (statusBarProvider as any).restoreOriginalState.bind(statusBarProvider);

      assert.doesNotThrow(() => {
        restoreOriginalState(75);
      }, "Should restore state without errors");
    });
  });

  suite("Disposal", () => {
    test("Should dispose without errors", () => {
      assert.doesNotThrow(() => {
        statusBarProvider.dispose();
      }, "dispose should not throw errors");
    });

    test("Should clear timers on disposal", () => {
      statusBarProvider.updateQuota({
        current: 50,
        limit: 100,
        percentage: 50,
        period: { start: "2024-01-01", end: "2024-01-31", remaining: 15 },
        lastUpdated: new Date(),
      });

      assert.doesNotThrow(() => {
        statusBarProvider.dispose();
      }, "dispose should clear timers without errors");
    });
  });
});
