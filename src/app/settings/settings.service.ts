import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../../entities/app-setting.entity';
import { MessagesService } from '../messages/messages.service';
import {
  CHAT_AUTO_DELETE_MINUTES,
  ChatAutoDeleteMinutes,
} from './dto/update-chat-auto-delete.dto';

export const KEY_CHAT_AUTO_DELETE_MINUTES = 'chat_auto_delete_minutes';
const KEY_CHAT_AUTO_DELETE_HOURS_LEGACY = 'chat_auto_delete_hours'; // 이전 호환

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(AppSetting)
    private readonly appSettingRepository: Repository<AppSetting>,
    private readonly messagesService: MessagesService,
  ) {}

  async getChatAutoDeleteMinutes(): Promise<number> {
    const row = await this.appSettingRepository.findOne({
      where: { key: KEY_CHAT_AUTO_DELETE_MINUTES },
    });
    if (row) {
      const value = parseInt(row.value, 10);
      return CHAT_AUTO_DELETE_MINUTES.includes(value as ChatAutoDeleteMinutes)
        ? value
        : 0;
    }
    // 이전 키(시간 단위) 호환
    const legacy = await this.appSettingRepository.findOne({
      where: { key: KEY_CHAT_AUTO_DELETE_HOURS_LEGACY },
    });
    if (legacy) {
      const hours = parseInt(legacy.value, 10);
      return hours > 0 ? hours * 60 : 0;
    }
    return 0;
  }

  async setChatAutoDeleteMinutes(minutes: number): Promise<number> {
    if (!CHAT_AUTO_DELETE_MINUTES.includes(minutes as ChatAutoDeleteMinutes)) {
      throw new Error(
        'Invalid minutes. Must be 0, 1, 10, 60, 180, 360, 720, or 1440.',
      );
    }
    await this.appSettingRepository.upsert(
      { key: KEY_CHAT_AUTO_DELETE_MINUTES, value: String(minutes) },
      ['key'],
    );
    return minutes;
  }

  /** 매분 실행: 설정된 주기(분)에 따라 모든 채팅방에서 오래된 메시지 삭제 */
  @Cron('* * * * *')
  async runChatAutoDelete(): Promise<void> {
    const minutes = await this.getChatAutoDeleteMinutes();
    if (minutes <= 0) return;
    this.logger.log(`채팅 자동 삭제 실행: ${minutes}분 이전 메시지 삭제`);
    const deleted = await this.messagesService.deleteAllMessages();
    if (deleted > 0) {
      this.logger.log(`채팅 자동 삭제 완료: ${deleted}건 삭제`);
    }
  }

  /** 매일 오후 6시 실행: 모든 이전 채팅 기록 삭제 */
  @Cron('0 18 * * *')
  async runDailyChatDelete(): Promise<void> {
    this.logger.log(
      '오후 6시 일일 채팅 삭제 작업 시작: 모든 이전 채팅 기록 삭제',
    );

    try {
      // 현재 시간 이전의 모든 메시지 삭제 (매우 큰 값으로 설정하여 모든 메시지 삭제)
      // 또는 특정 날짜 이전의 메시지만 삭제하려면 날짜를 지정할 수 있습니다
      const deleted = await this.messagesService.deleteAllMessages();

      if (deleted > 0) {
        this.logger.log(`오후 6시 일일 채팅 삭제 완료: ${deleted}건 삭제`);
      } else {
        this.logger.log('오후 6시 일일 채팅 삭제: 삭제할 메시지가 없습니다');
      }
    } catch (error) {
      this.logger.error('오후 6시 일일 채팅 삭제 중 오류 발생:', error);
    }
  }
}
