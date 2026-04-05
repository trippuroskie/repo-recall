"use client";

import { clsx } from "clsx";

const colorMap: Record<string, string> = {
  acquisition: "bg-tag-blue text-blue-800",
  activation: "bg-tag-green text-green-800",
  retention: "bg-tag-purple text-purple-800",
  revenue: "bg-tag-orange text-orange-800",
  admin: "bg-tag-yellow text-yellow-900",
  infrastructure: "bg-tag-gray text-gray-700",
  high: "bg-tag-orange text-orange-800",
  medium: "bg-tag-blue text-blue-800",
  low: "bg-tag-gray text-gray-700",
  file: "bg-tag-blue text-blue-800",
  service: "bg-tag-green text-green-800",
  flow: "bg-tag-purple text-purple-800",
};

export function Tag({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        colorMap[variant] || "bg-tag-gray text-gray-700"
      )}
    >
      {children}
    </span>
  );
}
