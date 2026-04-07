"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: ReactNode;
  accentColor?: string;
  glowColor?: string;
  trend?: "up" | "down" | "neutral";
  delay?: number;
}

export function StatCard({
  label,
  value,
  subValue,
  icon,
  accentColor = "text-amber-400",
  glowColor = "shadow-amber-500/10",
  trend,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`glass glass-hover noise-overlay relative overflow-hidden p-5 cursor-pointer ${glowColor}`}
    >
      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.2em] uppercase text-slate-400">
            {label}
          </p>
          <p className={`text-2xl font-bold font-[family-name:var(--font-display)] ${accentColor}`}>
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              {trend === "up" && <span className="text-emerald-400">+</span>}
              {trend === "down" && <span className="text-rose-400">-</span>}
              {subValue}
            </p>
          )}
        </div>
        <div className={`${accentColor} opacity-40`}>{icon}</div>
      </div>
    </motion.div>
  );
}
