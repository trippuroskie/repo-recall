"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Check,
  Trash2,
  KeyRound,
} from "lucide-react";

export default function SettingsPage() {
  const [hasToken, setHasToken] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchToken();
  }, []);

  async function fetchToken() {
    try {
      const res = await fetch("/api/settings/github-token");
      const data = await res.json();
      setHasToken(data.hasToken);
      setMasked(data.masked);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!newToken.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/settings/github-token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: newToken.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save token");
      }

      setNewToken("");
      setShowInput(false);
      setSuccess("GitHub token saved successfully.");
      await fetchToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save token");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/settings/github-token", {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove token");
      }

      setHasToken(false);
      setMasked(null);
      setSuccess("GitHub token removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove token");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/briefs"
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
        <h1 className="text-2xl font-bold text-foreground mb-2">Settings</h1>
        <p className="text-foreground-secondary mb-8">
          Manage your account and integrations.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-foreground-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading settings...
          </div>
        ) : (
          <div className="space-y-8">
            {/* GitHub Token Section */}
            <div className="border border-border rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <KeyRound size={20} className="text-foreground mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-foreground">
                    GitHub Access Token
                  </h2>
                  <p className="text-sm text-foreground-secondary mt-1">
                    Required for analyzing private repositories. Create a{" "}
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo&description=RepoRecall"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      personal access token
                    </a>{" "}
                    with <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">repo</code> scope.
                  </p>
                </div>
              </div>

              {hasToken && !showInput ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <code className="flex-1 text-sm bg-zinc-800/50 border border-border rounded-lg px-4 py-2.5 text-foreground-secondary font-mono">
                      {masked}
                    </code>
                    <button
                      onClick={() => setShowInput(true)}
                      className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer text-foreground-secondary"
                    >
                      Update
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-3 py-2 text-sm border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {deleting ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-green-400/70 flex items-center gap-1">
                    <Check size={12} />
                    Token configured — private repos are accessible.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="flex-1 border border-border rounded-lg px-4 py-2.5 bg-white text-sm outline-none focus:border-foreground/30 transition-colors placeholder:text-foreground-secondary/50 font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                      }}
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving || !newToken.trim()}
                      className="px-4 py-2.5 text-sm bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </button>
                    {hasToken && (
                      <button
                        onClick={() => {
                          setShowInput(false);
                          setNewToken("");
                        }}
                        className="px-3 py-2.5 text-sm text-foreground-secondary hover:text-foreground transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {!hasToken && (
                    <p className="text-xs text-foreground-secondary/70">
                      Your token is stored securely and only used for GitHub API
                      requests. It is never exposed to the browser.
                    </p>
                  )}
                </div>
              )}

              {success && (
                <p className="text-xs text-green-400 mt-3 flex items-center gap-1">
                  <Check size={12} />
                  {success}
                </p>
              )}
              {error && (
                <p className="text-xs text-red-400 mt-3">{error}</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
