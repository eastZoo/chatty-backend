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
}

export function validate(config: Record<string, unknown>) {
  // 기본값 설정
  const defaultConfig = {
    NODE_ENV: 'development',
    PORT: 3001,
    ADMIN_JWT_SECRET: 'your-default-jwt-secret-key-change-in-production',
    ADMIN_JWT_REFRESH_SECRET:
      'your-default-refresh-secret-key-change-in-production',
    DB_TYPE: 'postgres',
    DB_HOST: 'postgres.components.kr',
    DB_PORT: 5432,
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'pehdwn5158@',
    DB_NAME: 'chatty',
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
  return validatedConfig;
}
