import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { SettingsService } from './settings.service';
import { UpdateChatAutoDeleteDto } from './dto/update-chat-auto-delete.dto';
import { responseObj } from '../../util/responseObj';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('chat-auto-delete')
  @ApiOperation({ summary: '채팅 자동 삭제 주기 조회 (관리자 전용)' })
  @ApiResponse({ status: 200, description: '삭제 주기(분). 0이면 비활성화' })
  async getChatAutoDelete() {
    const minutes = await this.settingsService.getChatAutoDeleteMinutes();
    return responseObj.success({ minutes });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('chat-auto-delete')
  @ApiOperation({ summary: '채팅 자동 삭제 주기 설정 (관리자 전용)' })
  @ApiResponse({ status: 200, description: '설정 성공' })
  async setChatAutoDelete(@Body() dto: UpdateChatAutoDeleteDto) {
    const minutes =
      await this.settingsService.setChatAutoDeleteMinutes(dto.minutes);
    return responseObj.success({ minutes });
  }
}
