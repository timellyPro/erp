/**
 * @jest-environment node
 *
 * Guard against tenant-isolation regressions: a route that imports the owner-role
 * `prisma` client directly bypasses RLS. The baseline below is the set of routes that
 * still do (unmigrated, self-scoped, superadmin, or deliberately unscoped). Adding a
 * NEW route to it needs a conscious decision; migrating one should remove it.
 */
import fs from "fs";
import path from "path";
import baseline from "./ownerConnectionRoutes.json";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

describe("owner-connection route baseline", () => {
  const current = walk(path.join(process.cwd(), "app", "api"))
    .filter((f) => /^import prisma from "@\/lib\/db";/m.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(process.cwd(), f).split(path.sep).join("/"))
    .sort();

  it("has no new route importing the owner prisma client", () => {
    const added = current.filter((f) => !(baseline as string[]).includes(f));
    expect(added).toEqual([]);
  });

  it("has no stale baseline entries (remove routes you migrated)", () => {
    const stale = (baseline as string[]).filter((f) => !current.includes(f));
    expect(stale).toEqual([]);
  });
});
