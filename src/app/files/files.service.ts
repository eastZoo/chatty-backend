import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { File } from '../../entities/file.entity';

@Injectable()
export class FilesService {
  private readonly uploadPath = join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(File)
    private fileRepository: Repository<File>,
  ) {
    // uploads 디렉토리가 없으면 생성
    if (!existsSync(this.uploadPath)) {
      mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async uploadFile(file: Express.Multer.File, uploadedBy: any) {
    if (!file) {
      throw new Error('파일이 제공되지 않았습니다.');
    }

    // 파일명을 UUID로 변경하여 중복 방지
    const fileExtension = file.originalname.split('.').pop();
    const newFilename = `${uuidv4()}.${fileExtension}`;
    const filePath = join(this.uploadPath, newFilename);

    // 파일을 uploads 디렉토리에 저장
    const fs = require('fs').promises;
    await fs.writeFile(filePath, file.buffer);

    // 데이터베이스에 파일 정보 저장
    const fileEntity = this.fileRepository.create({
      originalName: file.originalname,
      filename: newFilename,
      mimetype: file.mimetype,
      size: file.size,
      path: filePath,
      url: `/files/${newFilename}`,
      uploadedBy: uploadedBy,
    });

    const savedFile = await this.fileRepository.save(fileEntity);

    return savedFile;
  }

  async deleteFile(fileId: string) {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });

    if (!file) {
      throw new NotFoundException('파일을 찾을 수 없습니다.');
    }

    // 실제 파일 삭제
    if (existsSync(file.path)) {
      unlinkSync(file.path);
    }

    // 데이터베이스에서 파일 정보 삭제
    await this.fileRepository.remove(file);

    return { message: '파일이 성공적으로 삭제되었습니다.' };
  }

  async getFileById(fileId: string) {
    const file = await this.fileRepository.findOne({
      where: { id: fileId },
      relations: ['uploadedBy'],
    });

    if (!file) {
      throw new NotFoundException('파일을 찾을 수 없습니다.');
    }

    return file;
  }
}
