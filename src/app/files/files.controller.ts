import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Delete,
  UseGuards,
  Request,
  Param,
  Get,
  Res,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { existsSync } from 'fs';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${uniqueSuffix}${ext}`;
          callback(null, filename);
        },
      }),
      fileFilter: (req, file, callback) => {
        // 모든 파일 타입 허용
        callback(null, true);
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB 제한
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Request() req) {
    if (!file) {
      throw new BadRequestException('파일이 제공되지 않았습니다.');
    }

    return this.filesService.uploadFile(file, req.user);
  }

  @Delete(':fileId')
  @UseGuards(AccessTokenGuard)
  async deleteFile(@Param('fileId') fileId: string) {
    return this.filesService.deleteFile(fileId);
  }

  @Get(':fileId')
  // @UseGuards(AccessTokenGuard)
  async downloadFile(@Param('fileId') fileId: string, @Res() res: Response) {
    try {
      Logger.log(fileId);
      // 파일 정보 조회
      const file = await this.filesService.getFileById(fileId);

      // 실제 파일 경로 확인
      const filePath = join(process.cwd(), 'uploads', file.filename);

      if (!existsSync(filePath)) {
        throw new BadRequestException('파일을 찾을 수 없습니다.');
      }

      // 파일 다운로드 헤더 설정
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.originalName)}"`,
      );
      res.setHeader('Content-Type', file.mimetype);
      res.setHeader('Content-Length', file.size.toString());

      // 파일 전송
      res.sendFile(filePath);
    } catch (error) {
      console.error('파일 다운로드 오류:', error);
      throw new BadRequestException('파일 다운로드에 실패했습니다.');
    }
  }
}
