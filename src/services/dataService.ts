import {
  QuotaData,
  CursorStats,
  UserInfo,
  FilteredUsageResponse,
  CacheStrategy,
  AuthUserInfo,
  AnalyticsData,
  UsageBasedStatus,
  MonthlyUsage,
  UsageItem,
  PeriodInfo,
} from "../types";
import { ApiService } from "./api";
import { DatabaseService } from "./database";
import { log } from "../utils/logger";
import { DateUtils } from "../utils/dateUtils";

export interface DataFetchOptions {
  forceRefresh?: boolean;
  token: string;
}

export interface UsageData {
  quota: QuotaData;
  stats: CursorStats;
  userInfo: UserInfo | null;
  usageEvents: FilteredUsageResponse | null;
  analyticsData: AnalyticsData | null;
}

export interface DataFetchContext {
  quotaPercentage: number;
  usageBasedEnabled: boolean;
  lastQuotaCheck: number;
  isQuotaExhausted: boolean;
}

export class DataService {
  private static instance: DataService;
  private readonly apiService: ApiService;
  private readonly dbService: DatabaseService;
  private lastFetchContext: DataFetchContext | null = null;

  private static readonly CACHE_TTL = {
    PREMIUM_QUOTA_NORMAL: 1 * 60 * 1000,
    PREMIUM_QUOTA_EXHAUSTED: 24 * 60 * 60 * 1000,
    USAGE_BASED_PRICING_NORMAL: 30 * 60 * 1000,
    USAGE_BASED_PRICING_EXHAUSTED: 1 * 60 * 1000,
    USAGE_EVENTS: 1 * 60 * 1000,
    USER_INFO: 24 * 60 * 60 * 1000,
    ANALYTICS_1D: 1 * 60 * 1000,
    ANALYTICS_7D: 15 * 60 * 1000,
    ANALYTICS_30D: 60 * 60 * 1000,
  };

  private constructor() {
    this.apiService = ApiService.getInstance();
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  async fetchPremiumQuota(options: DataFetchOptions): Promise<QuotaData | null> {
    const cacheKey = "premium_quota";
    log.trace("[DataService] Fetching premium quota:", { options, cacheKey });

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<QuotaData>(cacheKey);
      if (cached) {
        this.updateFetchContext(cached, false);
        log.trace("[DataService] Premium quota cache hit:", {
          data: cached,
          context: this.lastFetchContext,
        });
        return cached;
      }
    }

    const usageResponse = await this.apiService.fetchUsageData(options.token);
    if (!usageResponse) {
      return null;
    }

    log.trace("[DataService] Raw usage response:", {
      gpt4Data: usageResponse["gpt-4"],
      startOfMonth: usageResponse.startOfMonth,
    });

    const quota: QuotaData = {
      current: usageResponse["gpt-4"].numRequests,
      limit: usageResponse["gpt-4"].maxRequestUsage,
      percentage: Math.round((usageResponse["gpt-4"].numRequests / usageResponse["gpt-4"].maxRequestUsage) * 100),
      period: DateUtils.calculatePeriod(usageResponse.startOfMonth),
      lastUpdated: new Date(),
    };

    const ttl =
      quota.current >= quota.limit
        ? DataService.CACHE_TTL.PREMIUM_QUOTA_EXHAUSTED
        : DataService.CACHE_TTL.PREMIUM_QUOTA_NORMAL;
    log.trace("[DataService] Setting quota cache:", {
      quota,
      ttl,
      cacheKey,
    });

    await this.dbService.setCachedData(cacheKey, quota, CacheStrategy.TIME_BASED, ttl);

    this.updateFetchContext(quota, false);
    return quota;
  }

  async fetchQuota(options: DataFetchOptions): Promise<QuotaData | null> {
    const cacheKey = "premium_quota_detailed";

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<QuotaData>(cacheKey);
      if (cached) {
        log.trace("[DataService] Premium quota cache hit");
        this.updateFetchContext(cached, false);
        return cached;
      }
    }

    log.debug("[DataService] Fetching premium quota from API");
    const usageResponse = await this.apiService.fetchUsageData(options.token);
    if (!usageResponse) {
      return null;
    }

    const quota: QuotaData = {
      current: usageResponse["gpt-4"].numRequests,
      limit: usageResponse["gpt-4"].maxRequestUsage,
      percentage: Math.round((usageResponse["gpt-4"].numRequests / usageResponse["gpt-4"].maxRequestUsage) * 100),
      period: DateUtils.calculatePeriod(usageResponse.startOfMonth),
      lastUpdated: new Date(),
    };

    const ttl =
      quota.current >= quota.limit
        ? DataService.CACHE_TTL.PREMIUM_QUOTA_EXHAUSTED
        : DataService.CACHE_TTL.PREMIUM_QUOTA_NORMAL;
    await this.dbService.setCachedData(cacheKey, quota, CacheStrategy.TIME_BASED, ttl);

    this.updateFetchContext(quota, false);
    return quota;
  }

  async fetchUsageBasedPricingData(options: DataFetchOptions): Promise<any | null> {
    const cacheKey = "usage_based_pricing";

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<any>(cacheKey);
      if (cached) {
        log.trace("[DataService] Usage-based pricing cache hit");
        return cached;
      }
    }

    log.debug("[DataService] Fetching usage-based pricing data");

    const usageBasedStatusResponse = await this.apiService.checkUsageBasedStatus(options.token);
    if (!usageBasedStatusResponse) {
      return null;
    }

    const status: UsageBasedStatus = {
      isEnabled: !usageBasedStatusResponse.noUsageBasedAllowed,
      limit: usageBasedStatusResponse.hardLimit,
    };

    if (!status.isEnabled) {
      await this.dbService.setCachedData(
        cacheKey,
        { status, currentMonth: null, lastMonth: null },
        CacheStrategy.TIME_BASED,
        5 * 60 * 1000,
      );
      return { status, currentMonth: null, lastMonth: null };
    }
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    log.debug("[DataService] Fetching monthly usage data for usage-based pricing with context-aware caching");

    const [currentMonthResponse, lastMonthResponse] = await Promise.all([
      this.fetchMonthlyUsageWithContextAwareCaching(options, currentMonth, currentYear),
      this.fetchMonthlyUsageWithContextAwareCaching(options, lastMonth, lastYear),
    ]);

    const currentMonthData = this.parseMonthlyUsage(currentMonthResponse);
    const lastMonthData = this.parseMonthlyUsage(lastMonthResponse);

    const usageBasedPricingData = {
      currentMonth: currentMonthData || {
        items: [],
        totalCost: 0,
        hasUnpaidInvoice: false,
      },
      lastMonth: lastMonthData || {
        items: [],
        totalCost: 0,
        hasUnpaidInvoice: false,
      },
      status,
    };

    const isQuotaExhausted = this.lastFetchContext?.isQuotaExhausted || false;
    const ttl = isQuotaExhausted
      ? DataService.CACHE_TTL.USAGE_BASED_PRICING_EXHAUSTED
      : DataService.CACHE_TTL.USAGE_BASED_PRICING_NORMAL;

    await this.dbService.setCachedData(cacheKey, usageBasedPricingData, CacheStrategy.TIME_BASED, ttl);

    return usageBasedPricingData;
  }

  private async fetchMonthlyUsageWithContextAwareCaching(
    options: DataFetchOptions,
    month: number,
    year: number,
  ): Promise<any> {
    const cacheKey = `monthly_usage_${month}_${year}`;
    const currentDate = new Date();
    const isCurrentMonth = month === currentDate.getMonth() + 1 && year === currentDate.getFullYear();

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<any>(cacheKey);
      if (cached) {
        log.trace(`[DataService] Monthly usage cache hit for ${year}-${month}`);
        return cached;
      }
    }

    log.debug(`[DataService] Fetching monthly usage for ${year}-${month}`);
    const response = await this.apiService.fetchMonthlyUsage(options.token, month, year);

    if (response) {
      const monthlyUsage = this.parseMonthlyUsage(response);

      if (monthlyUsage) {
        const strategy = isCurrentMonth ? CacheStrategy.TIME_BASED : CacheStrategy.PERMANENT;
        let ttl = 0;

        if (isCurrentMonth) {
          const isQuotaExhausted = this.lastFetchContext?.isQuotaExhausted || false;
          ttl = isQuotaExhausted
            ? DataService.CACHE_TTL.USAGE_BASED_PRICING_EXHAUSTED
            : DataService.CACHE_TTL.USAGE_BASED_PRICING_NORMAL;
        }

        await this.dbService.setCachedData(cacheKey, monthlyUsage, strategy, ttl, `${month}_${year}`);
        return monthlyUsage;
      }
    }

    return null;
  }

  private async shouldFetchUsageBasedData(quotaPercentage: number): Promise<boolean> {
    if (quotaPercentage >= 95) {
      return true;
    }

    const cachedStatus = await this.dbService.getCachedData<UsageBasedStatus>("usage_based_status");
    if (cachedStatus?.isEnabled) {
      return true;
    }

    if (quotaPercentage < 80) {
      return false;
    }

    return true;
  }

  private updateFetchContext(quota: QuotaData, usageBasedEnabled: boolean): void {
    const previousContext = this.lastFetchContext;
    const isQuotaExhausted = quota.current >= quota.limit;

    if (previousContext && previousContext.isQuotaExhausted !== isQuotaExhausted) {
      log.debug(
        `[DataService] Quota exhaustion status changed: ${previousContext.isQuotaExhausted} → ${isQuotaExhausted}, invalidating usage-based caches`,
      );
      this.invalidateUsageBasedCaches();
    }

    this.lastFetchContext = {
      quotaPercentage: quota.percentage,
      usageBasedEnabled,
      lastQuotaCheck: Date.now(),
      isQuotaExhausted,
    };
  }

  public getFetchContext(): DataFetchContext | null {
    return this.lastFetchContext;
  }

  private parseMonthlyUsage(response: any): MonthlyUsage | null {
    if (!response?.items) {
      return null;
    }

    const items: UsageItem[] = [];
    let totalCost = 0;

    for (const item of response.items) {
      if (!item.hasOwnProperty("cents") || typeof item.cents === "undefined") {
        continue;
      }

      if (item.description.includes("Mid-month usage paid")) {
        continue;
      }

      const cost = item.cents / 100;
      if (cost > 0) {
        items.push({
          description: item.description,
          totalCost: cost,
          cents: item.cents,
        });

        totalCost += cost;
      }
    }

    items.sort((a, b) => (b.cents || 0) - (a.cents || 0));

    return {
      items,
      totalCost,
      hasUnpaidInvoice: response.hasUnpaidMidMonthInvoice || false,
    };
  }

  async fetchUserInfo(options: DataFetchOptions): Promise<UserInfo | null> {
    log.debug("[DataService] Fetching user information");

    const [apiUserInfo, dbUserInfo] = await Promise.all([this.fetchApiUserInfo(options), this.fetchDbUserInfo()]);

    log.trace("[DataService] Raw user info sources:", {
      apiUserInfo: apiUserInfo
        ? {
            ...apiUserInfo,
            sub: apiUserInfo.sub ? `${apiUserInfo.sub.substring(0, 8)}...` : null,
          }
        : null,
      dbUserInfo,
    });

    const combinedInfo = this.combineUserInfo(apiUserInfo, dbUserInfo);
    log.trace("[DataService] Combined user info:", {
      result: combinedInfo,
      source: combinedInfo ? (apiUserInfo && dbUserInfo ? "both" : apiUserInfo ? "api" : "db") : "none",
    });

    return combinedInfo;
  }

  private async fetchApiUserInfo(options: DataFetchOptions): Promise<AuthUserInfo | null> {
    const cacheKey = "api_user_info";

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<AuthUserInfo>(cacheKey);
      if (cached) {
        log.trace("[DataService] API user info cache hit");
        return cached;
      }
    }

    const response = await this.apiService.fetchAuthUserInfo(options.token);

    if (response) {
      const authUserInfo: AuthUserInfo = {
        email: response.email,
        email_verified: response.email_verified,
        name: response.name,
        sub: response.sub,
        updated_at: response.updated_at,
        picture: response.picture,
      };

      await this.dbService.setCachedData(
        cacheKey,
        authUserInfo,
        CacheStrategy.TIME_BASED,
        DataService.CACHE_TTL.USER_INFO,
      );

      return authUserInfo;
    }

    return null;
  }

  private async fetchDbUserInfo(): Promise<any | null> {
    return await this.dbService.getCursorUserInfo();
  }

  private combineUserInfo(apiUserInfo: AuthUserInfo | null, dbUserInfo: any | null): UserInfo | null {
    if (apiUserInfo && dbUserInfo) {
      log.debug("[DataService] Combining API and database user info");
      return {
        id: apiUserInfo.sub || "unknown",
        email: apiUserInfo.email || dbUserInfo.email || "unknown",
        name: apiUserInfo.name || "unknown",
        membershipType: dbUserInfo.membershipType,
      };
    } else if (dbUserInfo) {
      log.debug("[DataService] Using database fallback for user info");
      const displayName = dbUserInfo.email?.includes("@")
        ? dbUserInfo.email.split("@")[0]
        : dbUserInfo.email || "unknown";

      return {
        id: "unknown",
        email: dbUserInfo.email || "unknown",
        name: displayName,
        membershipType: dbUserInfo.membershipType,
      };
    } else if (apiUserInfo) {
      log.debug("[DataService] Using API-only user info");
      return {
        id: apiUserInfo.sub || "unknown",
        email: apiUserInfo.email || "unknown",
        name: apiUserInfo.name || "unknown",
        membershipType: undefined,
      };
    }

    return null;
  }

  async fetchUsageEvents(
    options: DataFetchOptions,
    daysBack: number = 7,
    pageSize: number = 100,
  ): Promise<FilteredUsageResponse | null> {
    const cacheKey = `usage_events_${daysBack}_${pageSize}`;

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<FilteredUsageResponse>(cacheKey);
      if (cached) {
        log.trace("[DataService] Usage events cache data:", JSON.stringify(cached, null, 2));
        return cached;
      }
    }

    log.debug(`[DataService] Fetching usage events (${daysBack}d, ${pageSize} items)`);
    const response = await this.apiService.fetchFilteredUsageEvents(options.token, daysBack, pageSize);

    if (response) {
      const usageEvents: FilteredUsageResponse = {
        usageEvents: response.usageEvents || [],
        totalUsageEventsCount: response.totalUsageEventsCount || 0,
      };

      await this.dbService.setCachedData(
        cacheKey,
        usageEvents,
        CacheStrategy.PARAM_BASED,
        DataService.CACHE_TTL.USAGE_EVENTS,
        `${daysBack}_${pageSize}`,
      );

      log.trace("[DataService] Fresh usage events data:", JSON.stringify(usageEvents, null, 2));
      return usageEvents;
    }

    return null;
  }

  async fetchAnalyticsData(options: DataFetchOptions, timePeriod: string = "1d"): Promise<AnalyticsData | null> {
    const cacheKey = `analytics_data_${timePeriod}`;

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<AnalyticsData>(cacheKey);
      if (cached) {
        log.trace(`[DataService] Analytics cache data for ${timePeriod}:`, JSON.stringify(cached, null, 2));
        return cached;
      }
    }

    log.debug(`[DataService] Fetching analytics data for ${timePeriod}`);

    try {
      const response = await this.apiService.fetchUserAnalytics(options.token, timePeriod);

      if (response) {
        log.debug(`[DataService] Analytics API response for ${timePeriod}:`, JSON.stringify(response, null, 2));

        if (response.dailyMetrics && Array.isArray(response.dailyMetrics)) {
          let totalLinesEdited = 0;
          let totalTabsAccepted = 0;
          let totalRequests = 0;

          for (const dayMetrics of response.dailyMetrics) {
            totalLinesEdited += (dayMetrics.acceptedLinesAdded || 0) + (dayMetrics.acceptedLinesDeleted || 0);
            totalTabsAccepted += dayMetrics.totalTabsAccepted || 0;
            totalRequests +=
              (dayMetrics.agentRequests || 0) + (dayMetrics.chatRequests || 0) + (dayMetrics.composerRequests || 0);
          }

          const analyticsData: AnalyticsData = {
            totalLinesEdited,
            totalTabsAccepted,
            totalRequests,
            period: response.period,
          };

          const cacheTTL = this.getAnalyticsCacheTTL(timePeriod);
          await this.dbService.setCachedData(cacheKey, analyticsData, CacheStrategy.PARAM_BASED, cacheTTL, timePeriod);

          log.trace(
            `[DataService] Processed analytics data for ${timePeriod}:`,
            JSON.stringify(analyticsData, null, 2),
          );
          return analyticsData;
        } else if (response.period) {
          log.debug(
            `[DataService] API returned period-only response for ${timePeriod}, checking for existing cached data`,
          );

          const existingCached = await this.dbService.getCachedData<AnalyticsData>(cacheKey);
          if (existingCached) {
            log.debug(`[DataService] Using existing cached analytics data for ${timePeriod}`);
            return existingCached;
          }

          const emptyAnalyticsData: AnalyticsData = {
            totalLinesEdited: 0,
            totalTabsAccepted: 0,
            totalRequests: 0,
            period: response.period,
          };

          log.debug(
            `[DataService] Created empty analytics data for ${timePeriod} with API period - will be hidden in UI`,
          );
          return emptyAnalyticsData;
        } else {
          log.debug(
            `[DataService] Unexpected analytics response structure for ${timePeriod}: ${JSON.stringify(response)}`,
          );
        }
      } else {
        log.debug(`[DataService] No analytics response for ${timePeriod}`);
      }
    } catch (error) {
      log.error(`[DataService] Failed to fetch analytics data for ${timePeriod}`, error);

      const cachedFallback = await this.dbService.getCachedData<AnalyticsData>(cacheKey);
      if (cachedFallback) {
        log.debug(`[DataService] Using cached fallback analytics data for ${timePeriod}`);
        return cachedFallback;
      }
    }

    return null;
  }

  private getAnalyticsCacheTTL(timePeriod: string): number {
    switch (timePeriod) {
      case "1d":
        return DataService.CACHE_TTL.ANALYTICS_1D;
      case "7d":
        return DataService.CACHE_TTL.ANALYTICS_7D;
      case "30d":
        return DataService.CACHE_TTL.ANALYTICS_30D;
      default:
        return DataService.CACHE_TTL.ANALYTICS_7D;
    }
  }

  async fetchMonthlyUsage(options: DataFetchOptions, month: number, year: number): Promise<any> {
    return this.fetchMonthlyUsageWithContextAwareCaching(options, month, year);
  }

  async fetchUsageBasedStatus(options: DataFetchOptions): Promise<UsageBasedStatus | null> {
    const cacheKey = "usage_based_status";

    if (!options.forceRefresh) {
      const cached = await this.dbService.getCachedData<UsageBasedStatus>(cacheKey);
      if (cached) {
        log.trace("[DataService] Usage-based status cache hit");
        return cached;
      }
    }

    log.debug("[DataService] Fetching usage-based pricing status");
    const response = await this.apiService.checkUsageBasedStatus(options.token);

    if (response) {
      const status: UsageBasedStatus = {
        isEnabled: !response.noUsageBasedAllowed,
        limit: response.hardLimit,
      };

      await this.dbService.setCachedData(cacheKey, status, CacheStrategy.TIME_BASED, 60 * 60 * 1000);

      return status;
    }

    return null;
  }

  async getCurrentMonthPeriod(forceRefresh: boolean = false): Promise<PeriodInfo> {
    const cacheKey = "current_month_period";

    if (!forceRefresh) {
      const cached = await this.dbService.getCachedData<PeriodInfo>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    log.debug("[DataService] Calculating current month period");
    const periodInfo = DateUtils.calculateCurrentMonthPeriod();

    await this.dbService.setCachedData(cacheKey, periodInfo, CacheStrategy.TIME_BASED, 60 * 60 * 1000);

    return periodInfo;
  }

  async getUsageBasedPeriod(forceRefresh: boolean = false): Promise<PeriodInfo> {
    const cacheKey = "usage_based_period";

    if (!forceRefresh) {
      const cached = await this.dbService.getCachedData<PeriodInfo>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    log.debug("[DataService] Calculating usage-based billing period");
    const periodInfo = DateUtils.calculateUsageBasedPeriod();

    await this.dbService.setCachedData(cacheKey, periodInfo, CacheStrategy.TIME_BASED, 60 * 60 * 1000);

    return periodInfo;
  }

  async fetchAllUsageData(options: DataFetchOptions, analyticsTimePeriod: string = "1d"): Promise<UsageData | null> {
    try {
      log.debug("[DataService] Starting comprehensive usage data fetch");
      log.trace("[DataService] Fetch parameters:", {
        forceRefresh: options.forceRefresh,
        analyticsTimePeriod,
        currentContext: this.lastFetchContext,
      });

      // Phase 1: Get premium quota data
      const quota = await this.fetchPremiumQuota(options);

      if (!quota) {
        log.error("[DataService] Failed to fetch premium quota data");
        return null;
      }

      // Phase 2: Determine what additional data to fetch based on quota status
      const shouldFetchUsageBased = await this.shouldFetchUsageBasedData(quota.percentage);
      log.trace("[DataService] Fetch decisions:", {
        shouldFetchUsageBased,
        quotaPercentage: quota.percentage,
      });

      const fetchPromises: Promise<any>[] = [];

      // Conditionally fetch usage-based pricing data
      if (shouldFetchUsageBased) {
        fetchPromises.push(this.fetchUsageBasedPricingData(options));
      } else {
        fetchPromises.push(Promise.resolve(null));
      }

      // User info fetching logic
      const isFullRefresh = options.forceRefresh;
      let shouldFetchUserInfo = isFullRefresh;
      if (!shouldFetchUserInfo && this.lastFetchContext) {
        shouldFetchUserInfo = Date.now() - this.lastFetchContext.lastQuotaCheck > 5 * 60 * 1000;
      }

      log.trace("[DataService] User info fetch decision:", {
        shouldFetch: shouldFetchUserInfo,
        isFullRefresh,
        timeSinceLastCheck: this.lastFetchContext
          ? Math.round((Date.now() - this.lastFetchContext.lastQuotaCheck) / 1000) + "s"
          : "no context",
      });

      if (shouldFetchUserInfo || !this.lastFetchContext) {
        fetchPromises.push(this.fetchUserInfo(options));
      } else {
        const cachedUserInfo = await this.dbService.getCachedData<AuthUserInfo>("api_user_info");
        if (cachedUserInfo) {
          const dbUserInfo = await this.fetchDbUserInfo();
          fetchPromises.push(Promise.resolve(this.combineUserInfo(cachedUserInfo, dbUserInfo)));
        } else {
          fetchPromises.push(this.fetchUserInfo(options));
        }
      }

      fetchPromises.push(this.fetchUsageEvents(options));
      fetchPromises.push(this.fetchAnalyticsData(options, analyticsTimePeriod));

      const [usageBasedPricing, userInfo, usageEvents, analyticsData] = await Promise.all(fetchPromises);

      const stats: CursorStats = {
        premiumRequests: {
          current: quota.current,
          limit: quota.limit,
          percentage: quota.percentage,
          startOfMonth: quota.period.start,
        },
        usageBasedPricing,
      };

      this.updateFetchContext(quota, usageBasedPricing?.status.isEnabled || false);

      const result = { quota, stats, userInfo, usageEvents, analyticsData };

      log.trace("[DataService] Fetch all usage data completed:", {
        quotaPercentage: quota.percentage,
        usageBasedEnabled: usageBasedPricing?.status.isEnabled || false,
        hasUserInfo: !!userInfo,
        eventsCount: usageEvents?.usageEvents?.length || 0,
        hasAnalytics: !!analyticsData,
        context: this.lastFetchContext,
      });

      return result;
    } catch (error) {
      log.error("[DataService] Context-aware comprehensive data fetch failed", error);
      return null;
    }
  }

  async clearAllCache(): Promise<void> {
    await this.dbService.clearCache();
    this.lastFetchContext = null;
    log.debug("[DataService] All cached data cleared");
  }

  async clearAllCacheIncludingPermanent(): Promise<void> {
    await this.dbService.clearAllCache();
    this.lastFetchContext = null;
    log.debug("[DataService] All cached data cleared including permanent");
  }

  async invalidateStateBasedCache(): Promise<void> {
    await this.clearAllCache();
    log.debug("[DataService] State-based cache invalidated");
  }

  private async invalidateUsageBasedCaches(): Promise<void> {
    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      const cacheKeysToInvalidate = [
        `monthly_usage_${currentMonth}_${currentYear}`,
        `monthly_usage_${lastMonth}_${lastYear}`,
        "usage_based_pricing",
        "premium_quota",
        "premium_quota_detailed",
      ];

      await Promise.all(cacheKeysToInvalidate.map((key) => this.dbService.removeCachedData(key)));

      log.debug("[DataService] Usage-based pricing caches invalidated due to quota status change");
    } catch (error) {
      log.warn("[DataService] Failed to invalidate usage-based caches", error);
    }
  }

  async getSessionToken(): Promise<string | null> {
    try {
      const token = await this.dbService.getCursorToken();
      if (token) {
        log.debug("[DataService] Session token retrieved successfully");
        return token;
      } else {
        log.warn("[DataService] No session token found");
        return null;
      }
    } catch (err) {
      log.error("[DataService] Failed to get session token", err);
      return null;
    }
  }

  async setUsageBasedLimit(token: string, limitUSD: number): Promise<boolean> {
    const success = await this.apiService.setUsageBasedLimit(token, limitUSD);
    if (success) {
      log.debug("[DataService] Invalidating usage-based caches after limit change");
      await this.dbService.removeCachedData("usage_based_status");
      await this.dbService.removeCachedData("usage_based_pricing");
      this.lastFetchContext = null; // Reset context to force fresh fetch
    }
    return success;
  }

  async enableUsageBasedPricing(token: string, limitUSD?: number): Promise<boolean> {
    const success = await this.apiService.enableUsageBasedPricing(token, limitUSD);
    if (success) {
      log.debug("[DataService] Invalidating usage-based caches after enabling");
      await this.dbService.removeCachedData("usage_based_status");
      await this.dbService.removeCachedData("usage_based_pricing");
      this.lastFetchContext = null; // Reset context to force fresh fetch
    }
    return success;
  }

  async disableUsageBasedPricing(token: string): Promise<boolean> {
    const success = await this.apiService.disableUsageBasedPricing(token);
    if (success) {
      log.debug("[DataService] Invalidating usage-based caches after disabling");
      await this.dbService.removeCachedData("usage_based_status");
      await this.dbService.removeCachedData("usage_based_pricing");
      this.lastFetchContext = null; // Reset context to force fresh fetch
    }
    return success;
  }

  async debugCacheStatus(): Promise<void> {
    const cacheKeys = [
      "premium_quota",
      "premium_quota_detailed",
      "usage_based_pricing",
      "api_user_info",
      "usage_events_7_100",
      "analytics_data_1d",
      "analytics_data_7d",
      "analytics_data_30d",
    ];

    log.debug("[DataService] Cache status check:");
    for (const key of cacheKeys) {
      const cached = await this.dbService.getCachedData<any>(key);
      if (cached) {
        log.debug(`  ✓ ${key}: cached (${typeof cached})`);
      } else {
        log.debug(`  ✗ ${key}: not cached`);
      }
    }

    if (this.lastFetchContext) {
      log.debug(
        `[DataService] Last fetch context: quota=${this.lastFetchContext.quotaPercentage}%, usage-based=${this.lastFetchContext.usageBasedEnabled}, exhausted=${this.lastFetchContext.isQuotaExhausted}, lastCheck=${new Date(this.lastFetchContext.lastQuotaCheck).toLocaleTimeString()}`,
      );
      log.debug(`[DataService] Context-aware caching TTLs:`);
      log.debug(
        `  - Premium quota: ${this.lastFetchContext.isQuotaExhausted ? DataService.CACHE_TTL.PREMIUM_QUOTA_EXHAUSTED / 1000 : DataService.CACHE_TTL.PREMIUM_QUOTA_NORMAL / 1000}s`,
      );
      log.debug(
        `  - Usage-based pricing: ${this.lastFetchContext.isQuotaExhausted ? DataService.CACHE_TTL.USAGE_BASED_PRICING_EXHAUSTED / 1000 : DataService.CACHE_TTL.USAGE_BASED_PRICING_NORMAL / 1000}s`,
      );
    } else {
      log.debug("[DataService] No fetch context available");
    }
  }
}
