import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { Users } from './users.entity';

export enum FriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity()
export class Friendship {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Users, (user) => user.sentFriendRequests, { eager: true })
  requester: Users;

  @ManyToOne(() => Users, (user) => user.receivedFriendRequests, {
    eager: true,
  })
  receiver: Users;

  @Column({
    type: 'enum',
    enum: FriendshipStatus,
    default: FriendshipStatus.PENDING,
  })
  status: FriendshipStatus;

  @CreateDateColumn()
  createdAt: Date;
}
