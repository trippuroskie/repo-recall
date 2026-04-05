"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogOut, CreditCard, User as UserIcon } from "lucide-react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (!user) {
    return (
      <Link
        href="/login"
        className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const avatar = user.user_metadata?.avatar_url;
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.user_name ||
    user.email;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
            <UserIcon className="w-4 h-4 text-zinc-400" />
          </div>
        )}
        <span className="text-sm text-zinc-300 hidden sm:block max-w-[120px] truncate">
          {name}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
          <div className="px-4 py-2 border-b border-zinc-700">
            <p className="text-sm font-medium text-white truncate">{name}</p>
            <p className="text-xs text-zinc-400 truncate">{user.email}</p>
          </div>
          <Link
            href="/billing"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Billing
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
