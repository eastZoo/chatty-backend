import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Users } from 'src/entities/users.entity';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { responseObj } from 'src/util/responseObj';
import { RegisterDto } from './dto/register.dto';
import { RedisService } from './redis.service';
import {
  AdminAccessTokenMaxAge,
  AdminRefreshTokenMaxAge,
  RedisRefreshTokenTTL,
} from 'src/util/getTokenMaxAge';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 사용자 로그인
   * @param {string} username 아이디
   * @param {string} password 비밀번호
   * @returns {{ accessToken: string; refreshToken: string }} 유저정보
   */
  async userSiginIn(username: string, password: string, res: Response) {
    const user = await this.validateAdminUser({ username, password });

    if (!user) {
      return res.send({
        success: false,
        message:
          '아이디 또는 비밀번호를 잘못 입력했습니다. 입력하신 내용을 다시 확인해주세요.',
      });
    }

    const payload = {
      id: user.id,
      username: user.username,
    };

    // Access Token 생성 (15분)
    const accessToken = this.createUserAccessToken(payload);
    // Refresh Token 생성 (7일)
    const refreshToken = this.createUserRefreshToken(payload);

    // Redis에 Refresh Token 저장 (30분 TTL)
    await this.redisService.setRefreshToken(
      user.id,
      refreshToken,
      RedisRefreshTokenTTL,
    ); // 30분

    delete user.password;
    const result = { accessToken, refreshToken, user };

    return res

      .cookie('chatty_refreshToken', result.refreshToken, {
        httpOnly: true,
        maxAge: AdminRefreshTokenMaxAge, // 7일 (절대 기간)
      })
      .send({
        success: true,
        data: {
          ...result.user,
          accessToken: result.accessToken,
        },
      });
  }

  /**
   *  회원가입
   * @param {SiginUpDto} siginUpDto 아이디
   * @returns {{ success:boolean; accessToken: string; refreshToken: string }} 유저정보
   */
  async userRegister(siginUpDto: RegisterDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      /**  유저 정보 저장 */
      await this.userInsertUser(siginUpDto, queryRunner.manager);
      await queryRunner.commitTransaction();
      return responseObj.success(null, '회원가입 성공');
    } catch (e: any) {
      await queryRunner.rollbackTransaction();
      return responseObj.fail(e.message);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 관리자 유저 검증
   */
  public async validateAdminUser({
    username,
    password,
  }: {
    username: string;
    password: string;
  }) {
    try {
      const user = await this.usersRepository.findOne({
        where: { username: username },
      });

      if (!user) {
        return null;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return null;
      }

      return user;
    } catch (e) {
      throw new HttpException('서버요청 에러!', 500);
    }
  }

  /**
   * 관리자 미승인 시 최신정보 확인
   */
  async getCurrentUser(req: any) {
    try {
      const { username } = req.user;
      const user = await this.usersRepository.findOne({
        where: { username: username },
      });
      delete user.password;

      return responseObj.success(user);
    } catch (e: any) {
      throw new HttpException(
        '유저 정보 조회 중 오류가 발생했습니다. 다시 시도해주세요.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Access Token만 생성 (Refresh Token 재발급 없음)
   * @param userId 사용자 ID
   * @returns 새로운 Access Token
   */
  async generateAccessToken(userId: string): Promise<string> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    const payload = {
      id: user.id,
      username: user.username,
    };

    const token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
      expiresIn: '1m', // 1분 (테스트용)
    });

    console.log(
      `✅ AuthService: 새로운 Access Token 생성 완료 - 사용자: ${user.username}`,
    );
    return token;
  }

  /**
   * Access Token 재발급 (Refresh Token 검증 및 Redis TTL 갱신)
   * @param refreshToken Refresh Token
   * @returns 새로운 Access Token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      // Refresh Token 검증
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('ADMIN_JWT_REFRESH_SECRET'),
      });

      // Redis에서 Refresh Token 확인
      const storedToken = await this.redisService.getRefreshToken(payload.id);
      if (!storedToken || storedToken !== refreshToken) {
        throw new UnauthorizedException('유효하지 않은 Refresh Token입니다.');
      }

      // Redis TTL 갱신 (30분 연장)
      await this.redisService.refreshTokenTTL(payload.id, 30 * 60); // 30분

      // 새로운 Access Token 생성 (15분)
      const newAccessToken = this.jwtService.sign(
        {
          id: payload.id,
          username: payload.username,
        },
        {
          secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
          expiresIn: '1m', // 1분 (테스트용)
        },
      );

      return newAccessToken;
    } catch (error) {
      throw new UnauthorizedException('유효하지 않은 Refresh Token입니다.');
    }
  }

  /** 유저 정보 저장 */
  userInsertUser = async (
    siginUpDto: RegisterDto,
    queryManager: EntityManager,
  ) => {
    try {
      const existingUser = await queryManager.findOne(Users, {
        where: { username: siginUpDto.username },
      });

      if (existingUser) {
        throw new Error('이미 존재하는 사용자 이름입니다.');
      }
      const newUser = Object.assign(new Users(), {
        username: siginUpDto.username,
        password: siginUpDto.password,
      });
      return await queryManager.save(Users, newUser);
    } catch (e: any) {
      console.log('error : ', e);
      throw new Error(e.message);
    }
  };

  //  Access Token 생성 (1분 - 테스트용)
  createUserAccessToken = (payload: any) => {
    Logger.log('createUserAccessToken -> payload', payload);
    const jwtSecretKey = this.configService.get('ADMIN_JWT_SECRET');

    const token = jwt.sign(payload, jwtSecretKey, {
      expiresIn: '1m', // 1분 (테스트용)
    });

    console.log(
      `🔑 AuthService: Access Token 생성 완료 (1분 만료) - 사용자: ${payload.username}`,
    );
    return token;
  };

  //  Refresh Token 생성 (7일)
  createUserRefreshToken = (payload: any) => {
    Logger.log('createUserRefreshToken -> payload', payload);
    const REFRESH_TOKEN_EXPIRES = AdminRefreshTokenMaxAge; // 7일
    const jwtRefreshSecretKey = this.configService.get(
      'ADMIN_JWT_REFRESH_SECRET',
    );

    return jwt.sign(payload, jwtRefreshSecretKey, {
      expiresIn: REFRESH_TOKEN_EXPIRES,
    });
  };

  /**
   * 로그아웃 처리 (Redis에서 Refresh Token 삭제)
   * @param userId 사용자 ID
   */
  async logout(userId: string): Promise<void> {
    await this.redisService.deleteRefreshToken(userId);
  }

  /**
   * 모든 사용자 강제 로그아웃
   * @returns 삭제된 토큰 개수
   */
  async logoutAll(): Promise<{ count: number }> {
    const count = await this.redisService.deleteAllRefreshTokens();
    return { count };
  }

  /**
   * Redis 토큰 정보 조회
   * @returns Redis 토큰 정보
   */
  async getRedisInfo(): Promise<any> {
    return await this.redisService.getRedisInfo();
  }
}
