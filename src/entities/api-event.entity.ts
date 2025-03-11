import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'api_events' })
export class ApiEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid', unique: true })
  requestId: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column()
  originService: string;

  @Column()
  destinationApi: string;

  @Column()
  destinationApiUrl: string;

  @Column()
  httpMethod: string;

  @Column()
  responseQueueUrl: string;

  @CreateDateColumn()
  createdAt: Date;
}
