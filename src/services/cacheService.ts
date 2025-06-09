import * as vscode from "vscode";
import { CacheMetadata, CachedData, CacheStrategy } from "../types";
import { DatabaseService } from "./database";
import { log } from "../utils/logger";
import { extractParamsFromKey } from "../utils/cacheUtils";

export class CacheService {
  private static instance: CacheService;
  private static readonly CACHE_VERSION = 1;
  private static readonly DEFAULT_TTL = 5 * 60 * 1000;
  private static readonly MAX_GLOBAL_STATE_SIZE = 100 * 1024 * 1024;

  private context: vscode.ExtensionContext;
  private globalStateKey = "cursor-pulse.cache";
  private fileStorageDirectory: vscode.Uri;
  private databaseService: DatabaseService;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.fileStorageDirectory = context.globalStorageUri;
    this.databaseService = DatabaseService.getInstance();
  }

  static async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(context);
      await CacheService.instance.ensureStorageDirectory();
    }
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      throw new Error("CacheService not initialized. Call initialize() first.");
    }
    return CacheService.instance;
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.fileStorageDirectory);
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code !== "FileExists") {
        log.error("[CacheService] Failed to create storage directory", error);
        throw error;
      }
    }
  }

  async getCachedData<T>(key: string): Promise<T | null> {
    try {
      log.trace(`[CacheService] Getting cached data for key: ${key}`);

      const globalCache = await this.getGlobalStateCache();
      const globalEntry = globalCache.data[key];

      if (globalEntry && (await this.isCacheValid(globalEntry.metadata, key))) {
        log.trace(`[CacheService] Cache hit in globalState for key: ${key}`);
        return globalEntry.data as T;
      }

      const fileData = await this.getFromFileStorage<T>(key);
      if (fileData && (await this.isCacheValid(fileData.metadata, key))) {
        log.trace(`[CacheService] Cache hit in file storage for key: ${key}`);
        return fileData.data;
      }

      if (globalEntry) {
        await this.removeFromGlobalState(key);
      }
      if (fileData) {
        await this.removeFromFileStorage(key);
      }

      log.trace(`[CacheService] Cache miss for key: ${key}`);
      return null;
    } catch (error) {
      log.error(`[CacheService] Failed to get cached data for key: ${key}`, error);
      return null;
    }
  }

  async setCachedData<T>(
    key: string,
    data: T,
    strategy: CacheStrategy = CacheStrategy.TIME_BASED,
    ttl: number = CacheService.DEFAULT_TTL,
    params?: string,
  ): Promise<void> {
    try {
      const metadata: CacheMetadata = {
        timestamp: Date.now(),
        ttl,
        stateVersion: await this.getCurrentStateVersion(),
        strategy,
        params,
      };

      const cachedData: CachedData<T> = { data, metadata };
      const serializedData = JSON.stringify(cachedData);
      const dataSize = Buffer.byteLength(serializedData, "utf8");

      await this.cleanupStorageLocation(key, dataSize);

      if (dataSize <= CacheService.MAX_GLOBAL_STATE_SIZE) {
        await this.saveToGlobalState(key, cachedData);
        log.trace(`[CacheService] Data cached in globalState for key: ${key} (${dataSize} bytes)`);
      } else {
        await this.saveToFileStorage(key, cachedData);
        log.trace(`[CacheService] Data cached in file storage for key: ${key} (${dataSize} bytes)`);
      }
    } catch (error) {
      log.error(`[CacheService] Failed to cache data for key: ${key}`, error);
    }
  }

  async removeCachedData(key: string): Promise<void> {
    try {
      await Promise.all([this.removeFromGlobalState(key), this.removeFromFileStorage(key)]);
      log.trace(`[CacheService] Cache removed for key: ${key}`);
    } catch (error) {
      log.error(`[CacheService] Failed to remove cached data for key: ${key}`, error);
    }
  }

  async clearCache(): Promise<void> {
    try {
      const defaultCache = { version: CacheService.CACHE_VERSION, data: {} };
      await this.context.globalState.update(this.globalStateKey, defaultCache);

      await this.clearFileStorage();

      log.debug("[CacheService] All cache data cleared");
    } catch (error) {
      log.error("[CacheService] Failed to clear cache", error);
    }
  }

  private async cleanupStorageLocation(key: string, newDataSize: number): Promise<void> {
    try {
      if (newDataSize <= CacheService.MAX_GLOBAL_STATE_SIZE) {
        await this.removeFromFileStorage(key);
      } else {
        await this.removeFromGlobalState(key);
      }
    } catch (error) {
      log.warn(`[CacheService] Failed to cleanup storage location for key: ${key}`, error);
    }
  }

  private async getGlobalStateCache(): Promise<{ version: number; data: Record<string, any> }> {
    const defaultCache = { version: CacheService.CACHE_VERSION, data: {} };
    const cache = this.context.globalState.get<typeof defaultCache>(this.globalStateKey, defaultCache);

    if (cache.version !== CacheService.CACHE_VERSION) {
      log.debug(`[CacheService] Cache version mismatch, clearing globalState cache`);
      await this.context.globalState.update(this.globalStateKey, defaultCache);
      return defaultCache;
    }

    return cache;
  }

  private async saveToGlobalState<T>(key: string, cachedData: CachedData<T>): Promise<void> {
    const cache = await this.getGlobalStateCache();
    cache.data[key] = cachedData;
    await this.context.globalState.update(this.globalStateKey, cache);
  }

  private async removeFromGlobalState(key: string): Promise<void> {
    const cache = await this.getGlobalStateCache();
    if (cache.data[key]) {
      delete cache.data[key];
      await this.context.globalState.update(this.globalStateKey, cache);
    }
  }

  private async getFromFileStorage<T>(key: string): Promise<CachedData<T> | null> {
    try {
      const fileName = this.sanitizeFileName(key);
      const filePath = vscode.Uri.joinPath(this.fileStorageDirectory, `${fileName}.json`);

      const data = await vscode.workspace.fs.readFile(filePath);
      const content = Buffer.from(data).toString("utf8");
      return JSON.parse(content) as CachedData<T>;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
        return null;
      }
      log.warn(`[CacheService] Failed to read file storage for key: ${key}`, error);
      return null;
    }
  }

  private async saveToFileStorage<T>(key: string, cachedData: CachedData<T>): Promise<void> {
    const fileName = this.sanitizeFileName(key);
    const filePath = vscode.Uri.joinPath(this.fileStorageDirectory, `${fileName}.json`);
    const content = JSON.stringify(cachedData, null, 2);
    await vscode.workspace.fs.writeFile(filePath, Buffer.from(content, "utf8"));
  }

  private async removeFromFileStorage(key: string): Promise<void> {
    try {
      const fileName = this.sanitizeFileName(key);
      const filePath = vscode.Uri.joinPath(this.fileStorageDirectory, `${fileName}.json`);
      await vscode.workspace.fs.delete(filePath);
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError && error.code === "FileNotFound")) {
        log.warn(`[CacheService] Failed to remove file storage for key: ${key}`, error);
      }
    }
  }

  private async clearFileStorage(): Promise<void> {
    try {
      const files = await vscode.workspace.fs.readDirectory(this.fileStorageDirectory);
      const deletePromises = files
        .filter(([name]) => name.endsWith(".json"))
        .map(([name]) => {
          const filePath = vscode.Uri.joinPath(this.fileStorageDirectory, name);
          return vscode.workspace.fs.delete(filePath);
        });

      await Promise.all(deletePromises);
    } catch (error) {
      log.warn("[CacheService] Failed to clear file storage", error);
    }
  }

  private sanitizeFileName(key: string): string {
    return key.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_");
  }

  private async getCurrentStateVersion(): Promise<number> {
    try {
      return await this.databaseService.getCurrentStateVersion();
    } catch (error) {
      log.warn("[CacheService] Failed to get current state version from database, using timestamp fallback", error);
      return Math.floor(Date.now() / 1000);
    }
  }

  private async isCacheValid(metadata: CacheMetadata, key: string): Promise<boolean> {
    const now = Date.now();

    switch (metadata.strategy) {
      case CacheStrategy.PERMANENT:
        return true;

      case CacheStrategy.TIME_BASED:
        return now - metadata.timestamp < metadata.ttl;

      case CacheStrategy.STATE_BASED:
        const currentStateVersion = await this.getCurrentStateVersion();
        const timeValid = now - metadata.timestamp < metadata.ttl;
        const stateValid = currentStateVersion === metadata.stateVersion;
        return timeValid && stateValid;

      case CacheStrategy.PARAM_BASED:
        const timeIsValid = now - metadata.timestamp < metadata.ttl;
        if (!timeIsValid) {
          return false;
        }

        const currentParams = extractParamsFromKey(key);
        return currentParams === metadata.params;

      default:
        return false;
    }
  }

  async debugCacheEntry(key: string): Promise<void> {
    try {
      const globalCache = await this.getGlobalStateCache();
      const globalEntry = globalCache.data[key];

      const fileEntry = await this.getFromFileStorage(key);

      if (globalEntry || fileEntry) {
        const entry = globalEntry || fileEntry;
        const location = globalEntry ? "globalState" : "fileStorage";
        const metadata = entry!.metadata;
        const now = Date.now();
        const age = Math.round((now - metadata.timestamp) / 1000);
        const ttlRemaining = Math.round((metadata.ttl - (now - metadata.timestamp)) / 1000);

        log.debug(`[CacheService] Cache entry for '${key}' (${location}):`);
        log.debug(`  - Strategy: ${metadata.strategy}`);
        log.debug(`  - Age: ${age}s`);
        log.debug(`  - TTL: ${Math.round(metadata.ttl / 1000)}s`);
        log.debug(`  - Remaining: ${ttlRemaining}s`);
        log.debug(`  - Valid: ${await this.isCacheValid(metadata, key)}`);
        log.debug(`  - Data type: ${typeof entry!.data}`);

        if (metadata.params) {
          log.debug(`  - Params: ${metadata.params}`);
        }

        if (metadata.strategy === CacheStrategy.STATE_BASED) {
          const currentStateVersion = await this.getCurrentStateVersion();
          log.debug(`  - State version: ${metadata.stateVersion} (current: ${currentStateVersion})`);
        }
      } else {
        log.debug(`[CacheService] No cache entry found for: ${key}`);
      }
    } catch (error) {
      log.error(`[CacheService] Cache debug failed for key: ${key}`, error);
    }
  }
}
