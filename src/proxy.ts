import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type Session } from "@/lib/session";

/**
 * Gate every page behind the session cookie. The tRPC API enforces this again
 * via `protectedProcedure` — this layer is for redirecting humans, not for
 * security on its own.
 *
 * Named `proxy` in a `proxy.ts` file: Next 16 deprecated the `middleware`
 * convention.
 */
export async function proxy(request: NextRequest) {
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
  /**
   * Pages only. Every `/api` route is excluded deliberately: they enforce
   * their own auth and answer 401, and redirecting an API call to an HTML
   * login page gives a non-browser client (the macOS sync engine) a 200 full
   * of HTML instead of a status it can act on.
   */
  matcher: ["/((?!api/|login|_next/static|_next/image|favicon.ico|icon|manifest.webmanifest).*)"],
};
