import { toClientErrorMessage, HttpError } from "./errorInfo";

describe("toClientErrorMessage", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as { NODE_ENV: string }).NODE_ENV = originalEnv as string;
  });

  it("returns the real message outside production, regardless of error shape", () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = "development";
    expect(toClientErrorMessage(new Error("boom"))).toBe("boom");
    expect(toClientErrorMessage({ message: "raw object" })).toBe("raw object");
  });

  it("passes through a plain application Error's message in production", () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = "production";
    expect(toClientErrorMessage(new Error("Amount cannot exceed remaining due (₹500.00)"))).toBe(
      "Amount cannot exceed remaining due (₹500.00)"
    );
  });

  it("passes through an HttpError's message in production", () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = "production";
    expect(toClientErrorMessage(new HttpError("Forbidden action", 403))).toBe("Forbidden action");
  });

  it("redacts a Prisma-shaped error in production", () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = "production";
    const prismaLikeError = Object.assign(
      new Error('Unique constraint failed on the fields: (`email`)'),
      { name: "PrismaClientKnownRequestError", code: "P2002" }
    );
    expect(toClientErrorMessage(prismaLikeError, "Save failed")).toBe("Save failed");
  });

  it("redacts an error carrying a .code (e.g. a Node/fs error) in production", () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = "production";
    const fsLikeError = Object.assign(new Error("ENOENT: no such file or directory, open '/etc/secret'"), {
      code: "ENOENT",
    });
    expect(toClientErrorMessage(fsLikeError)).toBe("Internal server error");
  });

  it("redacts a non-Error thrown value in production", () => {
    (process.env as { NODE_ENV: string }).NODE_ENV = "production";
    expect(toClientErrorMessage("a raw string throw", "Something went wrong")).toBe(
      "Something went wrong"
    );
    expect(toClientErrorMessage({ message: "raw object throw" })).toBe("Internal server error");
  });
});
