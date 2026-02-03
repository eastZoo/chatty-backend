import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Message } from './message.entity';
import { Users } from './users.entity';

@Entity()
export class MessageReadStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  message: Message;

  @ManyToOne(() => Users, { onDelete: 'CASCADE' })
  user: Users;

  @CreateDateColumn()
  readAt: Date;
}
