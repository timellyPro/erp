/**
 * @jest-environment node
 *
 * The superadmin carve-out (docs/SECURITY_REVIEW.md 3) keeps app/api/superadmin/** on the
 * owner-role connection, which bypasses RLS. That is only safe if EVERY handler there
 * authorizes SUPERADMIN itself, so this test fails when one doesn't (directly, or via a
 * helper defined in the same file that does).
 */
import fs from "fs";
import path from "path";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

const root = path.join(process.cwd(), "app", "api", "superadmin");
const files = walk(root);

function handlers(src: string) {
  const out: Array<{ name: string; body: string }> = [];
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index + m[0].length);
    const next = rest.search(/\nexport /);
    out.push({ name: m[1], body: next < 0 ? rest : rest.slice(0, next) });
  }
  return out;
}

/** Names of functions in this file whose own body checks SUPERADMIN. */
function authHelpers(src: string): string[] {
  const names: string[] = [];
  const re = /(?:async )?function (\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(m[1])) continue;
    const rest = src.slice(m.index);
    const next = rest.slice(1).search(/\n(?:export )?(?:async )?function /);
    const body = next < 0 ? rest : rest.slice(0, next + 1);
    if (body.includes("SUPERADMIN")) names.push(m[1]);
  }
  return names;
}

describe("superadmin routes authorize SUPERADMIN in every handler", () => {
  it("finds the superadmin routes", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const f of files) {
    const rel = path.relative(process.cwd(), f).split(path.sep).join("/");
    it(rel, () => {
      const src = fs.readFileSync(f, "utf8");
      const helpers = authHelpers(src);
      const bad = handlers(src)
        .filter((h) => !h.body.includes("SUPERADMIN") && !helpers.some((n) => h.body.includes(`${n}(`)))
        .map((h) => h.name);
      expect(bad).toEqual([]);
    });
  }
});
