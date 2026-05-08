"use client";

import { useState, FormEvent, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { checkUsernameApi } from "@/lib/api/auth";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const USERNAME_RE = /^[a-z0-9_]{1,30}$/;
const PASSWORD_RE = /^[a-zA-Z0-9@!_\-\.]{8,}$/;

function sanitizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ""); // 소문자·숫자·_ 외 제거
}

function sanitizePassword(raw: string): string {
  // 허용: 영문, 숫자, @ ! _ - .
  return raw.replace(/[^a-zA-Z0-9@!_\-.]/g, "");
}

type CheckState = "idle" | "checking" | "available" | "taken";

export default function LoginPage() {
  const { login, register } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registerCode, setRegisterCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "register") {
      setMode("register");
    }
  }, []);

  const handleUsernameChange = (raw: string) => {
    setUsername(sanitizeUsername(raw));
    setCheckState("idle");
    setError("");
  };

  const handlePasswordChange = (raw: string) => {
    setPassword(sanitizePassword(raw));
    setError("");
  };

  const handleCheckUsername = useCallback(async () => {
    if (!username || !USERNAME_RE.test(username)) {
      setError("사용자명은 소문자, 숫자, _만 허용됩니다.");
      return;
    }
    setCheckState("checking");
    try {
      const { available } = await checkUsernameApi(username);
      setCheckState(available ? "available" : "taken");
    } catch {
      setCheckState("idle");
    }
  }, [username]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!USERNAME_RE.test(username)) {
      setError("사용자명은 소문자, 숫자, _만 허용됩니다.");
      return;
    }

    if (mode === "register") {
      if (checkState !== "available") {
        setError("사용자명 중복 확인을 해주세요.");
        return;
      }
      if (!PASSWORD_RE.test(password)) {
        setError("비밀번호는 8자 이상, 영문/숫자/@!_-. 만 허용됩니다.");
        return;
      }
      if (password !== confirm) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }
    } else {
      if (password.length < 1) {
        setError("비밀번호를 입력해주세요.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(username, password, turnstileToken || undefined);
      } else {
        await register(username, password, turnstileToken || undefined, registerCode || undefined);
      }
      router.push("/main");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const checkBadge = () => {
    if (checkState === "checking") return <span className="text-xs text-slate-400">확인 중...</span>;
    if (checkState === "available") return <span className="text-xs text-emerald-400">사용 가능</span>;
    if (checkState === "taken") return <span className="text-xs text-red-400">이미 사용 중</span>;
    return null;
  };

  const inputCls = isDark
    ? "bg-white/10 border-white/15 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:ring-indigo-400"
    : "bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-400";

  return (
    <div className={`min-h-dvh overflow-x-hidden flex items-center justify-center px-4 py-8 transition-colors ${
      isDark
        ? "bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900"
        : "bg-linear-to-br from-slate-100 via-indigo-50 to-slate-100"
    }`}>
      <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-sm">
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600 mb-4 shadow-lg shadow-indigo-500/30">
            <span className="text-2xl">◈</span>
          </div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-800"}`}>ResearchAI</h1>
          <p className="text-slate-400 text-sm mt-1">AI 기반 리서치 시스템</p>
        </div>

        <div className={`rounded-2xl p-5 sm:p-8 shadow-xl backdrop-blur-sm ${
          isDark ? "bg-white/5 border border-white/10" : "bg-white border border-slate-200"
        }`}>
          <div className={`flex rounded-xl p-1 mb-6 ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setCheckState("idle"); setTurnstileToken(""); setRegisterCode(""); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === m
                    ? "bg-indigo-600 text-white shadow"
                    : isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 사용자명 */}
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                사용자명 <span className="text-slate-400">(소문자·숫자·_ 허용)</span>
              </label>
              <div className="flex min-w-0 gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  onCompositionUpdate={(e) => e.preventDefault()}
                  placeholder="username"
                  required
                  autoFocus
                  autoComplete="username"
                  inputMode="text"
                  lang="en"
                  style={{ imeMode: "disabled" } as React.CSSProperties}
                  className={`min-w-0 flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-1 transition-colors ${inputCls}`}
                />
                {mode === "register" && (
                  <button
                    type="button"
                    onClick={handleCheckUsername}
                    disabled={!username || checkState === "checking"}
                    className={`shrink-0 px-3 py-2 text-xs font-medium rounded-xl border disabled:opacity-40 transition-colors whitespace-nowrap ${
                      isDark
                        ? "bg-white/10 border-white/15 text-slate-300 hover:bg-white/20"
                        : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    중복확인
                  </button>
                )}
              </div>
              {mode === "register" && (
                <div className="mt-1 h-4">{checkBadge()}</div>
              )}
            </div>

            {/* 비밀번호 */}
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                비밀번호{mode === "register" && <span className="text-slate-400 break-keep"> (8자 이상, 영문/숫자/@!_-. 허용)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  onCompositionUpdate={(e) => e.preventDefault()}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  lang="en"
                  style={{ imeMode: "disabled" } as React.CSSProperties}
                  className={`w-full pl-4 pr-10 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-1 transition-colors ${inputCls}`}
                />
                <button
                  type="button"
                  onMouseDown={() => setShowPassword(true)}
                  onMouseUp={() => setShowPassword(false)}
                  onMouseLeave={() => setShowPassword(false)}
                  onTouchStart={() => setShowPassword(true)}
                  onTouchEnd={() => setShowPassword(false)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"}`}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 비밀번호 확인 (register) */}
            {mode === "register" && (
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>비밀번호 확인</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(sanitizePassword(e.target.value))}
                    onCompositionUpdate={(e) => e.preventDefault()}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    lang="en"
                    style={{ imeMode: "disabled" } as React.CSSProperties}
                    className={`w-full pl-4 pr-10 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-1 transition-colors ${inputCls}`}
                  />
                  <button
                    type="button"
                    onMouseDown={() => setShowConfirm(true)}
                    onMouseUp={() => setShowConfirm(false)}
                    onMouseLeave={() => setShowConfirm(false)}
                    onTouchStart={() => setShowConfirm(true)}
                    onTouchEnd={() => setShowConfirm(false)}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-400 hover:text-slate-600"}`}
                    tabIndex={-1}
                  >
                    {showConfirm ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {mode === "register" && (
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  초대 코드
                </label>
                <input
                  type="password"
                  value={registerCode}
                  onChange={(e) => setRegisterCode(e.target.value)}
                  placeholder="초대 코드를 입력하세요"
                  autoComplete="off"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-1 transition-colors ${inputCls}`}
                />
              </div>
            )}

            {TURNSTILE_SITE_KEY && (
              <div className="flex max-w-full justify-center overflow-hidden">
                <Turnstile
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setTurnstileToken}
                  onError={() => setTurnstileToken("")}
                  onExpire={() => setTurnstileToken("")}
                  options={{ theme: isDark ? "dark" : "light" }}
                />
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
            >
              {loading ? "처리 중..." : mode === "login" ? "로그인" : "가입하기"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
