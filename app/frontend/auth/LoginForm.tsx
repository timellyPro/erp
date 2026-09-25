"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import {
  markSuperAdminBrowserSession,
  clearSuperAdminBrowserSession,
  setSuperAdminLoginInProgress,
  clearSuperAdminLoginInProgress,
} from "@/lib/superAdminBrowserSession";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
const LOGO_SRC = "/timelylogo.webp";

function getEmailFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("email") ?? "";
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const emailFromParams = searchParams?.get("email") ?? "";
  const emailParam = useMemo(() => emailFromParams || getEmailFromUrl(), [emailFromParams]);
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const isSwitchAccount = Boolean(emailParam?.trim());

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuperAdminLoginInProgress();

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        if (result.error.includes("deactivated") || result.error.includes("password not set")) {
          setError("This account is deactivated or has no password set. Please contact your administrator.");
        } else {
          setError(isSwitchAccount ? "Incorrect password" : "Invalid email or password");
        }
        return;
      }

      // Set marker immediately so SuperAdminSessionGuard does not sign out during session refresh.
      markSuperAdminBrowserSession();

      const session = await getSession();
      if (session?.user?.role !== "SUPERADMIN") {
        clearSuperAdminBrowserSession();
      }
    } finally {
      clearSuperAdminLoginInProgress();
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)] backdrop-blur-xl bg-black/20">
        {/* Header - logo from public folder (root path) */}
        <div className="p-8 pb-6 border-b border-white/5 flex flex-col items-center text-center bg-white/[0.02]">
          <img
            src={LOGO_SRC}
            alt="Timelly"
            className="h-12 w-40 mb-6 drop-shadow-[0_0_15px_rgba(163,230,53,0.3)] object-contain"
          />
          <h1 className="text-2xl font-bold text-white mb-2">
            {isSwitchAccount ? "Switch Account" : "Welcome Back"}
          </h1>
          <p className="text-gray-400 text-sm">
            {isSwitchAccount
              ? "Enter your password to continue"
              : "Sign in to access your dashboard"}
          </p>
          {isSwitchAccount && email && (
            <p className="text-lime-400/90 text-sm font-medium mt-2 truncate max-w-full px-4">
              {email}
            </p>
          )}
        </div>

        {/* Form */}
        <div className="p-8 pt-6">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            {!isSwitchAccount && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 group-focus-within:text-lime-400 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your school email"
                    className="w-full pl-11 pr-4 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-lime-400/50 focus:bg-black/60 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex justify-between ml-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 group-focus-within:text-lime-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSwitchAccount ? "Enter password" : "••••••••"}
                  autoFocus={isSwitchAccount}
                  className="w-full pl-11 pr-12 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-lime-400/50 focus:bg-black/60 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (isSwitchAccount && !email)}
              className="group w-full py-3.5 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl shadow-[0_0_20px_rgba(163,230,53,0.3)] hover:shadow-[0_0_30px_rgba(163,230,53,0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="h-5 w-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  {isSwitchAccount ? "Continue" : "Sign In"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>

            {isSwitchAccount && (
              <a
                href="/admin/login"
                className="block text-center text-sm text-white/50 hover:text-white/70 transition-colors"
              >
                Use a different account
              </a>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-black/40 border-t border-white/5 text-center">
          <p className="text-gray-500 text-xs">
            Don&apos;t have an account?{" "}
            <a href="#" className="text-lime-400 font-medium hover:underline">
              School Administrator
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
