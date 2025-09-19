import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import type { Area } from './Area.js'

export enum DeviceType {
  STATIC_VIDEO_CAMERA = 'static_video_camera',
  PTZ_CAMERA = 'ptz_camera',
  SENSOR = 'sensor'
}

export enum DeviceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  MAINTENANCE = 'maintenance'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown'
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('varchar')
  name!: string

  @Column({
    type: 'enum',
    enum: DeviceType,
    default: DeviceType.STATIC_VIDEO_CAMERA
  })
  deviceType!: DeviceType

  @Column('uuid')
  areaId!: string

  @Column('varchar', { nullable: true })
  streamUrl?: string

  @Column('jsonb', { nullable: true })
  credentials?: Record<string, any>

  @Column('varchar', { nullable: true })
  resolution?: string

  @Column('int', { nullable: true })
  fps?: number

  @Column({
    type: 'enum',
    enum: DeviceStatus,
    default: DeviceStatus.ACTIVE
  })
  status!: DeviceStatus

  @Column({
    type: 'enum',
    enum: HealthStatus,
    default: HealthStatus.UNKNOWN
  })
  healthStatus!: HealthStatus

  @Column('timestamp', { nullable: true })
  lastSeen?: Date

  @Column('jsonb', { nullable: true })
  configuration?: Record<string, any>

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @ManyToOne('Area', 'devices')
  @JoinColumn({ name: 'areaId' })
  area!: Area
}