"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Single hook point for an error tracker (e.g. Sentry.captureException) once added.
    console.error("[ui] unhandled render error", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h1>
        <p className="text-gray-600 mb-8">
          This page hit an unexpected error. Your data is safe. Please try again.
        </p>
        <button
          onClick={reset}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow"
        >
          Try again
        </button>
        {error.digest && (
          <p className="mt-4 text-xs text-gray-400">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
