import {
  Body,
  Post,
  Req,
  Res,
  UnauthorizedException,
  Controller,
  UseGuards,
  Get,
  Delete,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: '로그인' })
  @ApiResponse({
    status: 200,
    type: Boolean,
  })
  @Post('/sign-in')
  async userSiginIn(@Body() loginDto: LoginDto, @Res() res: Response) {
    const { username, password } = loginDto;
    return this.authService.userSiginIn(username, password, res);
  }

  @ApiOperation({ summary: '회원가입' })
  @ApiResponse({
    status: 200,
    description: '회원가입',
    type: Boolean,
  })
  @Post('/register')
  userRegister(@Body() siginUpDto: RegisterDto) {
    return this.authService.userRegister(siginUpDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/logout')
  async logout(@Req() req: any, @Res() res: Response) {
    const userId = req.user.id;
    await this.authService.logout(userId);

    res.clearCookie('chatty_refreshToken');
    res.send({ success: true });
  }

  @UseGuards(JwtAuthGuard)
  @Get('/info')
  async getCurrentUser(@Req() req: any) {
    return this.authService.getCurrentUser(req);
  }

  @Post('refresh-token')
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies['chatty_refreshToken'];
    if (!refreshToken) {
      throw new UnauthorizedException('리프레시 토큰이 존재하지 않습니다.');
    }

    const newAccessToken =
      await this.authService.refreshAccessToken(refreshToken);

    console.log(
      `📤 AuthController: refresh-token 엔드포인트에서 x-access-token 헤더 설정 - 토큰 길이: ${newAccessToken.length}`,
    );
    res.header('x-access-token', newAccessToken).send({ success: true });
  }

  // ================================ redis test ================================
  @ApiOperation({ summary: '특정 사용자 강제 로그아웃 (관리자용)' })
  @ApiResponse({
    status: 200,
    description: '강제 로그아웃 성공',
  })
  @Delete('/force-logout/:userId')
  async forceLogout(@Param('userId') userId: string) {
    await this.authService.logout(userId);
    return {
      success: true,
      message: `사용자 ${userId}가 강제 로그아웃되었습니다.`,
    };
  }

  @ApiOperation({ summary: '모든 사용자 강제 로그아웃 (관리자용)' })
  @ApiResponse({
    status: 200,
    description: '모든 사용자 강제 로그아웃 성공',
  })
  @Delete('/force-logout-all')
  async forceLogoutAll() {
    const result = await this.authService.logoutAll();
    return {
      success: true,
      message: `모든 사용자(${result.count}명)가 강제 로그아웃되었습니다.`,
      count: result.count,
    };
  }

  @ApiOperation({ summary: 'Redis 토큰 정보 조회' })
  @ApiResponse({
    status: 200,
    description: 'Redis 토큰 정보',
  })
  @Get('/redis-info')
  async getRedisInfo() {
    const info = await this.authService.getRedisInfo();
    return {
      success: true,
      data: info,
    };
  }
}
