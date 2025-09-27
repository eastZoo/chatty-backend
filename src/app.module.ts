// src/app.module.ts
import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './app/users/users.module';
import { ChatsModule } from './app/chats/chats.module';
import { MessagesModule } from './app/messages/messages.module';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { join } from 'path';
import { MulterModule } from '@nestjs/platform-express';
import { validate } from './util/env.validation';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { FriendsModule } from './app/friends/friends.module';
import { FilesModule } from './app/files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV
        ? `.env.${process.env.NODE_ENV}`
        : '.env.development',
      validate,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get<string>('DB_TYPE');

        if (dbType === 'sqlite') {
          return {
            type: 'sqlite',
            database: 'chatty.db',
            entities: [__dirname + '/entities/*.entity{.ts,.js}'],
            synchronize: false,
            namingStrategy: new SnakeNamingStrategy(),
            logging: true,
          };
        } else {
          return {
            type: 'postgres',
            host: configService.get<string>('DB_HOST'),
            port: configService.get<number>('DB_PORT'),
            username: configService.get<string>('DB_USERNAME'),
            password: configService.get<string>('DB_PASSWORD'),
            database: configService.get<string>('DB_NAME'),
            entities: [__dirname + '/entities/*.entity{.ts,.js}'],
            synchronize: false,
            namingStrategy: new SnakeNamingStrategy(),
            logging: true,
          };
        }
      },
      inject: [ConfigService],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'uploads'),
    }),
    MulterModule.register({
      dest: './uploads',
    }),
    AuthModule,
    UsersModule,
    ChatsModule,
    MessagesModule,
    FriendsModule,
    FilesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService, // AppModule에서는 AppService만 등록합니다.
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
