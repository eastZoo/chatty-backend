import {
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { Message } from './message.entity';
import { Users } from './users.entity';

@Entity()
@Index('uq_message_read_status_user_message', ['user', 'message'], {
  unique: true,
})
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
