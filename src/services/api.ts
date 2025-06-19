import { ApiError, NewPricingStatus, PricingModelType } from "../types";
import { log } from "../utils/logger";

export class ApiService {
  private static instance: ApiService;
  private readonly API_BASE_URL = "https://www.cursor.com/api";

  static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private getAuthHeaders(token: string): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `WorkosCursorSessionToken=${token}`,
    };
  }

  async fetchAuthUserInfo(token: string): Promise<any | null> {
    try {
      log.debug("[API] Fetching user authentication info");

      return await this.makeRequest("/auth/me", {
        headers: this.getAuthHeaders(token),
      });
    } catch (err) {
      log.error("[API] Failed to fetch auth user info", err);
      return null;
    }
  }

  async fetchUsageData(token: string): Promise<any | null> {
    try {
      const userId = token.split("%3A%3A")[0];
      log.debug(`[API] Fetching usage data for user ${userId.substring(0, 8)}...`);

      return await this.makeRequest("/usage", {
        params: { user: userId },
        headers: this.getAuthHeaders(token),
      });
    } catch (err) {
      log.error("[API] Failed to fetch usage data", err);
      return null;
    }
  }

  async checkUsageBasedStatus(token: string): Promise<any | null> {
    try {
      log.debug("[API] Checking usage-based pricing status");

      return await this.makeRequest("/dashboard/get-hard-limit", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body: {},
      });
    } catch (err) {
      log.error("[API] Failed to check usage-based status", err);
      return null;
    }
  }

  async fetchMonthlyUsage(token: string, month: number, year: number): Promise<any | null> {
    try {
      log.debug(`[API] Fetching monthly usage for ${year}-${month.toString().padStart(2, "0")}`);

      return await this.makeRequest("/dashboard/get-monthly-invoice", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body: {
          month,
          year,
          includeUsageEvents: true,
        },
      });
    } catch (err) {
      log.error(`[API] Failed to fetch monthly usage for ${year}-${month}`, err);
      return null;
    }
  }

  async fetchFilteredUsageEvents(token: string, daysBack: number = 7, pageSize: number = 20): Promise<any | null> {
    try {
      log.debug(`[API] Fetching usage events for last ${daysBack} days`);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      return await this.makeRequest("/dashboard/get-filtered-usage-events", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body: {
          teamId: 0,
          startDate: startDate.getTime().toString(),
          endDate: endDate.getTime().toString(),
          page: 1,
          pageSize,
        },
      });
    } catch (err) {
      log.error("[API] Failed to fetch filtered usage events", err);
      return null;
    }
  }

  async fetchUserAnalytics(token: string, timePeriod: string = "1d"): Promise<any | null> {
    try {
      log.debug(`[API] Fetching user analytics for period: ${timePeriod}`);

      const { startDate, endDate } = this.calculateAnalyticsDateRange(timePeriod);

      return await this.makeRequest("/dashboard/get-user-analytics", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body: {
          teamId: 0,
          userId: 0,
          startDate: startDate.getTime().toString(),
          endDate: endDate.getTime().toString(),
        },
      });
    } catch (err) {
      log.error("[API] Failed to fetch user analytics", err);
      return null;
    }
  }

  async setUsageBasedLimit(token: string, limitUSD: number): Promise<boolean> {
    try {
      log.debug(`[API] Setting usage-based limit to $${limitUSD}`);

      const response = await this.makeRequest("/dashboard/set-hard-limit", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body: { hardLimit: limitUSD },
      });

      if (response) {
        log.info(`[API] Usage-based limit set to $${limitUSD}`);
        return true;
      }
      return false;
    } catch (err) {
      log.error("[API] Failed to set usage-based limit", err);
      return false;
    }
  }

  async enableUsageBasedPricing(token: string, limitUSD?: number): Promise<boolean> {
    try {
      log.debug(`[API] Enabling usage-based pricing${limitUSD ? ` with $${limitUSD} limit` : ""}`);

      const body: any = { noUsageBasedAllowed: false };
      if (limitUSD) {
        body.hardLimit = limitUSD;
      }

      const response = await this.makeRequest("/dashboard/set-hard-limit", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body,
      });

      if (response) {
        log.info(`[API] Usage-based pricing enabled${limitUSD ? ` with $${limitUSD} limit` : ""}`);
        return true;
      }
      return false;
    } catch (err) {
      log.error("[API] Failed to enable usage-based pricing", err);
      return false;
    }
  }

  async disableUsageBasedPricing(token: string): Promise<boolean> {
    try {
      log.debug("[API] Disabling usage-based pricing");

      const response = await this.makeRequest("/dashboard/set-hard-limit", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body: { hardLimit: 0, noUsageBasedAllowed: true, hardLimitPerUser: 0 },
      });

      if (response) {
        log.info("[API] Usage-based pricing disabled");
        return true;
      }
      return false;
    } catch (err) {
      log.error("[API] Failed to disable usage-based pricing", err);
      return false;
    }
  }

  async checkNewPricingStatus(token: string): Promise<{ isOnNewPricing: boolean } | null> {
    try {
      log.debug("[API] Checking new pricing model status");

      const response = await this.makeRequest("/dashboard/is-on-new-pricing", {
        method: "POST",
        headers: this.getAuthHeaders(token),
        body: {},
      });

      if (response && typeof response.isOnNewPricing === "boolean") {
        log.debug(`[API] Pricing model status: ${response.isOnNewPricing ? "new unlimited" : "legacy quota"}`);
        return response;
      }

      log.warn("[API] Invalid response format for pricing status");
      return null;
    } catch (err) {
      log.warn("[API] Failed to check new pricing status, assuming legacy model", err);
      // TODO: move to dataService
      return { isOnNewPricing: false };
    }
  }

  private calculateAnalyticsDateRange(timePeriod: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (timePeriod) {
      case "1d":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "7d":
        const dayOfWeek = startDate.getDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(startDate.getDate() - daysFromMonday);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "30d":
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        log.debug(`[API] Invalid time period '${timePeriod}', using 7d fallback`);
        const dayOfWeekDefault = startDate.getDay();
        const daysFromMondayDefault = dayOfWeekDefault === 0 ? 6 : dayOfWeekDefault - 1;
        startDate.setDate(startDate.getDate() - daysFromMondayDefault);
        startDate.setHours(0, 0, 0, 0);
    }

    return { startDate, endDate };
  }

  private async makeRequest(
    endpoint: string,
    options: {
      method?: string;
      params?: Record<string, string>;
      headers?: Record<string, string>;
      body?: any;
    } = {},
  ): Promise<any | null> {
    try {
      let url = `${this.API_BASE_URL}${endpoint}`;

      if (options.params) {
        const params = new URLSearchParams(options.params);
        url += `?${params.toString()}`;
      }

      const requestOptions: RequestInit = {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...options.headers,
        },
      };

      if (options.body && options.method !== "GET") {
        requestOptions.body = JSON.stringify(options.body);
      }

      log.trace(`[API] Request to ${endpoint}:`, {
        method: options.method || "GET",
        url,
        params: options.params,
        body: options.body,
        headers: { ...requestOptions.headers, Cookie: "***" },
      });

      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      log.trace(`[API] Response from ${endpoint}:`, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data: JSON.stringify(data, null, 2),
      });

      return data;
    } catch (err) {
      log.error(`[API] Request failed: ${options.method || "GET"} ${endpoint}`, err);
      return null;
    }
  }

  createApiError(error: any): ApiError {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return {
        type: "network",
        message: "Network connection failed",
        retryable: true,
      };
    }

    if (error.message.includes("401") || error.message.includes("403")) {
      return {
        type: "auth",
        message: "Authentication failed",
        retryable: false,
      };
    }

    if (error.message.includes("HTTP")) {
      return {
        type: "api",
        message: error.message,
        retryable: true,
      };
    }

    return {
      type: "unknown",
      message: error.message || "Unknown error occurred",
      retryable: true,
    };
  }
}
