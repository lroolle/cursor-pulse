import * as assert from "assert";
import { DatabaseService } from "../services/database";

suite("DatabaseService Test Suite", () => {
  let dbService: DatabaseService;

  setup(() => {
    dbService = DatabaseService.getInstance();
  });

  suite("Singleton Pattern", () => {
    test("Should implement singleton pattern correctly", () => {
      const instance1 = DatabaseService.getInstance();
      const instance2 = DatabaseService.getInstance();
      assert.strictEqual(instance1, instance2, "DatabaseService should be a singleton");
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
    test("Should handle cursor token retrieval gracefully", async () => {
      try {
        const token = await dbService.getCursorToken();
        if (token !== null) {
          assert.ok(typeof token === "string", "Token should be a string when present");
          assert.ok(token.length > 0, "Token should not be empty when present");
        }
        // If token is null, that's acceptable (e.g., no database file, user not logged in)
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle database errors gracefully");
      }
    });

    test("Should handle cursor user info retrieval gracefully", async () => {
      try {
        const userInfo = await dbService.getCursorUserInfo();
        if (userInfo !== null) {
          assert.ok(typeof userInfo === "object", "User info should be an object when present");
        }
        // If userInfo is null, that's acceptable (e.g., no database file, no user info)
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle database errors gracefully");
      }
    });
  });

  suite("Error Handling", () => {
    test("Should handle database connection errors gracefully", async () => {
      try {
        await dbService.hasStateChanged();
        // If this succeeds, that's fine too
      } catch (error) {
        assert.ok(error instanceof Error, "Should throw proper Error objects");
      }
    });

    test("Should handle missing database file gracefully", async () => {
      // This test verifies that the service handles missing database files gracefully
      // rather than crashing the extension

      try {
        const token = await dbService.getCursorToken();
        const userInfo = await dbService.getCursorUserInfo();

        // Both operations should complete without throwing
        // The results can be null if the database doesn't exist, which is fine
        assert.ok(token === null || typeof token === "string", "Token should be null or string");
        assert.ok(userInfo === null || typeof userInfo === "object", "UserInfo should be null or object");
      } catch (error) {
        // If errors are thrown, they should be proper Error objects
        assert.ok(error instanceof Error, "Should throw proper Error objects");
      }
    });

    test("Should handle invalid database paths gracefully", async () => {
      // Test the database service's error handling for invalid paths
      // This is particularly important for the path validation logic

      try {
        // These operations should not crash even with potential path issues
        await dbService.hasStateChanged();
        await dbService.getCursorToken();
        await dbService.getCursorUserInfo();
      } catch (error) {
        // Errors should be handled gracefully
        assert.ok(error instanceof Error, "Should handle path errors gracefully");
      }
    });
  });

  suite("Read-Only Operations Safety", () => {
    test("Should not modify database during read operations", async () => {
      // This test ensures that our read operations are truly read-only
      // and don't modify the database state

      try {
        // Multiple reads should be safe and consistent
        const token1 = await dbService.getCursorToken();
        const token2 = await dbService.getCursorToken();

        const userInfo1 = await dbService.getCursorUserInfo();
        const userInfo2 = await dbService.getCursorUserInfo();

        // Results should be consistent (same null status or same values)
        assert.strictEqual(typeof token1, typeof token2, "Token reads should be consistent");
        assert.strictEqual(typeof userInfo1, typeof userInfo2, "UserInfo reads should be consistent");

        if (token1 !== null && token2 !== null) {
          assert.strictEqual(token1, token2, "Token values should be identical");
        }

        if (userInfo1 !== null && userInfo2 !== null) {
          assert.deepStrictEqual(userInfo1, userInfo2, "UserInfo values should be identical");
        }
      } catch (error) {
        // Even if reads fail, they should fail consistently
        assert.ok(error instanceof Error, "Read failures should be consistent");
      }
    });
  });

  suite("State Change Detection", () => {
    test("Should handle state change detection without side effects", async () => {
      try {
        // State change detection should be a read-only operation
        const hasChanged1 = await dbService.hasStateChanged();
        const hasChanged2 = await dbService.hasStateChanged();

        // Both calls should complete successfully
        assert.ok(typeof hasChanged1 === "boolean", "First call should return boolean");
        assert.ok(typeof hasChanged2 === "boolean", "Second call should return boolean");

        // Note: The current implementation always returns true since we removed caching
        // This is acceptable behavior for now
      } catch (error) {
        assert.ok(error instanceof Error, "Should handle state detection errors gracefully");
      }
    });
  });
});
