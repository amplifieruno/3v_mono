import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm'
import type { Identity } from './Identity.js'

@Entity({ schema: 'itap', name: 'profiles' })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date

  @Column('text', { name: 'first_name', nullable: true })
  firstName?: string

  @Column('text', { name: 'last_name', nullable: true })
  lastName?: string

  @Column('text', { nullable: true })
  email?: string

  @OneToMany('Identity', 'profile')
  identities?: Identity[]
}