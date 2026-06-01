import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

// 로그인 없이 접근 가능한 경로 (whitelist)
const PUBLIC_PATHS = ["/", "/login", "/landing"];

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "change-me-in-production"
);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function isValidToken(raw: string | undefined): Promise<boolean> {
  if (!raw) return false;
  try {
    await jwtVerify(raw, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const rawToken = req.cookies.get("auth_token")?.value;
  const valid = await isValidToken(rawToken);

  // 만료/위조 쿠키 제거 후 공개 경로로 리다이렉트
  if (rawToken && !valid && !isPublic(pathname)) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete("auth_token");
    return res;
  }

  // 이미 로그인한 사용자가 /login 접근 시 /main 으로 리다이렉트
  if (pathname.startsWith("/login") && valid) {
    return NextResponse.redirect(new URL("/main", req.url));
  }

  // 비로그인 사용자가 보호된 경로 접근 시 / 로 리다이렉트 (원천차단)
  if (!valid && !isPublic(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|backgrounds).*)"],
};
