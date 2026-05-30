import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Behind Caddy on the DO droplet, Next.js sometimes resolves `req.nextUrl`'s
// host to `localhost:3000` (the bound HOSTNAME leaks through Next's URL
// parsing). Build redirects from the actual `Host` header instead — Caddy
// preserves it, so this gives us samvidya.com every time. Fall back to the
// SITE_URL env var only if the header is missing or itself localhost.
function safeRedirect(req: NextRequest, pathname: string): NextResponse {
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const base = host && !host.startsWith("localhost") && !host.startsWith("127.")
    ? `${proto}://${host}`
    : (process.env.SITE_URL || "https://samvidya.com");
  return NextResponse.redirect(`${base}${pathname}`);
}

export async function middleware(req: NextRequest) {
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-pathname", req.nextUrl.pathname);
  let res = NextResponse.next({ request: { headers: reqHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: { headers: reqHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;

  const isAuthRoute = path === "/login" || path === "/" || path.startsWith("/auth");
  const isFirm = path.startsWith("/firm");
  const isParty = path.startsWith("/party");
  const isSuper = path.startsWith("/super");
  // /v is the volunteer PWA. /v/login is the only unauthenticated route under it.
  const isVRoot = path === "/v" || path.startsWith("/v/");
  const isVLogin = path === "/v/login";

  if (!user && (isFirm || isParty || isSuper)) {
    return safeRedirect(req, "/login");
  }
  if (!user && isVRoot && !isVLogin) {
    return safeRedirect(req, "/v/login");
  }

  if (user && (isFirm || isParty || isSuper || (isVRoot && !isVLogin))) {
    const { data: profile } = await supabase
      .from("users").select("role").eq("id", user.id).single();
    const role = profile?.role as string | undefined;

    // Volunteers stick to /v/*; if they hit /firm or /party or /super, bounce to /v.
    if ((isFirm || isParty || isSuper) && role === "volunteer") {
      return safeRedirect(req, "/v");
    }
    // /v/* requires volunteer role
    if (isVRoot && !isVLogin && role !== "volunteer") {
      return safeRedirect(req, role === "superadmin" ? "/super" : role === "party_viewer" ? "/party" : "/firm");
    }

    // Superadmin always lands on /super
    if ((isFirm || isParty) && role === "superadmin") {
      return safeRedirect(req, "/super");
    }
    if (isSuper && role !== "superadmin") {
      return safeRedirect(req, role === "party_viewer" ? "/party" : "/firm");
    }
    if (isFirm && role !== "firm_admin" && role !== "firm_analyst" && role !== "firm_intern") {
      return safeRedirect(req, "/party");
    }
    if (isParty && role !== "party_viewer") {
      return safeRedirect(req, "/firm");
    }
  }

  // Authenticated user landing on /login or / — send them to their home
  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("users").select("role").eq("id", user.id).single();
    const role = profile?.role as string | undefined;
    return safeRedirect(req,
      role === "superadmin" ? "/super"
        : role === "party_viewer" ? "/party"
        : role === "volunteer" ? "/v"
        : "/firm");
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
};
