export interface QuotaData {
  current: number;
  limit: number;
  percentage: number;
  period: {
    start: string;
    end: string;
    remaining: number;
  };
  lastUpdated: Date;
}

export interface ApiError {
  type: "network" | "auth" | "api" | "unknown";
  message: string;
  retryable: boolean;
}

export interface QuotaState {
  data: QuotaData | null;
  loading: boolean;
  error: ApiError | null;
}

export interface CursorApiResponse {
  "gpt-4": {
    numRequests: number;
    maxRequestUsage: number;
    numTokens?: number;
  };
  "gpt-3.5-turbo"?: {
    numRequests: number;
    maxRequestUsage: number;
  };
  startOfMonth: string;
}

export interface UsageLimitResponse {
  hardLimit?: number;
  noUsageBasedAllowed?: boolean;
}

export interface UsageBasedStatus {
  isEnabled: boolean;
  limit?: number;
}

export interface UsageItem {
  description: string;
  totalCost: number;
  cents: number;
}

export interface MonthlyUsage {
  items: UsageItem[];
  totalCost: number;
  hasUnpaidInvoice: boolean;
}

export interface CursorStats {
  premiumRequests: {
    current: number;
    limit: number;
    percentage: number;
    startOfMonth: string;
  };
  usageBasedPricing?: {
    currentMonth: MonthlyUsage;
    lastMonth: MonthlyUsage;
    status: UsageBasedStatus;
  };
}

export interface UsageEventDetails {
  fastApply?: {};
  toolCallComposer?: {
    modelIntent: string;
    isHeadless: boolean;
    maxMode: boolean;
  };
  composer?: {
    modelIntent: string;
    overrideNumRequestsCounted?: number;
    isHeadless: boolean;
    isTokenBasedCall?: boolean;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheWriteTokens?: number;
      cacheReadTokens?: number;
      totalCents: number;
    };
    maxMode: boolean;
  };
  chat?: {
    modelIntent: string;
    overrideNumRequestsCounted?: number;
    isHeadless: boolean;
    isTokenBasedCall?: boolean;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheWriteTokens?: number;
      cacheReadTokens?: number;
      totalCents: number;
    };
    maxMode: boolean;
  };
  overrideNumRequestsCounted?: number;
}

export interface UsageEvent {
  timestamp: string;
  details: UsageEventDetails;
  subscriptionProductId?: string;
  usagePriceId?: string;
  status: string;
  owningUser: string;
  priceCents: number;
  isSlow?: boolean;
}

export interface FilteredUsageResponse {
  usageEvents: UsageEvent[];
  totalUsageEventsCount: number;
}

export interface ComprehensiveData {
  quota: QuotaData;
  stats: CursorStats;
  userInfo: UserInfo | null;
  usageEvents: FilteredUsageResponse | null;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  membershipType?: string; // "free", "pro", "team", "ultra"
}

export interface AuthUserInfo {
  email: string;
  email_verified: boolean;
  name: string;
  sub: string;
  updated_at: string;
  picture: string | null;
}

export interface ModelUsage {
  name: string;
  count: number;
}

export interface ExtensionUsage {
  name: string;
  count: number;
}

export interface ClientVersionUsage {
  name: string;
  count: number;
}

export interface DailyMetrics {
  date: string;
  activeUsers?: number;
  linesAdded?: number;
  linesDeleted?: number;
  acceptedLinesAdded?: number;
  acceptedLinesDeleted?: number;
  totalApplies?: number;
  totalAccepts?: number;
  totalRejects?: number;
  totalTabsShown?: number;
  totalTabsAccepted?: number;
  chatRequests?: number;
  composerRequests?: number;
  agentRequests?: number;
  subscriptionIncludedReqs?: number;
  apiKeyReqs?: number;
  modelUsage?: ModelUsage[];
  extensionUsage?: ExtensionUsage[];
  tabExtensionUsage?: ExtensionUsage[];
  clientVersionUsage?: ClientVersionUsage[];
}

export interface AnalyticsPeriod {
  startDate: string;
  endDate: string;
}

export interface UserAnalyticsResponse {
  dailyMetrics: DailyMetrics[];
  period: AnalyticsPeriod;
  totalMembersInTeam: number;
}

export interface AnalyticsData {
  totalLinesEdited: number;
  totalTabsAccepted: number;
  totalRequests: number;
  period: AnalyticsPeriod;
}

// Cache metadata interface
export interface CacheMetadata {
  timestamp: number;
  ttl: number;
  stateVersion: number;
  strategy: "state_based" | "time_based" | "permanent" | "param_based";
  params?: string;
}

// Cached data wrapper
export interface CachedData<T> {
  data: T;
  metadata: CacheMetadata;
}

// Cache strategies enum
export enum CacheStrategy {
  STATE_BASED = "state_based", // Invalidate when Cursor state changes
  TIME_BASED = "time_based", // TTL-based expiration
  PERMANENT = "permanent", // Cache forever (manual refresh only)
  PARAM_BASED = "param_based", // Cache based on request parameters
}

export interface PeriodInfo {
  start: string;
  end: string;
  remaining: number;
}

// New pricing model types
export enum PricingModelType {
  LEGACY_QUOTA = "legacy_quota",
  NEW_RATE_LIMITED = "new_rate_limited",
  TRIAL = "trial",
}

export interface NewPricingStatus {
  isOnNewPricing: boolean;
  pricingModelType: PricingModelType;
  hasOptedOut?: boolean;
}

export interface QuotaStateData extends QuotaData {
  isLegacyQuota: boolean;
  rateLimitStatus?: {
    isBurstBucketEmpty: boolean;
    isLocalBucketEmpty: boolean;
    estimatedRefillTime?: string;
  };
}

export interface UsageData {
  quota: QuotaData;
  stats: CursorStats;
  userInfo: UserInfo | null;
  usageEvents: FilteredUsageResponse | null;
  analyticsData: AnalyticsData | null;
  pricingStatus?: NewPricingStatus; // Include pricing context
}
