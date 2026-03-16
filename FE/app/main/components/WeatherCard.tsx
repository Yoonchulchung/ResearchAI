"use client";

import { useEffect, useState } from "react";

interface DayForecast {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProb: number;
  windSpeed: number;
}

interface WeatherData {
  temp: number;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  city: string;
  forecast: DayForecast[];
}

function getWeatherInfo(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "맑음" };
  if (code <= 2) return { icon: "🌤️", label: "구름 조금" };
  if (code === 3) return { icon: "☁️", label: "흐림" };
  if (code <= 48) return { icon: "🌫️", label: "안개" };
  if (code <= 57) return { icon: "🌧️", label: "이슬비" };
  if (code <= 67) return { icon: "🌧️", label: "비" };
  if (code <= 77) return { icon: "❄️", label: "눈" };
  if (code <= 82) return { icon: "🌦️", label: "소나기" };
  if (code <= 86) return { icon: "🌨️", label: "눈 소나기" };
  return { icon: "⛈️", label: "뇌우" };
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function formatDay(dateStr: string, index: number): string {
  if (index === 0) return "오늘";
  if (index === 1) return "내일";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
}

// ── Weekly forecast modal ──────────────────────────────────────
function WeatherModal({ weather, onClose }: { weather: WeatherData; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const { icon, label } = getWeatherInfo(weather.weatherCode);

  // temp range for bar chart
  const allMax = Math.max(...weather.forecast.map((d) => d.tempMax));
  const allMin = Math.min(...weather.forecast.map((d) => d.tempMin));
  const range = allMax - allMin || 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header: current weather */}
        <div className="bg-linear-to-br from-sky-400 to-indigo-500 px-6 pt-6 pb-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold opacity-80 mb-1">{weather.city}</div>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold leading-none">{weather.temp}°</span>
                <span className="text-4xl leading-none">{icon}</span>
              </div>
              <div className="text-sm mt-2 opacity-90">{label}</div>
              <div className="text-xs opacity-70 mt-1">
                최고 {weather.tempMax}° / 최저 {weather.tempMin}°
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-xl leading-none transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Sub stats */}
          <div className="flex gap-4 mt-4 pt-4 border-t border-white/20 text-xs">
            <div>
              <div className="opacity-60">바람</div>
              <div className="font-semibold mt-0.5">{weather.windSpeed} km/h</div>
            </div>
            <div>
              <div className="opacity-60">습도</div>
              <div className="font-semibold mt-0.5">{weather.humidity}%</div>
            </div>
            <div>
              <div className="opacity-60">강수확률</div>
              <div className="font-semibold mt-0.5">{weather.forecast[0]?.precipProb ?? 0}%</div>
            </div>
          </div>
        </div>

        {/* 7-day forecast */}
        <div className="px-4 py-4">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">7일 예보</div>
          <div className="space-y-2">
            {weather.forecast.map((day, i) => {
              const { icon: dIcon } = getWeatherInfo(day.weatherCode);
              // bar positions (0–100%)
              const minPct = ((day.tempMin - allMin) / range) * 100;
              const maxPct = ((day.tempMax - allMin) / range) * 100;
              const barLeft = minPct;
              const barWidth = maxPct - minPct;

              return (
                <div key={day.date} className={`flex items-center gap-3 py-1.5 ${i === 0 ? "bg-sky-50 rounded-xl px-2 -mx-2" : ""}`}>
                  {/* Day */}
                  <span className={`text-xs w-20 shrink-0 ${i === 0 ? "font-bold text-sky-700" : "text-slate-600"}`}>
                    {formatDay(day.date, i)}
                  </span>
                  {/* Icon */}
                  <span className="text-base w-6 text-center shrink-0">{dIcon}</span>
                  {/* Precip */}
                  <span className={`text-[10px] w-8 text-right shrink-0 ${day.precipProb >= 40 ? "text-sky-500 font-semibold" : "text-slate-300"}`}>
                    {day.precipProb > 0 ? `${day.precipProb}%` : ""}
                  </span>
                  {/* Temp range bar */}
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-7 text-right shrink-0">{day.tempMin}°</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full relative">
                      <div
                        className={`absolute h-full rounded-full ${i === 0 ? "bg-sky-400" : "bg-slate-300"}`}
                        style={{ left: `${barLeft}%`, width: `${Math.max(barWidth, 4)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-600 font-semibold w-7 shrink-0">{day.tempMax}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── WeatherCard ────────────────────────────────────────────────
export function WeatherCard() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const [weatherRes, geoRes] = await Promise.all([
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
            `&timezone=auto&forecast_days=7`,
          ),
          fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { "Accept-Language": "ko" } },
          ),
        ]);

        const [w, g] = await Promise.all([weatherRes.json(), geoRes.json()]);
        const c = w.current;
        const d = w.daily;

        const city =
          g.address?.city || g.address?.town || g.address?.county || g.address?.state || "현재 위치";

        const forecast: DayForecast[] = (d.time as string[]).map((date: string, i: number) => ({
          date,
          weatherCode: d.weather_code[i],
          tempMax: Math.round(d.temperature_2m_max[i]),
          tempMin: Math.round(d.temperature_2m_min[i]),
          precipProb: d.precipitation_probability_max[i] ?? 0,
          windSpeed: Math.round(d.wind_speed_10m_max[i]),
        }));

        setWeather({
          temp: Math.round(c.temperature_2m),
          tempMax: Math.round(d.temperature_2m_max[0]),
          tempMin: Math.round(d.temperature_2m_min[0]),
          weatherCode: c.weather_code,
          windSpeed: Math.round(c.wind_speed_10m),
          humidity: c.relative_humidity_2m,
          city,
          forecast,
        });
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      () => fetchWeather(37.5665, 126.978),
      { timeout: 5000 },
    );
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-xl animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 bg-slate-100 rounded animate-pulse w-20" />
            <div className="h-5 bg-slate-100 rounded animate-pulse w-16" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !weather) return null;

  const { icon, label } = getWeatherInfo(weather.weatherCode);

  return (
    <>
      {open && <WeatherModal weather={weather} onClose={() => setOpen(false)} />}

      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white rounded-2xl border border-slate-200 px-5 py-4 hover:border-sky-300 hover:shadow-sm transition-all text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none">{icon}</span>
            <div>
              <div className="text-2xl font-bold text-slate-800 leading-none">{weather.temp}°</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-600">{weather.city}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              최고 {weather.tempMax}° / 최저 {weather.tempMin}°
            </div>
            <div className="text-[10px] text-slate-300 mt-1">클릭하여 주간 예보 보기</div>
          </div>
        </div>
      </button>
    </>
  );
}
