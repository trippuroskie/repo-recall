"use client";

import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { GitBranch } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const error = searchParams.get("error");

  const handleGitHubLogin = async () => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
        scopes: "repo read:user",
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Welcome to RepoRecall
          </h1>
          <p className="text-zinc-400 text-sm">
            Sign in to analyze your repos and get back into your code.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            Authentication failed. Please try again.
          </div>
        )}

        <button
          onClick={handleGitHubLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer"
        >
          <GitBranch className="w-5 h-5" />
          Sign in with GitHub
        </button>

        <p className="mt-6 text-center text-xs text-zinc-500">
          We request repo access to analyze your private repositories.
          <br />
          Your code is never stored — only the generated brief.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
