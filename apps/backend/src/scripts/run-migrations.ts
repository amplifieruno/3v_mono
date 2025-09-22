import 'reflect-metadata'
import { DataSource } from 'typeorm'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Entities
import { Identity } from '../entities/Identity.js'
import { Profile } from '../entities/Profile.js'
import { Facility } from '../entities/Facility.js'
import { Area } from '../entities/Area.js'
import { Device } from '../entities/Device.js'
import { Segment } from '../entities/Segment.js'
import { TrackingSession } from '../entities/TrackingSession.js'
import { IdentityLocation } from '../entities/IdentityLocation.js'
import { User } from '../entities/User.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://itap_user:itap_password@localhost:5432/itap_dev',
  synchronize: false,
  logging: true,
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
  ssl: false
})

async function runMigrations() {
  try {
    console.log('Connecting to database...')
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'))

    await dataSource.initialize()
    console.log('Running migrations...')

    const migrations = await dataSource.runMigrations()

    if (migrations.length === 0) {
      console.log('No migrations to run. Database is up to date.')
    } else {
      console.log(`Successfully ran ${migrations.length} migration(s):`)
      migrations.forEach(migration => {
        console.log(`  - ${migration.name}`)
      })
    }

    await dataSource.destroy()
    process.exit(0)
  } catch (error) {
    console.error('Error running migrations:', error)
    process.exit(1)
  }
}

runMigrations()