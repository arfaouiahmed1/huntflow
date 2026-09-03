"use client";

import { toErrorMessage } from "@/lib/errors";

export interface StatsResponse {
  funnel: { status: string; count: number }[];
  weekly: { week: string; applied: number; interviews: number }[];
  responseRate: { replied: number; sent: number; rate: number };
  overdueFollowUps: number;
  upcomingInterviews: number;
  topCompanies: { company: string; count: number }[];
  contactCount: number;
  openPositions: number;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch("/api/data/stats", { cache: "no-store" });
  if (!res.ok) {
    let msg = `Stats ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") msg = data.error;
      else if (typeof data?.error?.message === "string") msg = data.error.message;
      else if (typeof data?.message === "string") msg = data.message;
    } catch {
      msg = `Stats ${res.status}: ${toErrorMessage(new Error(res.statusText))}`;
    }
    throw new Error(msg);
  }
  return res.json() as Promise<StatsResponse>;
}
