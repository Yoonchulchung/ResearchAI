import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get("auth_token")?.value;

  // Redirect already-logged-in users away from login page
  if (pathname.startsWith("/login")) {
    if (token) {
      return NextResponse.redirect(new URL("/main", req.url));
    }
  }

  // 로그인을 안했을 때는 /main 을 접속 차단하고 / 로 튕기게 처리
  if (!token && (pathname === "/main" || pathname.startsWith("/main/") || pathname.startsWith("/settings") || pathname.startsWith("/doc-"))) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|backgrounds).*)"],
};
