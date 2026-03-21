export class CreateExperienceDto {
  title: string;
  content: string;
  category?: string;
}

export class UpdateExperienceDto {
  title?: string;
  content?: string;
  category?: string;
  aiCategories?: string[] | null;
}

export class SearchExperiencesDto {
  query: string;
  topK?: number;
}
