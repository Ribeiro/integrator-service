import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiEvent } from './api-event.entity';

@Entity({ name: 'jobs_queue' })
export class JobsQueue {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ApiEvent, { eager: true })
  @JoinColumn({ name: 'event_id' })
  event: ApiEvent;

  @Column({ default: 'pending' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
