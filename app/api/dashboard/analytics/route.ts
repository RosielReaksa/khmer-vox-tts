import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import {
  listUserApiKeys,
  listUserGenerations,
  getUserTokenBalance,
  getUserTotalCreditsEarned,
} from "@/lib/store";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "24h"; // "24h", "7d", "30d"

  try {
    const [apiKeys, generations, currentBalance, totalCreditsEarned] =
      await Promise.all([
        listUserApiKeys(user.id),
        listUserGenerations(user.id, { limit: 1000 }),
        getUserTokenBalance(user.id),
        getUserTotalCreditsEarned(user.id),
      ]);

    const activeKeysCount = apiKeys.filter((k) => !k.revokedAt).length;

    // Filter generations by period
    const now = new Date();
    let periodMs = 24 * 60 * 60 * 1000;
    if (period === "7d") periodMs = 7 * 24 * 60 * 60 * 1000;
    if (period === "30d") periodMs = 30 * 24 * 60 * 60 * 1000;

    const cutoffDate = new Date(now.getTime() - periodMs);

    const filteredGenerations = generations.filter((g) => {
      const gDate = new Date(g.createdAt);
      return gDate >= cutoffDate;
    });

    const totalRequests = filteredGenerations.length;
    const successfulRequests = filteredGenerations.filter(
      (g) => g.status === "success",
    );
    const successRatePercent =
      totalRequests > 0
        ? Math.round((successfulRequests.length / totalRequests) * 1000) / 10
        : 100.0;

    const totalLatency = successfulRequests.reduce(
      (acc, g) => acc + (g.latencyMs || 0),
      0,
    );
    const avgLatencyMs =
      successfulRequests.length > 0
        ? Math.round(totalLatency / successfulRequests.length)
        : 0;

    const tokensUsedInPeriod = filteredGenerations.reduce(
      (acc, g) => acc + (g.creditsCharged || 0),
      0,
    );

    // Prepare line chart and bar chart data
    let requestsOverTime: Array<{ label: string; value: number }> = [];
    let latencyDistribution = [
      { label: "50ms", count: 0 },
      { label: "100ms", count: 0 },
      { label: "150ms", count: 0 },
      { label: "200ms", count: 0 },
      { label: "300ms", count: 0 },
      { label: "500ms+", count: 0 },
    ];

    let displayRequests = totalRequests;
    let displaySuccessRate = successRatePercent;
    let displayAvgLatency = avgLatencyMs || 120; // default baseline latency
    let displayTokensUsed = tokensUsedInPeriod;
    let isDemo = false;

    // Generate recent activity logs
    let recentActivity = filteredGenerations.slice(0, 10).map((g) => ({
      id: g.id,
      endpoint: g.mode === "clone" ? "/v1/synthesize/stream" : "/v1/synthesize",
      method: "POST",
      status:
        g.status === "success"
          ? "200 OK"
          : g.errorMessage?.includes("rate")
            ? "429 Rate Limit"
            : "500 Error",
      statusCode:
        g.status === "success"
          ? 200
          : g.errorMessage?.includes("rate")
            ? 429
            : 500,
      latency: g.status === "success" ? `${g.latencyMs || 120}ms` : "--",
      time: formatRelativeTime(new Date(g.createdAt)),
      rawTime: g.createdAt,
    }));

    if (totalRequests === 0) {
      // User has no activity in this period, let's inject realistic demo data
      isDemo = true;
      displayRequests = period === "24h" ? 245 : period === "7d" ? 1720 : 8420;
      displaySuccessRate = 99.8;
      displayAvgLatency = 245;
      displayTokensUsed =
        period === "24h" ? 45000 : period === "7d" ? 312000 : 1500000;

      // Seed chart data
      if (period === "24h") {
        const hours = [
          "22:00",
          "00:00",
          "02:00",
          "04:00",
          "06:00",
          "08:00",
          "10:00",
          "12:00",
          "14:00",
          "16:00",
          "18:00",
          "20:00",
        ];
        const values = [12, 8, 5, 4, 15, 22, 35, 28, 42, 30, 25, 19];
        requestsOverTime = hours.map((h, i) => ({
          label: h,
          value: values[i],
        }));
      } else if (period === "7d") {
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const values = [210, 245, 195, 280, 310, 260, 220];
        requestsOverTime = days.map((d, i) => ({ label: d, value: values[i] }));
      } else {
        const intervals = [
          "1-3",
          "4-6",
          "7-9",
          "10-12",
          "13-15",
          "16-18",
          "19-21",
          "22-24",
          "25-27",
          "28-30",
        ];
        const values = [780, 810, 720, 890, 940, 860, 910, 790, 850, 870];
        requestsOverTime = intervals.map((int, i) => ({
          label: `Day ${int}`,
          value: values[i],
        }));
      }

      latencyDistribution = [
        { label: "50ms", count: Math.round(displayRequests * 0.2) },
        { label: "100ms", count: Math.round(displayRequests * 0.4) },
        { label: "150ms", count: Math.round(displayRequests * 0.8) },
        { label: "200ms", count: Math.round(displayRequests * 0.6) },
        { label: "300ms", count: Math.round(displayRequests * 0.3) },
        { label: "500ms+", count: Math.round(displayRequests * 0.15) },
      ];

      recentActivity = [
        {
          id: "demo-1",
          endpoint: "/v1/synthesize",
          method: "POST",
          status: "200 OK",
          statusCode: 200,
          latency: "124ms",
          time: "Just now",
          rawTime: new Date().toISOString(),
        },
        {
          id: "demo-2",
          endpoint: "/v1/voices",
          method: "GET",
          status: "200 OK",
          statusCode: 200,
          latency: "45ms",
          time: "2 mins ago",
          rawTime: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
        },
        {
          id: "demo-3",
          endpoint: "/v1/synthesize",
          method: "POST",
          status: "429 Rate Limit",
          statusCode: 429,
          latency: "--",
          time: "15 mins ago",
          rawTime: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
        },
        {
          id: "demo-4",
          endpoint: "/v1/synthesize/stream",
          method: "POST",
          status: "500 Error",
          statusCode: 500,
          latency: "1250ms",
          time: "1 hour ago",
          rawTime: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        },
        {
          id: "demo-5",
          endpoint: "/v1/synthesize",
          method: "POST",
          status: "200 OK",
          statusCode: 200,
          latency: "185ms",
          time: "2 hours ago",
          rawTime: new Date(now.getTime() - 120 * 60 * 1000).toISOString(),
        },
      ];
    } else {
      // Use real data to group into chart intervals
      // 1. Line Chart
      const intervalsCount = period === "24h" ? 12 : period === "7d" ? 7 : 10;
      const intervalMs = periodMs / intervalsCount;

      for (let i = 0; i < intervalsCount; i++) {
        const intervalStart = new Date(cutoffDate.getTime() + i * intervalMs);
        const intervalEnd = new Date(
          cutoffDate.getTime() + (i + 1) * intervalMs,
        );

        const count = filteredGenerations.filter((g) => {
          const d = new Date(g.createdAt);
          return d >= intervalStart && d < intervalEnd;
        }).length;

        let label = "";
        if (period === "24h") {
          label = intervalStart.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        } else if (period === "7d") {
          label = intervalStart.toLocaleDateString([], { weekday: "short" });
        } else {
          label = `${intervalStart.getDate()}/${intervalStart.getMonth() + 1}`;
        }

        requestsOverTime.push({ label, value: count });
      }

      // 2. Bar Chart Latency Distribution
      filteredGenerations.forEach((g) => {
        if (g.status !== "success") return;
        const lat = g.latencyMs || 0;
        if (lat < 50) latencyDistribution[0].count++;
        else if (lat < 100) latencyDistribution[1].count++;
        else if (lat < 150) latencyDistribution[2].count++;
        else if (lat < 200) latencyDistribution[3].count++;
        else if (lat < 300) latencyDistribution[4].count++;
        else latencyDistribution[5].count++;
      });
    }

    // Determine token limits for the progress card
    const totalCredits = Math.max(totalCreditsEarned, currentBalance, 10000); // minimum baseline
    const remainingCredits = currentBalance;
    const usedPercent =
      totalCredits > 0
        ? Math.min(
            100,
            Math.round(
              ((totalCredits - remainingCredits) / totalCredits) * 100,
            ),
          )
        : 0;

    return NextResponse.json({
      activeKeysCount,
      totalRequests: displayRequests,
      successRatePercent: displaySuccessRate,
      avgLatencyMs: displayAvgLatency,
      tokensUsed: displayTokensUsed,
      totalCredits,
      remainingCredits,
      usedPercent,
      requestsOverTime,
      latencyDistribution,
      recentActivity,
      isDemo,
    });
  } catch (error) {
    console.error("Failed to load analytics:", error);
    return NextResponse.json(
      { error: "Failed to load analytics data" },
      { status: 500 },
    );
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = new Date().getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
