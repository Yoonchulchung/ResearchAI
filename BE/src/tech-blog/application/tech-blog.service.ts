import { Injectable, Logger } from '@nestjs/common';
import { load } from 'cheerio';

export interface TechBlogSource {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  category?: string;
  description?: string[];
}

export interface TechBlogPost {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  thumbnail?: string;
  tags: string[];
}

export interface TechBlogListResult {
  sources: TechBlogSource[];
  posts: TechBlogPost[];
  errors: { sourceId: string; message: string }[];
  fetchedAt: string;
}

const SOURCES: TechBlogSource[] = [
  { id: 'naver-d2', name: 'NAVER D2', url: 'https://d2.naver.com/home', feedUrl: 'https://d2.naver.com/d2.atom', category: '포털/글로벌' },
  { id: 'kakao-tech', name: 'Kakao Tech', url: 'https://tech.kakao.com/blog?page=1', feedUrl: 'https://tech.kakao.com/feed/', category: '포털/글로벌' },
  { id: 'naver-place', name: 'NAVER Place Dev', url: 'https://medium.com/naver-place-dev', feedUrl: 'https://medium.com/feed/naver-place-dev', category: '포털/글로벌' },
  { id: 'google-developers', name: 'Google Developers Blog', url: 'https://developers.googleblog.com/', feedUrl: 'https://developers.googleblog.com/feeds/posts/default?alt=rss', category: '포털/글로벌' },
  { id: 'zum', name: 'ZUM 기술 블로그', url: 'https://zuminternet.github.io/', feedUrl: 'https://zuminternet.github.io/feed.xml', category: '포털/글로벌' },
  { id: 'danawa', name: 'Danawa Lab', url: 'https://danawalab.github.io/', feedUrl: 'https://danawalab.github.io/feed.xml', category: '포털/글로벌' },
  { id: 'line', name: 'LINE Engineering', url: 'https://engineering.linecorp.com/ko', feedUrl: 'https://engineering.linecorp.com/ko/feed/', category: '포털/글로벌' },
  { id: 'meta', name: 'Meta Engineering', url: 'https://engineering.fb.com/', feedUrl: 'https://engineering.fb.com/feed/', category: '포털/글로벌' },
  { id: 'x-engineering', name: 'X Engineering', url: 'https://blog.x.com/engineering/en_us', category: '포털/글로벌' },
  { id: 'toss', name: 'Toss Tech', url: 'https://toss.tech/', feedUrl: 'https://toss.tech/rss.xml', category: '핀테크' },
  { id: 'slack', name: 'Slack Engineering', url: 'https://slack.engineering/', feedUrl: 'https://slack.engineering/feed/', category: '협업/글로벌' },
  { id: 'kakaopay', name: 'KakaoPay Tech', url: 'https://tech.kakaopay.com/', category: '핀테크' },
  { id: 'banksalad', name: 'Banksalad Tech', url: 'https://blog.banksalad.com/', feedUrl: 'https://blog.banksalad.com/rss.xml', category: '핀테크' },
  { id: 'paypal', name: 'PayPal Tech', url: 'https://medium.com/paypal-tech', feedUrl: 'https://medium.com/feed/paypal-tech', category: '핀테크' },
  { id: 'wanted', name: '원티드 기술 블로그', url: 'https://medium.com/wantedjobs', feedUrl: 'https://medium.com/feed/wantedjobs', category: '커리어/플랫폼', description: ['마크업 작성 방식 등 기초적인 개발 공부와 관리 방법을 다룹니다.', '원티드랩 프론트엔드 팀의 Pull Request 양식도 공유합니다.'] },
  { id: 'saramin', name: '사람인 기술 블로그', url: 'https://saramin.github.io/', feedUrl: 'https://saramin.github.io/feed.xml', category: '커리어/플랫폼', description: ['인턴들의 정규직 전환 이야기가 다양합니다.', '사람인의 개발문화에 대한 정보는 적은 편입니다.'] },
  { id: 'kmong', name: '크몽 기술 블로그', url: 'https://blog.kmong.com/category/tech', feedUrl: 'https://blog.kmong.com/feed', category: '커리어/플랫폼', description: ['개발자를 위한 SEO 검색엔진 최적화 가이드를 제공합니다.', 'A/B 테스트, 지라 사용법 등 개발 초심자에게 필요한 내용이 많습니다.'] },
  { id: 'linkedin', name: 'LinkedIn Engineering', url: 'https://www.linkedin.com/blog/engineering', category: '커리어/플랫폼', description: ['고객 경험을 향상하기 위한 프로젝트와 관련 기술을 볼 수 있습니다.', 'LinkedIn만의 AI 사용법과 윤리 원칙이 담겨 있습니다.'] },
  { id: 'woowa', name: '우아한형제들 기술 블로그', url: 'https://techblog.woowahan.com/', feedUrl: 'https://techblog.woowahan.com/feed/', category: '모빌리티/로컬', description: ['우아한테크캠프 및 코스에 대한 포스팅이 많습니다.', '태그별로 분류되어 원하는 글을 찾기 쉽습니다.'] },
  { id: 'socar', name: '쏘카 기술 블로그', url: 'https://tech.socarcorp.kr/', feedUrl: 'https://tech.socarcorp.kr/feed.xml', category: '모빌리티/로컬', description: ['쏘카만의 기술 블로그 운영 팁이 담겨 있습니다.', '모빌리티에 관심이 많은 개발자에게 추천합니다.'] },
  { id: 'yogiyo', name: '요기요 기술 블로그', url: 'https://techblog.yogiyo.co.kr/', feedUrl: 'https://techblog.yogiyo.co.kr/feed', category: '모빌리티/로컬', description: ['요기요만의 코드 리뷰 방법과 팁을 알 수 있습니다.', '개발자들의 커리어 패스와 성장 이야기가 다양합니다.'] },
  { id: 'hyundai', name: '현대자동차 기술 블로그', url: 'https://developers.hyundaimotorgroup.com/blog/', category: '모빌리티/로컬', description: ['자율주행에 관심이 많은 프론트엔드 개발자에게 추천합니다.', '현대자동차 개발자가 활용하는 기술과 업데이트 방식을 알 수 있습니다.'] },
  { id: 'grab', name: 'Grab Engineering', url: 'https://engineering.grab.com/', feedUrl: 'https://engineering.grab.com/feed.xml', category: '모빌리티/로컬', description: ['차량 공유 서비스를 제공하는 Grab의 기술 블로그입니다.', '머신러닝 중심의 개인정보 보호조치 방식을 알 수 있습니다.'] },
  { id: 'coupang', name: 'Coupang Engineering', url: 'https://medium.com/coupang-engineering', feedUrl: 'https://medium.com/feed/coupang-engineering', category: '이커머스', description: ['AI, Data, Infrastructure, Mobile 등으로 카테고리가 분류되어 있습니다.', '영어 콘텐츠가 많아 Korean 카테고리 활용을 추천합니다.'] },
  { id: 'gmarket', name: 'G마켓 기술 블로그', url: 'https://dev.gmarket.com/', category: '이커머스', description: ['JavaScript Map 자료구조 팁 등 프론트엔드 웹 코딩 내용을 다룹니다.', '웹보다 앱 개발 콘텐츠 비율이 높은 편입니다.'] },
  { id: 'kurly', name: '마켓컬리 기술 블로그', url: 'https://helloworld.kurly.com/', category: '이커머스', description: ['성장하는 컬리의 문제 해결 과정을 전체적으로 볼 수 있습니다.', '컬리 기업문화를 자세히 알 수 있습니다.'] },
  { id: 'lotteon', name: '롯데ON 기술 블로그', url: 'https://techblog.lotteon.com/', feedUrl: 'https://techblog.lotteon.com/feed', category: '이커머스', description: ['롯데ON 개발자들의 네트워킹과 회고 시간을 엿볼 수 있습니다.', '온오프라인 통합 커머스에 관심이 있다면 추천합니다.'] },
  { id: 'daangn', name: '당근마켓 기술 블로그', url: 'https://medium.com/daangn', feedUrl: 'https://medium.com/feed/daangn', category: '이커머스', description: ['머신러닝, 엔지니어링, 데이터, 검색으로 카테고리가 구분되어 있습니다.', 'TypeScript와 NestJS 관련 포스팅이 있습니다.'] },
  { id: 'joongna', name: '중고나라 기술 블로그', url: 'https://team.joongna.com/blog', category: '이커머스', description: ['웹, 앱 등 중고나라 개발자가 활용하는 기술 스택을 구체적으로 알 수 있습니다.', '서비스 기능 구현 방식과 사용 기술에 대한 글은 부족한 편입니다.'] },
  { id: 'amazon-science', name: 'Amazon Science', url: 'https://www.amazon.science/blog', feedUrl: 'https://www.amazon.science/index.rss', category: '이커머스', description: ['자율주행 자동차, 과학기술, 스마트홈, 기술 관련 글이 있습니다.', '알렉사의 의사소통 방식 등 인기 콘텐츠를 볼 수 있습니다.'] },
  { id: 'ebay', name: 'eBay Tech Blog', url: 'https://tech.ebayinc.com/', category: '이커머스', description: ['이커머스에 관심이 많은 프론트엔드 개발자에게 추천합니다.', '이베이 개발자들의 스펙과 직무 경험을 볼 수 있습니다.'] },
  { id: 'zigbang', name: '직방 기술 블로그', url: 'https://medium.com/zigbang', feedUrl: 'https://medium.com/feed/zigbang', category: '숙박/공간', description: ['프론트엔드와 백엔드 카테고리로 분류되어 있습니다.', '직방 앱과 웹에서 어떤 기술이 사용되는지 볼 수 있습니다.'] },
  { id: 'yanolja', name: '야놀자 기술 블로그', url: 'https://yanolja.github.io/', category: '숙박/공간', description: ['야놀자 개발팀 밋업 자료를 공개합니다.', 'CX 서비스실 이야기가 주된 내용입니다.'] },
  { id: 'gccompany', name: '여기어때 기술 블로그', url: 'https://techblog.gccompany.co.kr/', feedUrl: 'https://techblog.gccompany.co.kr/feed', category: '숙박/공간', description: ['쿠폰, 팝업 배너 같은 단기 이벤트 기능 구현이 궁금하다면 추천합니다.', '프론트엔드 개발팀 리더가 기업 문화를 소개합니다.'] },
  { id: 'dailyhotel', name: '데일리호텔 기술 블로그', url: 'https://dailyhotel.io/techblog', feedUrl: 'https://dailyhotel.io/feed.xml', category: '숙박/공간', description: ['UI/UX 변화 과정을 통해 접근성과 편리성을 참고할 수 있습니다.', '사용자 리뷰와 만족도 기능 구현에 관심 있다면 추천합니다.'] },
  { id: 'airbnb', name: 'Airbnb Engineering', url: 'https://medium.com/airbnb-engineering', feedUrl: 'https://medium.com/feed/airbnb-engineering', category: '숙박/공간', description: ['전 세계 숙소 데이터 관리 방법을 다룹니다.', '업계 최고 수준의 데이터 인프라 구축 방법을 알 수 있습니다.'] },
  { id: 'netmarble', name: '넷마블 기술 블로그', url: 'https://netmarble.engineering/', feedUrl: 'https://netmarble.engineering/feed/', category: '게임', description: ['어려운 기술도 쉽게 풀어서 설명합니다.', '넷마블의 ChatGPT 활용법도 참고할 수 있습니다.'] },
  { id: 'nexon', name: '넥슨 기술 블로그', url: 'https://www.nexon.com/tech', category: '게임', description: ['글 정리가 깔끔한 편입니다.', '프론트엔드 웹 개발팀의 정착기에서 개발문화를 엿볼 수 있습니다.'] },
  { id: 'devsisters', name: '데브시스터즈 기술 블로그', url: 'https://tech.devsisters.com/', feedUrl: 'https://tech.devsisters.com/rss.xml', category: '게임', description: ['쿠키런 개발사 데브시스터즈의 기술 블로그입니다.', '게임 개발에 관심이 많은 프론트엔드 개발자 취준생에게 추천합니다.'] },
  { id: 'google-play', name: 'Google Play 개발자 블로그', url: 'https://android-developers.googleblog.com/search/label/Google%20Play', feedUrl: 'https://android-developers.googleblog.com/feeds/posts/default/-/Google%20Play?alt=rss', category: '게임', description: ['모바일 게임에 관심이 많은 프론트엔드 개발자에게 추천합니다.', '아시아 사용자 환경에 대한 이야기도 많습니다.'] },
  { id: 'oliveyoung', name: '올리브영 기술 블로그', url: 'https://oliveyoung.tech/', category: '뷰티/패션', description: ['모바일 페이지 성능 개선기는 프로젝트 회고 작성 때 참고하기 좋습니다.', '올리브영 개발자만의 서비스 리뷰 방식을 볼 수 있습니다.'] },
  { id: 'hwahae', name: '화해 기술 블로그', url: 'https://blog.hwahae.co.kr/category/tech/', category: '뷰티/패션', description: ['개발직군뿐 아니라 코드 리뷰, 플랫폼 등 다양한 카테고리가 있습니다.', '기술 리뷰가 자주 업로드되는 편입니다.'] },
  { id: 'musinsa', name: '무신사 기술 블로그', url: 'https://medium.com/musinsa-tech', feedUrl: 'https://medium.com/feed/musinsa-tech', category: '뷰티/패션', description: ['검색 알고리즘에 관심이 많다면 추천합니다.', '비전공자를 위한 개발자 취업 팁도 확인할 수 있습니다.'] },
  { id: 'brandi', name: '브랜디 기술 블로그', url: 'https://labs.brandi.co.kr/', category: '뷰티/패션', description: ['iOS, Android 앱 개발 비중이 큽니다.', '프로젝트 관리에 어려움을 느끼고 있다면 추천합니다.'] },
  { id: '29cm', name: '29CM 기술 블로그', url: 'https://medium.com/29cm', feedUrl: 'https://medium.com/feed/29cm', category: '뷰티/패션', description: ['패션 이커머스 라이브 방송 등 주요 기능 구현 방식을 알 수 있습니다.', '개발자들의 의사소통과 협업 방식을 배울 수 있습니다.'] },
  { id: 'kakaostyle', name: '카카오스타일 기술 블로그', url: 'https://devblog.kakaostyle.com/', category: '뷰티/패션', description: ['지그재그를 운영 중인 카카오스타일의 기술 블로그입니다.', '실제 활용하는 기술 스택과 방식이 구체적으로 적혀 있습니다.'] },
  { id: 'watcha', name: '왓챠 기술 블로그', url: 'https://medium.com/watcha', feedUrl: 'https://medium.com/feed/watcha', category: '미디어', description: ['모바일 앱보다 웹 관련 포스팅이 많습니다.', '맞춤 추천 기능의 강화학습 모델을 구체적으로 볼 수 있습니다.'] },
  { id: 'tving', name: '티빙 기술 블로그', url: 'https://medium.com/tving-team', feedUrl: 'https://medium.com/feed/tving-team', category: '미디어', description: ['티빙 개발자 인터뷰가 다양해 자기소개서 작성에 참고하기 좋습니다.', '개발과 기술 공유보다는 기업문화가 주된 콘텐츠입니다.'] },
  { id: 'ridi', name: '리디 기술 블로그', url: 'https://ridicorp.com/story-category/tech-blog/', feedUrl: 'https://ridicorp.com/feed/', category: '미디어', description: ['리디북스 웹과 앱 프로세스의 차이를 알 수 있습니다.', '리디 직원들의 이야기가 주된 내용입니다.'] },
  { id: 'netflix', name: 'Netflix Tech Blog', url: 'https://netflixtechblog.com/', feedUrl: 'https://netflixtechblog.com/feed', category: '미디어', description: ['넷플릭스의 설계 방법과 의사소통 방식 등 조직문화를 알 수 있습니다.', '머신러닝과 A/B 테스트 콘텐츠를 추천합니다.'] },
  { id: 'spotify', name: 'Spotify Engineering', url: 'https://engineering.atspotify.com/', feedUrl: 'https://engineering.atspotify.com/feed', category: '미디어', description: ['메인 화면에 대한 다양한 실험 케이스를 볼 수 있습니다.', '음악 재생목록 알고리즘 관련 콘텐츠도 있습니다.'] },
  { id: 'pinterest', name: 'Pinterest Engineering', url: 'https://medium.com/pinterest-engineering', feedUrl: 'https://medium.com/feed/pinterest-engineering', category: '미디어', description: ['실시간 사용자를 위한 시퀀스 기능 및 데이터 활용법을 알 수 있습니다.', '디버깅 과정과 사용 기술이 구체적으로 나와 있습니다.'] },
  { id: 'devocean', name: 'SK DEVOCEAN', url: 'https://devocean.sk.com/blog/techBoardList.do', category: '데이터/통신', description: ['SKT를 중심으로 다양한 SK 산업별 개발 이야기를 볼 수 있습니다.', '프레임워크, OS 등 기술 스택별 카테고리가 체계화되어 있습니다.'] },
  { id: 'kakaoenterprise', name: '카카오엔터프라이즈 기술 블로그', url: 'https://tech.kakaoenterprise.com/', feedUrl: 'https://tech.kakaoenterprise.com/feed', category: '데이터/통신', description: ['인공지능 분야를 지망하는 개발자 취준생에게 추천합니다.', 'IT 트렌드 소식도 정기적으로 업로드됩니다.'] },
  { id: 'modusign', name: '모두싸인 기술 블로그', url: 'https://team.modusign.co.kr/blog', category: '데이터/통신', description: ['전자계약 서비스를 운영 중인 스타트업의 기술 블로그입니다.', '프론트엔드 팀의 테스트 코드 작성 성장기를 볼 수 있습니다.'] },
  { id: 'nhncloud', name: 'NHN Cloud Meetup', url: 'https://meetup.nhncloud.com/', feedUrl: 'https://meetup.nhncloud.com/rss', category: '데이터/통신', description: ['문제 해결 과정을 재미있게 이야기합니다.', '카테고리가 없어 직접 검색해서 찾아야 하는 단점이 있습니다.'] },
  { id: 'microsoft', name: 'Microsoft DevBlogs', url: 'https://devblogs.microsoft.com/', feedUrl: 'https://devblogs.microsoft.com/feed/', category: '데이터/통신', description: ['Microsoft 개발자들과 토론할 수 있는 라운지가 있습니다.', 'AI, Office, Data 등 팀별 기술 블로그가 마련되어 있습니다.'] },
  { id: 'zoom', name: 'Zoom Blog', url: 'https://www.zoom.com/en/blog/', category: '데이터/통신', description: ['Zoom 개발자들의 스펙과 사용 기술을 확인할 수 있습니다.', '개발자 컨퍼런스 소식도 같이 받아볼 수 있습니다.'] },
  { id: 'apple', name: 'Apple Developer News', url: 'https://developer.apple.com/news/', feedUrl: 'https://developer.apple.com/news/rss/news.rss', category: '데이터/통신', description: ['한국어 보기 기능과 애플 신제품 뉴스를 확인할 수 있습니다.', '제품별 사용 기술과 앱 테스트 정보를 볼 수 있습니다.'] },
  { id: 'dropbox', name: 'Dropbox Tech', url: 'https://dropbox.tech/', feedUrl: 'https://dropbox.tech/feed', category: '데이터/통신', description: ['프론트엔드 카테고리가 따로 있습니다.', 'Dropbox에서 사용하는 프레임워크 업데이트 과정을 볼 수 있습니다.'] },
  { id: 'github', name: 'GitHub Engineering', url: 'https://github.blog/engineering/', feedUrl: 'https://github.blog/engineering.atom', category: '데이터/통신', description: ['GitHub가 미숙한 개발 초심자에게 추천합니다.', 'GitHub Copilot 등 새로운 기능 사용 방법을 알려줍니다.'] },
];

const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const SOURCE_CONCURRENCY = 8;

@Injectable()
export class TechBlogService {
  private readonly logger = new Logger(TechBlogService.name);
  private cache: TechBlogListResult | null = null;
  private cacheExpiresAt = 0;

  getSources(): TechBlogSource[] {
    return SOURCES;
  }

  async getPosts(options: { source?: string; limit?: number; refresh?: boolean } = {}): Promise<TechBlogListResult> {
    const now = Date.now();
    if (!options.refresh && this.cache && this.cacheExpiresAt > now) {
      return this.filterResult(this.cache, options.source, options.limit);
    }

    const settled = await this.mapWithConcurrency(SOURCES, SOURCE_CONCURRENCY, (source) => this.fetchSource(source));
    const posts: TechBlogPost[] = [];
    const errors: TechBlogListResult['errors'] = [];

    settled.forEach((result, index) => {
      const source = SOURCES[index];
      if (result.status === 'fulfilled') {
        posts.push(...result.value);
        return;
      }
      const message = result.reason instanceof Error ? result.reason.message : '크롤링에 실패했습니다.';
      errors.push({ sourceId: source.id, message });
      this.logger.warn(`${source.name} crawl failed: ${message}`);
    });

    const result: TechBlogListResult = {
      sources: SOURCES,
      posts: this.dedupe(posts).sort((a, b) => this.dateValue(b.publishedAt) - this.dateValue(a.publishedAt)),
      errors,
      fetchedAt: new Date().toISOString(),
    };

    this.cache = result;
    this.cacheExpiresAt = now + CACHE_TTL_MS;
    return this.filterResult(result, options.source, options.limit);
  }

  private async fetchSource(source: TechBlogSource): Promise<TechBlogPost[]> {
    const url = source.feedUrl ?? source.url;
    const html = await this.fetchText(url);
    const contentType = html.trimStart();

    if (source.feedUrl || contentType.startsWith('<?xml') || contentType.startsWith('<rss') || contentType.startsWith('<feed')) {
      const parsed = this.parseFeed(html, source);
      if (parsed.length > 0) return parsed;
    }

    return this.parseHtml(html, source);
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        try {
          results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'ResearchAI-TechBlogCrawler/1.0 (+https://github.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseFeed(xml: string, source: TechBlogSource): TechBlogPost[] {
    const $ = load(xml, { xmlMode: true });
    const posts: TechBlogPost[] = [];

    $('item').each((_, el) => {
      const item = $(el);
      const title = this.cleanText(item.children('title').first().text());
      const url = this.absoluteUrl(this.cleanText(item.children('link').first().text()) || item.children('guid').first().text(), source.url);
      if (!title || !url) return;

      const summary = this.summaryFromHtml(
        item.children('description').first().text() ||
        item.children('content\\:encoded').first().text(),
      );
      const publishedAt = this.toIsoDate(item.children('pubDate').first().text() || item.children('dc\\:date').first().text());
      const thumbnail =
        item.children('media\\:content').first().attr('url') ||
        item.children('media\\:thumbnail').first().attr('url') ||
        this.extractImage(item.children('description').first().text());
      const tags = item.children('category').map((_, cat) => this.cleanText($(cat).text())).get().filter(Boolean);

      posts.push(this.post(source, title, url, { summary, publishedAt, thumbnail, tags }));
    });

    $('entry').each((_, el) => {
      const entry = $(el);
      const title = this.cleanText(entry.children('title').first().text());
      const linkEl = entry.children('link[rel="alternate"]').first().length
        ? entry.children('link[rel="alternate"]').first()
        : entry.children('link').first();
      const url = this.absoluteUrl(linkEl.attr('href') || this.cleanText(linkEl.text()), source.url);
      if (!title || !url) return;

      const summary = this.summaryFromHtml(
        entry.children('summary').first().text() ||
        entry.children('content').first().text(),
      );
      const publishedAt = this.toIsoDate(entry.children('published').first().text() || entry.children('updated').first().text());
      const thumbnail = entry.children('media\\:thumbnail').first().attr('url') || this.extractImage(entry.children('content').first().text());
      const tags = entry.children('category').map((_, cat) => this.cleanText($(cat).attr('term') || $(cat).text())).get().filter(Boolean);

      posts.push(this.post(source, title, url, { summary, publishedAt, thumbnail, tags }));
    });

    return posts.slice(0, 20);
  }

  private parseHtml(html: string, source: TechBlogSource): TechBlogPost[] {
    const $ = load(html);
    $('script, style, noscript, nav, header, footer, aside').remove();
    const posts: TechBlogPost[] = [];

    const blocks = $('article, li, .post, .entry, [class*="post"], [class*="article"], [class*="card"]').toArray();
    const candidates = blocks.length > 0 ? blocks : $('a[href]').toArray();

    for (const el of candidates) {
      const block = $(el);
      const anchor = block.is('a') ? block : block.find('a[href]').first();
      const rawUrl = anchor.attr('href');
      const url = rawUrl ? this.absoluteUrl(rawUrl, source.url) : '';
      if (!url || this.isNoiseUrl(url, source.url)) continue;

      const title = this.cleanText(
        anchor.find('h1, h2, h3, h4').first().text() ||
        block.find('h1, h2, h3, h4').first().text() ||
        anchor.text(),
      );
      if (!title || title.length < 6 || title.length > 180) continue;

      const summary = this.cleanText(block.find('p').first().text());
      const publishedAt = this.toIsoDate(block.find('time').first().attr('datetime') || block.find('time').first().text());
      const thumbnail = this.absoluteUrl(block.find('img').first().attr('src') || block.find('img').first().attr('data-src') || '', source.url);

      posts.push(this.post(source, title, url, { summary, publishedAt, thumbnail }));
      if (posts.length >= 20) break;
    }

    return this.dedupe(posts);
  }

  private post(
    source: TechBlogSource,
    title: string,
    url: string,
    extra: Partial<Omit<TechBlogPost, 'id' | 'sourceId' | 'sourceName' | 'title' | 'url'>> = {},
  ): TechBlogPost {
    return {
      id: `${source.id}:${Buffer.from(url).toString('base64url')}`,
      sourceId: source.id,
      sourceName: source.name,
      title: this.cleanText(title),
      url,
      summary: extra.summary ? this.cleanText(extra.summary).slice(0, 240) : undefined,
      publishedAt: extra.publishedAt,
      thumbnail: extra.thumbnail,
      tags: extra.tags ?? [],
    };
  }

  private filterResult(result: TechBlogListResult, source?: string, limit = 120): TechBlogListResult {
    const posts = source && source !== 'all'
      ? result.posts.filter((post) => post.sourceId === source)
      : result.posts;

    return {
      ...result,
      posts: posts.slice(0, Math.min(Math.max(limit, 1), 300)),
    };
  }

  private dedupe(posts: TechBlogPost[]): TechBlogPost[] {
    const seen = new Set<string>();
    return posts.filter((post) => {
      const key = post.url.replace(/[#?].*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private summaryFromHtml(html: string): string | undefined {
    if (!html) return undefined;
    const $ = load(html);
    return this.cleanText($.text()).slice(0, 240) || undefined;
  }

  private extractImage(html: string): string | undefined {
    if (!html) return undefined;
    const $ = load(html);
    return $('img').first().attr('src') || undefined;
  }

  private absoluteUrl(url: string, base: string): string {
    const clean = this.cleanText(url);
    if (!clean || clean.startsWith('mailto:') || clean.startsWith('javascript:')) return '';
    try {
      return new URL(clean, base).toString();
    } catch {
      return '';
    }
  }

  private isNoiseUrl(url: string, base: string): boolean {
    try {
      const parsed = new URL(url);
      const baseUrl = new URL(base);
      if (parsed.hostname !== baseUrl.hostname && !baseUrl.hostname.includes('medium.com')) return true;
      return ['#', '/', baseUrl.pathname].includes(parsed.pathname) || /\.(png|jpg|jpeg|gif|svg|webp|pdf)$/i.test(parsed.pathname);
    } catch {
      return true;
    }
  }

  private cleanText(value: string): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private toIsoDate(value?: string): string | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString();
  }

  private dateValue(value?: string): number {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  }
}
