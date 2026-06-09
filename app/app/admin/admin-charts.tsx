"use client";

import { useState } from "react";
import type { PaymentOrderWithUser, GenerationWithUser } from "@/lib/store";

function getLocalDateString(isoString: string | Date | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function RevenueChart({ orders }: { orders: PaymentOrderWithUser[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Generate last 14 days (YYYY-MM-DD)
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split("T")[0];
  });

  const dailyData = last14Days.map((day) => {
    const dayOrders = orders.filter((o) => getLocalDateString(o.approvedAt || o.paidAt || o.createdAt) === day);
    const amount = dayOrders.reduce((sum, o) => sum + o.totalPriceCents, 0) / 100;
    return { day, amount, count: dayOrders.length };
  });

  const maxVal = Math.max(...dailyData.map((d) => d.amount), 10);
  const chartHeight = 140;
  const chartWidth = 500;
  const padding = { top: 25, right: 15, bottom: 25, left: 45 };

  const graphHeight = chartHeight - padding.top - padding.bottom;
  const graphWidth = chartWidth - padding.left - padding.right;
  const barWidth = (graphWidth / dailyData.length) - 6;

  return (
    <article className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
        <div>
          <h3 className="text-xl font-headline font-black uppercase text-primary leading-none">Revenue Trend</h3>
          <p className="mt-1.5 text-xs font-body text-on-surface-variant">Daily approved revenue (USD) - Last 14 days</p>
        </div>
        {hoveredIdx !== null && (
          <div className="rounded-none border-2 border-primary bg-[#ffcc00] px-2 py-0.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]">
            {dailyData[hoveredIdx].day.slice(5)}: ${dailyData[hoveredIdx].amount.toFixed(2)} ({dailyData[hoveredIdx].count} paid)
          </div>
        )}
      </div>
      <div className="mt-4 relative">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
          {Array.from({ length: 4 }).map((_, i) => {
            const y = padding.top + (graphHeight / 3) * i;
            const val = maxVal - (maxVal / 3) * i;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#1a1a1a"
                  strokeDasharray="2 2"
                  strokeOpacity="0.2"
                />
                <text
                  x={padding.left - 5}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-primary text-[8px] font-headline font-bold"
                >
                  ${Math.round(val)}
                </text>
              </g>
            );
          })}

          {dailyData.map((d, i) => {
            const barHeight = (d.amount / maxVal) * graphHeight;
            const x = padding.left + i * (graphWidth / dailyData.length) + 3;
            const y = chartHeight - padding.bottom - barHeight;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={d.day}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  fill={isHovered ? "#ff3366" : "#ffcc00"}
                  stroke="#1a1a1a"
                  strokeWidth="1.5"
                  className="transition-colors duration-150"
                />
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  className="fill-primary text-[7px] font-headline font-bold"
                >
                  {d.day.slice(8)}
                </text>
              </g>
            );
          })}
          <line
            x1={padding.left}
            y1={chartHeight - padding.bottom}
            x2={chartWidth - padding.right}
            y2={chartHeight - padding.bottom}
            stroke="#1a1a1a"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </article>
  );
}

export function TokenSoldChart({ orders }: { orders: PaymentOrderWithUser[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Generate last 14 days
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split("T")[0];
  });

  const dailyData = last14Days.map((day) => {
    const dayOrders = orders.filter((o) => getLocalDateString(o.approvedAt || o.paidAt || o.createdAt) === day);
    const tokens = dayOrders.reduce((sum, o) => sum + o.tokens, 0);
    return { day, tokens, count: dayOrders.length };
  });

  const maxVal = Math.max(...dailyData.map((d) => d.tokens), 10_000);
  const chartHeight = 140;
  const chartWidth = 500;
  const padding = { top: 25, right: 15, bottom: 25, left: 45 };

  const graphHeight = chartHeight - padding.top - padding.bottom;
  const graphWidth = chartWidth - padding.left - padding.right;
  const barWidth = (graphWidth / dailyData.length) - 6;

  return (
    <article className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
        <div>
          <h3 className="text-xl font-headline font-black uppercase text-primary leading-none">Tokens Credited</h3>
          <p className="mt-1.5 text-xs font-body text-on-surface-variant">Daily tokens sold - Last 14 days</p>
        </div>
        {hoveredIdx !== null && (
          <div className="rounded-none border-2 border-primary bg-[#00ffcc] px-2 py-0.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]">
            {dailyData[hoveredIdx].day.slice(5)}: {dailyData[hoveredIdx].tokens.toLocaleString()} tokens
          </div>
        )}
      </div>
      <div className="mt-4 relative">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
          {Array.from({ length: 4 }).map((_, i) => {
            const y = padding.top + (graphHeight / 3) * i;
            const val = maxVal - (maxVal / 3) * i;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#1a1a1a"
                  strokeDasharray="2 2"
                  strokeOpacity="0.2"
                />
                <text
                  x={padding.left - 5}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-primary text-[8px] font-headline font-bold"
                >
                  {val >= 1_000_000 ? `${(val / 1_000_000).toFixed(1)}M` : val >= 1_000 ? `${(val / 1_000).toFixed(0)}k` : val}
                </text>
              </g>
            );
          })}

          {dailyData.map((d, i) => {
            const barHeight = (d.tokens / maxVal) * graphHeight;
            const x = padding.left + i * (graphWidth / dailyData.length) + 3;
            const y = chartHeight - padding.bottom - barHeight;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={d.day}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  fill={isHovered ? "#ff3366" : "#00ffcc"}
                  stroke="#1a1a1a"
                  strokeWidth="1.5"
                  className="transition-colors duration-150"
                />
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  className="fill-primary text-[7px] font-headline font-bold"
                >
                  {d.day.slice(8)}
                </text>
              </g>
            );
          })}
          <line
            x1={padding.left}
            y1={chartHeight - padding.bottom}
            x2={chartWidth - padding.right}
            y2={chartHeight - padding.bottom}
            stroke="#1a1a1a"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </article>
  );
}

export function UsageAnalyticsCharts({ generations }: { generations: GenerationWithUser[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Generate last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  const dailyData = last7Days.map((day) => {
    const dayGens = generations.filter((g) => getLocalDateString(g.createdAt) === day);
    const ttsCount = dayGens.filter((g) => g.mode === "tts" && g.status === "success").length;
    const cloneCount = dayGens.filter((g) => g.mode === "clone" && g.status === "success").length;
    const failedCount = dayGens.filter((g) => g.status === "failed").length;
    const totalCount = dayGens.length;
    const avgLatency =
      dayGens.length === 0 ? 0 : Math.round(dayGens.reduce((sum, g) => sum + g.latencyMs, 0) / dayGens.length);

    return { day, ttsCount, cloneCount, failedCount, totalCount, avgLatency };
  });

  const maxCount = Math.max(...dailyData.map((d) => d.totalCount), 10);
  const maxLatency = Math.max(...dailyData.map((d) => d.avgLatency), 2000);

  const chartHeight = 140;
  const chartWidth = 500;
  const padding = { top: 25, right: 45, bottom: 25, left: 45 };

  const graphHeight = chartHeight - padding.top - padding.bottom;
  const graphWidth = chartWidth - padding.left - padding.right;
  const barGroupWidth = (graphWidth / dailyData.length);
  const barWidth = (barGroupWidth - 12) / 3;

  return (
    <section className="grid gap-5 xl:grid-cols-2">
      {/* Generation Volume Chart */}
      <article className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
          <div>
            <h3 className="text-xl font-headline font-black uppercase text-primary leading-none">Generation Volume</h3>
            <p className="mt-1.5 text-xs font-body text-on-surface-variant">Daily successful TTS, Voice Clone, & Failed</p>
          </div>
          {hoveredIdx !== null && (
            <div className="rounded-none border-2 border-primary bg-[#ff9900] px-2 py-0.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]">
              {dailyData[hoveredIdx].day}: TTS {dailyData[hoveredIdx].ttsCount} | Clone {dailyData[hoveredIdx].cloneCount} | Fail {dailyData[hoveredIdx].failedCount}
            </div>
          )}
        </div>
        <div className="mt-4 relative">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
            {Array.from({ length: 4 }).map((_, i) => {
              const y = padding.top + (graphHeight / 3) * i;
              const val = Math.round(maxCount - (maxCount / 3) * i);
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#1a1a1a"
                    strokeDasharray="2 2"
                    strokeOpacity="0.2"
                  />
                  <text
                    x={padding.left - 5}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-primary text-[8px] font-headline font-bold"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {dailyData.map((d, i) => {
              const xStart = padding.left + i * barGroupWidth + 6;
              const isHovered = hoveredIdx === i;

              // TTS Bar
              const ttsH = (d.ttsCount / maxCount) * graphHeight;
              const ttsY = chartHeight - padding.bottom - ttsH;

              // Clone Bar
              const cloneH = (d.cloneCount / maxCount) * graphHeight;
              const cloneY = chartHeight - padding.bottom - cloneH;

              // Failed Bar
              const failH = (d.failedCount / maxCount) * graphHeight;
              const failY = chartHeight - padding.bottom - failH;

              return (
                <g
                  key={d.day}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={xStart}
                    y={ttsY}
                    width={barWidth}
                    height={Math.max(ttsH, 1)}
                    fill={isHovered ? "#ff3366" : "#ffcc00"}
                    stroke="#1a1a1a"
                    strokeWidth="1"
                  />
                  <rect
                    x={xStart + barWidth + 2}
                    y={cloneY}
                    width={barWidth}
                    height={Math.max(cloneH, 1)}
                    fill={isHovered ? "#ff3366" : "#00ffcc"}
                    stroke="#1a1a1a"
                    strokeWidth="1"
                  />
                  <rect
                    x={xStart + (barWidth + 2) * 2}
                    y={failY}
                    width={barWidth}
                    height={Math.max(failH, 1)}
                    fill={isHovered ? "#ff3366" : "#ff6666"}
                    stroke="#1a1a1a"
                    strokeWidth="1"
                  />
                  <text
                    x={xStart + barGroupWidth / 2 - 6}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    className="fill-primary text-[7px] font-headline font-bold"
                  >
                    {d.day.slice(8)}
                  </text>
                </g>
              );
            })}
            <line
              x1={padding.left}
              y1={chartHeight - padding.bottom}
              x2={chartWidth - padding.right}
              y2={chartHeight - padding.bottom}
              stroke="#1a1a1a"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </article>

      {/* Latency Trend Chart */}
      <article className="min-w-0 rounded-none border-3 border-primary bg-surface p-5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
          <div>
            <h3 className="text-xl font-headline font-black uppercase text-primary leading-none">Latency Trend</h3>
            <p className="mt-1.5 text-xs font-body text-on-surface-variant">Daily average upstream generation latency</p>
          </div>
          {hoveredIdx !== null && (
            <div className="rounded-none border-2 border-primary bg-[#00ffcc] px-2 py-0.5 text-xs font-headline font-bold uppercase text-primary shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]">
              {dailyData[hoveredIdx].day}: {dailyData[hoveredIdx].avgLatency} ms avg
            </div>
          )}
        </div>
        <div className="mt-4 relative">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
            {Array.from({ length: 4 }).map((_, i) => {
              const y = padding.top + (graphHeight / 3) * i;
              const val = Math.round(maxLatency - (maxLatency / 3) * i);
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#1a1a1a"
                    strokeDasharray="2 2"
                    strokeOpacity="0.2"
                  />
                  <text
                    x={padding.left - 5}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-primary text-[8px] font-headline font-bold"
                  >
                    {val}ms
                  </text>
                </g>
              );
            })}

            {dailyData.map((d, i) => {
              const barHeight = (d.avgLatency / maxLatency) * graphHeight;
              const x = padding.left + i * barGroupWidth + (barGroupWidth - barWidth * 2) / 2;
              const y = chartHeight - padding.bottom - barHeight;
              const isHovered = hoveredIdx === i;

              return (
                <g
                  key={d.day}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth * 2}
                    height={Math.max(barHeight, 2)}
                    fill={isHovered ? "#ff3366" : "#cc99ff"}
                    stroke="#1a1a1a"
                    strokeWidth="1.5"
                  />
                  <text
                    x={x + barWidth}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    className="fill-primary text-[7px] font-headline font-bold"
                  >
                    {d.day.slice(8)}
                  </text>
                </g>
              );
            })}
            <line
              x1={padding.left}
              y1={chartHeight - padding.bottom}
              x2={chartWidth - padding.right}
              y2={chartHeight - padding.bottom}
              stroke="#1a1a1a"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </article>
    </section>
  );
}
