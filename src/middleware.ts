import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type Session } from "@/lib/session";

/**
 * Gate every page behind the session cookie. The tRPC API enforces this again
 * via `protectedProcedure` — middleware is for redirecting humans, not for
 * security on its own.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<Session>(request, response, sessionOptions);

  if (!session.signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except the login page, auth endpoints and static assets.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon|manifest.webmanifest).*)"],
};
