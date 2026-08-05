"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

export interface DonutChartDataItem {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartWidgetProps {
  data: DonutChartDataItem[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
}

const DEFAULT_COLORS = [
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
  "#f59e0b",
];

export function DonutChartWidget({
  data,
  height = 240,
  innerRadius = 50,
  outerRadius = 85,
}: DonutChartWidgetProps) {
  if (!data || data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
        No distribution data available
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                }
                stroke="var(--card)"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
              fontSize: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            formatter={(value) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
