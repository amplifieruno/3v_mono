import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne } from 'typeorm'
import { Profile } from './Profile.js'

export enum IdentityStatus {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified', 
  ARCHIVED = 'archived'
}

@Entity('identities')
export class Identity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('jsonb', { nullable: true })
  embeddings?: number[][]

  @Column('jsonb', { nullable: true })
  attributes?: Record<string, any>

  @Column('text', { array: true, default: [] })
  photos!: string[]

  @Column('decimal', { precision: 3, scale: 2, default: 0.8 })
  confidence!: number

  @Column({
    type: 'enum',
    enum: IdentityStatus,
    default: IdentityStatus.UNVERIFIED
  })
  status!: IdentityStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @Column('timestamp', { nullable: true })
  firstSeen?: Date

  @Column('timestamp', { nullable: true })
  lastSeen?: Date

  @Column('int', { default: 0 })
  detectionCount!: number

  @OneToOne(() => Profile, profile => profile.identity)
  profile?: Profile
}