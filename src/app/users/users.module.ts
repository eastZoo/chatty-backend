// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from '../../entities/users.entity';
import { UsersService } from './users.service';
import { ChatReadStatus } from 'src/entities/chat-read-status.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Users, ChatReadStatus])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
