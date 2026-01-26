import { IsIn } from 'class-validator';

/** 분 단위: 0=비활성화, 1, 10(분), 60, 180, 360, 720, 1440(1h, 3h, 6h, 12h, 24h) */
export const CHAT_AUTO_DELETE_MINUTES = [
  0, 1, 10, 60, 180, 360, 720, 1440,
] as const;
export type ChatAutoDeleteMinutes =
  (typeof CHAT_AUTO_DELETE_MINUTES)[number];

export class UpdateChatAutoDeleteDto {
  @IsIn(CHAT_AUTO_DELETE_MINUTES, {
    message:
      '삭제 주기는 0, 1, 10(분), 60, 180, 360, 720, 1440(분) 중 하나여야 합니다.',
  })
  minutes: number; // 0 = 비활성화
}
