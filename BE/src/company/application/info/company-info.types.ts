import { CompanyListItem } from 'src/company/application/company.service';

export const SOURCE_PRIORITY: Record<string, number> = {
  dart: 100,
  jobkorea: 70,
  'namu-wiki': 65,
  jasoseol: 60,
  saramin: 58,
  jobplanet: 55,
  'jobplanet-info': 50,
  jobSite: 30,
  manual: 10,
};

export interface CompanyInfoResult {
  companyType: string | null;
  employees: string | null;
  foundedDate: string | null;
  address: string | null;
  homeUrl: string | null;
  ceoName: string | null;
  corpCode: string | null;
  stockCode: string | null;
  industry: string | null;
  dartUrl: string | null;
  source: string;
  /** 스크래핑 중 발견된 공식 한국어 회사명. 영문명으로 검색했을 때 소스가 반환한 실제 명칭. */
  discoveredName?: string | null;
  /** 스크래핑 중 발견된 영문 회사명. */
  discoveredEnglishName?: string | null;
}

export interface CompanyInfoApiStats {
  [source: string]: { calls: number; success: number; fail: number };
}

/** @deprecated use CompanyInfoApiStats */
export type EnrichApiStats = CompanyInfoApiStats;

export type InfoSourceKey =
  | 'dart'
  | 'jobkorea'
  | 'jasoseol'
  | 'jobplanet'
  | 'namu-wiki'
  | 'saramin';

export type CompanyRefreshMissingProgress =
  | {
      type: 'start';
      companyId: string;
      companyName: string;
      completed: number;
      total: number;
      message: string;
    }
  | {
      type: 'source';
      source: InfoSourceKey;
      label: string;
      status: 'running' | 'success' | 'empty' | 'error' | 'skipped';
      completed: number;
      total: number;
      message: string;
    }
  | {
      type: 'merge' | 'saving';
      completed: number;
      total: number;
      message: string;
    }
  | {
      type: 'done';
      completed: number;
      total: number;
      message: string;
      result: CompanyListItem;
    }
  | {
      type: 'error';
      completed: number;
      total: number;
      message: string;
    };

export type CompanyRefreshMissingProgressHandler = (
  event: CompanyRefreshMissingProgress,
) => void;
