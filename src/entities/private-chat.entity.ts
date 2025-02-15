import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Users } from './users.entity';
import { Message } from './message.entity';

@Entity()
export class PrivateChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Users, { eager: true })
  userA: Users;

  @ManyToOne(() => Users, { eager: true })
  userB: Users;

  @OneToMany(() => Message, (message) => message.privateChat, { cascade: true })
  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
