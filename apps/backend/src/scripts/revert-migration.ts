import 'reflect-metadata'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// Import after loading env variables
import { AppDataSource } from '../config/database.js'

async function revertMigration() {
  try {
    await AppDataSource.initialize()
    console.log('Reverting last migration...')

    await AppDataSource.undoLastMigration()
    console.log('Successfully reverted last migration')

    await AppDataSource.destroy()
    process.exit(0)
  } catch (error) {
    console.error('Error reverting migration:', error)
    process.exit(1)
  }
}

revertMigration()