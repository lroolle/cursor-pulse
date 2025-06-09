import * as vscode from "vscode";
import { QuotaData, ApiError, CursorStats, UserInfo, FilteredUsageResponse, UsageEvent, AnalyticsData } from "../types";
import { log } from "../utils/logger";
import { DataService } from "../services/dataService";
import { PeriodInfo } from "../types";

export class StatusBarProvider {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private dataService: DataService;
  private previousQuota: number = 0;
  private previousUsageBasedSpend: number = 0;
  private animationTimer: NodeJS.Timeout | undefined;
  private flipTimer: NodeJS.Timeout | undefined;
  private originalText: string = "";

  // Animation constants
  private static readonly ANIMATION_CONFIG = {
    BOOST_THRESHOLD: 5,
    MAGIC_THRESHOLD: 20,
    FRAME_DURATION: {
      BASIC: 150,
      BOOST: 180,
      MAGIC: 200,
    },
    COLORS: {
      BLUE: "#3a8de3",
      PURPLE: "#d64cd6",
      MAGIC_PURPLE: "#d64cd6",
      MAGIC_BLUE: "#3a8de3",
    },
  };

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.statusBarItem.command = "cursorPulse.showActions";
    this.statusBarItem.name = "Cursor Pulse";
    this.dataService = DataService.getInstance();
  }

  updateQuota(data: QuotaData): void {
    const quotaIncreased = data.current > this.previousQuota;
    const oldQuota = this.previousQuota;
    this.previousQuota = data.current;

    const config = vscode.workspace.getConfiguration("cursorPulse");
    const showPercentage = config.get<boolean>("showPercentage", true);

    const percentageText = showPercentage ? ` (${data.percentage}%)` : "";
    const normalText = `$(zap) ${data.current}/${data.limit}${percentageText}`;
    this.statusBarItem.text = normalText;
    this.originalText = normalText;

    if (quotaIncreased) {
      this.animateQuotaIncreaseWithOldValue(data.percentage, data.current, data.limit, showPercentage, oldQuota);
    } else {
      this.statusBarItem.color = this.getStatusColor(data.percentage);
    }

    this.statusBarItem.tooltip = this.createSimpleTooltip(data);
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  async updateUsageData(data: {
    quota: QuotaData;
    stats: CursorStats;
    userInfo: UserInfo | null;
    usageEvents: FilteredUsageResponse | null;
    analyticsData: AnalyticsData | null;
  }): Promise<void> {
    const { quota, stats, userInfo, usageEvents, analyticsData } = data;

    const quotaIncreased = quota.current > this.previousQuota;
    const oldQuota = this.previousQuota;
    this.previousQuota = quota.current;

    const config = vscode.workspace.getConfiguration("cursorPulse");
    const showPercentage = config.get<boolean>("showPercentage", true);

    const shouldShowUsageBased = this.shouldFlipToUsageBasedDisplay(quota, stats);

    if (shouldShowUsageBased) {
      try {
        const totalCost =
          stats.usageBasedPricing!.currentMonth.totalCost + stats.usageBasedPricing!.lastMonth.totalCost;
        const limit = stats.usageBasedPricing!.status.limit || 0;
        const spendPercentage = limit > 0 ? Math.round((totalCost / limit) * 100) : 0;

        const spendIncreased = totalCost > this.previousUsageBasedSpend;
        const oldSpend = this.previousUsageBasedSpend;
        this.previousUsageBasedSpend = totalCost;

        const limitDisplay = limit === 0 ? "∞" : limit.toString();
        const percentageText = showPercentage ? ` (${spendPercentage}%)` : "";
        const normalText = `$(credit-card) $${totalCost.toFixed(2)}/${limitDisplay}${percentageText}`;
        this.statusBarItem.text = normalText;
        this.originalText = normalText;

        if (spendIncreased) {
          this.animateUsageBasedIncreaseWithOldValue(
            spendPercentage,
            totalCost,
            limit,
            showPercentage,
            oldSpend,
            totalCost,
          );
        } else {
          this.statusBarItem.color = this.getUsageColor(spendPercentage);
        }
      } catch (error) {
        log.warn("Failed to display usage-based status, falling back to premium display", error);
        this.displayPremiumStatusWithOldValue(quota, showPercentage, quotaIncreased, oldQuota);
      }
    } else {
      this.previousUsageBasedSpend = 0;
      this.displayPremiumStatusWithOldValue(quota, showPercentage, quotaIncreased, oldQuota);
    }

    const usageBasedPeriod = await this.dataService.getUsageBasedPeriod();
    this.statusBarItem.tooltip = this.createUsageDataTooltip(data, usageBasedPeriod);
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  updateLoading(): void {
    this.statusBarItem.text = "$(refresh) Loading...";
    this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.foreground");
    this.statusBarItem.tooltip = "Fetching usage information...";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  updateError(error: ApiError): void {
    this.statusBarItem.text = "$(sync-ignored) --/-- (offline)";
    this.statusBarItem.color = new vscode.ThemeColor("statusBarItem.errorForeground");
    this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    this.statusBarItem.tooltip = this.createErrorTooltip(error);
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  private getStatusColor(percentage: number): vscode.ThemeColor | string {
    return this.getUsageColor(percentage);
  }

  private getUsageColor(percentage: number): string {
    const DANGER_THRESHOLD = 90;
    const WARNING_THRESHOLD = 75;
    const CAUTION_THRESHOLD = 50;

    const DANGER_RED = "#d63031";
    const WARNING_ORANGE = "#f39c12";
    const CAUTION_GREEN = "#27ae60";
    const NORMAL_BLUE = "#3498db";

    if (percentage >= DANGER_THRESHOLD) {
      return DANGER_RED;
    }
    if (percentage >= WARNING_THRESHOLD) {
      return WARNING_ORANGE;
    }
    if (percentage >= CAUTION_THRESHOLD) {
      return CAUTION_GREEN;
    }
    return NORMAL_BLUE;
  }

  private createUsageDataTooltip(
    data: {
      quota: QuotaData;
      stats: CursorStats;
      userInfo: UserInfo | null;
      usageEvents: FilteredUsageResponse | null;
      analyticsData: AnalyticsData | null;
    },
    usageBasedPeriod: PeriodInfo,
  ): vscode.MarkdownString {
    const { quota, stats, userInfo, usageEvents, analyticsData } = data;
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportThemeIcons = true;
    tooltip.supportHtml = true;

    tooltip.appendMarkdown(`\n\n`);

    if (userInfo) {
      const planType = this.determinePlanType(stats, userInfo);
      const displayName = userInfo.name && userInfo.name !== "unknown" ? userInfo.name : userInfo.email;

      tooltip.appendMarkdown(
        `$(account) **<a href="https://www.cursor.com/dashboard" title="Go to Cursor Dashboard">${displayName}</a>** \`${planType}\`&nbsp;&nbsp;&nbsp;&nbsp;<b>$(pulse)&nbsp;&nbsp;&nbsp;&nbsp;${this.statusBarItem.name}</b>&nbsp;&nbsp;\n\n`,
      );
    }

    if (analyticsData) {
      const hasAnalyticsData =
        analyticsData.totalLinesEdited > 0 || analyticsData.totalTabsAccepted > 0 || analyticsData.totalRequests > 0;

      if (hasAnalyticsData) {
        const formatNumber = (num: number): string => {
          return num.toLocaleString();
        };

        const config = vscode.workspace.getConfiguration("cursorPulse");
        const timePeriod = config.get<string>("analyticsTimePeriod", "1d");

        const periodTitles: Record<string, string> = {
          "1d": "Analytics for Today",
          "7d": "Analytics for This Week",
          "30d": "Analytics for This Month",
        };

        const sectionTitle = periodTitles[timePeriod] || "Your Analytics";

        tooltip.appendMarkdown(`---\n\n`);

        tooltip.appendMarkdown(`<b>$(graph) ${sectionTitle}</b>\n`);

        tooltip.appendMarkdown(
          `<table>\n` +
            `<tr>\n` +
            `<td align="center" style="padding:8px;">\n` +
            `<b style="color:#4FC3F7;font-size:14px;">&nbsp;&nbsp;&nbsp;&nbsp;$(infinity) ${formatNumber(analyticsData.totalLinesEdited)}</b><br/>\n` +
            `<small style="color:#888;">&nbsp;&nbsp;&nbsp;&nbsp;Lines Edited</small>\n` +
            `</td>\n` +
            `<td align="center" style="padding:8px;border-left:2px solid #555;">\n` +
            `<b style="color:#66BB6A;font-size:14px;">&nbsp;&nbsp;$(tab) ${formatNumber(analyticsData.totalTabsAccepted)}</b><br/>\n` +
            `&nbsp;&nbsp;<small style="color:#888;">Tabs Accepted</small>\n` +
            `</td>\n` +
            `<td align="center" style="padding:8px;border-left:2px solid #555;">\n` +
            `<b style="color:#FF8A65;font-size:14px;">&nbsp;&nbsp;$(arrow-up) ${formatNumber(analyticsData.totalRequests)}</b><br/>\n` +
            `&nbsp;&nbsp;<small style="color:#888;">Requests</small>\n` +
            `</td>\n` +
            `</tr>\n` +
            `</table>\n\n`,
        );
      }
    }
    tooltip.appendMarkdown(
      `<div style="padding:10px"><b>$(zap) Premium Fast Request</b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>${quota.current}/${quota.limit} (${quota.percentage}%)</strong><br/>&nbsp;&nbsp;&nbsp;&nbsp;<small style="font-size:10px;opacity:0.8;line-height:0.9;"><i>Reset in <strong>${quota.period.remaining} days</strong> (${quota.period.start} to ${quota.period.end})</i></small><br/>&nbsp;&nbsp;&nbsp;&nbsp;${this.createProgressBar(quota.percentage)}</div>\n\n`,
    );

    if (stats.usageBasedPricing?.status.isEnabled) {
      const totalCost = stats.usageBasedPricing.currentMonth.totalCost + stats.usageBasedPricing.lastMonth.totalCost;
      const limit = stats.usageBasedPricing.status.limit || 0;
      const spendPercentage = limit > 0 ? Math.round((totalCost / limit) * 100) : 0;

      tooltip.appendMarkdown(
        `<div><b>$(credit-card) Usage-Based Spend</b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>$${totalCost.toFixed(2)}/${limit === 0 ? "N/A" : limit} (${spendPercentage}%)</strong><br/>&nbsp;&nbsp;&nbsp;&nbsp;<small style="font-size:10px;opacity:0.8;line-height:0.9;"><i>Reset in <strong>${usageBasedPeriod.remaining} days</strong> (${usageBasedPeriod.start} to ${usageBasedPeriod.end})</i></small><br/>&nbsp;&nbsp;&nbsp;&nbsp;${this.createProgressBar(spendPercentage)}</div>\n\n`,
      );

      const recentItems = [
        ...stats.usageBasedPricing.currentMonth.items,
        ...stats.usageBasedPricing.lastMonth.items,
      ].slice(0, 10);

      if (recentItems.length > 0) {
        const config = vscode.workspace.getConfiguration("cursorPulse");
        const showChargesCollapsed = config.get<boolean>("showChargesCollapsed", true);

        if (showChargesCollapsed && recentItems.length > 1) {
          tooltip.appendMarkdown(
            `<details><summary>&nbsp;&nbsp;$(list-unordered) Usage-Based Charges (${recentItems.length} items)</summary>\n\n`,
          );

          tooltip.appendMarkdown(
            `<div style="font-family:monospace;font-size:9px;line-height:1.0;padding:3px;border:1px solid #444;background-color:#2d2d30;border-radius:3px;margin-top:5px;">\n`,
          );

          for (const item of recentItems) {
            const trimmedDescription = this.trimDescription(item.description, 35);
            const fullDescription = this.escapeHtmlAttribute(item.description);
            tooltip.appendMarkdown(
              `&nbsp;&nbsp;&nbsp;&nbsp;<small style="font-size:9px;"><b>$${item.totalCost.toFixed(2)}</b> <code title="${fullDescription}">${trimmedDescription}</code></small><br/>\n`,
            );
          }

          tooltip.appendMarkdown(`</div>\n`);
          tooltip.appendMarkdown(`</details>\n\n`);
        } else {
          tooltip.appendMarkdown(`$(list-unordered) **Usage-Based Charges**\n\n`);

          tooltip.appendMarkdown(
            `<div style="font-family:monospace;font-size:9px;line-height:1.0;padding:3px;border:1px solid #444;background-color:#2d2d30;border-radius:3px;">\n`,
          );

          const displayItems = recentItems.slice(0, 3);
          for (const item of displayItems) {
            const trimmedDescription = this.trimDescription(item.description, 35);
            const fullDescription = this.escapeHtmlAttribute(item.description);
            tooltip.appendMarkdown(
              `&nbsp;&nbsp;&nbsp;&nbsp;<small style="font-size:9px;"><b>$${item.totalCost.toFixed(2)}</b> <code title="${fullDescription}">${trimmedDescription}</code></small><br/>\n`,
            );
          }

          if (recentItems.length > 3) {
            tooltip.appendMarkdown(
              `&nbsp;&nbsp;&nbsp;&nbsp;<small style="font-size:9px;color:#888;">... and ${recentItems.length - 3} more charges</small><br/>\n`,
            );
          }

          tooltip.appendMarkdown(`</div>\n\n`);
        }
      }
    } else if (stats.usageBasedPricing?.status) {
      tooltip.appendMarkdown(`$(lock) **Usage-Based Pricing:** $(x) Disabled\n\n`);
      tooltip.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;$(info) Only slow requests when quota exceeded\n\n`);
    }

    if (usageEvents && usageEvents.usageEvents.length > 0) {
      const relevantEvents = usageEvents.usageEvents.filter(
        (event) => event.priceCents > 0 || event.status === "errored",
      );

      if (relevantEvents.length > 0) {
        const config = vscode.workspace.getConfiguration("cursorPulse");
        const maxEvents = config.get<number>("maxUsageEvents", 8);

        tooltip.appendMarkdown(`$(clock) **Filtered Usage Events**\n\n`);

        tooltip.appendMarkdown(
          `<div style="font-family:monospace;font-size:9px;line-height:1.0;padding:3px;border:1px solid #444;background-color:#2d2d30;border-radius:3px;">\n`,
        );

        const eventsToShow = relevantEvents.slice(0, maxEvents);
        for (const event of eventsToShow) {
          const timeStr = this.formatEventTime(event.timestamp);
          const requestCount = this.calculateRequestCount(event.priceCents);
          const { model, isMaxMode, isUsageBased, includedInPro, isSlow } = this.extractEventInfo(event);
          const trimmedModel = this.trimDescription(model, 24);
          const modeTag = isMaxMode ? this.createMaxModeSvg() : "";
          const errorTag = event.status === "errored" ? "⚠" : "";
          const slowTag = isSlow && !isMaxMode && !errorTag ? this.createSlowModeSvg() : "";
          const typeTag =
            isUsageBased && !isMaxMode && !errorTag && !includedInPro && !isSlow ? this.createDollarSvg() : "";

          const timeCol = timeStr.padEnd(11);
          const countCol = `${requestCount}×`.padEnd(6);
          const modelCol = trimmedModel.padEnd(26);
          const typeTagText = typeTag;

          const compactDateTime = timeStr;
          const maxModeText = isMaxMode ? "yes" : "no";
          const slowModeText = isSlow ? "yes" : "no";
          const typeText = isUsageBased ? "Usage-Based" : "Included";
          const costText =
            event.priceCents > 0 ? `${requestCount}($${(event.priceCents / 100).toFixed(4)})` : `${requestCount}(free)`;
          const title = `${compactDateTime} model: ${model}, MAX Mode: ${maxModeText}, Slow Mode: ${slowModeText}, type: ${typeText}, Cost Requests: ${costText}`;

          tooltip.appendMarkdown(
            `&nbsp;&nbsp;&nbsp;&nbsp;<small style="font-size:9px;" title="${this.escapeHtmlAttribute(title)}">${timeCol} <b>${countCol}</b> <code>${modelCol}</code> ${modeTag}${errorTag}${slowTag}${typeTagText}</small><br/>\n`,
          );
        }

        if (relevantEvents.length > maxEvents) {
          tooltip.appendMarkdown(
            `&nbsp;&nbsp;&nbsp;&nbsp;<small style="font-size:9px;color:#888;font-style:italic;">... <a href="https://www.cursor.com/dashboard?tab=usage" title="Opens Cursor Dashboard - View complete usage history">view full usage data</a></small><br/>\n`,
          );
        }

        tooltip.appendMarkdown(`</div>\n\n`);
      } else {
        tooltip.appendMarkdown(`$(clock) **Filtered Usage Events**\n\n`);
        tooltip.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;<small>$(info) No recent usage events</small>\n\n`);
      }
    } else {
      tooltip.appendMarkdown(`$(clock) **Filtered Usage Events**\n\n`);
      tooltip.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;<small>$(info) No usage events found</small>\n\n`);
    }

    tooltip.appendMarkdown(`---\n\n`);

    const actions = [];
    actions.push(`$(gear) [Settings](command:workbench.action.openSettings?%22@ext%3Alroolle.cursor-pulse%22)`);

    if (stats.usageBasedPricing?.status.isEnabled) {
      actions.push(`$(settings-gear) [Set Limit](command:cursorPulse.setUsageLimit)`);
    } else if (stats.usageBasedPricing?.status) {
      actions.push(`$(unlock) [Enable Usage-Based](command:cursorPulse.enableUsageBased)`);
    }

    actions.push(`$(refresh) [Reload](command:cursorPulse.softReload)`);
    if (log.isDebugEnabled()) {
      actions.push(`$(note) [Logging](command:cursorPulse.showLogs)`);
    }

    const displayActions = actions.slice(0, 4);
    tooltip.appendMarkdown(displayActions.join(" | "));

    return tooltip;
  }

  private createSimpleTooltip(data: QuotaData): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportThemeIcons = true;
    tooltip.supportHtml = true;

    tooltip.appendMarkdown(`$(pulse) **Cursor Usage**\n\n`);
    tooltip.appendMarkdown(`**Current:** ${data.current}/${data.limit} requests\n\n`);
    tooltip.appendMarkdown(`**Usage:** ${data.percentage}%\n\n`);
    tooltip.appendMarkdown(`**Period:** ${data.period.start} - ${data.period.end}\n\n`);
    tooltip.appendMarkdown(`**Remaining:** ${data.period.remaining} days\n\n`);
    tooltip.appendMarkdown(`**Last updated:** ${data.lastUpdated.toLocaleTimeString()}\n\n`);

    const actions = [];
    actions.push(`$(gear) [Settings](command:cursorPulse.openSettings)`);
    actions.push(`$(refresh) [Soft Reload](command:cursorPulse.softReload)`);

    if (log.isDebugEnabled()) {
      actions.push(`$(note) [Logging](command:cursorPulse.showLogs)`);
    }
    const actionsText = actions.join(" | ");
    tooltip.appendMarkdown(`${actionsText}`);

    return tooltip;
  }

  private createErrorTooltip(error: ApiError): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportThemeIcons = true;
    tooltip.supportHtml = true;

    tooltip.appendMarkdown(`$(alert) **Cursor Pulse - Connection Issue**\n\n`);

    switch (error.type) {
      case "auth":
        tooltip.appendMarkdown(`$(x) **Status:** Authentication failed\n\n`);
        tooltip.appendMarkdown(`$(lightbulb) **Solution:** Please sign in to Cursor\n\n`);
        break;
      case "network":
        tooltip.appendMarkdown(`$(globe) **Status:** Network connection failed\n\n`);
        tooltip.appendMarkdown(`$(lightbulb) **Solution:** Check your internet connection\n\n`);
        break;
      case "api":
        tooltip.appendMarkdown(`$(server) **Status:** Server error\n\n`);
        tooltip.appendMarkdown(`$(lightbulb) **Solution:** Cursor services may be temporarily unavailable\n\n`);
        break;
      default:
        tooltip.appendMarkdown(`$(warning) **Status:** ${error.message}\n\n`);
    }

    const actions = [];
    if (error.retryable) {
      actions.push(`$(refresh) [Try Again](command:cursorPulse.softReload)`);
    }
    actions.push(`$(gear) [Settings](command:cursorPulse.openSettings)`);

    if (log.isDebugEnabled()) {
      actions.push(`$(note) [Logging](command:cursorPulse.showLogs)`);
    }
    const actionsText = actions.join(" | ");
    tooltip.appendMarkdown(`${actionsText}`);

    return tooltip;
  }

  private createProgressBar(percentage: number): string {
    const width = 250;
    const height = 8;
    const borderRadius = height / 2;

    const filledWidth = Math.max(0, Math.min(width, (percentage / 100) * width));

    const fillColor = this.getUsageColor(percentage);

    const backgroundColor = "#e0e0e0";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="${backgroundColor}" />
  ${filledWidth > 0 ? `<rect x="0" y="0" width="${filledWidth}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="${fillColor}" />` : ""}
</svg>`;

    const svgBase64 = Buffer.from(svg.trim()).toString("base64");
    return `<img src="data:image/svg+xml;base64,${svgBase64}" alt="Progress ${percentage}%" width="${width}" height="${height}" />`;
  }

  private determinePlanType(stats: any, userInfo?: UserInfo | null): string {
    if (userInfo?.membershipType) {
      switch (userInfo.membershipType.toLowerCase()) {
        case "pro":
          return "Pro";
        case "team":
          return "Team";
        case "free":
          return "Free";
        default:
          return `${userInfo.membershipType} Plan`;
      }
    }

    if (stats.usageBasedPricing?.status.isEnabled) {
      return "Pro Plan";
    }

    return "Free Plan";
  }

  private formatEventTime(timestamp: string): string {
    const date = new Date(parseInt(timestamp));
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = date.getDate();
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${month} ${day}, ${time}`;
  }

  private calculateRequestCount(priceCents: number): string {
    const requestCount = Math.round((priceCents / 4) * 10) / 10;
    return requestCount.toString();
  }

  private extractEventInfo(event: UsageEvent): {
    model: string;
    isMaxMode: boolean;
    isUsageBased: boolean;
    includedInPro: boolean;
    isSlow: boolean;
  } {
    let model = "unknown";
    let isMaxMode = false;
    let isUsageBased = event.priceCents > 0;
    let includedInPro = false;
    let isSlow = Boolean(event.isSlow);

    if (event.subscriptionProductId && event.subscriptionProductId !== "") {
      includedInPro = true;
    }

    if (event.details.fastApply) {
      model = "fast-apply";
    } else if (event.details.toolCallComposer) {
      model = event.details.toolCallComposer.modelIntent;
      isMaxMode = event.details.toolCallComposer.maxMode;
    } else if (event.details.composer) {
      model = (event.details as any).composer.modelIntent;
      isMaxMode = (event.details as any).composer.maxMode;
    } else if ((event.details as any).chat) {
      model = (event.details as any).chat.modelIntent;
      isMaxMode = (event.details as any).chat.maxMode;
    }

    return { model, isMaxMode, isUsageBased, includedInPro, isSlow };
  }

  private trimDescription(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + "...";
  }

  private escapeHtmlAttribute(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private createMaxModeSvg(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10" viewBox="0 0 8 10">
  <defs>
    <linearGradient id="magicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#d64cd6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3a8de3;stop-opacity:1" />
    </linearGradient>
  </defs>
  <text x="4" y="8" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-size="8" font-weight="600" fill="url(#magicGradient)">M</text>
</svg>`;

    const svgBase64 = Buffer.from(svg.trim()).toString("base64");
    return `<img src="data:image/svg+xml;base64,${svgBase64}" alt="M" width="8" height="10" style="vertical-align: middle;" />`;
  }

  private createDollarSvg(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10" viewBox="0 0 24 24">
  <g fill="#fbbf24" fill-rule="evenodd" clip-rule="evenodd">
    <path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10" opacity=".4"/>
    <path d="M12 5.25a.75.75 0 0 1 .75.75v.317c1.63.292 3 1.517 3 3.183a.75.75 0 0 1-1.5 0c0-.678-.564-1.397-1.5-1.653v3.47c1.63.292 3 1.517 3 3.183s-1.37 2.891-3 3.183V18a.75.75 0 0 1-1.5 0v-.317c-1.63-.292-3-1.517-3-3.183a.75.75 0 0 1 1.5 0c0 .678.564 1.397 1.5 1.652v-3.469c-1.63-.292-3-1.517-3-3.183s1.37-2.891 3-3.183V6a.75.75 0 0 1 .75-.75m-.75 2.597c-.936.256-1.5.975-1.5 1.653s.564 1.397 1.5 1.652zm3 6.653c0-.678-.564-1.397-1.5-1.652v3.304c.936-.255 1.5-.974 1.5-1.652"/>
  </g>
</svg>`;

    const svgBase64 = Buffer.from(svg.trim()).toString("base64");
    return `<img src="data:image/svg+xml;base64,${svgBase64}" alt="$" width="8" height="10" style="vertical-align: middle;" />`;
  }

  private createSlowModeSvg(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16">
  <g fill="none">
    <path d="M7.343 3.989c-1.856 0-3.032 1.316-3.484 2.807l-.06.2H2.497a.5.5 0 0 0-.5.5c0 .686.19 1.328.522 1.813c.117.171.256.328.415.458l-.299.725a1.094 1.094 0 0 0 1.012 1.511H4.72c.424 0 .81-.245.99-.628l.304-.645a10.72 10.72 0 0 0 2.746 0l.303.645c.18.383.567.628.99.628h1.063a1.093 1.093 0 0 0 1.012-1.511l-.202-.49h.965c.617 0 1.112-.525 1.112-1.132v-.62c0-.94-.734-1.75-1.69-1.75h-1.464c-.534-1.385-1.793-2.511-3.506-2.511zm4.244 5.013L11.154 7.5h1.159c.357 0 .69.314.69.75v.62a.14.14 0 0 1-.041.096c-.028.028-.055.036-.071.036h-1.304zM9.78 10.547c.388-.088.773-.199 1.153-.331l.271.657a.094.094 0 0 1-.087.13h-1.062a.094.094 0 0 1-.086-.054l-.189-.402zm-5.947-.334c.383.134.771.246 1.163.335l-.19.4a.094.094 0 0 1-.085.055H3.647a.094.094 0 0 1-.087-.13l.272-.66zm-.336-2.217l-.202.67a2.082 2.082 0 0 1-.25-.67h.452z" fill="#6b7280"/>
  </g>
</svg>`;

    const svgBase64 = Buffer.from(svg.trim()).toString("base64");
    return `<img src="data:image/svg+xml;base64,${svgBase64}" alt="Slow" width="12" height="12" style="vertical-align: middle;" />`;
  }

  private shouldFlipToUsageBasedDisplay(quota: QuotaData, stats: CursorStats): boolean {
    try {
      return (
        stats.usageBasedPricing?.status.isEnabled === true &&
        quota.current >= quota.limit &&
        stats.usageBasedPricing?.currentMonth !== undefined &&
        stats.usageBasedPricing?.lastMonth !== undefined
      );
    } catch (error) {
      log.warn("Error checking usage-based display conditions", error);
      return false;
    }
  }

  private animateQuotaIncreaseWithOldValue(
    percentage: number,
    currentQuota: number,
    quotaLimit: number,
    showPercentage: boolean,
    oldQuota: number,
  ): void {
    if (!this.isAnimationEnabled()) {
      return;
    }

    this.clearAnimationTimers();
    const delta = currentQuota - oldQuota;

    this.executeFrameAnimation(delta, percentage, (frame: number) =>
      this.formatPremiumFrames(frame, delta, oldQuota, currentQuota, quotaLimit, showPercentage),
    );
  }

  private animateUsageBasedIncreaseWithOldValue(
    percentage: number,
    totalSpend: number,
    spendLimit: number,
    showPercentage: boolean,
    oldSpend: number,
    currentSpend: number,
  ): void {
    if (!this.isAnimationEnabled()) {
      return;
    }

    this.clearAnimationTimers();
    const delta = currentSpend - oldSpend;

    this.executeFrameAnimation(delta, percentage, (frame: number) =>
      this.formatUsageBasedFrames(frame, delta, oldSpend, currentSpend, totalSpend, spendLimit, showPercentage),
    );
  }

  private isAnimationEnabled(): boolean {
    const config = vscode.workspace.getConfiguration("cursorPulse");
    const isEnabled = config.get<boolean>("enableQuotaAnimation", true);

    if (!isEnabled) {
      this.statusBarItem.color = this.getUsageColor(0);
      return false;
    }
    return true;
  }

  private executeFrameAnimation(
    delta: number,
    percentage: number,
    frameFormatter: (frame: number) => { text: string; color: string | vscode.ThemeColor },
  ): void {
    const { BOOST_THRESHOLD, MAGIC_THRESHOLD } = StatusBarProvider.ANIMATION_CONFIG;

    if (delta >= MAGIC_THRESHOLD) {
      this.runMagicFrameAnimation(percentage, frameFormatter);
    } else if (delta >= BOOST_THRESHOLD) {
      this.runBoostFrameAnimation(percentage, frameFormatter);
    } else {
      this.runBasicFrameAnimation(percentage, frameFormatter);
    }
  }

  private formatPremiumFrames(
    frame: number,
    delta: number,
    oldQuota: number,
    currentQuota: number,
    quotaLimit: number,
    showPercentage: boolean,
  ): { text: string; color: string | vscode.ThemeColor } {
    const percentageDisplay = showPercentage ? ` (${Math.round((currentQuota / quotaLimit) * 100)}%)` : "";
    const animationType = this.getAnimationType(delta);

    switch (frame) {
      case 1:
        return {
          text: `$(zap) ${oldQuota}/${quotaLimit}${percentageDisplay}`,
          color: this.getUsageColor(Math.round((oldQuota / quotaLimit) * 100)),
        };

      case 2:
        if (animationType === "basic") {
          return {
            text: `$(fold-up) +${delta} ${oldQuota}/${quotaLimit}${percentageDisplay}`,
            color: new vscode.ThemeColor("statusBarItem.prominentForeground"),
          };
        } else {
          return {
            text: `$(fold-up) +${delta} ${oldQuota}/${quotaLimit}${percentageDisplay}`,
            color: StatusBarProvider.ANIMATION_CONFIG.COLORS.BLUE,
          };
        }

      case 3:
        if (animationType === "basic") {
          return {
            text: `$(fold-up) +${delta} ${currentQuota}/${quotaLimit}${percentageDisplay}`,
            color: new vscode.ThemeColor("statusBarItem.prominentBackground"),
          };
        } else if (animationType === "boost") {
          return {
            text: `$(fold-up) +${delta} ${currentQuota}/${quotaLimit}${percentageDisplay}`,
            color: StatusBarProvider.ANIMATION_CONFIG.COLORS.PURPLE,
          };
        } else {
          return {
            text: `$(fold-up) +${delta} ${currentQuota}/${quotaLimit}${percentageDisplay}`,
            color: StatusBarProvider.ANIMATION_CONFIG.COLORS.MAGIC_BLUE,
          };
        }

      default:
        return {
          text: this.originalText,
          color: this.getUsageColor(Math.round((currentQuota / quotaLimit) * 100)),
        };
    }
  }

  private formatUsageBasedFrames(
    frame: number,
    delta: number,
    oldSpend: number,
    currentSpend: number,
    totalSpend: number,
    spendLimit: number,
    showPercentage: boolean,
  ): { text: string; color: string | vscode.ThemeColor } {
    const limitDisplay = spendLimit === 0 ? "∞" : spendLimit.toString();
    const percentageDisplay = showPercentage ? ` (${Math.round((totalSpend / spendLimit) * 100)}%)` : "";
    const animationType = this.getAnimationType(delta);

    switch (frame) {
      case 1:
        return {
          text: `$(credit-card) $${oldSpend.toFixed(2)}/${limitDisplay}${percentageDisplay}`,
          color: this.getUsageColor(Math.round((oldSpend / spendLimit) * 100)),
        };

      case 2:
        if (animationType === "basic") {
          return {
            text: `$(fold-up) +$${delta.toFixed(2)} $${oldSpend.toFixed(2)}/${limitDisplay}${percentageDisplay}`,
            color: new vscode.ThemeColor("statusBarItem.prominentForeground"),
          };
        } else {
          return {
            text: `$(fold-up) +$${delta.toFixed(2)} $${oldSpend.toFixed(2)}/${limitDisplay}${percentageDisplay}`,
            color: StatusBarProvider.ANIMATION_CONFIG.COLORS.BLUE,
          };
        }

      case 3:
        if (animationType === "basic") {
          return {
            text: `$(fold-up) +$${delta.toFixed(2)} $${currentSpend.toFixed(2)}/${limitDisplay}${percentageDisplay}`,
            color: new vscode.ThemeColor("statusBarItem.prominentBackground"),
          };
        } else if (animationType === "boost") {
          return {
            text: `$(fold-up) +$${delta.toFixed(2)} $${currentSpend.toFixed(2)}/${limitDisplay}${percentageDisplay}`,
            color: StatusBarProvider.ANIMATION_CONFIG.COLORS.PURPLE,
          };
        } else {
          return {
            text: `$(fold-up) +$${delta.toFixed(2)} $${currentSpend.toFixed(2)}/${limitDisplay}${percentageDisplay}`,
            color: StatusBarProvider.ANIMATION_CONFIG.COLORS.MAGIC_BLUE,
          };
        }

      default:
        return {
          text: this.originalText,
          color: this.getUsageColor(Math.round((totalSpend / spendLimit) * 100)),
        };
    }
  }

  private getAnimationType(delta: number): "basic" | "boost" | "magic" {
    const { BOOST_THRESHOLD, MAGIC_THRESHOLD } = StatusBarProvider.ANIMATION_CONFIG;

    if (delta >= MAGIC_THRESHOLD) {
      return "magic";
    }
    if (delta >= BOOST_THRESHOLD) {
      return "boost";
    }
    return "basic";
  }

  private runBasicFrameAnimation(
    percentage: number,
    frameFormatter: (frame: number) => { text: string; color: string | vscode.ThemeColor },
  ): void {
    const { BASIC } = StatusBarProvider.ANIMATION_CONFIG.FRAME_DURATION;

    this.playFrameSequence([1, 2, 3], BASIC, frameFormatter, percentage);
  }

  private runBoostFrameAnimation(
    percentage: number,
    frameFormatter: (frame: number) => { text: string; color: string | vscode.ThemeColor },
  ): void {
    const { BOOST } = StatusBarProvider.ANIMATION_CONFIG.FRAME_DURATION;

    this.playFrameSequence([1, 2, 3], BOOST, frameFormatter, percentage);
  }

  private runMagicFrameAnimation(
    percentage: number,
    frameFormatter: (frame: number) => { text: string; color: string | vscode.ThemeColor },
  ): void {
    const { MAGIC } = StatusBarProvider.ANIMATION_CONFIG.FRAME_DURATION;

    this.playFrameSequence([1, 2, 3], MAGIC, frameFormatter, percentage);
  }

  private playFrameSequence(
    frames: number[],
    frameDuration: number,
    frameFormatter: (frame: number) => { text: string; color: string | vscode.ThemeColor },
    finalPercentage: number,
  ): void {
    let currentFrameIndex = 0;

    const playNextFrame = () => {
      if (currentFrameIndex >= frames.length) {
        this.restoreOriginalState(finalPercentage);
        return;
      }

      const frame = frames[currentFrameIndex];
      const { text, color } = frameFormatter(frame);

      this.statusBarItem.text = text;
      this.statusBarItem.color = color;

      currentFrameIndex++;

      if (currentFrameIndex < frames.length) {
        this.animationTimer = setTimeout(playNextFrame, frameDuration);
      } else {
        this.animationTimer = setTimeout(() => {
          this.restoreOriginalState(finalPercentage);
        }, frameDuration);
      }
    };

    playNextFrame();
  }

  private restoreOriginalState(percentage: number): void {
    this.statusBarItem.text = this.originalText;
    this.statusBarItem.color = this.getUsageColor(percentage);
    this.clearAnimationTimers();
  }

  private clearAnimationTimers(): void {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = undefined;
    }
    if (this.flipTimer) {
      clearTimeout(this.flipTimer);
      this.flipTimer = undefined;
    }
  }

  private displayPremiumStatusWithOldValue(
    quota: QuotaData,
    showPercentage: boolean,
    quotaIncreased: boolean = false,
    oldQuota: number = 0,
  ): void {
    try {
      const percentageText = showPercentage ? ` (${quota.percentage}%)` : "";
      const normalText = `$(zap) ${quota.current}/${quota.limit}${percentageText}`;
      this.statusBarItem.text = normalText;
      this.originalText = normalText;

      if (quotaIncreased) {
        this.animateQuotaIncreaseWithOldValue(quota.percentage, quota.current, quota.limit, showPercentage, oldQuota);
      } else {
        this.statusBarItem.color = this.getStatusColor(quota.percentage);
      }
    } catch (error) {
      log.error("Error displaying premium status", error);
      this.statusBarItem.text = `$(zap) ${quota.current}/${quota.limit}`;
      this.statusBarItem.color = this.getStatusColor(quota.percentage);
    }
  }

  dispose(): void {
    this.clearAnimationTimers();
    this.statusBarItem.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
