import 'reflect-metadata'
import { AppDataSource } from '../config/database.js'

async function syncDatabase() {
  try {
    console.log('🔄 Connecting to database...')
    await AppDataSource.initialize()
    console.log('✅ Database connected successfully')
    
    console.log('🔄 Synchronizing database schema...')
    await AppDataSource.synchronize()
    console.log('✅ Database schema synchronized successfully')
    
    console.log('📊 Checking tables...')
    const queryRunner = AppDataSource.createQueryRunner()
    const tables = await queryRunner.getTables()
    
    console.log('📋 Created tables:')
    tables.forEach(table => {
      console.log(`  - ${table.name}`)
    })
    
    await queryRunner.release()
    await AppDataSource.destroy()
    console.log('🏁 Database sync completed!')
    
  } catch (error) {
    console.error('❌ Database sync failed:', error)
    process.exit(1)
  }
}

syncDatabase()