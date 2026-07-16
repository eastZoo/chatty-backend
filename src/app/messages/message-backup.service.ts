import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Message } from '../../entities/message.entity';
import { MessageReadStatus } from '../../entities/message-read-status.entity';

/**
 * 자동 삭제 대상 메시지를 실제로 지우기 전에
 * 복원용 INSERT 문(.sql) 파일로 백업하는 서비스.
 *
 * - 대상: message 테이블 + 관련 message_read_status 테이블
 * - 저장 위치: <프로젝트 루트>/backups/messages/
 * - 파일명: messages_backup_YYYYMMDD-HHmmss_<사유>.sql
 * - 각 INSERT 는 `ON CONFLICT (id) DO NOTHING` 으로 작성되어 재실행/중복 복원에 안전.
 */
@Injectable()
export class MessageBackupService {
  private readonly logger = new Logger(MessageBackupService.name);
  private readonly backupDir = path.join(process.cwd(), 'backups', 'messages');

  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(MessageReadStatus)
    private readonly readStatusRepository: Repository<MessageReadStatus>,
  ) {}

  /**
   * 주어진 메시지 ID 목록과 관련 읽음 상태를 INSERT 문 형태로 백업한다.
   * @param messageIds 백업 대상 메시지 ID
   * @param reason 백업 사유(파일명/헤더에 기록, 예: 'auto-delete-60min')
   * @returns 생성된 백업 파일의 절대 경로. 백업할 대상이 없으면 null.
   */
  async backupMessagesByIds(
    messageIds: string[],
    reason: string,
  ): Promise<string | null> {
    if (!messageIds || messageIds.length === 0) return null;

    // FK 컬럼 값을 얻기 위해 관계를 함께 로드한다.
    const messages = await this.messagesRepository.find({
      where: { id: In(messageIds) },
      relations: ['chat', 'privateChat', 'sender', 'replyTarget'],
    });

    if (messages.length === 0) return null;

    const readStatuses = await this.readStatusRepository.find({
      where: { message: { id: In(messageIds) } },
      relations: ['message', 'user'],
    });

    const now = new Date();
    const stamp = this.formatStamp(now);
    const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `messages_backup_${stamp}_${safeReason}.sql`;

    const lines: string[] = [];
    lines.push('-- ============================================================');
    lines.push(`-- 채팅 자동 삭제 백업 (복원용 INSERT)`);
    lines.push(`-- 생성 시각: ${now.toISOString()}`);
    lines.push(`-- 사유: ${reason}`);
    lines.push(`-- 메시지: ${messages.length}건, 읽음상태: ${readStatuses.length}건`);
    lines.push('-- 복원 방법: 이 파일을 대상 DB 에 그대로 실행하세요.');
    lines.push('--   예) psql -d <DB명> -f ' + fileName);
    lines.push('-- ============================================================');
    lines.push('BEGIN;');
    lines.push('');

    lines.push('-- message');
    for (const m of messages) {
      lines.push(this.buildMessageInsert(m));
    }

    if (readStatuses.length > 0) {
      lines.push('');
      lines.push('-- message_read_status');
      for (const rs of readStatuses) {
        lines.push(this.buildReadStatusInsert(rs));
      }
    }

    lines.push('');
    lines.push('COMMIT;');
    lines.push('');

    fs.mkdirSync(this.backupDir, { recursive: true });
    const filePath = path.join(this.backupDir, fileName);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

    this.logger.log(
      `채팅 백업 완료: ${messages.length}건 -> ${filePath}`,
    );
    return filePath;
  }

  /** message 한 행에 대한 INSERT 문 생성 */
  private buildMessageInsert(m: Message): string {
    // simple-array 컬럼(file_ids)은 DB 에 콤마로 join 된 문자열로 저장된다.
    const fileIds =
      m.fileIds && m.fileIds.length > 0 ? m.fileIds.join(',') : null;

    const values = [
      this.sqlString(m.id),
      this.sqlString(m.content),
      this.sqlString(fileIds),
      this.sqlString(m.chat?.id ?? null),
      this.sqlString(m.privateChat?.id ?? null),
      this.sqlString(m.sender?.id ?? null),
      this.sqlString(m.replyTarget?.id ?? null),
      this.sqlTimestamp(m.createdAt),
    ];

    return (
      'INSERT INTO message ' +
      '(id, content, file_ids, chat_id, private_chat_id, sender_id, reply_target_id, created_at) ' +
      `VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  /** message_read_status 한 행에 대한 INSERT 문 생성 */
  private buildReadStatusInsert(rs: MessageReadStatus): string {
    const values = [
      this.sqlString(rs.id),
      this.sqlString(rs.message?.id ?? null),
      this.sqlString(rs.user?.id ?? null),
      this.sqlTimestamp(rs.readAt),
    ];

    return (
      'INSERT INTO message_read_status ' +
      '(id, message_id, user_id, read_at) ' +
      `VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  /** 문자열/NULL 을 SQL 리터럴로 변환 (작은따옴표 이스케이프) */
  private sqlString(value: string | null | undefined): string {
    if (value === null || value === undefined) return 'NULL';
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /** Date 를 SQL timestamp 리터럴로 변환 */
  private sqlTimestamp(value: Date | null | undefined): string {
    if (!value) return 'NULL';
    const iso =
      value instanceof Date ? value.toISOString() : new Date(value).toISOString();
    return `'${iso}'`;
  }

  /** YYYYMMDD-HHmmss (로컬 시간) */
  private formatStamp(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
      `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
  }
}
