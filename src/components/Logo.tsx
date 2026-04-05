"use client";

import { BookOpen } from "lucide-react";

export function Logo({ size = "default" }: { size?: "small" | "default" | "large" }) {
  const sizes = {
    small: { icon: 18, text: "text-base" },
    default: { icon: 22, text: "text-lg" },
    large: { icon: 28, text: "text-2xl" },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground">
        <BookOpen size={s.icon} className="text-background" strokeWidth={1.8} />
      </div>
      <span className={`${s.text} font-semibold tracking-tight text-foreground`}>
        RepoRecall
      </span>
    </div>
  );
}
