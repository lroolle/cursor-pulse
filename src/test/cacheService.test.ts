import * as assert from "assert";
import * as vscode from "vscode";
import { CacheService } from "../services/cacheService";
import { CacheStrategy } from "../types";

// Mock extension context for testing
class MockExtensionContext implements Partial<vscode.ExtensionContext> {
  private storage = new Map<string, any>();

  globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } = {
    get: <T>(key: string, defaultValue?: T): T => {
      return this.storage.get(key) ?? defaultValue;
    },
    update: async (key: string, value: any): Promise<void> => {
      this.storage.set(key, value);
    },
    keys: (): readonly string[] => {
      return Array.from(this.storage.keys());
    },
    setKeysForSync: (): void => {},
  };

  globalStorageUri: vscode.Uri = vscode.Uri.file("/tmp/cursor-pulse-test");

  constructor() {
    // Initialize with a test storage location
  }
}

// Mock vscode.workspace.fs for testing
const mockFileSystem = {
  storage: new Map<string, Uint8Array>(),

  createDirectory: async (uri: vscode.Uri): Promise<void> => {
    // Directory creation simulation - no-op
  },

  readFile: async (uri: vscode.Uri): Promise<Uint8Array> => {
    const content = mockFileSystem.storage.get(uri.toString());
    if (!content) {
      const error = new Error("File not found") as any;
      error.code = "FileNotFound";
      throw Object.assign(error, { name: "FileSystemError" });
    }
    return content;
  },

  writeFile: async (uri: vscode.Uri, content: Uint8Array): Promise<void> => {
    mockFileSystem.storage.set(uri.toString(), content);
  },

  delete: async (uri: vscode.Uri): Promise<void> => {
    const deleted = mockFileSystem.storage.delete(uri.toString());
    if (!deleted) {
      const error = new Error("File not found") as any;
      error.code = "FileNotFound";
      throw Object.assign(error, { name: "FileSystemError" });
    }
  },

  readDirectory: async (uri: vscode.Uri): Promise<[string, vscode.FileType][]> => {
    const basePath = uri.toString();
    const files: [string, vscode.FileType][] = [];

    for (const [path] of mockFileSystem.storage) {
      if (path.startsWith(basePath + "/")) {
        const fileName = path.substring(basePath.length + 1);
        if (!fileName.includes("/")) {
          // Only direct children
          files.push([fileName, vscode.FileType.File]);
        }
      }
    }

    return files;
  },
};

suite("CacheService Test Suite", () => {
  let cacheService: CacheService;
  let mockContext: MockExtensionContext;

  // Mock vscode.workspace.fs using Object.defineProperty
  const originalFs = Object.getOwnPropertyDescriptors(vscode.workspace.fs);

  suiteSetup(() => {
    // Mock the file system methods using Object.defineProperty
    Object.defineProperty(vscode.workspace, "fs", {
      value: mockFileSystem,
      writable: true,
      configurable: true,
    });
  });

  suiteTeardown(() => {
    // Restore the original file system
    if (originalFs.fs) {
      Object.defineProperties(vscode.workspace, { fs: originalFs.fs });
    }
  });

  setup(async () => {
    mockContext = new MockExtensionContext();
    await CacheService.initialize(mockContext as unknown as vscode.ExtensionContext);
    cacheService = CacheService.getInstance();

    // Clear mock storage
    mockFileSystem.storage.clear();
    (mockContext as any).storage?.clear?.();
  });

  teardown(async () => {
    await cacheService.clearCache();
  });

  suite("Singleton Pattern", () => {
    test("Should implement singleton pattern correctly", () => {
      const instance1 = CacheService.getInstance();
      const instance2 = CacheService.getInstance();
      assert.strictEqual(instance1, instance2, "CacheService should be a singleton");
    });

    test("Should throw error if not initialized", async () => {
      // Reset the singleton
      (CacheService as any).instance = null;

      assert.throws(
        () => {
          CacheService.getInstance();
        },
        /not initialized/,
        "Should throw error when not initialized",
      );

      // Re-initialize for other tests
      await CacheService.initialize(mockContext as unknown as vscode.ExtensionContext);
    });
  });

  suite("Cache Operations", () => {
    test("Should handle small data in globalState", async () => {
      const testKey = "small-test-key";
      const testData = { value: "small test data", timestamp: Date.now() };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);

      const cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, testData, "Small data should be retrieved from globalState");
    });

    test("Should handle large data in file storage", async () => {
      const testKey = "large-test-key";
      // Create data larger than the threshold (100KB)
      const largeData = {
        value: "x".repeat(150 * 1024), // 150KB of data
        timestamp: Date.now(),
      };

      await cacheService.setCachedData(testKey, largeData, CacheStrategy.TIME_BASED, 60000);

      const cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, largeData, "Large data should be retrieved from file storage");
    });

    test("Should handle cache removal", async () => {
      const testKey = "removal-test-key";
      const testData = { value: "test removal" };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);

      // Verify data exists
      let cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, testData, "Data should exist before removal");

      await cacheService.removeCachedData(testKey);

      cachedData = await cacheService.getCachedData(testKey);
      assert.strictEqual(cachedData, null, "Data should be null after removal");
    });

    test("Should handle cache clearing", async () => {
      const testKeys = ["clear-test-1", "clear-test-2", "clear-test-3"];
      const testData = { value: "test clear" };

      // Set multiple cache entries
      for (const key of testKeys) {
        await cacheService.setCachedData(key, testData, CacheStrategy.TIME_BASED, 60000);
      }

      // Verify all entries exist
      for (const key of testKeys) {
        const cachedData = await cacheService.getCachedData(key);
        assert.deepStrictEqual(cachedData, testData, `Data should exist for key: ${key}`);
      }

      await cacheService.clearCache();

      // Verify all entries are cleared
      for (const key of testKeys) {
        const cachedData = await cacheService.getCachedData(key);
        assert.strictEqual(cachedData, null, `Data should be cleared for key: ${key}`);
      }
    });
  });

  suite("Cache Strategies", () => {
    test("Should handle TIME_BASED strategy", async () => {
      const testKey = "time-based-test";
      const testData = { strategy: "TIME_BASED" };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);

      const cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, testData, "TIME_BASED strategy should work");
    });

    test("Should handle PERMANENT strategy", async () => {
      const testKey = "permanent-test";
      const testData = { strategy: "PERMANENT" };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.PERMANENT, 0);

      const cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, testData, "PERMANENT strategy should work");
    });

    test("Should handle STATE_BASED strategy", async () => {
      const testKey = "state-based-test";
      const testData = { strategy: "STATE_BASED" };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.STATE_BASED, 60000);

      const cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, testData, "STATE_BASED strategy should work");
    });

    test("Should handle PARAM_BASED strategy", async () => {
      const testKey = "analytics:7d"; // Use a key pattern that matches our extraction logic
      const testData = { strategy: "PARAM_BASED" };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.PARAM_BASED, 60000, "7d");

      const cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, testData, "PARAM_BASED strategy should work");
    });
  });

  suite("TTL and Expiration", () => {
    test("Should handle cache expiration", async () => {
      const testKey = "ttl-test";
      const testData = { expiry: true };
      const shortTTL = 1; // 1ms

      await cacheService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, shortTTL);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const expiredData = await cacheService.getCachedData(testKey);
      assert.strictEqual(expiredData, null, "Expired data should return null");
    });

    test("Should handle permanent cache (no expiration)", async () => {
      const testKey = "permanent-test";
      const testData = { permanent: true };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.PERMANENT);

      // Wait some time
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cachedData = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(cachedData, testData, "Permanent data should not expire");
    });
  });

  suite("Error Handling", () => {
    test("Should handle null/undefined cache keys gracefully", async () => {
      const result = await cacheService.getCachedData("");
      assert.strictEqual(result, null, "Empty key should return null");
    });

    test("Should handle file system errors gracefully", async () => {
      // Mock a file system error
      const originalReadFile = mockFileSystem.readFile;
      mockFileSystem.readFile = async () => {
        throw new Error("Simulated file system error");
      };

      const result = await cacheService.getCachedData("test-key");
      assert.strictEqual(result, null, "Should return null on file system error");

      // Restore original function
      mockFileSystem.readFile = originalReadFile;
    });

    test("Should handle malformed cached data", async () => {
      const testKey = "malformed-test";

      // Manually insert malformed data into mock file system
      const filePath = `${mockContext.globalStorageUri.toString()}/${testKey.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_")}.json`;
      mockFileSystem.storage.set(filePath, Buffer.from("invalid json", "utf8"));

      const result = await cacheService.getCachedData(testKey);
      assert.strictEqual(result, null, "Should return null for malformed data");
    });
  });

  suite("Cache Debugging", () => {
    test("Should handle cache debugging for existing entries", async () => {
      const testKey = "debug-test";
      const testData = { debug: true };

      await cacheService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);

      await assert.doesNotReject(async () => {
        await cacheService.debugCacheEntry(testKey);
      }, "Cache debugging should not throw for existing entries");
    });

    test("Should handle cache debugging for non-existing entries", async () => {
      const testKey = "non-existing-debug-test";

      await assert.doesNotReject(async () => {
        await cacheService.debugCacheEntry(testKey);
      }, "Cache debugging should not throw for non-existing entries");
    });
  });

  suite("Cache Version Management", () => {
    test("Should handle cache version mismatches", async () => {
      const testKey = "version-test";
      const testData = { version: "test" };

      // Manually set corrupted cache with wrong version BEFORE trying to use cache service
      const corruptedCache = {
        version: 999, // Wrong version
        data: { [testKey]: { data: testData, metadata: { strategy: CacheStrategy.TIME_BASED } } },
      };
      await mockContext.globalState.update("cursor-pulse.cache", corruptedCache);

      // Now try to get data - it should return null since cache will be cleared due to version mismatch
      const result = await cacheService.getCachedData(testKey);
      assert.strictEqual(result, null, "Should handle version mismatches gracefully");
    });
  });

  suite("File Name Sanitization", () => {
    test("Should sanitize invalid file name characters", async () => {
      const testKey = 'test<key>with/invalid:characters"and|spaces?*';
      const testData = { sanitized: true };

      await assert.doesNotReject(async () => {
        await cacheService.setCachedData(testKey, testData, CacheStrategy.TIME_BASED, 60000);
      }, "Should handle invalid file name characters");

      const result = await cacheService.getCachedData(testKey);
      assert.deepStrictEqual(result, testData, "Should retrieve data with sanitized file names");
    });
  });
});
