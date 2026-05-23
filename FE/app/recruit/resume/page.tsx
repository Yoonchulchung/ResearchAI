"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getResume, saveResume,
  type ResumeProfile, type ResumeEducation,
  type ResumeLanguage, type ResumeSkill,
  type ResumeAward, type ResumeActivity, type ResumeOverseas,
  type ResumeSelfIntro,
} from "@/lib/api/resume";
import { createExperience, updateExperience, getExperiences, type Experience } from "@/lib/api/experiences";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

const EMPTY_PROFILE: ResumeProfile = {
  basicInfo: { name: "", englishName: "", gender: "", birthDate: "", email: "", phone: "", address: "", nationality: "대한민국", hobby: "", motto: "" },
  education: [], languages: [], skills: [], military: undefined,
  awards: [], activities: [], overseas: [], selfIntroductions: [],
};

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
      <span className="w-1 h-4 rounded-full bg-indigo-500 shrink-0" />
      {children}
    </h2>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 py-6 text-center">{children}</p>;
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={5}
          className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-300 resize-y leading-relaxed" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? label}
          className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-300" />
      )}
    </div>
  );
}

// ─── View mode components ──────────────────────────────────────────────────────

function ViewTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">{children}</span>;
}

function ViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function ExpandableCard({ title, sub, content }: { title: string; sub?: string; content?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{title}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {content && (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            className={`shrink-0 ml-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M2 4.5L6.5 9L11 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {open && content && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mt-3">{content}</p>
        </div>
      )}
    </div>
  );
}

function ExperienceLibrarySection({ allExperiences, linkedIds }: { allExperiences: Experience[]; linkedIds: Set<string> }) {
  if (allExperiences.length === 0) return null;

  const grouped = allExperiences.reduce<Record<string, Experience[]>>((acc, exp) => {
    const cat = exp.category || "기타";
    (acc[cat] ||= []).push(exp);
    return acc;
  }, {});

  return (
    <ViewSection title={`경험 라이브러리 (${allExperiences.length}건)`}>
      <div className="flex flex-col gap-3">
        {Object.entries(grouped).map(([cat, exps]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{cat}</p>
            <div className="flex flex-col gap-1.5">
              {exps.map((exp) => (
                <ExpandableCard
                  key={exp.id}
                  title={exp.title}
                  sub={linkedIds.has(exp.id) ? "이력서 연동" : undefined}
                  content={exp.content}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ViewSection>
  );
}

function ResumeView({ profile, onEdit, allExperiences }: { profile: ResumeProfile; onEdit: () => void; allExperiences: Experience[] }) {
  const bi = profile.basicInfo;
  const isEmpty = !bi.name && profile.education.length === 0 && profile.awards.length === 0 &&
    profile.activities.length === 0 && profile.overseas.length === 0 && profile.selfIntroductions.length === 0;

  const linkedIds = new Set<string>([
    ...(profile.awards as (ResumeAward & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
    ...(profile.activities as (ResumeActivity & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
    ...(profile.overseas as (ResumeOverseas & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
    ...(profile.selfIntroductions as (ResumeSelfIntro & { experienceId?: string })[]).flatMap(a => a.experienceId ? [a.experienceId] : []),
  ]);

  if (isEmpty) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-400">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="6" y="4" width="28" height="32" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 13h14M13 19h14M13 25h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <p className="text-sm">아직 작성된 이력서가 없습니다.</p>
          <button onClick={onEdit}
            className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-xl transition-colors">
            이력서 작성 시작
          </button>
        </div>
        <ExperienceLibrarySection allExperiences={allExperiences} linkedIds={linkedIds} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 기본정보 */}
      {(bi.name || bi.email || bi.phone || bi.address) && (
        <ViewSection title="기본정보">
          <div className="flex flex-col gap-2">
            {bi.name && (
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">{bi.name}</span>
                {bi.englishName && <span className="text-sm text-slate-400">{bi.englishName}</span>}
                {bi.gender && <ViewTag>{bi.gender}</ViewTag>}
                {bi.birthDate && <span className="text-xs text-slate-400">{bi.birthDate}</span>}
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-sm text-slate-600 mt-1">
              {bi.email && <span>✉ {bi.email}</span>}
              {bi.phone && <span>📱 {bi.phone}</span>}
              {bi.nationality && bi.nationality !== "대한민국" && <ViewTag>{bi.nationality}</ViewTag>}
            </div>
            {bi.address && <p className="text-xs text-slate-400">{bi.address}</p>}
            {bi.motto && (
              <p className="text-xs text-slate-500 italic border-l-2 border-indigo-200 pl-3 mt-1">"{bi.motto}"</p>
            )}
          </div>
        </ViewSection>
      )}

      {/* 학력 */}
      {profile.education.length > 0 && (
        <ViewSection title="학력사항">
          <div className="flex flex-col gap-3">
            {profile.education.map((edu) => (
              <div key={edu.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${edu.type === "university" || edu.type === "graduate" ? "bg-indigo-400" : "bg-slate-300"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">{edu.school}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {edu.major && <ViewTag>{edu.major}</ViewTag>}
                    {edu.status && <ViewTag>{edu.status}</ViewTag>}
                    {edu.gpa && <ViewTag>학점 {edu.gpa}{edu.gpaMax ? `/${edu.gpaMax}` : ""}</ViewTag>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{edu.startDate} ~ {edu.endDate} · {edu.location}</p>
                </div>
              </div>
            ))}
          </div>
        </ViewSection>
      )}

      {/* 병역 */}
      {profile.military && (
        <ViewSection title="병역">
          <div className="flex flex-wrap gap-2">
            <ViewTag>{profile.military.status}</ViewTag>
            {profile.military.rank && <ViewTag>계급 {profile.military.rank}</ViewTag>}
            {profile.military.dischargeType && <ViewTag>{profile.military.dischargeType}</ViewTag>}
            {profile.military.startDate && (
              <span className="text-xs text-slate-400 self-center">
                {profile.military.startDate} ~ {profile.military.endDate}
              </span>
            )}
          </div>
        </ViewSection>
      )}

      {/* 어학 + 기술 */}
      {(profile.languages.length > 0 || profile.skills.length > 0) && (
        <ViewSection title="어학 / 자격 · 기술">
          {profile.languages.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-400 mb-2">공인외국어시험</p>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((l) => (
                  <div key={l.id} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                    <span className="font-bold text-slate-700">{l.name}</span>
                    <span className="text-slate-400 ml-1.5">{l.score}</span>
                    {l.date && <span className="text-slate-300 ml-1.5">{l.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {profile.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">컴퓨터활용능력</p>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((s) => (
                  <div key={s.id} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                    <span className="font-bold text-slate-700">{s.name}</span>
                    {s.level && <span className="text-slate-400 ml-1.5">{s.level}</span>}
                    {s.period && <span className="text-slate-300 ml-1.5">{s.period}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </ViewSection>
      )}

      {/* 수상경력 */}
      {profile.awards.length > 0 && (
        <ViewSection title={`수상경력 (${profile.awards.length}건)`}>
          <div className="flex flex-col gap-2">
            {profile.awards.map((aw) => (
              <ExpandableCard
                key={aw.id}
                title={`${aw.title} — ${aw.organization}`}
                sub={aw.date}
                content={aw.description}
              />
            ))}
          </div>
        </ViewSection>
      )}

      {/* 학내외활동 */}
      {profile.activities.length > 0 && (
        <ViewSection title={`학내외활동 (${profile.activities.length}건)`}>
          <div className="flex flex-col gap-2">
            {profile.activities.map((ac) => (
              <ExpandableCard
                key={ac.id}
                title={`${ac.type} ${ac.organization}`}
                sub={`${ac.startDate}${ac.endDate ? ` ~ ${ac.endDate}` : ""}${ac.role ? ` · ${ac.role}` : ""}`}
                content={ac.description}
              />
            ))}
          </div>
        </ViewSection>
      )}

      {/* 해외경험 */}
      {profile.overseas.length > 0 && (
        <ViewSection title={`해외경험 (${profile.overseas.length}건)`}>
          <div className="flex flex-col gap-2">
            {profile.overseas.map((ov) => (
              <ExpandableCard
                key={ov.id}
                title={`${ov.country} — ${ov.purpose}`}
                sub={`${ov.startDate} ~ ${ov.endDate}`}
                content={ov.description}
              />
            ))}
          </div>
        </ViewSection>
      )}

      {/* 자기소개서 */}
      {profile.selfIntroductions.length > 0 && (
        <ViewSection title={`자기소개서 (${profile.selfIntroductions.length}문항)`}>
          <div className="flex flex-col gap-3">
            {profile.selfIntroductions.map((si, i) => (
              <ExpandableCard
                key={si.id}
                title={si.question || `문항 ${i + 1}`}
                content={si.answer}
              />
            ))}
          </div>
        </ViewSection>
      )}

      {/* 경험 라이브러리 */}
      <ExperienceLibrarySection allExperiences={allExperiences} linkedIds={linkedIds} />
    </div>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function ResumeEdit({ profile, update }: { profile: ResumeProfile; update: (patch: Partial<ResumeProfile>) => void }) {
  const bi = profile.basicInfo;
  const setBi = (key: keyof typeof bi, val: string) =>
    update({ basicInfo: { ...bi, [key]: val } });

  return (
    <div className="flex flex-col gap-5">
      {/* 기본정보 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <SectionTitle>기본정보</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="이름" value={bi.name} onChange={(v) => setBi("name", v)} />
          <Field label="영문이름" value={bi.englishName} onChange={(v) => setBi("englishName", v)} placeholder="Chung, Yoon-Chul" />
          <Field label="생년월일" value={bi.birthDate} onChange={(v) => setBi("birthDate", v)} placeholder="1999.04.06" />
          <Field label="성별" value={bi.gender} onChange={(v) => setBi("gender", v)} placeholder="남 / 여" />
          <Field label="이메일" value={bi.email} onChange={(v) => setBi("email", v)} />
          <Field label="휴대폰" value={bi.phone} onChange={(v) => setBi("phone", v)} placeholder="010-0000-0000" />
          <Field label="국적" value={bi.nationality} onChange={(v) => setBi("nationality", v)} />
          <Field label="취미" value={bi.hobby} onChange={(v) => setBi("hobby", v)} />
          <div className="sm:col-span-2">
            <Field label="현주소" value={bi.address} onChange={(v) => setBi("address", v)} />
          </div>
          <div className="sm:col-span-2">
            <Field label="좌우명" value={bi.motto} onChange={(v) => setBi("motto", v)} />
          </div>
        </div>
      </section>

      {/* 학력 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>학력사항</SectionTitle>
          <button onClick={() => update({ education: [...profile.education, { id: uid(), type: "university", school: "", location: "", startDate: "", endDate: "", status: "졸업" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            추가
          </button>
        </div>
        {profile.education.length === 0 && <EmptyHint>학력을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.education.map((edu, i) => (
            <div key={edu.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <select value={edu.type} onChange={(e) => { const ed = [...profile.education]; ed[i] = { ...ed[i], type: e.target.value as ResumeEducation["type"] }; update({ education: ed }); }}
                  className="text-xs font-semibold border border-slate-200 rounded-md px-2 py-1 text-slate-600 focus:outline-none">
                  <option value="high">고등학교</option>
                  <option value="university">대학교</option>
                  <option value="graduate">대학원</option>
                  <option value="other">기타</option>
                </select>
                <DeleteBtn onClick={() => update({ education: profile.education.filter((_, j) => j !== i) })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="학교명" value={edu.school} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], school: v }; update({ education: ed }); }} />
                <Field label="소재지" value={edu.location} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], location: v }; update({ education: ed }); }} />
                <Field label="입학일" value={edu.startDate} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], startDate: v }; update({ education: ed }); }} placeholder="2020.03.02" />
                <Field label="졸업일" value={edu.endDate} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], endDate: v }; update({ education: ed }); }} placeholder="2026.02.26" />
                {edu.type !== "high" && (
                  <Field label="전공" value={edu.major ?? ""} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], major: v }; update({ education: ed }); }} />
                )}
                <Field label="졸업구분" value={edu.status} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], status: v }; update({ education: ed }); }} placeholder="졸업 / 재학 / 중퇴" />
                {edu.type !== "high" && (
                  <>
                    <Field label="학점" value={edu.gpa ?? ""} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], gpa: v }; update({ education: ed }); }} placeholder="3.43" />
                    <Field label="만점" value={edu.gpaMax ?? ""} onChange={(v) => { const ed = [...profile.education]; ed[i] = { ...ed[i], gpaMax: v }; update({ education: ed }); }} placeholder="4.5" />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 병역 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>병역</SectionTitle>
          {!profile.military ? (
            <button onClick={() => update({ military: { status: "군필", rank: "", dischargeType: "", startDate: "", endDate: "" } })}
              className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors">추가</button>
          ) : (
            <button onClick={() => update({ military: undefined })}
              className="text-xs font-semibold text-red-400 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">삭제</button>
          )}
        </div>
        {!profile.military && <EmptyHint>해당 없으면 비워두세요.</EmptyHint>}
        {profile.military && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="복무구분" value={profile.military.status} onChange={(v) => update({ military: { ...profile.military!, status: v } })} placeholder="군필 / 미필 / 면제" />
            <Field label="계급" value={profile.military.rank ?? ""} onChange={(v) => update({ military: { ...profile.military!, rank: v } })} placeholder="상병" />
            <Field label="제대구분" value={profile.military.dischargeType ?? ""} onChange={(v) => update({ military: { ...profile.military!, dischargeType: v } })} placeholder="의병제대 / 만기제대" />
            <Field label="복무기간" value={`${profile.military.startDate ?? ""}${profile.military.endDate ? `~${profile.military.endDate}` : ""}`} onChange={(v) => {
              const [s, e] = v.split("~");
              update({ military: { ...profile.military!, startDate: s ?? "", endDate: e ?? "" } });
            }} placeholder="2022.05~2023.05" />
          </div>
        )}
      </section>

      {/* 어학 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>어학</SectionTitle>
          <button onClick={() => update({ languages: [...profile.languages, { id: uid(), name: "", score: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.languages.length === 0 && <EmptyHint>어학 성적을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-3">
          {profile.languages.map((lang, i) => (
            <div key={lang.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ languages: profile.languages.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="시험명" value={lang.name} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], name: v }; update({ languages: ls }); }} placeholder="OPIc(영어) / TOEIC" />
                <Field label="점수/등급" value={lang.score} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], score: v }; update({ languages: ls }); }} placeholder="Advanced Low / 900" />
                <Field label="응시일" value={lang.date ?? ""} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], date: v }; update({ languages: ls }); }} placeholder="2025.05" />
                <Field label="등록번호" value={lang.regNo ?? ""} onChange={(v) => { const ls = [...profile.languages]; ls[i] = { ...ls[i], regNo: v }; update({ languages: ls }); }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 기술 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>자격 / 기술</SectionTitle>
          <button onClick={() => update({ skills: [...profile.skills, { id: uid(), category: "컴퓨터활용능력", name: "", level: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.skills.length === 0 && <EmptyHint>자격 및 기술을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-2">
          {profile.skills.map((sk, i) => (
            <div key={sk.id} className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="이름" value={sk.name} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], name: v }; update({ skills: ss }); }} placeholder="C언어" />
                <Field label="수준" value={sk.level ?? ""} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], level: v }; update({ skills: ss }); }} placeholder="중급" />
                <Field label="분류" value={sk.category} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], category: v }; update({ skills: ss }); }} placeholder="컴퓨터활용능력" />
                <Field label="사용기간" value={sk.period ?? ""} onChange={(v) => { const ss = [...profile.skills]; ss[i] = { ...ss[i], period: v }; update({ skills: ss }); }} placeholder="4년" />
              </div>
              <DeleteBtn onClick={() => update({ skills: profile.skills.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
      </section>

      {/* 수상경력 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>수상경력</SectionTitle>
          <button onClick={() => update({ awards: [...profile.awards, { id: uid(), title: "", organization: "", date: "", description: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.awards.length === 0 && <EmptyHint>수상경력을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.awards.map((aw, i) => (
            <div key={aw.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ awards: profile.awards.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="상훈명" value={aw.title} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], title: v }; update({ awards: as2 }); }} placeholder="최우수 / 대상" />
                <Field label="수여기관" value={aw.organization} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], organization: v }; update({ awards: as2 }); }} />
                <Field label="발급일" value={aw.date} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], date: v }; update({ awards: as2 }); }} placeholder="2023.12.14" />
              </div>
              <Field label="상세 내용 (경험 라이브러리에 저장됩니다)" value={aw.description ?? ""} onChange={(v) => { const as2 = [...profile.awards]; as2[i] = { ...as2[i], description: v }; update({ awards: as2 }); }} placeholder="수상 배경과 성과를 자세히 기술하세요." multiline />
            </div>
          ))}
        </div>
      </section>

      {/* 학내외활동 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>학내외활동</SectionTitle>
          <button onClick={() => update({ activities: [...profile.activities, { id: uid(), type: "연구회", organization: "", startDate: "", endDate: "", role: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.activities.length === 0 && <EmptyHint>학내외활동을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.activities.map((ac, i) => (
            <div key={ac.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ activities: profile.activities.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="활동구분" value={ac.type} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], type: v }; update({ activities: aas }); }} placeholder="연구회 / 동아리" />
                <Field label="기관/조직명" value={ac.organization} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], organization: v }; update({ activities: aas }); }} />
                <Field label="시작일" value={ac.startDate} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], startDate: v }; update({ activities: aas }); }} placeholder="2020.12" />
                <Field label="종료일" value={ac.endDate ?? ""} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], endDate: v }; update({ activities: aas }); }} placeholder="2022.05" />
                <Field label="역할" value={ac.role ?? ""} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], role: v }; update({ activities: aas }); }} placeholder="임원 / 팀장" />
              </div>
              <Field label="활동 내용 (경험 라이브러리에 저장됩니다)" value={ac.description ?? ""} onChange={(v) => { const aas = [...profile.activities]; aas[i] = { ...aas[i], description: v }; update({ activities: aas }); }} placeholder="활동 내용을 자세히 기술하세요." multiline />
            </div>
          ))}
        </div>
      </section>

      {/* 해외경험 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>해외경험</SectionTitle>
          <button onClick={() => update({ overseas: [...profile.overseas, { id: uid(), country: "", purpose: "해외거주", startDate: "", endDate: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.overseas.length === 0 && <EmptyHint>해외경험을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.overseas.map((ov, i) => (
            <div key={ov.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex justify-end"><DeleteBtn onClick={() => update({ overseas: profile.overseas.filter((_, j) => j !== i) })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="국가" value={ov.country} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], country: v }; update({ overseas: os }); }} placeholder="파나마 / 아랍에미리트" />
                <Field label="목적" value={ov.purpose} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], purpose: v }; update({ overseas: os }); }} placeholder="해외거주 / 어학연수" />
                <Field label="시작일" value={ov.startDate} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], startDate: v }; update({ overseas: os }); }} placeholder="2013.12.18" />
                <Field label="종료일" value={ov.endDate} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], endDate: v }; update({ overseas: os }); }} placeholder="2016.06.20" />
              </div>
              <Field label="상세 내용 (경험 라이브러리에 저장됩니다)" value={ov.description ?? ""} onChange={(v) => { const os = [...profile.overseas]; os[i] = { ...os[i], description: v }; update({ overseas: os }); }} placeholder="해외경험 내용을 자세히 기술하세요." multiline />
            </div>
          ))}
        </div>
      </section>

      {/* 자기소개서 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>자기소개서</SectionTitle>
          <button onClick={() => update({ selfIntroductions: [...profile.selfIntroductions, { id: uid(), question: "", answer: "" }] })}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>추가
          </button>
        </div>
        {profile.selfIntroductions.length === 0 && <EmptyHint>자기소개서 문항을 추가해주세요.</EmptyHint>}
        <div className="flex flex-col gap-4">
          {profile.selfIntroductions.map((si, i) => (
            <div key={si.id} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-600">문항 {i + 1}</span>
                <DeleteBtn onClick={() => update({ selfIntroductions: profile.selfIntroductions.filter((_, j) => j !== i) })} />
              </div>
              <Field label="질문" value={si.question} onChange={(v) => { const ss = [...profile.selfIntroductions]; ss[i] = { ...ss[i], question: v }; update({ selfIntroductions: ss }); }} placeholder="성장과정 및 인생에서 가장 가치를 두는 것은?" />
              <Field label="답변 (경험 라이브러리에 저장됩니다)" value={si.answer} onChange={(v) => { const ss = [...profile.selfIntroductions]; ss[i] = { ...ss[i], answer: v }; update({ selfIntroductions: ss }); }} placeholder="자세한 내용을 작성하세요." multiline />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Experience sync ───────────────────────────────────────────────────────────

type SyncableItem = (ResumeAward | ResumeActivity | ResumeOverseas | ResumeSelfIntro) & { experienceId?: string };

async function syncToExperienceLibrary(profile: ResumeProfile): Promise<ResumeProfile> {
  const updated = structuredClone(profile) as ResumeProfile & {
    awards: (ResumeAward & { experienceId?: string })[];
    activities: (ResumeActivity & { experienceId?: string })[];
    overseas: (ResumeOverseas & { experienceId?: string })[];
    selfIntroductions: (ResumeSelfIntro & { experienceId?: string })[];
  };

  const syncItems = async <T extends SyncableItem>(
    items: T[],
    getTitle: (item: T) => string,
    getContent: (item: T) => string,
    category: string,
  ) => {
    for (const item of items) {
      const content = getContent(item).trim();
      if (!content) continue;
      const expData = { title: getTitle(item), content, category };
      try {
        if ((item as SyncableItem).experienceId) {
          await updateExperience((item as SyncableItem).experienceId!, expData);
        } else {
          const exp = await createExperience(expData);
          (item as SyncableItem).experienceId = exp.id;
        }
      } catch { /* 개별 실패는 무시 */ }
    }
  };

  await syncItems(
    updated.awards,
    (aw) => `${aw.title} — ${aw.organization}`,
    (aw) => aw.description ?? "",
    "수상경력",
  );
  await syncItems(
    updated.activities,
    (ac) => `${ac.type} ${ac.organization}`,
    (ac) => ac.description ?? "",
    "학내외활동",
  );
  await syncItems(
    updated.overseas,
    (ov) => `${ov.country} (${ov.purpose})`,
    (ov) => ov.description ?? "",
    "해외경험",
  );
  await syncItems(
    updated.selfIntroductions,
    (si) => si.question || "자기소개서",
    (si) => si.answer,
    "자기소개서",
  );

  return updated as ResumeProfile;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResumePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ResumeProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      getResume().catch(() => null),
      getExperiences().catch(() => [] as Experience[]),
    ]).then(([res, exps]) => {
      if (res) setProfile(res);
      setExperiences(exps);
      setLoading(false);
    });
  }, []);

  const update = useCallback((patch: Partial<ResumeProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const synced = await syncToExperienceLibrary(profile);
      setProfile(synced);
      await saveResume(synced);
      getExperiences().then(setExperiences).catch(() => {});
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-400 text-sm">이력서를 불러오는 중...</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200/60 flex items-center gap-3 px-5 py-3">
        <button onClick={() => router.push("/recruit")} className="text-slate-400 hover:text-slate-700 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-sm font-bold text-slate-800">이력서</h1>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
          <button onClick={() => setMode("view")}
            className={`px-3 py-1.5 transition-colors ${mode === "view" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
            조회
          </button>
          <button onClick={() => setMode("edit")}
            className={`px-3 py-1.5 transition-colors ${mode === "edit" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
            편집
          </button>
        </div>
        <div className="flex-1" />
        {mode === "edit" && (
          <button onClick={handleSave} disabled={saving}
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saved ? "저장됨 ✓" : saving ? "저장 중..." : "저장"}
          </button>
        )}
        {mode === "view" && (
          <button onClick={() => setMode("edit")}
            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors">
            편집하기
          </button>
        )}
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {mode === "view" ? (
          <ResumeView profile={profile} onEdit={() => setMode("edit")} allExperiences={experiences} />
        ) : (
          <>
            <ResumeEdit profile={profile} update={update} />
            <div className="flex justify-end py-6">
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2">
                {saving && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {saved ? "저장됨 ✓" : saving ? "저장 중..." : "이력서 저장"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
