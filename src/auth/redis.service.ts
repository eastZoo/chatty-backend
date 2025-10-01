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
    ttl: number = 30 * 60, // 30분
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

    if (token) {
      this.logger.log(
        `✅ RedisService: Refresh Token 조회 성공 - User ID: ${userId}`,
      );
    } else {
      this.logger.warn(
        `❌ RedisService: Refresh Token 조회 실패 - User ID: ${userId}`,
      );
    }

    return token;
  }

  /**
   * Refresh Token의 TTL을 갱신 (30분 연장)
   * @param userId 사용자 ID
   * @param ttl TTL (초) - 기본값: 30분 (1800초)
   */
  async refreshTokenTTL(userId: string, ttl: number = 30 * 60): Promise<void> {
    const key = `refresh_token:${userId}`;
    const exists = await this.redis.exists(key);

    if (exists) {
      await this.redis.expire(key, ttl);
      this.logger.log(
        `🔄 RedisService: Refresh Token TTL 갱신 완료 - User ID: ${userId}, TTL: ${ttl}초 (${Math.floor(ttl / 60)}분)`,
      );
    } else {
      this.logger.warn(
        `⚠️ RedisService: Refresh Token이 존재하지 않음 - User ID: ${userId}`,
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
   * 모든 Refresh Token 삭제 (강제 로그아웃)
   * @returns 삭제된 토큰 개수
   */
  async deleteAllRefreshTokens(): Promise<number> {
    const keys = await this.redis.keys('refresh_token:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.log(`모든 Refresh Token 삭제 완료 - ${keys.length}개`);
    }
    return keys.length;
  }

  /**
   * Redis 토큰 정보 조회
   * @returns Redis 토큰 정보
   */
  async getRedisInfo(): Promise<any> {
    const keys = await this.redis.keys('refresh_token:*');
    const tokenInfo = [];

    for (const key of keys) {
      const userId = key.replace('refresh_token:', '');
      const ttl = await this.redis.ttl(key);
      const token = await this.redis.get(key);

      tokenInfo.push({
        userId,
        ttl,
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : null,
      });
    }

    return {
      totalTokens: keys.length,
      tokens: tokenInfo,
    };
  }

  /**
   * Redis 연결 종료
   */
  async disconnect(): Promise<void> {
    await this.redis.disconnect();
    this.logger.log('Redis 연결 종료');
  }
}
