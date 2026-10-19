import { DataSource } from 'typeorm'
import { Identity } from '../entities/Identity.js'
import { Profile } from '../entities/Profile.js'

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || '',
  synchronize: false, // process.env.NODE_ENV === 'development', // Only for development
  // logging: process.env.NODE_ENV === 'development',
  entities: [
    Identity,
    Profile,
  ],
  // migrations: [
  //   process.env.NODE_ENV === 'production'
  //     ? 'dist/migrations/*.js'
  //     : 'src/migrations/*.ts'
  // ],
  // subscribers: [
  //   process.env.NODE_ENV === 'production'
  //     ? 'dist/subscribers/*.js'
  //     : 'src/subscribers/*.ts'
  // ],
  ssl: false
})