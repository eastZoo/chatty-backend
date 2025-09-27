import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Users } from './users.entity';

@Entity()
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalName: string;

  @Column()
  filename: string;

  @Column()
  mimetype: string;

  @Column('bigint')
  size: number;

  @Column()
  path: string;

  @Column({ nullable: true })
  url: string;

  @ManyToOne(() => Users, { eager: true })
  uploadedBy: Users;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
