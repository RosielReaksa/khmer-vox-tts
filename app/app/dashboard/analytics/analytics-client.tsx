"use client";

import { useState, useMemo } from "react";
import { useCachedJson } from "@/app/app/dashboard/dashboard-data-cache";
import { VoxLoader } from "@/app/components/vox-loader";

type AnalyticsData = {
  activeKeysCount: number;
  totalRequests: number;
  successRatePercent: number;
  avgLatencyMs: number;
  tokensUsed: number;
  totalCredits: number;
  remainingCredits: number;
  usedPercent: number;
  requestsOverTime: Array<{ label: string; value: number }>;
  latencyDistribution: Array<{ label: string; count: number }>;
  recentActivity: Array<{
    id: string;
    endpoint: string;
    method: string;
    status: string;
    statusCode: number;
    latency: string;
    time: string;
    rawTime: string;
  }>;
  isDemo: boolean;
};

export function AnalyticsClient() {
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h");
  const { data, error, loading, refresh } = useCachedJson<AnalyticsData>(
    `dashboard:analytics:${period}`,
    `/api/dashboard/analytics?period=${period}`,
    { pollMs: 30000 }
  );

  const activeKeysCount = data?.activeKeysCount ?? 0;
  const totalRequests = data?.totalRequests ?? 0;
  const successRatePercent = data?.successRatePercent ?? 100;
  const avgLatencyMs = data?.avgLatencyMs ?? 0;
  const tokensUsed = data?.tokensUsed ?? 0;
  const totalCredits = data?.totalCredits ?? 0;
  const remainingCredits = data?.remainingCredits ?? 0;
  const usedPercent = data?.usedPercent ?? 0;
  const requestsOverTime = data?.requestsOverTime ?? [];
  const latencyDistribution = data?.latencyDistribution ?? [];
  const recentActivity = data?.recentActivity ?? [];
  const isDemo = data?.isDemo ?? false;

  // Calculate dynamic SVG path for line chart
  const lineChartPath = useMemo(() => {
    if (requestsOverTime.length < 2) return "";
    const values = requestsOverTime.map((d) => d.value);
    const maxVal = Math.max(...values, 1);
    
    // Convert points to SVG coordinates (viewbox 0 0 100 100)
    const points = requestsOverTime.map((d, i) => {
      const x = (i / (requestsOverTime.length - 1)) * 100;
      const y = 90 - (d.value / maxVal) * 75; // leave 10px margin at top, 10px at bottom
      return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L100,100 L0,100 Z`;

    return { linePath, areaPath };
  }, [requestsOverTime]);

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as "24h" | "7d" | "30d";
    setPeriod(value);
  };

  const handleExport = () => {
    // Generate CSV data from recentActivity and trigger download
    try {
      const headers = ["ID", "Endpoint", "Method", "Status", "Latency", "Time"];
      const rows = recentActivity.map((r) => [
        r.id,
        r.endpoint,
        r.method,
        r.status,
        r.latency,
        r.rawTime || r.time,
      ]);
      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((e) => e.map(val => `"${val}"`).join(","))].join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `khmervox_analytics_export_${period}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export analytics CSV:", err);
    }
  };

  // Radial chart stroke calculations
  const radius = 40;
  const circumference = 2 * Math.PI * radius; // 251.3
  const strokeDashoffset = circumference * (1 - usedPercent / 100);

  return (
    <div className="dashboard-enter flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-4 border-b-4 border-primary">
        <div>
          <h1 className="font-sans font-black text-4xl sm:text-5xl lg:text-6xl uppercase tracking-tighter leading-none mb-2 text-primary">
            Analytics
          </h1>
          <p className="font-body text-base font-semibold text-primary/70 max-w-xl">
            Monitor your API performance, token consumption, and system health in real-time.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isDemo && (
            <span className="font-sans text-[10px] font-black uppercase bg-[#ffcc00] border-2 border-primary px-3 py-1 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              Demo Data Mode
            </span>
          )}
          <select
            value={period}
            onChange={handlePeriodChange}
            className="bg-white font-sans font-bold uppercase text-xs border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] py-2 px-4 focus:ring-0 focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button
            onClick={handleExport}
            disabled={recentActivity.length === 0}
            className="bg-primary text-[#faf7f2] font-sans font-bold uppercase text-xs py-2.5 px-5 border-4 border-primary hover:bg-[#0055ff] hover:text-white transition-colors shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-y-1 active:translate-x-1 active:shadow-none flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-sm font-bold">download</span>
            Export
          </button>
        </div>
      </div>

      {error && (
        <div className="border-4 border-primary bg-[#ffdad6] p-4 text-sm font-bold text-[#93000a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          {error}
        </div>
      )}

      {loading && !data ? (
        <VoxLoader variant="panel" label="Loading analytics..." />
      ) : (
        <>
          {/* Bento Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
            {/* Radial progress card */}
            <div className="lg:col-span-1 bg-[#ffcc00] border-4 border-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] p-6 flex flex-col justify-between h-full relative overflow-hidden group hover:bg-primary hover:text-[#faf7f2] transition-colors duration-300">
              <div className="relative z-10">
                <h2 className="font-sans font-black text-2xl uppercase tracking-tight mb-1">
                  Usage Overview
                </h2>
                <p className="font-body font-bold text-xs uppercase opacity-85">
                  Token Consumption
                </p>
              </div>

              <div className="flex-1 flex items-center justify-center relative z-10 my-6">
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      className="opacity-20"
                      cx="50"
                      cy="50"
                      fill="transparent"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth="11"
                    />
                    <circle
                      className="text-primary group-hover:text-[#ffcc00] transition-colors duration-300"
                      cx="50"
                      cy="50"
                      fill="transparent"
                      r={radius}
                      stroke="currentColor"
                      strokeDasharray={circumference.toFixed(1)}
                      strokeDashoffset={strokeDashoffset.toFixed(1)}
                      strokeWidth="11"
                      strokeLinecap="square"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-sans font-black text-4xl">{usedPercent}%</span>
                    <span className="font-sans font-black text-[10px] uppercase mt-0.5">
                      Utilized
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 mt-auto pt-4 border-t-2 border-primary group-hover:border-[#faf7f2]/20">
                <div className="flex justify-between items-center font-sans font-black text-sm uppercase">
                  <span>
                    {remainingCredits.toLocaleString()} / {totalCredits.toLocaleString()}
                  </span>
                  <span className="text-xs">Tokens Left</span>
                </div>
              </div>
            </div>

            {/* Metrics cards */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Card 1: Total Requests */}
              <div className="bg-white border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] p-5 flex flex-col justify-between hover:bg-[#eee9e0] transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <span className="font-sans font-black uppercase text-xs tracking-wider text-primary/70">
                    Total Requests
                  </span>
                  <span className="material-symbols-outlined text-2xl text-[#0055ff]">swap_vert</span>
                </div>
                <div>
                  <div className="font-sans font-black text-4xl sm:text-5xl tracking-tighter leading-none">
                    {totalRequests.toLocaleString()}
                  </div>
                  <div className="font-body font-bold text-xs mt-2 flex items-center gap-1 text-primary/80">
                    <span className="material-symbols-outlined text-sm font-bold text-[#0055ff]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      arrow_upward
                    </span>
                    API usage in selected period
                  </div>
                </div>
              </div>

              {/* Card 2: Avg Latency */}
              <div className="bg-white border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] p-5 flex flex-col justify-between hover:bg-[#eee9e0] transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <span className="font-sans font-black uppercase text-xs tracking-wider text-primary/70">
                    Avg Latency
                  </span>
                  <span className="material-symbols-outlined text-2xl text-[#e63b2e]">speed</span>
                </div>
                <div>
                  <div className="font-sans font-black text-4xl sm:text-5xl tracking-tighter leading-none">
                    {avgLatencyMs}
                    <span className="text-xl ml-1 font-bold lowercase">ms</span>
                  </div>
                  <div className={`font-body font-bold text-xs mt-2 flex items-center gap-1 ${avgLatencyMs > 500 ? "text-[#e63b2e]" : "text-primary/80"}`}>
                    {avgLatencyMs > 500 ? (
                      <>
                        <span className="material-symbols-outlined text-sm font-bold text-[#e63b2e]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          warning
                        </span>
                        Elevated server response time
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm font-bold text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                        Optimal audio synthesis latency
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 3: Success Rate */}
              <div className="bg-white border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] p-5 flex flex-col justify-between hover:bg-[#eee9e0] transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <span className="font-sans font-black uppercase text-xs tracking-wider text-primary/70">
                    Success Rate
                  </span>
                  <span className="material-symbols-outlined text-2xl text-[#10b981]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
                <div>
                  <div className="font-sans font-black text-4xl sm:text-5xl tracking-tighter leading-none text-emerald-600">
                    {successRatePercent}%
                  </div>
                  <div className="font-body font-bold text-xs mt-2 text-primary/80">
                    {successRatePercent === 100 ? "All requests processed successfully" : "Stable service delivery rate"}
                  </div>
                </div>
              </div>

              {/* Card 4: Active Keys */}
              <div className="bg-white border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] p-5 flex flex-col justify-between hover:bg-[#eee9e0] transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <span className="font-sans font-black uppercase text-xs tracking-wider text-primary/70">
                    Active Keys
                  </span>
                  <span className="material-symbols-outlined text-2xl text-[#0055ff]">vpn_key</span>
                </div>
                <div>
                  <div className="font-sans font-black text-4xl sm:text-5xl tracking-tighter leading-none">
                    {activeKeysCount}
                  </div>
                  <div className="font-body font-bold text-xs mt-2 text-primary/80">
                    Active tokens keys across environments
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Charts Section */}
          <section className="mt-4 flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Line Chart Area */}
              <div className="bg-white border-4 border-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] p-5">
                <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-primary">
                  <h3 className="font-sans font-black uppercase text-sm text-primary">
                    Requests Over Time
                  </h3>
                  <span className="font-sans font-bold text-xs text-primary/60">
                    Interval Activity
                  </span>
                </div>
                
                {requestsOverTime.length > 0 ? (
                  <div className="relative pt-2">
                    <div className="h-56 w-full bg-[#eee9e0] border-4 border-primary relative overflow-hidden flex items-end px-1">
                      <div className="w-full h-full relative">
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                          {lineChartPath && (
                            <>
                              <path d={lineChartPath.areaPath} fill="#ffcc00" opacity="0.35" />
                              <path
                                d={lineChartPath.linePath}
                                fill="none"
                                stroke="#1a1a1a"
                                strokeLinejoin="round"
                                strokeWidth="3"
                              />
                            </>
                          )}
                        </svg>
                      </div>
                    </div>
                    {/* X-axis labels */}
                    <div className="flex justify-between mt-2 px-1 font-sans font-bold text-[9px] sm:text-[10px] text-primary/80 uppercase">
                      {requestsOverTime.map((d, i) => (
                        <span key={i} className="text-center w-full truncate">
                          {d.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-56 w-full bg-[#eee9e0] border-4 border-primary flex items-center justify-center font-sans font-bold text-sm text-primary/50">
                    No chart data available
                  </div>
                )}
              </div>

              {/* Bar Chart Area */}
              <div className="bg-white border-4 border-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] p-5">
                <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-primary">
                  <h3 className="font-sans font-black uppercase text-sm text-primary">
                    Latency Distribution
                  </h3>
                  <span className="font-sans font-bold text-xs text-primary/60">
                    Request Frequency
                  </span>
                </div>

                <div className="h-56 w-full border-b-4 border-l-4 border-primary relative flex items-end justify-around pb-0 pt-4 px-2 bg-[#faf7f2]/30">
                  {latencyDistribution.length > 0 ? (
                    (() => {
                      const maxCount = Math.max(...latencyDistribution.map((d) => d.count), 1);
                      return latencyDistribution.map((item, idx) => {
                        const heightPercent = `${Math.max(10, Math.round((item.count / maxCount) * 85))}%`;
                        return (
                          <div
                            key={idx}
                            style={{ height: heightPercent }}
                            className="w-[12%] bg-primary border-t-4 border-x-4 border-primary hover:bg-[#0055ff] transition-all cursor-pointer group relative flex flex-col justify-end"
                          >
                            {/* Tooltip */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-primary text-[#faf7f2] text-[10px] font-sans font-black py-1 px-2 border-2 border-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-10 pointer-events-none">
                              {item.count.toLocaleString()} reqs ({item.label})
                            </div>
                            {/* X-axis label under the border */}
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-sans font-bold text-[10px] text-primary uppercase">
                              {item.label}
                            </div>
                          </div>
                        );
                      });
                    })()
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center font-sans font-bold text-sm text-primary/50">
                      No distribution data
                    </div>
                  )}
                </div>
                {/* Spacer to align label spacing */}
                <div className="h-6" />
              </div>
            </div>
          </section>

          {/* Recent Activity Table */}
          <section className="mt-4">
            <h2 className="font-sans font-black text-2xl uppercase tracking-tight mb-4 border-b-4 border-primary pb-1 inline-block text-primary">
              Recent Activity
            </h2>
            
            <div className="bg-white border-4 border-primary shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b-4 border-primary bg-[#eee9e0] font-sans font-black uppercase text-xs text-primary">
                    <th className="p-4 border-r-4 border-primary w-[30%]">Endpoint</th>
                    <th className="p-4 border-r-4 border-primary w-[15%]">Method</th>
                    <th className="p-4 border-r-4 border-primary w-[25%]">Status</th>
                    <th className="p-4 border-r-4 border-primary w-[15%]">Latency</th>
                    <th className="p-4 w-[15%]">Time</th>
                  </tr>
                </thead>
                <tbody className="font-body font-bold text-sm text-primary">
                  {recentActivity.length > 0 ? (
                    recentActivity.map((log) => {
                      let statusClass = "bg-emerald-100 text-emerald-800 border-emerald-600";
                      let statusIcon = (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 border border-primary shrink-0" />
                      );

                      if (log.statusCode === 429) {
                        statusClass = "bg-[#ffcc00]/20 text-[#e6b800] border-[#ffcc00]";
                        statusIcon = (
                          <span className="material-symbols-outlined text-[12px] font-bold text-[#e6b800] shrink-0">
                            warning
                          </span>
                        );
                      } else if (log.statusCode >= 400) {
                        statusClass = "bg-red-100 text-red-700 border-red-500";
                        statusIcon = (
                          <span className="material-symbols-outlined text-[12px] font-bold text-red-500 shrink-0">
                            error
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={log.id}
                          className="border-b-4 border-primary last:border-b-0 hover:bg-[#eee9e0]/35 transition-colors"
                        >
                          <td className="p-4 border-r-4 border-primary font-mono text-xs font-medium">
                            {log.endpoint}
                          </td>
                          <td className="p-4 border-r-4 border-primary">
                            <span className="bg-primary text-[#faf7f2] px-2.5 py-0.5 font-sans font-black text-[10px] uppercase border-2 border-primary">
                              {log.method}
                            </span>
                          </td>
                          <td className="p-4 border-r-4 border-primary">
                            <span className={`inline-flex items-center gap-1.5 font-sans font-black text-[10px] uppercase px-2 py-0.5 border-2 ${statusClass}`}>
                              {statusIcon}
                              {log.status}
                            </span>
                          </td>
                          <td className="p-4 border-r-4 border-primary font-body text-xs font-semibold">
                            {log.latency}
                          </td>
                          <td className="p-4 text-primary/70 text-xs font-semibold">
                            {log.time}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center font-sans font-bold text-sm text-primary/50">
                        No recent API requests found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
