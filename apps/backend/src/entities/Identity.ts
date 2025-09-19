import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne } from 'typeorm'
import type { Profile } from './Profile.js'

export enum IdentityStatus {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified', 
  ARCHIVED = 'archived'
}

@Entity('identities')
export class Identity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  // Legacy: old embeddings stored as JSONB
  @Column('jsonb', { nullable: true })
  embeddings?: number[][]

  // New: single averaged embedding vector for fast similarity search
  // Note: vector column is added via migration, TypeORM doesn't recognize 'vector' type
  // @Column('vector(512)', { nullable: true })
  embedding?: string // pgvector stores as string, we'll parse it

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

  @OneToOne('Profile', 'identity')
  profile?: Profile
}