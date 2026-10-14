"use client";

import { useEffect } from "react";

export default function AuthLoadingFallback() {
  // Do not touch `document.body.style` here — avoid overriding page-level
  // background or overflow settings (login page should control its own styles).
  useEffect(() => {
    return () => {};
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-transparent">
      {/* Content wrapper - allow interactions */}
      <div className="pointer-events-auto text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/20">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        </div>
        <h2 className="text-2xl font-semibold text-white mb-2">Verifying Access</h2>
        <p className="text-gray-400">Checking your authentication status...</p>
      </div>
    </div>
  );
}
