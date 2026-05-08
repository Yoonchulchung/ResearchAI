import { NextRequest, NextResponse } from "next/server";

// 로그인 없이 접근 가능한 경로 (whitelist)
const PUBLIC_PATHS = ["/", "/login", "/landing"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("auth_token")?.value;

  // 이미 로그인한 사용자가 /login 접근 시 /main 으로 리다이렉트
  if (pathname.startsWith("/login") && token) {
    return NextResponse.redirect(new URL("/main", req.url));
  }

  // 비로그인 사용자가 보호된 경로 접근 시 / 로 리다이렉트 (원천차단)
  if (!token && !isPublic(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|backgrounds).*)"],
};
