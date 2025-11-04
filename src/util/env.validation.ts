import { plainToClass } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Production = 'production',
  Development = 'development',
  Local = 'local',
}

class EnvironmentVariables {
  @IsOptional()
  @IsEnum(Environment)
  NODE_ENV?: Environment;

  @IsOptional()
  @IsNumber()
  PORT?: number;

  @IsOptional()
  @IsString()
  ADMIN_JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  ADMIN_JWT_REFRESH_SECRET?: string;

  @IsOptional()
  @IsString()
  DB_HOST?: string;

  @IsOptional()
  @IsNumber()
  DB_PORT?: number;

  @IsOptional()
  @IsString()
  DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  DB_NAME?: string;

  @IsOptional()
  @IsString()
  DB_TYPE?: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsNumber()
  REDIS_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;
}

export function validate(config: Record<string, unknown>) {
  const nodeEnv = (config.NODE_ENV as string) || 'development';
  const isProduction = nodeEnv === 'production';

  // 개발 환경에서만 사용할 수 있는 안전한 기본값 (localhost 등)
  // 민감한 정보(비밀번호, 실제 호스트 등)는 기본값 없음
  const defaultConfig: Record<string, unknown> = {
    NODE_ENV: 'development',
    PORT: 3001,
    // 개발 환경에서만 JWT 시크릿 기본값 제공 (프로덕션에서는 필수)
    ...(isProduction
      ? {}
      : {
          ADMIN_JWT_SECRET: 'dev-jwt-secret-change-in-production',
          ADMIN_JWT_REFRESH_SECRET: 'dev-refresh-secret-change-in-production',
        }),
    // 개발 환경에서만 DB 기본값 제공 (localhost)
    ...(isProduction
      ? {}
      : {
          DB_TYPE: 'postgres',
          DB_HOST: 'localhost',
          DB_PORT: 5432,
        }),
    // 개발 환경에서만 Redis 기본값 제공
    ...(isProduction
      ? {}
      : {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
        }),
    ...config,
  };

  const validatedConfig = plainToClass(EnvironmentVariables, defaultConfig, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  // 프로덕션 환경에서 필수 환경 변수 검증
  if (isProduction) {
    const requiredFields = [
      'ADMIN_JWT_SECRET',
      'ADMIN_JWT_REFRESH_SECRET',
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_NAME',
      'REDIS_HOST',
      'REDIS_PORT',
    ];

    const missingFields = requiredFields.filter(
      (field) => !validatedConfig[field],
    );

    if (missingFields.length > 0) {
      throw new Error(
        `프로덕션 환경에서 필수 환경 변수가 누락되었습니다: ${missingFields.join(', ')}`,
      );
    }
  }

  return validatedConfig;
}
