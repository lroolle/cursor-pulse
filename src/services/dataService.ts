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
  NewPricingStatus,
  PricingModelType,
  UsageData,
} from "../types";
import { ApiService } from "./api";
import { DatabaseService } from "./database";
import { CacheService } from "./cacheService";
import { log } from "../utils/logger";
import { DateUtils } from "../utils/dateUtils";

export interface DataFetchOptions {
  forceRefresh?: boolean;
  token: string;
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
  private readonly cacheService: CacheService;
  private lastFetchContext: DataFetchContext | null = null;
  private pricingStatusCache: NewPricingStatus | null = null;

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
    PRICING_MODEL: 24 * 60 * 60 * 1000,
  };

  private constructor() {
    this.apiService = ApiService.getInstance();
    this.dbService = DatabaseService.getInstance();
    this.cacheService = CacheService.getInstance();
  }

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  async fetchPremiumQuota(options: DataFetchOptions): Promise<QuotaData | null> {
    return this.fetchQuota(options);
  }

  async fetchQuota(options: DataFetchOptions): Promise<QuotaData | null> {
    const cacheKey = "quota:premium";

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<QuotaData>(cacheKey);
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

    const current = usageResponse["gpt-4"].numRequests ?? 0;
    const limit = usageResponse["gpt-4"].maxRequestUsage ?? null;

    if (limit === null || limit === undefined) {
      log.debug("[DataService] Quota limit is null/undefined, likely new pricing user");
      return null;
    }

    const percentage = limit > 0 ? Math.round((current / limit) * 100) : 0;

    const quota: QuotaData = {
      current,
      limit,
      percentage,
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

    await this.cacheService.setCachedData(cacheKey, quota, CacheStrategy.TIME_BASED, ttl);

    this.updateFetchContext(quota, false);
    return quota;
  }

  async fetchUsageBasedPricingData(options: DataFetchOptions): Promise<any | null> {
    const cacheKey = "pricing:data";

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<any>(cacheKey);
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

    // API behavior:
    // - When enabled: returns {"hardLimit": number}
    // - When disabled: returns {"noUsageBasedAllowed": true}
    const isEnabled = usageBasedStatusResponse.noUsageBasedAllowed !== true;

    const status: UsageBasedStatus = {
      isEnabled,
      limit: usageBasedStatusResponse.hardLimit,
    };

    log.debug(`[DataService] Usage-based pricing status in fetchUsageBasedPricingData:`, {
      rawResponse: usageBasedStatusResponse,
      isEnabled,
      limit: usageBasedStatusResponse.hardLimit,
    });

    if (!status.isEnabled) {
      await this.cacheService.setCachedData(
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

    await this.cacheService.setCachedData(cacheKey, usageBasedPricingData, CacheStrategy.TIME_BASED, ttl);

    return usageBasedPricingData;
  }

  private async fetchMonthlyUsageWithContextAwareCaching(
    options: DataFetchOptions,
    month: number,
    year: number,
  ): Promise<any> {
    const cacheKey = `usage:${year}-${String(month).padStart(2, "0")}`;
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const isCurrentMonth = month === currentMonth && year === currentYear;

    // Calculate previous month
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const isPreviousMonth = month === prevMonth && year === prevYear;

    // Cursor can accumulate usage-based charges into the previous month when quota is exhausted
    // Only treat previous month as active if quota is currently exhausted
    const isQuotaExhausted = this.lastFetchContext?.isQuotaExhausted || false;
    const isActiveBillingMonth = isCurrentMonth || (isPreviousMonth && isQuotaExhausted);

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<any>(cacheKey);
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
        const strategy = isActiveBillingMonth ? CacheStrategy.TIME_BASED : CacheStrategy.PERMANENT;
        let ttl = 0;

        if (isActiveBillingMonth) {
          const isQuotaExhausted = this.lastFetchContext?.isQuotaExhausted || false;
          ttl = isQuotaExhausted
            ? DataService.CACHE_TTL.USAGE_BASED_PRICING_EXHAUSTED
            : DataService.CACHE_TTL.USAGE_BASED_PRICING_NORMAL;
        }

        await this.cacheService.setCachedData(cacheKey, monthlyUsage, strategy, ttl, `${month}_${year}`);
        return monthlyUsage;
      }
    }

    return null;
  }

  private async shouldFetchUsageBasedData(quotaPercentage: number, pricingStatus?: NewPricingStatus): Promise<boolean> {
    // For new pricing users, always try to fetch usage-based data since they might have spending
    if (pricingStatus?.pricingModelType === PricingModelType.NEW_RATE_LIMITED) {
      log.debug("[DataService] New pricing user - always fetch usage-based data");
      return true;
    }

    if (quotaPercentage >= 95) {
      return true;
    }

    const cachedStatus = await this.cacheService.getCachedData<UsageBasedStatus>("pricing:status");
    if (cachedStatus?.isEnabled) {
      log.debug("[DataService] Usage-based enabled in cache - fetching data");
      return true;
    }

    if (quotaPercentage < 80) {
      log.debug("[DataService] Low quota percentage and no cached status - skipping usage-based fetch");
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
    const cacheKey = "user:info";

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<AuthUserInfo>(cacheKey);
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

      await this.cacheService.setCachedData(
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
    const cacheKey = `events:${daysBack}d:${pageSize}`;

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<FilteredUsageResponse>(cacheKey);
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

      await this.cacheService.setCachedData(
        cacheKey,
        usageEvents,
        CacheStrategy.TIME_BASED,
        DataService.CACHE_TTL.USAGE_EVENTS,
      );

      log.trace("[DataService] Fresh usage events data:", JSON.stringify(usageEvents, null, 2));
      return usageEvents;
    }

    return null;
  }

  async fetchAnalyticsData(options: DataFetchOptions, timePeriod: string = "1d"): Promise<AnalyticsData | null> {
    const cacheKey = `analytics:${timePeriod}`;

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<AnalyticsData>(cacheKey);
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
          await this.cacheService.setCachedData(cacheKey, analyticsData, CacheStrategy.TIME_BASED, cacheTTL);

          log.trace(
            `[DataService] Processed analytics data for ${timePeriod}:`,
            JSON.stringify(analyticsData, null, 2),
          );
          return analyticsData;
        } else if (response.period) {
          log.debug(
            `[DataService] API returned period-only response for ${timePeriod}, checking for existing cached data`,
          );

          const existingCached = await this.cacheService.getCachedData<AnalyticsData>(cacheKey);
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

      const cachedFallback = await this.cacheService.getCachedData<AnalyticsData>(cacheKey);
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
    const cacheKey = "pricing:status";

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<UsageBasedStatus>(cacheKey);
      if (cached) {
        log.trace("[DataService] Usage-based status cache hit");
        return cached;
      }
    }

    log.debug("[DataService] Fetching usage-based pricing status");
    const response = await this.apiService.checkUsageBasedStatus(options.token);

    if (response) {
      // API behavior:
      // - When enabled: returns {"hardLimit": number}
      // - When disabled: returns {"noUsageBasedAllowed": true}
      const isEnabled = response.noUsageBasedAllowed !== true;

      const status: UsageBasedStatus = {
        isEnabled,
        limit: response.hardLimit,
      };

      log.debug(`[DataService] Usage-based status parsed:`, {
        rawResponse: response,
        isEnabled,
        limit: response.hardLimit,
      });

      await this.cacheService.setCachedData(cacheKey, status, CacheStrategy.TIME_BASED, 60 * 60 * 1000);

      return status;
    }

    return null;
  }

  async getCurrentMonthPeriod(forceRefresh: boolean = false): Promise<PeriodInfo> {
    const cacheKey = "period:current";

    if (!forceRefresh) {
      const cached = await this.cacheService.getCachedData<PeriodInfo>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    log.debug("[DataService] Calculating current month period");
    const periodInfo = DateUtils.calculateCurrentMonthPeriod();

    await this.cacheService.setCachedData(cacheKey, periodInfo, CacheStrategy.TIME_BASED, 60 * 60 * 1000);

    return periodInfo;
  }

  private async determinePricingModel(options: DataFetchOptions): Promise<NewPricingStatus> {
    const cacheKey = "pricing:model";

    if (!options.forceRefresh && this.pricingStatusCache) {
      return this.pricingStatusCache;
    }

    if (!options.forceRefresh) {
      const cached = await this.cacheService.getCachedData<NewPricingStatus>(cacheKey);
      if (cached) {
        this.pricingStatusCache = cached;
        return cached;
      }
    }

    const apiResponse = await this.apiService.checkNewPricingStatus(options.token);

    let pricingStatus: NewPricingStatus;
    if (apiResponse && typeof apiResponse.isOnNewPricing === "boolean") {
      pricingStatus = {
        isOnNewPricing: apiResponse.isOnNewPricing,
        pricingModelType: apiResponse.isOnNewPricing
          ? PricingModelType.NEW_RATE_LIMITED
          : PricingModelType.LEGACY_QUOTA,
        hasOptedOut: !apiResponse.isOnNewPricing,
      };

      // Cache for 24 hours (pricing model doesn't change frequently)
      await this.cacheService.setCachedData(
        cacheKey,
        pricingStatus,
        CacheStrategy.TIME_BASED,
        DataService.CACHE_TTL.PRICING_MODEL,
      );
      this.pricingStatusCache = pricingStatus;
      return pricingStatus;
    }

    const fallbackStatus: NewPricingStatus = {
      isOnNewPricing: false,
      pricingModelType: PricingModelType.LEGACY_QUOTA,
      hasOptedOut: false,
    };

    this.pricingStatusCache = fallbackStatus;
    return fallbackStatus;
  }

  private async fetchPremiumQuotaOptional(options: DataFetchOptions): Promise<QuotaData | null> {
    try {
      return await this.fetchPremiumQuota(options);
    } catch (error) {
      log.debug("[DataService] Premium quota unavailable (normal for new pricing)", error);
      return null;
    }
  }

  private createCompatibilityQuota(): QuotaData {
    // Create mock quota for new pricing users to maintain UI compatibility
    // Use 0 limit to indicate unlimited/rate-limited
    return {
      current: 0,
      limit: 0,
      percentage: 0,
      period: DateUtils.calculateCurrentMonthPeriod(),
      lastUpdated: new Date(),
    };
  }

  private createTrialQuota(): QuotaData {
    return {
      current: 0,
      limit: 50,
      percentage: 0,
      period: DateUtils.calculateCurrentMonthPeriod(),
      lastUpdated: new Date(),
    };
  }

  async getUsageBasedPeriod(forceRefresh: boolean = false): Promise<PeriodInfo> {
    const cacheKey = "period:billing";

    if (!forceRefresh) {
      const cached = await this.cacheService.getCachedData<PeriodInfo>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    log.debug("[DataService] Calculating usage-based billing period");
    const periodInfo = DateUtils.calculateUsageBasedPeriod();

    await this.cacheService.setCachedData(cacheKey, periodInfo, CacheStrategy.TIME_BASED, 60 * 60 * 1000);

    return periodInfo;
  }

  async fetchAllUsageData(options: DataFetchOptions, analyticsTimePeriod: string = "1d"): Promise<UsageData | null> {
    try {
      log.debug("[DataService] Starting fetch all usage data with pricing model detection");
      log.trace("[DataService] Fetch parameters:", {
        forceRefresh: options.forceRefresh,
        analyticsTimePeriod,
        currentContext: this.lastFetchContext,
      });

      // Phase 1: Determine pricing model first
      const pricingStatus = await this.determinePricingModel(options);
      log.debug(`[DataService] Pricing model detected: ${pricingStatus.pricingModelType}`);

      // Phase 2: Conditional quota fetching based on pricing model
      let quota: QuotaData | null = null;

      switch (pricingStatus.pricingModelType) {
        case PricingModelType.LEGACY_QUOTA:
          // Legacy users: quota is essential
          quota = await this.fetchPremiumQuota(options);
          if (!quota) {
            log.error("[DataService] Failed to fetch quota for legacy user");
            return null;
          }
          log.debug("[DataService] Legacy quota fetched successfully");
          break;

        case PricingModelType.NEW_RATE_LIMITED:
          // New pricing users: quota may be unavailable or meaningless
          quota = await this.fetchPremiumQuotaOptional(options);
          if (!quota) {
            quota = this.createCompatibilityQuota();
            log.debug("[DataService] Created compatibility quota for new pricing user");
          } else {
            log.debug("[DataService] Quota data available for new pricing user");
          }
          break;

        case PricingModelType.TRIAL:
          // Trial users: similar to new pricing
          quota = (await this.fetchPremiumQuotaOptional(options)) || this.createTrialQuota();
          log.debug("[DataService] Trial quota setup completed");
          break;
      }

      // Phase 3: Determine additional data to fetch
      const shouldFetchUsageBased = await this.shouldFetchUsageBasedData(quota.percentage, pricingStatus);
      log.trace("[DataService] Fetch decisions:", {
        pricingModel: pricingStatus.pricingModelType,
        shouldFetchUsageBased,
        quotaPercentage: quota.percentage,
      });

      const fetchPromises: Promise<any>[] = [];
      if (shouldFetchUsageBased) {
        fetchPromises.push(this.fetchUsageBasedPricingData(options));
      } else {
        fetchPromises.push(Promise.resolve(null));
      }

      const isFullRefresh = options.forceRefresh;

      if (isFullRefresh) {
        fetchPromises.push(this.fetchUserInfo(options));
      } else {
        const cachedUserInfo = await this.cacheService.getCachedData<AuthUserInfo>("user:info");
        if (cachedUserInfo) {
          const dbUserInfo = await this.fetchDbUserInfo(); // DB info is cheap
          fetchPromises.push(Promise.resolve(this.combineUserInfo(cachedUserInfo, dbUserInfo)));
        } else {
          fetchPromises.push(this.fetchUserInfo(options)); // Cache miss, fetch from API
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

      const result: UsageData = {
        quota,
        stats,
        userInfo,
        usageEvents,
        analyticsData,
        pricingStatus,
      };

      log.trace("[DataService] Fetch all usage data completed:", {
        pricingModel: pricingStatus.pricingModelType,
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
    await this.cacheService.clearCache();
    this.lastFetchContext = null;
    this.pricingStatusCache = null;
    log.debug("[DataService] All cached data cleared");
  }

  async clearAllCacheIncludingPermanent(): Promise<void> {
    await this.cacheService.clearCache();
    this.lastFetchContext = null;
    this.pricingStatusCache = null;
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
        `usage:${currentYear}-${String(currentMonth).padStart(2, "0")}`,
        `usage:${lastYear}-${String(lastMonth).padStart(2, "0")}`,
        "pricing:data",
        "quota:premium",
      ];

      await Promise.all(cacheKeysToInvalidate.map((key) => this.cacheService.removeCachedData(key)));

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
      await this.cacheService.removeCachedData("pricing:status");
      await this.cacheService.removeCachedData("pricing:data");
      this.lastFetchContext = null;
    }
    return success;
  }

  async enableUsageBasedPricing(token: string, limitUSD?: number): Promise<boolean> {
    const success = await this.apiService.enableUsageBasedPricing(token, limitUSD);
    if (success) {
      log.debug("[DataService] Invalidating usage-based caches after enabling");
      await this.cacheService.removeCachedData("pricing:status");
      await this.cacheService.removeCachedData("pricing:data");
      this.lastFetchContext = null;
    }
    return success;
  }

  async disableUsageBasedPricing(token: string): Promise<boolean> {
    const success = await this.apiService.disableUsageBasedPricing(token);
    if (success) {
      log.debug("[DataService] Invalidating usage-based caches after disabling");
      await this.cacheService.removeCachedData("pricing:status");
      await this.cacheService.removeCachedData("pricing:data");
      this.lastFetchContext = null;
    }
    return success;
  }

  async debugCacheStatus(): Promise<void> {
    const cacheKeys = [
      "quota:premium",
      "pricing:data",
      "pricing:status",
      "user:info",
      "events:7d:100",
      "analytics:1d",
      "analytics:7d",
      "analytics:30d",
    ];

    log.debug("[DataService] Cache status check:");
    for (const key of cacheKeys) {
      const cached = await this.cacheService.getCachedData<any>(key);
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
