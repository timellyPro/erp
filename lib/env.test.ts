import { getEnvProblems } from "@/lib/env";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x",
  DATABASE_URL_TENANT: "postgres://t",
  NEXTAUTH_SECRET: "s",
  NEXTAUTH_URL: "https://app.example.com",
  CRON_SECRET: "c",
} as unknown as NodeJS.ProcessEnv;

describe("getEnvProblems", () => {
  it("reports nothing outside production", () => {
    expect(getEnvProblems({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("passes a complete production config", () => {
    expect(getEnvProblems(good)).toEqual([]);
  });

  it("accepts DIRECT_URL in place of DATABASE_URL", () => {
    const env = { ...good, DATABASE_URL: "", DIRECT_URL: "postgres://d" } as NodeJS.ProcessEnv;
    expect(getEnvProblems(env)).toEqual([]);
  });

  it("flags each missing variable", () => {
    const problems = getEnvProblems({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DATABASE_URL"),
        expect.stringContaining("DATABASE_URL_TENANT"),
        expect.stringContaining("NEXTAUTH_SECRET"),
        expect.stringContaining("NEXTAUTH_URL"),
        expect.stringContaining("CRON_SECRET"),
      ])
    );
  });

  it("flags a non-https NEXTAUTH_URL", () => {
    const env = { ...good, NEXTAUTH_URL: "http://app.example.com" } as NodeJS.ProcessEnv;
    expect(getEnvProblems(env)).toEqual([expect.stringContaining("https://")]);
  });
});
