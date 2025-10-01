import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: 'redis.components.kr',
      port: 6379,
      password: 'rehdwn5158@', // ← 추가
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis 연결 성공');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis 연결 오류:', error);
    });
  }

  /**
   * Refresh Token을 Redis에 저장
   * @param userId 사용자 ID
   * @param refreshToken Refresh Token
   * @param ttl TTL (초) - 기본값: 30분 (1800초)
   */
  async setRefreshToken(
    userId: string,
    refreshToken: string,
    ttl: number = 1800, // 30분
  ): Promise<void> {
    const key = `refresh_token:${userId}`;
    await this.redis.setex(key, ttl, refreshToken);
    this.logger.log(
      `Refresh Token 저장 완료 - User ID: ${userId}, TTL: ${ttl}초`,
    );
  }

  /**
   * Refresh Token을 Redis에서 조회
   * @param userId 사용자 ID
   * @returns Refresh Token 또는 null
   */
  async getRefreshToken(userId: string): Promise<string | null> {
    const key = `refresh_token:${userId}`;
    const token = await this.redis.get(key);
    return token;
  }

  /**
   * Refresh Token의 TTL을 갱신 (30분 연장)
   * @param userId 사용자 ID
   * @param ttl TTL (초) - 기본값: 30분 (1800초)
   */
  async refreshTokenTTL(userId: string, ttl: number = 1800): Promise<void> {
    const key = `refresh_token:${userId}`;
    const exists = await this.redis.exists(key);

    if (exists) {
      await this.redis.expire(key, ttl);
      this.logger.log(
        `Refresh Token TTL 갱신 완료 - User ID: ${userId}, TTL: ${ttl}초`,
      );
    }
  }

  /**
   * Refresh Token을 Redis에서 삭제
   * @param userId 사용자 ID
   */
  async deleteRefreshToken(userId: string): Promise<void> {
    const key = `refresh_token:${userId}`;
    await this.redis.del(key);
    this.logger.log(`Refresh Token 삭제 완료 - User ID: ${userId}`);
  }

  /**
   * Refresh Token의 남은 TTL 조회
   * @param userId 사용자 ID
   * @returns 남은 TTL (초) 또는 -1 (키가 없음), -2 (키가 있지만 TTL이 없음)
   */
  async getRefreshTokenTTL(userId: string): Promise<number> {
    const key = `refresh_token:${userId}`;
    return await this.redis.ttl(key);
  }

  /**
   * Redis 연결 종료
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
    this.logger.log('Redis 연결 종료');
  }
}
