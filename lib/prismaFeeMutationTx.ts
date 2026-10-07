/** Interactive Prisma tx settings for fee writes on remote DB (default 5s expires on Supabase). */
export const FEE_MUTATION_TX = {
  maxWait: 15_000,
  timeout: 30_000,
} as const;
