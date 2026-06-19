import { Injectable } from '@nestjs/common';
import {
  COMPETENCY_KEYS,
  HrAnalysis,
  CompanyAnalysisDto,
} from 'src/company/domain/company-analysis.types';

@Injectable()
export class CompanyAnalysisChatService {
  formatChatContext(
    c: CompanyAnalysisDto,
    sourceContext: string | null,
  ): string {
    const parts: string[] = [
      `## 분석 대상\n회사명: ${c.companyName}\n분석일: ${c.updatedAt.toISOString()}\n모델: ${c.aiModel ?? 'unknown'}`,
    ];

    if (c.summary) parts.push(`## 인재상·조직문화 요약\n${c.summary}`);
    if (c.report) parts.push(`## 기업 분석 보고서\n${c.report}`);

    const scoreLines = COMPETENCY_KEYS.map((key) => {
      const reason = c.reasons?.[key];
      return `- ${key}: ${c.scores[key]}점${reason ? ` | 근거: ${reason}` : ''}`;
    });
    parts.push(`## 핵심 역량 점수와 근거\n${scoreLines.join('\n')}`);

    if (c.hrAnalysis) {
      const hrParts: string[] = [];
      if (c.hrAnalysis.hrWheel?.length) {
        const wheelLines = c.hrAnalysis.hrWheel.map((w) => {
          const category = this.getHrWheelCategory(w.area);
          return `- [${category}] ${w.area}: ${w.score}점 | 근거: ${w.evidence || '저장된 근거 없음'}`;
        });
        const averages = this.formatHrCategoryAverages(c.hrAnalysis.hrWheel);
        hrParts.push(
          `### HR Wheel\n${wheelLines.join('\n')}${averages ? `\n\n${averages}` : ''}`,
        );
      }
      if (c.hrAnalysis.competingValues) {
        const v = c.hrAnalysis.competingValues;
        const evidenceLines = v.evidence
          ? [
              v.evidence.clan ? `- 클랜 ${v.clan}%: ${v.evidence.clan}` : null,
              v.evidence.adhocracy
                ? `- 아드호크라시 ${v.adhocracy}%: ${v.evidence.adhocracy}`
                : null,
              v.evidence.market
                ? `- 시장 ${v.market}%: ${v.evidence.market}`
                : null,
              v.evidence.hierarchy
                ? `- 위계 ${v.hierarchy}%: ${v.evidence.hierarchy}`
                : null,
            ]
              .filter(Boolean)
              .join('\n')
          : '';
        hrParts.push(
          `### 경쟁 가치 모델(CVF)\n클랜 ${v.clan}, 아드호크라시 ${v.adhocracy}, 시장 ${v.market}, 위계 ${v.hierarchy}, 지배 유형 ${v.dominant}\n${v.description}${evidenceLines ? `\n\n비율별 근거:\n${evidenceLines}` : ''}`,
        );
      }
      if (c.hrAnalysis.ulrichModel) {
        const u = c.hrAnalysis.ulrichModel;
        hrParts.push(
          `### 울리치 모델\n전략적 파트너 ${u.strategicPartner}, 변화 관리자 ${u.changeAgent}, 행정 전문가 ${u.adminExpert}, 직원 후원자 ${u.employeeChampion}, 지배 역할 ${u.dominant}\n${u.description}`,
        );
      }
      if (c.hrAnalysis.harvardModel) {
        const h = c.hrAnalysis.harvardModel;
        hrParts.push(
          `### 하버드 모델\n상황 요인: ${h.situationalFactors.join(', ')}\n이해관계자 관심사: ${h.stakeholderInterests.join(', ')}\nHR 정책: ${h.hrPolicies.join(', ')}\nHR 성과: ${h.hrOutcomes.join(', ')}\n장기 효과: ${h.longTermConsequences.join(', ')}\n요약: ${h.summary}`,
        );
      }
      if (c.hrAnalysis.careerPageUrl)
        hrParts.push(`### 채용 페이지\n${c.hrAnalysis.careerPageUrl}`);
      if (c.hrAnalysis.dataCollectionNote)
        hrParts.push(
          `### HR 자료 수집 메모\n${c.hrAnalysis.dataCollectionNote}`,
        );
      if (hrParts.length)
        parts.push(`## HR 분석 산출물\n${hrParts.join('\n\n')}`);
    }

    if (c.companyProfile) {
      const cp = c.companyProfile;
      const profileLines = [
        cp.businessArea ? `사업영역: ${cp.businessArea}` : null,
        cp.businessStatus ? `사업현황: ${cp.businessStatus}` : null,
        cp.coreValues.length ? `핵심가치: ${cp.coreValues.join(', ')}` : null,
        cp.jobIntroduction?.length
          ? `직무소개:\n${cp.jobIntroduction.map((j) => `- ${j.name}: ${j.description}`).join('\n')}`
          : null,
        cp.specialNotes ? `특기사항: ${cp.specialNotes}` : null,
        cp.historyAchievements
          ? `역사·주요 업적: ${cp.historyAchievements}`
          : null,
        cp.socialContribution ? `사회공헌: ${cp.socialContribution}` : null,
        cp.employeeCount ? `임직원수: ${cp.employeeCount}` : null,
        cp.brandImage ? `브랜드 이미지: ${cp.brandImage}` : null,
        cp.businessPromotion ? `사업 추진: ${cp.businessPromotion}` : null,
        cp.currentYearGoal ? `올해 목표: ${cp.currentYearGoal}` : null,
        cp.nextYearGoal ? `내년 목표: ${cp.nextYearGoal}` : null,
      ].filter(Boolean);
      if (profileLines.length)
        parts.push(`## 기업 프로파일\n${profileLines.join('\n')}`);
    }

    if (c.businessSegments?.length) {
      parts.push(
        `## 사업 부문\n${c.businessSegments
          .map((s) =>
            [
              `- ${s.name}${s.revenueShare ? ` (매출비중 ${s.revenueShare})` : ''}: ${s.description}`,
              s.mainProducts ? `  주요제품: ${s.mainProducts}` : null,
              s.subsidiaries?.length
                ? `  종속회사: ${s.subsidiaries.join(', ')}`
                : null,
              s.facilities ? `  시설·거점: ${s.facilities}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n')}`,
      );
    }

    if (c.competitors?.length) {
      parts.push(
        `## 검증된 경쟁사 분석\n${c.competitors
          .map((comp) =>
            [
              `- ${comp.name} (${comp.threatLevel})`,
              `  경쟁 이유: ${comp.reason}`,
              `  필요 역량·전략: ${comp.needed}`,
              comp.marketScope
                ? `  시장 범위: ${comp.marketScope === 'domestic' ? '국내 경쟁' : '국내 시장에 영향을 주는 해외 기업'}`
                : null,
              comp.sourceTitle || comp.sourceUrl
                ? `  근거: ${comp.sourceTitle ?? comp.sourceUrl}${comp.sourceUrl ? ` (${comp.sourceUrl})` : ''}`
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n')}`,
      );
    }

    if (c.hrTechSources?.length) {
      parts.push(
        `## HR 분석에 사용한 기술 조직·HRD 크롤링 출처\n${c.hrTechSources.map((source, i) => `${i + 1}. [${source.category}] ${source.title}\n   출처: ${source.url}`).join('\n')}`,
      );
    }

    if (c.financialSummary)
      parts.push(
        `## DART 재무·공시 원자료 요약\n${c.financialSummary.slice(0, 6000)}`,
      );
    if (c.jobplanetSummary)
      parts.push(
        `## 잡플래닛 리뷰 수집 자료\n${c.jobplanetSummary.slice(0, 6000)}`,
      );

    const sources = [
      this.formatSources('인재상·채용 검색 출처', c.evidence),
      this.formatSources('경쟁사 후보 크롤링 출처', c.competitorSources),
      this.formatSources('기술 조직·HRD 크롤링 출처', c.hrTechSources),
      this.formatSources('사업부문 검색 출처', c.segmentSources),
      this.formatSources(
        'DART 공시 출처',
        c.disclosures?.map((d) => ({
          title: `${d.date} ${d.title}`,
          url: d.url,
        })) ?? null,
      ),
      this.formatSources(
        '최근 뉴스',
        c.recentNews?.map((n) => ({
          title: `${n.title}${n.summary ? ` - ${n.summary}` : ''}`,
          url: n.url,
        })) ?? null,
      ),
      this.formatSources('채용 공고', c.jobPostings),
    ].filter(Boolean);
    if (sources.length)
      parts.push(`## 저장된 출처 목록\n${sources.join('\n\n')}`);

    if (sourceContext?.trim()) {
      parts.push(
        `## 보고서 작성 당시 AI에 제공된 원자료 묶음\n${sourceContext.slice(0, 40000)}`,
      );
    } else {
      parts.push(
        '## 보고서 작성 당시 AI에 제공된 원자료 묶음\n이 분석은 원자료 전문 저장 기능이 추가되기 전에 생성되어 전문이 없습니다. 위의 저장된 산출물, 항목별 근거, 출처 목록, 재무·리뷰 요약을 기준으로 답변하세요.',
      );
    }

    return parts.join('\n\n---\n\n');
  }

  private getHrWheelCategory(area: string): 'HRM' | 'HRD' | '공통' {
    const normalized = area.replace(/\s/g, '');
    if (
      /(교육|성장|개발|육성|학습|역량|리더십|승계|코칭|멘토링)/.test(normalized)
    )
      return 'HRD';
    if (
      /(채용|확보|선발|평가|성과|보상|복리|후생|인사관리|노무|배치|이동|제도|운영)/.test(
        normalized,
      )
    )
      return 'HRM';
    return '공통';
  }

  private formatHrCategoryAverages(
    hrWheel: HrAnalysis['hrWheel'],
  ): string | null {
    if (!hrWheel?.length) return null;
    const grouped = new Map<'HRM' | 'HRD' | '공통', number[]>();
    for (const item of hrWheel) {
      const key = this.getHrWheelCategory(item.area);
      grouped.set(key, [...(grouped.get(key) ?? []), item.score]);
    }
    const lines = [...grouped.entries()].map(([category, scores]) => {
      const avg = Math.round(
        scores.reduce((sum, score) => sum + score, 0) / scores.length,
      );
      return `- ${category} 평균: ${avg}점 (${scores.length}개 항목 기준)`;
    });
    return `### HRM/HRD 분류별 평균\n${lines.join('\n')}`;
  }

  private formatSources(
    label: string,
    sources: { title: string; url: string }[] | null,
  ): string | null {
    if (!sources?.length) return null;
    return `### ${label}\n${sources.map((s, i) => `${i + 1}. ${s.title || s.url}\n   출처: ${s.url}`).join('\n')}`;
  }
}
