import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

export enum SegmentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived'
}

@Entity('segments')
export class Segment {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('varchar')
  name!: string

  @Column('text', { nullable: true })
  description?: string

  @Column('jsonb')
  conditions!: Record<string, any>

  @Column('boolean', { default: true })
  isDynamic!: boolean

  @Column('int', { default: 0 })
  memberCount!: number

  @Column('uuid')
  createdBy!: string

  @Column('timestamp', { nullable: true })
  lastEvaluated?: Date

  @Column({
    type: 'enum',
    enum: SegmentStatus,
    default: SegmentStatus.ACTIVE
  })
  status!: SegmentStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}