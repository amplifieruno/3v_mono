import { DataSource } from 'typeorm'
import { Identity } from '../entities/Identity.js'
import { Profile } from '../entities/Profile.js'
import { Facility } from '../entities/Facility.js'
import { Area } from '../entities/Area.js'
import { Device } from '../entities/Device.js'
import { Segment } from '../entities/Segment.js'
import { TrackingSession } from '../entities/TrackingSession.js'
import { IdentityLocation } from '../entities/IdentityLocation.js'
import { User } from '../entities/User.js'

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://itap_user:itap_password@localhost:5432/itap_dev',
  synchronize: process.env.NODE_ENV === 'development', // Only for development
  logging: process.env.NODE_ENV === 'development',
  entities: [
    Identity,
    Profile,
    Facility,
    Area,
    Device,
    Segment,
    TrackingSession,
    IdentityLocation,
    User
  ],
  migrations: ['src/migrations/*.ts'],
  subscribers: ['src/subscribers/*.ts'],
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})