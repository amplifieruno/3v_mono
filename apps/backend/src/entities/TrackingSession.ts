import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm'
import { IdentityLocation } from './IdentityLocation.js'

export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  LOST = 'lost',
  ERROR = 'error'
}

@Entity('tracking_sessions')
export class TrackingSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('uuid')
  identityId!: string

  @Column('uuid')
  facilityId!: string

  @CreateDateColumn()
  startTime!: Date

  @Column('timestamp', { nullable: true })
  endTime?: Date

  @Column('int', { nullable: true })
  duration?: number // Duration in seconds

  @Column('jsonb', { nullable: true })
  path?: any[] // Array of location points

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.ACTIVE
  })
  status!: SessionStatus

  @OneToMany(() => IdentityLocation, location => location.session)
  locations!: IdentityLocation[]
}