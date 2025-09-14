import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const modelsPath = path.join(__dirname, '../../public/models')

// Model URLs from @vladmandic/face-api via jsdelivr CDN
const MODEL_BASE_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model'

const models = [
  // Face detection models
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  
  // Face landmark detection
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_landmark_68_tiny_model-weights_manifest.json',
  'face_landmark_68_tiny_model-shard1',
  
  // Face recognition (embeddings)
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
  
  // Age and gender detection
  'age_gender_model-weights_manifest.json',
  'age_gender_model-shard1',
  
  // Face expression detection
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1',
]

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        https.get(response.headers.location!, (redirectResponse) => {
          redirectResponse.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
        }).on('error', reject)
      } else if (response.statusCode === 200) {
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      } else {
        reject(new Error(`Failed to download: ${response.statusCode}`))
      }
    }).on('error', reject)
  })
}

async function main() {
  console.log('📦 Downloading face-api models...')
  
  // Create models directory if it doesn't exist
  if (!fs.existsSync(modelsPath)) {
    fs.mkdirSync(modelsPath, { recursive: true })
    console.log(`✅ Created directory: ${modelsPath}`)
  }
  
  let downloaded = 0
  let skipped = 0
  
  for (const modelFile of models) {
    const filePath = path.join(modelsPath, modelFile)
    
    if (fs.existsSync(filePath)) {
      console.log(`⏭️  Skipping ${modelFile} (already exists)`)
      skipped++
      continue
    }
    
    const url = `${MODEL_BASE_URL}/${modelFile}`
    console.log(`⬇️  Downloading ${modelFile}...`)
    
    try {
      await downloadFile(url, filePath)
      console.log(`✅ Downloaded ${modelFile}`)
      downloaded++
    } catch (error) {
      console.error(`❌ Failed to download ${modelFile}:`, error)
    }
  }
  
  console.log(`\n🎉 Download complete!`)
  console.log(`   Downloaded: ${downloaded} files`)
  console.log(`   Skipped: ${skipped} files`)
  console.log(`   Models location: ${modelsPath}`)
  
  // Verify all required models are present
  const requiredModels = [
    'ssd_mobilenetv1_model',
    'face_landmark_68_model',
    'face_recognition_model',
    'age_gender_model',
    'face_expression_model'
  ]
  
  console.log('\n🔍 Verifying models...')
  let allPresent = true
  
  for (const model of requiredModels) {
    const manifestFile = `${model}-weights_manifest.json`
    const manifestPath = path.join(modelsPath, manifestFile)
    
    if (fs.existsSync(manifestPath)) {
      console.log(`✅ ${model}: OK`)
    } else {
      console.log(`❌ ${model}: Missing`)
      allPresent = false
    }
  }
  
  if (allPresent) {
    console.log('\n✨ All models are ready!')
  } else {
    console.log('\n⚠️  Some models are missing. Please run this script again.')
    process.exit(1)
  }
}

main().catch(console.error)