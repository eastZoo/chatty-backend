import {
  Body,
  Post,
  Req,
  Res,
  UnauthorizedException,
  Controller,
  UseGuards,
  Get,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';
import { AdminAccessTokenMaxAge } from 'src/util/getTokenMaxAge';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: '로그인' })
  @ApiResponse({
    status: 200,
    type: Boolean,
  })
  @Post('/sign-in')
  async userSiginIn(@Body() loginDto: LoginDto) {
    const { username, password } = loginDto;
    return this.authService.userSiginIn(username, password);
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

  @Post('/logout')
  logout(@Res() res: Response) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.send({ success: true });
  }

  @UseGuards(AccessTokenGuard)
  @Get('/info')
  async getCurrentUser(@Req() req: any) {
    return this.authService.getCurrentUser(req);
  }

  @Post('refresh-token')
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies['refreshToken'];
    if (!refreshToken) {
      throw new UnauthorizedException('리프레시 토큰이 존재하지 않습니다.');
    }
    const tokens = await this.authService.refreshToken(refreshToken);
    res
      .cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        maxAge: AdminAccessTokenMaxAge, // 1분 (60초 * 1000밀리초)
      })
      .send({ success: true });
  }

  /**
   * 유저 FCM 토큰 등록
   */
  @Put('/update-fcm-token')
  @UseGuards(AccessTokenGuard)
  async updateFcmToken(
    @Req() req: any,
    @Body() updateFcmTokenDto: UpdateFcmTokenDto,
  ) {
    const { id } = req.user;
    const { token } = updateFcmTokenDto;

    console.log('id : ', id);
    console.log('token : ', token);
    return await this.authService.updsertFcmToken({
      token: token,
      userId: id,
    });
  }
}
