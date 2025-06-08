import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as vscode from "vscode";
import { Database } from "sqlite3";
import { CacheMetadata, CachedData, CacheStrategy } from "../types";
import { execSync } from "child_process";
import { log } from "../utils/logger";

export class DatabaseService {
  private static instance: DatabaseService;
  private static readonly CACHE_KEY_PREFIX = "cursor-pulse.cached";
  private static readonly DEFAULT_TTL = 5 * 60 * 1000;

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async getCachedData<T>(key: string): Promise<T | null> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        return null;
      }

      const cacheKey = `${DatabaseService.CACHE_KEY_PREFIX}.${key}`;
      log.trace(`[Database] Getting cached data:`, {
        key: key,
        cacheKey: cacheKey,
        dbPath: dbPath,
      });

      const cachedValue = await this.getValueFromDB(dbPath, cacheKey);

      if (!cachedValue) {
        return null;
      }

      const cachedData: CachedData<T> = JSON.parse(cachedValue);
      log.trace(`[Database] Retrieved cached data:`, {
        key: key,
        metadata: cachedData.metadata,
        data: JSON.stringify(cachedData.data, null, 2),
      });

      if (await this.isCacheValid(cachedData.metadata)) {
        return cachedData.data;
      }

      await this.removeCachedData(key);
      log.trace(`[Database] Cache expired for key: ${key}`);
      return null;
    } catch (err) {
      log.error(`[Database] Cache retrieval failed for key: ${key}`, err);
      return null;
    }
  }

  async setCachedData<T>(
    key: string,
    data: T,
    strategy: CacheStrategy = CacheStrategy.TIME_BASED,
    ttl: number = DatabaseService.DEFAULT_TTL,
    params?: string,
  ): Promise<void> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        log.warn("[Database] Database file does not exist for caching");
        return;
      }

      const stateVersion = await this.getCurrentStateVersion();
      const metadata: CacheMetadata = {
        timestamp: Date.now(),
        ttl,
        stateVersion,
        strategy,
        params,
      };

      const cachedData: CachedData<T> = { data, metadata };
      const cacheKey = `${DatabaseService.CACHE_KEY_PREFIX}.${key}`;

      await this.setValueInDB(dbPath, cacheKey, JSON.stringify(cachedData));
      log.trace(`[Database] Data cached for key: ${key} (${strategy})`);
    } catch (err) {
      log.error(`[Database] Cache storage failed for key: ${key}`, err);
    }
  }

  async removeCachedData(key: string): Promise<void> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        return;
      }

      const cacheKey = `${DatabaseService.CACHE_KEY_PREFIX}.${key}`;
      await this.removeValueFromDB(dbPath, cacheKey);
      log.trace(`[Database] Cache removed for key: ${key}`);
    } catch (err) {
      log.error(`[Database] Cache removal failed for key: ${key}`, err);
    }
  }

  async clearCache(): Promise<void> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        return;
      }

      return new Promise((resolve, reject) => {
        const db = new Database(dbPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        const query = `DELETE FROM ItemTable WHERE key LIKE '${DatabaseService.CACHE_KEY_PREFIX}.%'`;

        db.run(query, (err) => {
          db.close();
          if (err) {
            reject(err);
          } else {
            log.debug("[Database] All cache data cleared");
            resolve();
          }
        });
      });
    } catch (err) {
      log.error("[Database] Cache clear failed", err);
    }
  }

  async clearAllCache(): Promise<void> {
    await this.clearCache();
  }

  async debugCacheEntry(key: string): Promise<void> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        log.debug(`[Database] No database file exists for cache debug: ${key}`);
        return;
      }

      const cacheKey = `${DatabaseService.CACHE_KEY_PREFIX}.${key}`;
      const cachedValue = await this.getValueFromDB(dbPath, cacheKey);

      if (!cachedValue) {
        log.debug(`[Database] No cache entry found for: ${key}`);
        return;
      }

      try {
        const cachedData = JSON.parse(cachedValue);
        const metadata = cachedData.metadata;
        const now = Date.now();
        const age = Math.round((now - metadata.timestamp) / 1000);
        const ttlRemaining = Math.round((metadata.ttl - (now - metadata.timestamp)) / 1000);

        log.debug(`[Database] Cache entry for '${key}':`);
        log.debug(`  - Strategy: ${metadata.strategy}`);
        log.debug(`  - Age: ${age}s`);
        log.debug(`  - TTL: ${Math.round(metadata.ttl / 1000)}s`);
        log.debug(`  - Remaining: ${ttlRemaining}s`);
        log.debug(`  - Valid: ${await this.isCacheValid(metadata)}`);
        log.debug(`  - Data type: ${typeof cachedData.data}`);

        if (metadata.params) {
          log.debug(`  - Params: ${metadata.params}`);
        }
      } catch (parseError) {
        log.error(`[Database] Failed to parse cache entry for ${key}`, parseError);
      }
    } catch (err) {
      log.error(`[Database] Cache debug failed for key: ${key}`, err);
    }
  }

  /**
   * Check if Cursor state has changed since last check
   */
  async hasStateChanged(): Promise<boolean> {
    try {
      const currentVersion = await this.getCurrentStateVersion();
      const lastKnownVersion = await this.getCachedData<number>("last_state_version");

      if (lastKnownVersion === null) {
        await this.setCachedData("last_state_version", currentVersion, CacheStrategy.PERMANENT);
        return false;
      }

      const hasChanged = currentVersion > lastKnownVersion;
      if (hasChanged) {
        await this.setCachedData("last_state_version", currentVersion, CacheStrategy.PERMANENT);
        log.debug(`[Database] State changed: ${lastKnownVersion} -> ${currentVersion}`);
      }

      return hasChanged;
    } catch (err) {
      log.error("[Database] State change detection failed", err);
      return true;
    }
  }

  private async getCurrentStateVersion(): Promise<number> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        return 0;
      }

      return new Promise((resolve, reject) => {
        const db = new Database(dbPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        const query = `SELECT MAX(rowid) as maxRowId FROM cursorDiskKV`;

        db.get(query, (err, row: any) => {
          db.close();
          if (err) {
            this.getMaxRowIdFromItemTable(dbPath).then(resolve).catch(reject);
          } else {
            resolve(row?.maxRowId || 0);
          }
        });
      });
    } catch (err) {
      log.error("[Database] State version detection failed", err);
      return 0;
    }
  }

  private async getMaxRowIdFromItemTable(dbPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
      });

      const query = `SELECT MAX(rowid) as maxRowId FROM ItemTable`;

      db.get(query, (err, row: any) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve(row?.maxRowId || 0);
        }
      });
    });
  }

  private async isCacheValid(metadata: CacheMetadata): Promise<boolean> {
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
        return now - metadata.timestamp < metadata.ttl;

      default:
        return false;
    }
  }

  private async getValueFromDB(dbPath: string, key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
      });

      const query = `SELECT value FROM ItemTable WHERE key = ?`;
      log.trace(`[Database] Executing query:`, {
        sql: query,
        params: [key],
        dbPath: dbPath,
      });

      db.get(query, [key], (err, row: any) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          log.trace(`[Database] Query result:`, {
            key: key,
            found: !!row,
            value: row?.value ? "exists" : null,
          });
          resolve(row?.value || null);
        }
      });
    });
  }

  private async setValueInDB(dbPath: string, key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
      });

      const query = `INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)`;
      log.trace(`[Database] Executing query:`, {
        sql: query,
        params: [key, "value_length:" + value.length],
        dbPath: dbPath,
      });

      db.run(query, [key, value], (err) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          log.trace(`[Database] Value set successfully:`, {
            key: key,
            valueLength: value.length,
          });
          resolve();
        }
      });
    });
  }

  private async removeValueFromDB(dbPath: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
      });

      const query = `DELETE FROM ItemTable WHERE key = ?`;
      log.trace(`[Database] Executing query:`, {
        sql: query,
        params: [key],
        dbPath: dbPath,
      });

      db.run(query, [key], (err) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          log.trace(`[Database] Value deleted successfully:`, { key: key });
          resolve();
        }
      });
    });
  }

  async getCursorToken(): Promise<string | null> {
    try {
      const dbPath = this.getCursorDBPath();
      log.debug(`[Database] Accessing database at: ${dbPath}`);

      if (!fs.existsSync(dbPath)) {
        log.warn("[Database] Database file does not exist");
        return null;
      }

      return this.extractTokenFromDB(dbPath);
    } catch (err) {
      log.error("[Database] Token extraction failed", err);
      return null;
    }
  }

  async getCursorUserInfo(): Promise<any | null> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        return null;
      }

      return this.extractUserInfoFromDB(dbPath);
    } catch (err) {
      log.error("[Database] User info extraction failed", err);
      return null;
    }
  }

  private getCursorDBPath(): string {
    const config = vscode.workspace.getConfiguration("cursorPulse");
    const customPath = config.get<string>("customDatabasePath");

    if (customPath?.trim()) {
      log.debug(`[Database] Using custom path: ${customPath}`);
      return customPath;
    }

    return this.getDefaultDBPath();
  }

  private getDefaultDBPath(): string {
    const platform = os.platform();
    const homeDir = os.homedir();
    const appName = vscode.env.appName;

    switch (platform) {
      case "darwin":
        return path.join(homeDir, "Library", "Application Support", appName, "User", "globalStorage", "state.vscdb");

      case "win32":
        return path.join(homeDir, "AppData", "Roaming", appName, "User", "globalStorage", "state.vscdb");

      case "linux":
        if (this.isRunningInWSL()) {
          const windowsUsername = this.getWindowsUsername();
          if (windowsUsername) {
            log.debug(`[Database] Using WSL path for user: ${windowsUsername}`);
            return path.join(
              "/mnt/c/Users",
              windowsUsername,
              "AppData/Roaming",
              appName,
              "User/globalStorage/state.vscdb",
            );
          }
        }
        return path.join(homeDir, ".config", appName, "User", "globalStorage", "state.vscdb");

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private isRunningInWSL(): boolean {
    try {
      return (
        vscode.env.remoteName === "wsl" ||
        (fs.existsSync("/proc/version") && fs.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft"))
      );
    } catch {
      return false;
    }
  }

  private getWindowsUsername(): string | undefined {
    try {
      const result = execSync('cmd.exe /C "echo %USERNAME%"', {
        encoding: "utf8",
      });
      return result.trim() || undefined;
    } catch (err) {
      log.error("[Database] Error getting Windows username", err);
      return undefined;
    }
  }

  private async extractTokenFromDB(dbPath: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
      });

      const query = `
        SELECT value 
        FROM ItemTable 
        WHERE key = 'cursorAuth/accessToken' 
        OR key = 'workos.sessionToken'
        OR key LIKE '%cursor%token%'
        OR key LIKE '%session%'
        ORDER BY key
      `;

      log.trace(`[Database] Executing token query:`, {
        sql: query,
        dbPath: dbPath,
      });

      db.get(query, (err, row: any) => {
        db.close();

        if (err) {
          reject(err);
          return;
        }

        log.trace(`[Database] Token query result:`, {
          found: !!row,
          hasValue: !!row?.value,
        });

        if (!row) {
          resolve(null);
          return;
        }

        try {
          let token = row.value;

          try {
            const tokenData = JSON.parse(token);
            token = tokenData?.token || tokenData;
          } catch {
            // Token is not JSON, use as-is
          }

          if (typeof token === "string" && token.includes(".")) {
            resolve(this.processJWTToken(token));
          } else {
            resolve(typeof token === "string" ? token : null);
          }
        } catch (parseError) {
          log.error("[Database] Token parsing error", parseError);
          resolve(null);
        }
      });
    });
  }

  private processJWTToken(token: string): string | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return token;
      }

      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

      if (payload.sub) {
        const userId = payload.sub.split("|")[1] || payload.sub;
        return `${userId}%3A%3A${token}`;
      }

      return token;
    } catch (err) {
      log.error("[Database] JWT processing error", err);
      return token;
    }
  }

  private async extractUserInfoFromDB(dbPath: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
      });

      const query = `
        SELECT key, value 
        FROM ItemTable 
        WHERE key IN (
          'cursorAuth/cachedEmail',
          'cursorAuth/stripeMembershipType'
        )
      `;

      log.trace(`[Database] Executing user info query:`, {
        sql: query,
        dbPath: dbPath,
      });

      db.all(query, (err, rows: any[]) => {
        db.close();

        if (err) {
          reject(err);
          return;
        }

        log.trace(`[Database] User info query result:`, {
          rowCount: rows?.length || 0,
          keys: rows?.map((r) => r.key) || [],
        });

        try {
          const userInfo: any = {};

          for (const row of rows) {
            try {
              const value = typeof row.value === "string" ? row.value : row.value.toString();

              switch (row.key) {
                case "cursorAuth/cachedEmail":
                  userInfo.email = value;
                  break;

                case "cursorAuth/stripeMembershipType":
                  userInfo.membershipType = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
                  break;
              }
            } catch (error) {
              log.debug(`[Database] Error processing row ${row.key}: ${error}`);
            }
          }

          if (userInfo.email || userInfo.membershipType) {
            log.trace(`[Database] Extracted user info:`, {
              hasEmail: !!userInfo.email,
              membershipType: userInfo.membershipType,
            });
            resolve(userInfo);
          } else {
            resolve(null);
          }
        } catch (err) {
          log.error("[Database] User info processing error", err);
          resolve(null);
        }
      });
    });
  }
}
