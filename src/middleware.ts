import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  // Pass the pathname to server components via header — Next 14 doesn't expose
  // it directly. The party layout uses this to write per-view audit rows.
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

  if (!user && (isFirm || isParty || isSuper)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (isFirm || isParty || isSuper)) {
    const { data: profile } = await supabase
      .from("users").select("role").eq("id", user.id).single();
    const role = profile?.role as string | undefined;

    // Superadmin always lands on /super. Sending them anywhere else creates a
    // ping-pong because the firm/party layouts reject non-matching roles.
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

  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("users").select("role").eq("id", user.id).single();
    const role = profile?.role as string | undefined;
    const url = req.nextUrl.clone();
    url.pathname = role === "superadmin" ? "/super"
      : role === "party_viewer" ? "/party"
      : "/firm";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
};
