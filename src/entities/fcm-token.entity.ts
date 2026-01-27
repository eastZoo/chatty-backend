// src/users/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Users } from './users.entity';

@Entity()
export class FcmToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  token: string;

  @ManyToOne(() => Users, (user) => user.id, {
    onDelete: 'CASCADE',
  })
  user: Users;
}
