import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm'
import { Identity } from './Identity.js'

export enum AccessLevel {
  BASIC = 'basic',
  STANDARD = 'standard',
  ELEVATED = 'elevated',
  ADMIN = 'admin'
}

export enum ProfileStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  TERMINATED = 'terminated'
}

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('uuid')
  identityId!: string

  @Column('varchar')
  firstName!: string

  @Column('varchar')
  lastName!: string

  @Column('varchar', { nullable: true })
  email?: string

  @Column('varchar', { nullable: true })
  phone?: string

  @Column('varchar', { nullable: true })
  employeeId?: string

  @Column('varchar', { nullable: true })
  department?: string

  @Column('varchar', { nullable: true })
  role?: string

  @Column({
    type: 'enum',
    enum: AccessLevel,
    default: AccessLevel.STANDARD
  })
  accessLevel!: AccessLevel

  @Column('date', { nullable: true })
  startDate?: Date

  @Column('date', { nullable: true })
  endDate?: Date

  @Column({
    type: 'enum',
    enum: ProfileStatus,
    default: ProfileStatus.ACTIVE
  })
  status!: ProfileStatus

  @Column('jsonb', { nullable: true })
  customFields?: Record<string, any>

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @OneToOne(() => Identity, identity => identity.profile)
  @JoinColumn({ name: 'identityId' })
  identity!: Identity
}