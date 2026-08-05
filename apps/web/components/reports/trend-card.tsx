"use client";

import * as React from "react";
import { StatCard, StatCardProps } from "@/components/ui/stat-card";
import {
  AreaChartWidget,
  AreaChartDataItem,
} from "@/components/charts/area-chart-widget";

export interface TrendCardProps extends StatCardProps {
  sparklineData?: AreaChartDataItem[];
  sparklineColor?: string;
}

export function TrendCard({
  sparklineData,
  sparklineColor = "#0ea5e9",
  ...statProps
}: TrendCardProps) {
  return (
    <div className="space-y-2">
      <StatCard {...statProps} />
      {sparklineData && sparklineData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-2 h-16 overflow-hidden">
          <AreaChartWidget
            data={sparklineData}
            height={48}
            color={sparklineColor}
          />
        </div>
      )}
    </div>
  );
}
