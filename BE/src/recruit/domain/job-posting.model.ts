export interface JobPosting {
  id: string;
  source: string;
  sourceType: 'crawler' | 'api';
  title: string;
  company: string;
  location: string;
  description: string;
  skills: string[];
  url: string;
  postedAt: string | null;
  collectedAt: string;
}
