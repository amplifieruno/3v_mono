import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm'
import { Area } from './Area.js'

export enum FacilityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive', 
  MAINTENANCE = 'maintenance'
}

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('varchar')
  name!: string

  @Column('text', { nullable: true })
  description?: string

  @Column('varchar', { nullable: true })
  address?: string

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  latitude?: number

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  longitude?: number

  @Column('varchar', { default: 'UTC' })
  timezone!: string

  @Column('uuid')
  createdBy!: string

  @Column({
    type: 'enum',
    enum: FacilityStatus,
    default: FacilityStatus.ACTIVE
  })
  status!: FacilityStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @OneToMany(() => Area, area => area.facility)
  areas!: Area[]
}