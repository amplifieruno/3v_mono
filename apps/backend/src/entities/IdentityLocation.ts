import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import type { TrackingSession } from './TrackingSession.js'

export enum MovementType {
  ENTRY = 'entry',
  EXIT = 'exit',
  MOVEMENT = 'movement',
  STATIONARY = 'stationary'
}

@Entity('identity_locations')
export class IdentityLocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('uuid')
  identityId!: string

  @Column('uuid')
  areaId!: string

  @Column('uuid')
  deviceId!: string

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  latitude?: number

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  longitude?: number

  @Column('decimal', { precision: 3, scale: 2 })
  confidence!: number

  @Column({
    type: 'enum',
    enum: MovementType,
    default: MovementType.MOVEMENT
  })
  movementType!: MovementType

  @Column('uuid', { nullable: true })
  sessionId?: string

  @CreateDateColumn()
  timestamp!: Date

  @ManyToOne('TrackingSession', 'locations')
  @JoinColumn({ name: 'sessionId' })
  session?: TrackingSession
}