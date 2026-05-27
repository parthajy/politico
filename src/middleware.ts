import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (!user && isVRoot && !isVLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/v/login";
    return NextResponse.redirect(url);
  }

  if (user && (isFirm || isParty || isSuper || (isVRoot && !isVLogin))) {
    const { data: profile } = await supabase
      .from("users").select("role").eq("id", user.id).single();
    const role = profile?.role as string | undefined;

    // Volunteers stick to /v/*; if they hit /firm or /party or /super, bounce to /v.
    if ((isFirm || isParty || isSuper) && role === "volunteer") {
      const url = req.nextUrl.clone();
      url.pathname = "/v";
      return NextResponse.redirect(url);
    }
    // /v/* requires volunteer role
    if (isVRoot && !isVLogin && role !== "volunteer") {
      const url = req.nextUrl.clone();
      url.pathname = role === "superadmin" ? "/super" : role === "party_viewer" ? "/party" : "/firm";
      return NextResponse.redirect(url);
    }

    // Superadmin always lands on /super
    if ((isFirm || isParty) && role === "superadmin") {
      const url = req.nextUrl.clone();
      url.pathname = "/super";
      return NextResponse.redirect(url);
    }
    if (isSuper && role !== "superadmin") {
      const url = req.nextUrl.clone();
      url.pathname = role === "party_viewer" ? "/party" : "/firm";
      return NextResponse.redirect(url);
    }
    if (isFirm && role !== "firm_admin" && role !== "firm_analyst" && role !== "firm_intern") {
      const url = req.nextUrl.clone();
      url.pathname = "/party";
      return NextResponse.redirect(url);
    }
    if (isParty && role !== "party_viewer") {
      const url = req.nextUrl.clone();
      url.pathname = "/firm";
      return NextResponse.redirect(url);
    }
  }

  // Authenticated user landing on /login or / — send them to their home
  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("users").select("role").eq("id", user.id).single();
    const role = profile?.role as string | undefined;
    const url = req.nextUrl.clone();
    url.pathname = role === "superadmin" ? "/super"
      : role === "party_viewer" ? "/party"
      : role === "volunteer" ? "/v"
      : "/firm";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
};
