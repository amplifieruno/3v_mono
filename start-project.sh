#!/bin/bash

# ITAP Project Startup Script
# This script builds and starts the entire project from scratch

echo "🚀 Starting ITAP - Identity Tracking and Access Platform"
echo "========================================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running in docker directory
if [[ ! -f "docker-compose.dev.yml" ]]; then
    echo -e "${RED}❌ Please run this script from the docker/ directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Building InsightFace CPU service...${NC}"
docker-compose -f docker-compose.dev.yml build insightface

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to build InsightFace service${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 2: Starting all services...${NC}"
echo -e "${YELLOW}   - PostgreSQL (Database)${NC}"
echo -e "${YELLOW}   - Redis (Cache)${NC}"
echo -e "${YELLOW}   - MinIO (Object Storage)${NC}"
echo -e "${YELLOW}   - InsightFace (Face Recognition)${NC}"

docker-compose -f docker-compose.dev.yml up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start services${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All services started successfully!${NC}"
echo ""
echo -e "${YELLOW}📊 Service URLs:${NC}"
echo "   🗃️  PostgreSQL: localhost:5432 (itap_user/itap_password)"
echo "   🔄 Redis: localhost:6379 (password: redis_password)"
echo "   📁 MinIO Console: http://localhost:9001 (minioadmin/minioadmin123)"
echo "   🧠 InsightFace API: http://localhost:18080/info"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "   1. Wait for InsightFace to finish loading models (~2-3 minutes)"
echo "   2. Start backend: cd ../apps/backend && npm run dev"
echo "   3. Start frontend: cd ../apps/frontend && npm run dev"
echo ""
echo -e "${GREEN}🎉 ITAP infrastructure is ready!${NC}"