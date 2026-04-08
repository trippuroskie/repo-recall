"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, Suspense } from "react";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import type { ProjectBrief } from "@/lib/types";

function AnalyzeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const repoUrl = searchParams.get("repo") || "";
  const token = searchParams.get("token") || undefined;

  const handleComplete = useCallback(
    (brief: ProjectBrief) => {
      router.push(`/brief/${brief.id}`);
    },
    [router]
  );

  const handleError = useCallback(
    (message: string) => {
      router.push(`/briefs?error=${encodeURIComponent(message)}`);
    },
    [router]
  );

  if (!repoUrl) {
    router.push("/briefs");
    return null;
  }

  return (
    <AnalysisProgress
      repoUrl={repoUrl}
      token={token}
      onComplete={handleComplete}
      onError={handleError}
    />
  );
}

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
          <p className="text-sm text-foreground-secondary">Loading...</p>
        </div>
      }
    >
      <AnalyzeContent />
    </Suspense>
  );
}
