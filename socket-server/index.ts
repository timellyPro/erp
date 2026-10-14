import { Server } from "socket.io";
import { decode } from "next-auth/jwt";
import { logger } from "@/lib/logger";

/**
 * Standalone realtime socket server (see CLAUDE.md: deployed separately from the
 * Next.js app). Previously had zero auth or tenant scoping: any client could
 * connect, join any room by guessing/observing an id, and both read and inject
 * messages into it (PRODUCTION_READINESS.md Blocker #1).
 *
 * Auth: verifies the same NextAuth session JWT the main app issues (default
 * cookie-based session, `session: { strategy: "jwt" }` in lib/auth/authOptions.ts,
 * no custom jwt.encode/decode override there — so `next-auth/jwt`'s default
 * `decode` with the shared NEXTAUTH_SECRET reads it directly, no separate
 * ticket-minting endpoint needed). Accepts the token either as a cookie (browser
 * clients connecting with credentials) or via `socket.handshake.auth.token` (for
 * non-browser clients that can't rely on cookies).
 *
 * Tenant scoping: a room id must equal the caller's schoolId or be prefixed with
 * `${schoolId}:` — this is a deliberately simple convention (there is no existing
 * frontend integration to match; grep for join-room/send-message/receive-message
 * turned up zero call sites when this was fixed), so any real integration must
 * follow it. SUPERADMIN sessions bypass the room-prefix check (already global by
 * design elsewhere in this app).
 */

const PORT = Number(process.env.SOCKET_PORT || 3001);
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN || process.env.NEXTAUTH_URL || "http://localhost:3000";
const SESSION_COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

if (!NEXTAUTH_SECRET) {
  throw new Error(
    "SOCKET SERVER: NEXTAUTH_SECRET must be set so incoming connections' session tokens can be verified."
  );
}

const io = new Server(PORT, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
});

type AuthedSocketData = {
  userId: string;
  schoolId: string | null;
  role: string;
};

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

io.use(async (socket, next) => {
  try {
    const authToken = socket.handshake.auth?.token as string | undefined;
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const rawToken =
      authToken || SESSION_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean);

    if (!rawToken) {
      return next(new Error("Unauthorized: no session token provided"));
    }

    const token = await decode({ token: rawToken, secret: NEXTAUTH_SECRET as string });
    if (!token || !token.id) {
      return next(new Error("Unauthorized: invalid or expired session"));
    }

    const data: AuthedSocketData = {
      userId: String(token.id),
      schoolId: typeof token.schoolId === "string" && token.schoolId ? token.schoolId : null,
      role: String(token.role ?? ""),
    };
    socket.data = data;
    next();
  } catch (err) {
    logger.error("Socket auth error:", err);
    next(new Error("Unauthorized: session verification failed"));
  }
});

function roomAllowed(data: AuthedSocketData, roomId: unknown): roomId is string {
  if (typeof roomId !== "string" || !roomId) return false;
  if (data.role === "SUPERADMIN") return true;
  if (!data.schoolId) return false;
  return roomId === data.schoolId || roomId.startsWith(`${data.schoolId}:`);
}

io.on("connection", (socket) => {
  const data = socket.data as AuthedSocketData;
  logger.info("Connected:", socket.id, "user:", data.userId);

  socket.on("join-room", (roomId: unknown) => {
    if (!roomAllowed(data, roomId)) {
      socket.emit("error", { message: "Forbidden: cannot join this room" });
      return;
    }
    socket.join(roomId);
  });

  socket.on(
    "send-message",
    ({ roomId, message }: { roomId: unknown; message: unknown }) => {
      if (!roomAllowed(data, roomId)) {
        socket.emit("error", { message: "Forbidden: cannot send to this room" });
        return;
      }
      io.to(roomId).emit("receive-message", message);
    }
  );

  socket.on("disconnect", () => {
    logger.info("Disconnected:", socket.id);
  });
});

logger.info(`Socket server running on :${PORT}`);
