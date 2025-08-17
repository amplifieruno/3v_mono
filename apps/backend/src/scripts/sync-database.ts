import 'reflect-metadata'
import { AppDataSource } from '../config/database.js'

async function syncDatabase() {
  try {
    console.log('Connecting to database...')
    await AppDataSource.initialize()
    console.log('Database connection initialized')
    
    console.log('Synchronizing database schema...')
    await AppDataSource.synchronize(true) // true = drop existing tables
    console.log('Database schema synchronized successfully')
    
    console.log('Current tables:')
    const tables = await AppDataSource.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `)
    
    tables.forEach((table: any) => {
      console.log(`- ${table.tablename}`)
    })
    
  } catch (error) {
    console.error('Error synchronizing database:', error)
  } finally {
    await AppDataSource.destroy()
    process.exit(0)
  }
}

syncDatabase()