import { NextResponse, type NextRequest } from "next/server";
import { configuredAppUrl, consumeMagicLink, createSession, SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const result = token ? await consumeMagicLink(token) : null;
  const base = configuredAppUrl() || req.nextUrl.origin;
  if (!result) return NextResponse.redirect(new URL("/login?error=expired", base));
  const session = await createSession(result.user.id);
  const dest = result.user.name ? result.next : `/welcome?next=${encodeURIComponent(result.next)}`;
  const res = NextResponse.redirect(new URL(dest, base));
  res.cookies.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https://"),
    path: "/",
    expires: session.expires,
  });
  return res;
}
