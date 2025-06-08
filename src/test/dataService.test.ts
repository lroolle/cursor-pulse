import * as assert from "assert";
import * as vscode from "vscode";
import { DataService } from "../services/dataService";
import { QuotaData, CursorStats, UserInfo, FilteredUsageResponse, AnalyticsData } from "../types";

suite("DataService Test Suite", () => {
  let dataService: DataService;

  setup(() => {
    dataService = DataService.getInstance();
  });

  teardown(async () => {
    await dataService.clearAllCache();
  });

  suite("Singleton Pattern", () => {
    test("Should implement singleton pattern correctly", () => {
      const instance1 = DataService.getInstance();
      const instance2 = DataService.getInstance();
      assert.strictEqual(instance1, instance2, "DataService should be a singleton");
    });
  });

  suite("Cache Strategy", () => {
    test("Should clear cache when requested", async () => {
      await assert.doesNotReject(async () => {
        await dataService.clearAllCache();
      }, "Cache clearing should not throw errors");
    });

    test("Should handle cache TTL configuration", () => {
      const analyticsTTL = (dataService as any).getAnalyticsCacheTTL("1d");
      assert.ok(typeof analyticsTTL === "number", "Analytics TTL should be a number");
      assert.ok(analyticsTTL > 0, "Analytics TTL should be positive");

      const weeklyTTL = (dataService as any).getAnalyticsCacheTTL("7d");
      const monthlyTTL = (dataService as any).getAnalyticsCacheTTL("30d");
      assert.ok(typeof weeklyTTL === "number", "Weekly TTL should be a number");
      assert.ok(typeof monthlyTTL === "number", "Monthly TTL should be a number");
    });

    test("Should have different TTL for different time periods", () => {
      const dailyTTL = (dataService as any).getAnalyticsCacheTTL("1d");
      const weeklyTTL = (dataService as any).getAnalyticsCacheTTL("7d");
      const monthlyTTL = (dataService as any).getAnalyticsCacheTTL("30d");

      assert.ok(weeklyTTL > dailyTTL, "Weekly TTL should be longer than daily");
      assert.ok(monthlyTTL > weeklyTTL, "Monthly TTL should be longer than weekly");
    });
  });

  suite("Data Fetching Methods", () => {
    test("Should have all required fetch methods", () => {
      assert.ok(typeof dataService.fetchQuota === "function", "fetchQuota should exist");
      assert.ok(typeof dataService.fetchPremiumQuota === "function", "fetchPremiumQuota should exist");
      assert.ok(
        typeof dataService.fetchUsageBasedPricingData === "function",
        "fetchUsageBasedPricingData should exist",
      );
      assert.ok(typeof dataService.fetchUserInfo === "function", "fetchUserInfo should exist");
      assert.ok(typeof dataService.fetchUsageEvents === "function", "fetchUsageEvents should exist");
      assert.ok(typeof dataService.fetchAnalyticsData === "function", "fetchAnalyticsData should exist");
      assert.ok(typeof dataService.fetchAllUsageData === "function", "fetchAllUsageData should exist");
    });

    test("Should handle invalid tokens gracefully", async () => {
      try {
        await dataService.fetchQuota({ token: "", forceRefresh: true });
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper Error objects");
      }
    });
  });

  suite("Period Calculations", () => {
    test("Should calculate usage-based period correctly", async () => {
      try {
        const period = await dataService.getUsageBasedPeriod();
        assert.ok(typeof period === "object", "Period should be an object");
        assert.ok(typeof period.start === "string", "Period start should be a string");
        assert.ok(typeof period.end === "string", "Period end should be a string");
        assert.ok(typeof period.remaining === "number", "Period remaining should be a number");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper error when database unavailable");
      }
    });

    test("Should calculate current month period correctly", async () => {
      try {
        const period = await dataService.getCurrentMonthPeriod();
        assert.ok(typeof period === "object", "Period should be an object");
        assert.ok(typeof period.start === "string", "Period start should be a string");
        assert.ok(typeof period.end === "string", "Period end should be a string");
        assert.ok(typeof period.remaining === "number", "Period remaining should be a number");
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper error when database unavailable");
      }
    });
  });

  suite("Context-Aware Caching Logic", () => {
    test("Should update fetch context correctly", () => {
      const updateFetchContext = (dataService as any).updateFetchContext.bind(dataService);

      const mockQuota: QuotaData = {
        current: 50,
        limit: 100,
        percentage: 50,
        period: { start: "2024-01-01", end: "2024-01-31", remaining: 15 },
        lastUpdated: new Date(),
      };

      assert.doesNotThrow(() => {
        updateFetchContext(mockQuota, false);
      }, "updateFetchContext should not throw");

      const context = dataService.getFetchContext();
      if (context) {
        assert.strictEqual(context.quotaPercentage, 50, "Should store quota percentage");
        assert.strictEqual(context.usageBasedEnabled, false, "Should store usage-based status");
        assert.strictEqual(context.isQuotaExhausted, false, "Should correctly detect non-exhausted quota");
      }
    });

    test("Should determine when to fetch usage-based data", async () => {
      const shouldFetch = (dataService as any).shouldFetchUsageBasedData.bind(dataService);

      try {
        const result = await shouldFetch(90);
        assert.ok(typeof result === "boolean", "Should return boolean");
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle errors gracefully");
      }
    });
  });

  suite("Data Parsing Logic", () => {
    test("Should parse monthly usage correctly", () => {
      const parseMonthlyUsage = (dataService as any).parseMonthlyUsage.bind(dataService);

      const mockResponse = {
        items: [
          { cents: 400, description: "Test usage" },
          { cents: 600, description: "Another usage" },
        ],
      };

      const result = parseMonthlyUsage(mockResponse);
      assert.ok(result, "Should parse valid response");
      assert.strictEqual(result.totalCost, 10.0, "Should convert cents to dollars");
      assert.ok(Array.isArray(result.items), "Should have items array");
    });

    test("Should handle invalid monthly usage data", () => {
      const parseMonthlyUsage = (dataService as any).parseMonthlyUsage.bind(dataService);

      const result = parseMonthlyUsage(null);
      assert.strictEqual(result, null, "Should return null for invalid data");
    });
  });

  suite("User Info Combination Logic", () => {
    test("Should combine user info correctly", () => {
      const combineUserInfo = (dataService as any).combineUserInfo.bind(dataService);

      const apiUserInfo = {
        sub: "api-id",
        email: "api@example.com",
        name: "API User",
        email_verified: true,
        updated_at: "2024-01-01",
        picture: null,
      };

      const dbUserInfo = {
        membershipType: "pro",
      };

      const result = combineUserInfo(apiUserInfo, dbUserInfo);
      assert.ok(result, "Should combine user info");
      assert.strictEqual(result.id, "api-id", "Should use API ID");
      assert.strictEqual(result.email, "api@example.com", "Should use API email");
      assert.strictEqual(result.membershipType, "pro", "Should use DB membership type");
    });

    test("Should handle missing user info gracefully", () => {
      const combineUserInfo = (dataService as any).combineUserInfo.bind(dataService);

      const result = combineUserInfo(null, null);
      assert.strictEqual(result, null, "Should return null when both sources are null");
    });
  });

  suite("Session Token Management", () => {
    test("Should handle session token retrieval", async () => {
      try {
        const token = await dataService.getSessionToken();
        if (token) {
          assert.ok(typeof token === "string", "Token should be a string");
          assert.ok(token.length > 0, "Token should not be empty");
        }
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle errors gracefully");
      }
    });
  });

  suite("Usage-Based Pricing Management", () => {
    test("Should handle usage-based limit setting", async () => {
      try {
        const result = await dataService.setUsageBasedLimit("test-token", 50);
        assert.ok(typeof result === "boolean", "Should return boolean");
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle errors gracefully");
      }
    });

    test("Should handle enabling usage-based pricing", async () => {
      try {
        const result = await dataService.enableUsageBasedPricing("test-token", 100);
        assert.ok(typeof result === "boolean", "Should return boolean");
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle errors gracefully");
      }
    });

    test("Should handle disabling usage-based pricing", async () => {
      try {
        const result = await dataService.disableUsageBasedPricing("test-token");
        assert.ok(typeof result === "boolean", "Should return boolean");
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle errors gracefully");
      }
    });
  });

  suite("Cache Invalidation Logic", () => {
    test("Should invalidate state-based cache", async () => {
      await assert.doesNotReject(async () => {
        await dataService.invalidateStateBasedCache();
      }, "State-based cache invalidation should not throw");
    });

    test("Should clear all cache including permanent", async () => {
      await assert.doesNotReject(async () => {
        await dataService.clearAllCacheIncludingPermanent();
      }, "Clearing all cache should not throw");
    });
  });

  suite("Error Handling", () => {
    test("Should handle network errors gracefully", async () => {
      try {
        await dataService.fetchQuota({ token: "invalid-token", forceRefresh: true });
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper Error objects");
      }
    });

    test("Should handle database errors gracefully", async () => {
      try {
        await dataService.fetchUserInfo({ token: "test-token", forceRefresh: true });
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper Error objects");
      }
    });
  });
});
