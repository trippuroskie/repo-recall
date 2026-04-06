"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import Link from "next/link";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import type { PlanLimits } from "@/lib/plans";

export default function BillingPage() {
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then(setLimits)
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-foreground-secondary hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              Dashboard
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Plan & Billing
        </h1>
        <p className="text-foreground-secondary mb-8">
          Manage your subscription and track your usage.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-foreground-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading plan info...
          </div>
        ) : limits ? (
          <div className="space-y-8">
            {/* Current plan */}
            <div className="border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {limits.plan === "pro" ? "Pro" : "Free"} Plan
                  </h2>
                  <p className="text-sm text-foreground-secondary">
                    {limits.plan === "pro"
                      ? "$9/month — unlimited analyses and chat"
                      : "3 analyses and 20 chat messages per month"}
                  </p>
                </div>
                {limits.plan === "pro" ? (
                  <button
                    onClick={handleManageBilling}
                    className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Manage billing
                  </button>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="px-4 py-2 text-sm bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {upgrading ? "Redirecting..." : "Upgrade to Pro"}
                  </button>
                )}
              </div>

              {/* Usage bars */}
              {limits.plan === "free" && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <UsageBar
                    label="Analyses"
                    used={limits.analyzesUsed}
                    limit={limits.analyzesLimit}
                  />
                  <UsageBar
                    label="Chat messages"
                    used={limits.chatUsed}
                    limit={limits.chatLimit}
                  />
                </div>
              )}
            </div>

            {/* Plan comparison */}
            <div className="grid md:grid-cols-2 gap-4">
              <PlanCard
                name="Free"
                price="$0"
                active={limits.plan === "free"}
                features={[
                  "3 public repo analyses/month",
                  "20 chat messages/month",
                  "Last 30 PRs history",
                  "Basic business context",
                ]}
              />
              <PlanCard
                name="Pro"
                price="$9/mo"
                active={limits.plan === "pro"}
                features={[
                  "Unlimited analyses",
                  "Unlimited chat messages",
                  "Private repo access",
                  "Full PR history",
                  "Full AARRR business analysis",
                  "Auto-refresh on new PRs",
                ]}
                highlighted
                onUpgrade={
                  limits.plan === "free" ? handleUpgrade : undefined
                }
                upgrading={upgrading}
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = Math.min((used / limit) * 100, 100);
  const isNearLimit = pct >= 80;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-foreground-secondary">{label}</span>
        <span
          className={isNearLimit ? "text-amber-400" : "text-foreground-secondary"}
        >
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isNearLimit ? "bg-amber-400" : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  active,
  features,
  highlighted,
  onUpgrade,
  upgrading,
}: {
  name: string;
  price: string;
  active: boolean;
  features: string[];
  highlighted?: boolean;
  onUpgrade?: () => void;
  upgrading?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-6 ${
        highlighted
          ? "border-blue-500/50 bg-blue-500/5"
          : "border-border"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-foreground">{name}</h3>
        {active && (
          <span className="text-xs bg-foreground/10 text-foreground px-2 py-0.5 rounded-full">
            Current
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground mb-4">{price}</p>
      <ul className="space-y-2 mb-6">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-sm text-foreground-secondary"
          >
            <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          disabled={upgrading}
          className="w-full py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {upgrading ? "Redirecting..." : "Upgrade to Pro"}
        </button>
      )}
    </div>
  );
}
