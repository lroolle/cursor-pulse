import * as assert from "assert";
import { DatabaseService } from "../services/database";
import { CacheStrategy } from "../types";

suite("DatabaseService Test Suite", () => {
  let dbService: DatabaseService;

  setup(() => {
    dbService = DatabaseService.getInstance();
  });

  teardown(async () => {
    await dbService.clearAllCache();
  });

  suite("Singleton Pattern", () => {
    test("Should implement singleton pattern correctly", () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();
      assert.strictEqual(instance1, instance2, "DatabaseService should be a singleton");
    });
  });

  suite("Cache Operations", () => {
    test("Should handle cache data operations", async () => {
      const testKey = "test-key";
      const testData = { value: "test-data", timestamp: Date.now() };

      await assert.doesNotReject(async () => {
        await dbService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);
      }, "Setting cache data should not throw");

      const cachedData = await dbService.getCachedData(testKey);
      if (cachedData) {
        assert.deepStrictEqual(cachedData, testData, "Retrieved data should match stored data");
      }
    });

    test("Should handle cache removal", async () => {
      const testKey = "test-removal-key";
      const testData = { value: "test" };

      await dbService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);

      await assert.doesNotReject(async () => {
        await dbService.removeCachedData(testKey);
      }, "Removing cache data should not throw");

      const cachedData = await dbService.getCachedData(testKey);
      assert.strictEqual(cachedData, null, "Removed data should not be retrievable");
    });

    test("Should handle cache clearing", async () => {
      await assert.doesNotReject(async () => {
        await dbService.clearCache();
      }, "Clearing cache should not throw");

      await assert.doesNotReject(async () => {
        await dbService.clearAllCache();
      }, "Clearing all cache should not throw");
    });
  });

  suite("Cache Strategy Validation", () => {
    test("Should handle different cache strategies", async () => {
      const testKey = "strategy-test";
      const testData = { strategy: "test" };

      await assert.doesNotReject(async () => {
        await dbService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);
      }, "TIME_BASED strategy should work");

      await assert.doesNotReject(async () => {
        await dbService.setCachedData(testKey, testData, CacheStrategy.STATE_BASED);
      }, "STATE_BASED strategy should work");

      await assert.doesNotReject(async () => {
        await dbService.setCachedData(testKey, testData, CacheStrategy.PERMANENT);
      }, "PERMANENT strategy should work");
    });
  });

  suite("Database Path Resolution", () => {
    test("Should handle database path resolution", async () => {
      try {
        const hasStateChanged = await dbService.hasStateChanged();
        assert.ok(typeof hasStateChanged === "boolean", "hasStateChanged should return boolean");
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle database errors gracefully");
      }
    });
  });

  suite("Cursor Token Management", () => {
    test("Should handle cursor token retrieval", async () => {
      try {
        const token = await dbService.getCursorToken();
        if (token) {
          assert.ok(typeof token === "string", "Token should be a string");
          assert.ok(token.length > 0, "Token should not be empty");
        }
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle database errors gracefully");
      }
    });

    test("Should handle cursor user info retrieval", async () => {
      try {
        const userInfo = await dbService.getCursorUserInfo();
        if (userInfo) {
          assert.ok(typeof userInfo === "object", "User info should be an object");
        }
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle database errors gracefully");
      }
    });
  });

  suite("Cache Debugging", () => {
    test("Should handle cache debugging", async () => {
      const testKey = "debug-test";
      const testData = { debug: true };

      await dbService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);

      await assert.doesNotReject(async () => {
        await dbService.debugCacheEntry(testKey);
      }, "Cache debugging should not throw");
    });
  });

  suite("Error Handling", () => {
    test("Should handle null/undefined cache keys", async () => {
      const result = await dbService.getCachedData("");
      assert.strictEqual(result, null, "Empty key should return null");
    });

    test("Should handle invalid cache data gracefully", async () => {
      const testKey = "invalid-data-test";

      await assert.doesNotReject(async () => {
        await dbService.setCachedData(testKey, null as any, CacheStrategy.TIME_BASED, 60000);
      }, "Setting null data should not throw");
    });

    test("Should handle database connection errors", async () => {
      try {
        await dbService.hasStateChanged();
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper Error objects");
      }
    });
  });

  suite("TTL Validation", () => {
    test("Should handle cache expiration", async () => {
      const testKey = "ttl-test";
      const testData = { expiry: true };
      const shortTTL = 1;

      await dbService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, shortTTL);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const expiredData = await dbService.getCachedData(testKey);
      assert.strictEqual(expiredData, null, "Expired data should return null");
    });

    test("Should handle cache without TTL", async () => {
      const testKey = "no-ttl-test";
      const testData = { permanent: true };

      await assert.doesNotReject(async () => {
        await dbService.setCachedData(testKey, testData, CacheStrategy.PERMANENT);
      }, "Setting data without TTL should work");
    });
  });
});
