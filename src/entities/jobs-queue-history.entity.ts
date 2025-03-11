import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JobsQueue } from './jobs-queue.entity';

@Entity({ name: 'jobs_queue_history' })
export class JobsQueueHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => JobsQueue)
  @JoinColumn({ name: 'job_id' })
  job: JobsQueue;

  @Column()
  httpStatus: number;

  @Column({ type: 'jsonb', nullable: true })
  responsePayload: any;

  @CreateDateColumn()
  timestamp: Date;
}
