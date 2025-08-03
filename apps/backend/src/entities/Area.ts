import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm'
import { Facility } from './Facility.js'
import { Device } from './Device.js'

export enum AreaType {
  BUILDING = 'building',
  FLOOR = 'floor',
  ROOM = 'room',
  ZONE = 'zone',
  SECTOR = 'sector'
}

export enum AccessLevel {
  PUBLIC = 'public',
  RESTRICTED = 'restricted',
  SECURE = 'secure',
  CLASSIFIED = 'classified'
}

export enum AreaStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance'
}

@Entity('areas')
export class Area {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('uuid')
  facilityId!: string

  @Column('uuid', { nullable: true })
  parentId?: string

  @Column()
  name!: string

  @Column('text', { nullable: true })
  description?: string

  @Column({
    type: 'enum',
    enum: AreaType,
    default: AreaType.ROOM
  })
  areaType!: AreaType

  @Column('jsonb', { nullable: true })
  coordinates?: any // Polygon coordinates for area boundaries

  @Column({
    type: 'enum',
    enum: AccessLevel,
    default: AccessLevel.PUBLIC
  })
  accessLevel!: AccessLevel

  @Column({
    type: 'enum',
    enum: AreaStatus,
    default: AreaStatus.ACTIVE
  })
  status!: AreaStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @ManyToOne(() => Facility, facility => facility.areas)
  @JoinColumn({ name: 'facilityId' })
  facility!: Facility

  @ManyToOne(() => Area, area => area.children)
  @JoinColumn({ name: 'parentId' })
  parent?: Area

  @OneToMany(() => Area, area => area.parent)
  children!: Area[]

  @OneToMany(() => Device, device => device.area)
  devices!: Device[]
}