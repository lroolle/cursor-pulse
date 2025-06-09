import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as vscode from "vscode";
import initSqlJs, { Database } from "sql.js";
import { execSync } from "child_process";
import { log } from "../utils/logger";

export class DatabaseService {
  private static instance: DatabaseService;
  private sqlWasm: any = null;

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private async initSqlJs(): Promise<any> {
    if (!this.sqlWasm) {
      const wasmPath = path.join(__dirname, "sql-wasm.wasm");
      this.sqlWasm = await initSqlJs({
        locateFile: (file: string) => {
          if (file.endsWith(".wasm")) {
            return wasmPath;
          }
          return file;
        },
      });
    }
    return this.sqlWasm;
  }

  /**
   * Check if Cursor state has changed since last check
   * This is read-only and safe to use
   */
  async hasStateChanged(): Promise<boolean> {
    try {
      const currentVersion = await this.getCurrentStateVersion();
      // We'll need to implement this check differently now that we don't cache in ItemTable
      // For now, return true to always assume state has changed
      return true;
    } catch (err) {
      log.error("[DatabaseService] State change detection failed", err);
      return true;
    }
  }

  async getCurrentStateVersion(): Promise<number> {
    let db: Database | null = null;
    let stmt: any = null;
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        return 0;
      }

      const SQL = await this.initSqlJs();
      const data = fs.readFileSync(dbPath);
      db = new SQL.Database(data);

      let query = `SELECT MAX(rowid) as maxRowId FROM cursorDiskKV`;

      try {
        stmt = db!.prepare(query);
        const result = stmt.getAsObject();
        return Number(result.maxRowId) || 0;
      } catch (err) {
        // Fallback to ItemTable if cursorDiskKV doesn't exist
        log.debug("[DatabaseService] cursorDiskKV table not found, falling back to ItemTable");
        return await this.getMaxRowIdFromItemTable(dbPath);
      }
    } catch (err) {
      log.error("[DatabaseService] State version detection failed", err);
      return 0;
    } finally {
      if (stmt) {
        try {
          stmt.free();
        } catch (freeErr) {
          log.warn("[DatabaseService] Error freeing statement", freeErr);
        }
      }
      if (db) {
        try {
          db.close();
        } catch (closeErr) {
          log.warn("[DatabaseService] Error closing database connection", closeErr);
        }
      }
    }
  }

  private async getMaxRowIdFromItemTable(dbPath: string): Promise<number> {
    let db: Database | null = null;
    let stmt: any = null;
    try {
      const SQL = await this.initSqlJs();
      const data = fs.readFileSync(dbPath);
      db = new SQL.Database(data);

      const query = `SELECT MAX(rowid) as maxRowId FROM ItemTable`;
      stmt = db!.prepare(query);

      let result: any = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }

      return Number(result?.maxRowId) || 0;
    } catch (err) {
      log.error("[DatabaseService] Max row ID query failed", err);
      return 0;
    } finally {
      if (stmt) {
        try {
          stmt.free();
        } catch (freeErr) {
          log.warn("[DatabaseService] Error freeing statement", freeErr);
        }
      }
      if (db) {
        try {
          db.close();
        } catch (closeErr) {
          log.warn("[DatabaseService] Error closing database connection", closeErr);
        }
      }
    }
  }

  private validateAndNormalizePath(customPath: string): string | null {
    try {
      // Normalize the path to resolve relative components
      const normalized = path.normalize(customPath);

      // Check for path traversal attempts
      if (normalized.includes("..")) {
        log.warn(`[DatabaseService] Path traversal detected in: ${customPath}`);
        return null;
      }

      // Ensure path is absolute for security
      const resolved = path.resolve(normalized);

      // Validate file extension
      if (!resolved.endsWith(".vscdb") && !resolved.endsWith(".db")) {
        log.warn(`[DatabaseService] Invalid database file extension: ${resolved}`);
        return null;
      }

      return resolved;
    } catch (err) {
      log.error(`[DatabaseService] Path validation failed for: ${customPath}`, err);
      return null;
    }
  }

  private getCursorDBPath(): string {
    const config = vscode.workspace.getConfiguration("cursorPulse");
    const customPath = config.get<string>("customDatabasePath");

    if (customPath?.trim()) {
      const validatedPath = this.validateAndNormalizePath(customPath.trim());
      if (validatedPath) {
        log.debug(`[DatabaseService] Using custom path: ${validatedPath}`);
        return validatedPath;
      } else {
        log.warn(`[DatabaseService] Invalid custom path provided: ${customPath}, falling back to default`);
      }
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
            log.debug(`[DatabaseService] Using WSL path for user: ${windowsUsername}`);
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
      log.error("[DatabaseService] Error getting Windows username", err);
      return undefined;
    }
  }

  /**
   * Read-only operation to get Cursor token from the database
   * This is safe as we're only reading, not modifying the database
   */
  async getCursorToken(): Promise<string | null> {
    try {
      const dbPath = this.getCursorDBPath();
      log.debug(`[DatabaseService] Accessing database at: ${dbPath}`);

      if (!fs.existsSync(dbPath)) {
        log.warn("[DatabaseService] Database file does not exist");
        return null;
      }

      return this.extractTokenFromDB(dbPath);
    } catch (err) {
      log.error("[DatabaseService] Token extraction failed", err);
      return null;
    }
  }

  /**
   * Read-only operation to get Cursor user info from the database
   * This is safe as we're only reading, not modifying the database
   */
  async getCursorUserInfo(): Promise<any | null> {
    try {
      const dbPath = this.getCursorDBPath();
      if (!fs.existsSync(dbPath)) {
        return null;
      }

      return this.extractUserInfoFromDB(dbPath);
    } catch (err) {
      log.error("[DatabaseService] User info extraction failed", err);
      return null;
    }
  }

  private async extractTokenFromDB(dbPath: string): Promise<string | null> {
    try {
      const SQL = await this.initSqlJs();
      const data = fs.readFileSync(dbPath);
      const db = new SQL.Database(data);

      const query = `
        SELECT value
        FROM ItemTable
        WHERE key = 'cursorAuth/accessToken'
        OR key = 'workos.sessionToken'
        ORDER BY key
      `;

      log.trace(`[DatabaseService] Executing token query:`, {
        sql: query,
        dbPath: dbPath,
      });

      const stmt = db.prepare(query);
      let result: any = null;

      // Step through results to find the first valid token
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.value) {
          result = row;
          break;
        }
      }

      stmt.free();
      db.close();

      log.trace(`[DatabaseService] Token query result:`, {
        found: !!result,
        hasValue: !!result?.value,
      });

      if (!result || !result.value) {
        return null;
      }

      try {
        let token = String(result.value);

        try {
          const tokenData = JSON.parse(token);
          token = tokenData?.token || tokenData;
        } catch {
          // Token is not JSON, use as-is
        }

        if (typeof token === "string" && token.includes(".")) {
          return this.processJWTToken(token);
        } else {
          return typeof token === "string" ? token : null;
        }
      } catch (parseError) {
        log.error("[DatabaseService] Token parsing error", parseError);
        return null;
      }
    } catch (err) {
      log.error("[DatabaseService] Token extraction failed", err);
      return null;
    }
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
      log.error("[DatabaseService] JWT processing error", err);
      return token;
    }
  }

  private async extractUserInfoFromDB(dbPath: string): Promise<any | null> {
    try {
      const SQL = await this.initSqlJs();
      const data = fs.readFileSync(dbPath);
      const db = new SQL.Database(data);

      const query = `
        SELECT key, value
        FROM ItemTable
        WHERE key IN (
          'cursorAuth/cachedEmail',
          'cursorAuth/stripeMembershipType'
        )
      `;

      log.trace(`[DatabaseService] Executing user info query:`, {
        sql: query,
        dbPath: dbPath,
      });

      const stmt = db.prepare(query);
      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      db.close();

      log.trace(`[DatabaseService] User info query result:`, {
        rowCount: rows?.length || 0,
        keys: rows?.map((r) => r.key) || [],
      });

      try {
        const userInfo: any = {};

        for (const row of rows) {
          try {
            const value = typeof row.value === "string" ? row.value : String(row.value);

            switch (row.key) {
              case "cursorAuth/cachedEmail":
                userInfo.email = value;
                break;

              case "cursorAuth/stripeMembershipType":
                userInfo.membershipType = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
                break;
            }
          } catch (error) {
            log.debug(`[DatabaseService] Error processing row ${row.key}: ${error}`);
          }
        }

        if (userInfo.email || userInfo.membershipType) {
          log.trace(`[DatabaseService] Extracted user info:`, {
            hasEmail: !!userInfo.email,
            membershipType: userInfo.membershipType,
          });
          return userInfo;
        } else {
          return null;
        }
      } catch (err) {
        log.error("[DatabaseService] User info processing error", err);
        return null;
      }
    } catch (err) {
      log.error("[DatabaseService] User info extraction failed", err);
      return null;
    }
  }
}
