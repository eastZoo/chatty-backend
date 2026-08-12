// src/users/user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { Users } from './users.entity';

@Entity()
export class FcmToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('uq_fcm_token_token', { unique: true })
  @Column({ type: 'text' })
  token: string;

  @ManyToOne(() => Users, (user) => user.id, {
    onDelete: 'CASCADE',
  })
  user: Users;
}
