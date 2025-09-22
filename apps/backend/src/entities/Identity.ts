import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import type { Profile } from './Profile.js'

@Entity({ schema: 'itap', name: 'identities' })
export class Identity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date

  @Column('text', { array: true })
  images!: string[]

  @Column('text', { default: 'unverified' })
  status!: string

  @Column('jsonb', { default: {} })
  attributes!: Record<string, any>

  // Vector embedding for face recognition
  // TypeORM doesn't support vector type natively, handled via raw queries
  embedding?: number[]

  @Column('uuid', { name: 'profile_id', nullable: true })
  profileId?: string

  @ManyToOne('Profile', 'identities')
  @JoinColumn({ name: 'profile_id' })
  profile?: Profile
}