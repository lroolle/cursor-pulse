import { PeriodInfo } from "../types";

export class DateUtils {
  private static formatDateWithMonthName(date: Date): string {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[date.getMonth()]} ${date.getDate()}`;
  }

  static calculatePeriod(startOfMonth: string): PeriodInfo {
    const start = new Date(startOfMonth);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1); // End on the last day of the period

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const elapsedDays = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const remaining = Math.max(0, totalDays - elapsedDays);

    return {
      start: this.formatDateWithMonthName(start),
      end: this.formatDateWithMonthName(end),
      remaining,
    };
  }

  static calculateCurrentMonthPeriod(): PeriodInfo {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const totalDays = end.getDate();
    const elapsedDays = today.getDate();
    const remaining = Math.max(0, totalDays - elapsedDays);

    return {
      start: this.formatDateWithMonthName(start),
      end: this.formatDateWithMonthName(end),
      remaining,
    };
  }

  static calculateUsageBasedPeriod(billingDay: number = 3): PeriodInfo {
    const currentDate = new Date();

    let periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), billingDay);
    let periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, billingDay - 1);

    if (currentDate.getDate() < billingDay) {
      periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, billingDay);
      periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), billingDay - 1);
    }

    const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const elapsedDays = Math.ceil((today.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));

    const remaining = Math.max(0, totalDays - elapsedDays);

    return {
      start: this.formatDateWithMonthName(periodStart),
      end: this.formatDateWithMonthName(periodEnd),
      remaining,
    };
  }
}
