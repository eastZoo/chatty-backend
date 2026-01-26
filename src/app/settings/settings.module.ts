import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../../entities/app-setting.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { MessagesModule } from '../messages/messages.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppSetting]),
    MessagesModule,
    AuthModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
