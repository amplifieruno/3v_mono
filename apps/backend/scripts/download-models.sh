#!/bin/bash

# Download face-api.js models for face recognition
# This script downloads the required model files instead of storing them in git

MODELS_DIR="$(dirname "$0")/../models"
mkdir -p "$MODELS_DIR"

echo "📥 Downloading face-api.js models..."
cd "$MODELS_DIR"

# Base URL for face-api.js models
BASE_URL="https://github.com/justadudewhohacks/face-api.js/raw/master/weights"

# Download SSD MobileNet model (face detection)
echo "⬇️  Downloading face detection model..."
curl -L -O "$BASE_URL/ssd_mobilenetv1_model-weights_manifest.json"
curl -L -O "$BASE_URL/ssd_mobilenetv1_model-shard1.bin"

# Download face landmarks model
echo "⬇️  Downloading face landmarks model..."
curl -L -O "$BASE_URL/face_landmark_68_model-weights_manifest.json"
curl -L -O "$BASE_URL/face_landmark_68_model-shard1.bin"

# Download face recognition model
echo "⬇️  Downloading face recognition model..."
curl -L -O "$BASE_URL/face_recognition_model-weights_manifest.json"
curl -L -O "$BASE_URL/face_recognition_model-shard1.bin"
curl -L -O "$BASE_URL/face_recognition_model-shard2.bin"

echo "✅ Models downloaded successfully!"
echo "📁 Models stored in: $MODELS_DIR"