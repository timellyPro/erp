"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Call after a successful POST/PUT/PATCH/DELETE so Next.js revalidates server components,
 * and optionally re-run a client-side list fetch (tables, hooks, etc.).
 */
export function useAfterMutationRefresh() {
  const router = useRouter();

  return useCallback(
    (clientRefetch?: () => void | Promise<void>) => {
      if (clientRefetch) {
        try {
          const out = clientRefetch();
          if (out != null && typeof (out as Promise<void>).then === "function") {
            void (out as Promise<void>).catch(() => {});
          }
        } catch {
          /* ignore refetch errors — caller may toast */
        }
      }
      try {
        router.refresh();
      } catch {
        /* ignore */
      }
    },
    [router]
  );
}
