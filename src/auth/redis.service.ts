import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisRefreshTokenTTL } from 'src/util/getTokenMaxAge';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;
  private isConnected = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: configService.get<string>('REDIS_HOST'),
      port: configService.get<number>('REDIS_PORT'),
      password: configService.get<string>('REDIS_PASSWORD'),
      enableReadyCheck: true, // Redis ready 상태 확인 활성화
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        // 재연결 전략: 지수 백오프 (최대 1초)
        const delay = Math.min(times * 50, 1000);
        return delay;
      },
      reconnectOnError: (err) => {
        // 특정 에러 시에만 재연결
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      keepAlive: 60000, // 60초마다 keep-alive 패킷 전송
    });

    // 초기 연결 성공 시에만 로그 출력
    this.redis.on('ready', () => {
      if (!this.isConnected) {
        this.logger.log('Redis 연결 성공');
      }
      this.isConnected = true;
      this.startHealthCheck();
    });

    this.redis.on('connect', () => {
      // connect 이벤트는 재연결 시에도 발생하므로 로그 제거
      // ready 이벤트로 대체됨
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis 연결이 끊어졌습니다. 재연결 시도 중...');
      this.isConnected = false;
      this.stopHealthCheck();
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis 연결 오류:', error);
      this.isConnected = false;
      this.stopHealthCheck();
    });

    this.redis.on('reconnecting', () => {
      this.logger.debug('Redis 재연결 시도 중...');
    });
  }

  /**
   * Refresh Token을 Redis에 저장
   * @param userId 사용자 ID
   * @param refreshToken Refresh Token
   * @param ttl TTL (초) - 기본값: 7일
   */
  async setRefreshToken(
    userId: string,
    refreshToken: string,
    ttl: number = RedisRefreshTokenTTL,
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
   * Refresh Token의 TTL을 갱신 (7일 연장)
   * @param userId 사용자 ID
   * @param ttl TTL (초) - 기본값: 7일
   */
  async refreshTokenTTL(
    userId: string,
    ttl: number = RedisRefreshTokenTTL,
  ): Promise<void> {
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
    this.stopHealthCheck();
    await this.redis.quit();
    this.logger.log('Redis 연결 종료');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.redis.ping();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        this.logger.warn(`Redis health check PING 실패: ${message}`);
      }
    }, 30000);

    if (typeof this.healthCheckInterval.unref === 'function') {
      this.healthCheckInterval.unref();
    }
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }
}
