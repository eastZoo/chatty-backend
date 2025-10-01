import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { File } from '../../entities/file.entity';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([File]), forwardRef(() => AuthModule)],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [forwardRef(() => FilesService)],
})
export class FilesModule {}
