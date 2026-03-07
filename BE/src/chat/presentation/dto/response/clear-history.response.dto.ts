export class ClearHistoryResponseDto {
  ok: boolean;

  static success(): ClearHistoryResponseDto {
    const dto = new ClearHistoryResponseDto();
    dto.ok = true;
    return dto;
  }
}
