import * as vscode from "vscode";

let logChannel: vscode.LogOutputChannel | undefined;

export function initializeLogger(): void {
  if (!logChannel) {
    logChannel = vscode.window.createOutputChannel("Cursor Pulse", { log: true });
  }
}

export const log = {
  trace(message: string, ...args: any[]): void {
    if (logChannel) {
      logChannel.trace(message, ...args);
    }
  },

  debug(message: string, ...args: any[]): void {
    if (logChannel) {
      logChannel.debug(message, ...args);
    }
  },

  info(message: string, ...args: any[]): void {
    if (logChannel) {
      logChannel.info(message, ...args);
    }
  },

  warn(message: string, ...args: any[]): void {
    if (logChannel) {
      logChannel.warn(message, ...args);
    }
  },

  error(message: string, error?: any): void {
    if (logChannel) {
      if (error) {
        logChannel.error(message, error);
      } else {
        logChannel.error(message);
      }
    }
  },

  isDebugEnabled(): boolean {
    return logChannel ? logChannel.logLevel <= vscode.LogLevel.Debug : false;
  },

  isTraceEnabled(): boolean {
    return logChannel ? logChannel.logLevel <= vscode.LogLevel.Trace : false;
  },
};

export function getLogger(): vscode.LogOutputChannel {
  if (!logChannel) {
    throw new Error("Logger not initialized. Call initializeLogger() first.");
  }
  return logChannel;
}

export function showOutputChannel(): void {
  if (logChannel) {
    logChannel.show();
  }
}
