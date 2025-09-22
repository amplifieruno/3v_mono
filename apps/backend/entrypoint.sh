#!/bin/bash
set -e

echo "🚀 Starting ITAP Backend..."
echo "📍 Environment: $NODE_ENV"

# Wait for dependencies to be ready
echo "⏳ Waiting for dependencies..."

# Parse DATABASE_URL if provided, otherwise use individual vars
if [ -n "$DATABASE_URL" ]; then
    # Extract host, port, user, and database from DATABASE_URL
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:\/]*\).*/\1/p')
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
else
    DB_HOST=${DB_HOST:-postgres}
    DB_USER=${DB_USER:-itap_user}
    DB_NAME=${DB_NAME:-itap_prod}
fi

# Wait for PostgreSQL
echo "🔄 Waiting for PostgreSQL at $DB_HOST..."
while ! pg_isready -h $DB_HOST -U $DB_USER -d $DB_NAME > /dev/null 2>&1; do
    echo "⏳ PostgreSQL is unavailable - sleeping"
    sleep 2
done
echo "✅ PostgreSQL is ready!"

# Parse REDIS_URL if provided
if [ -n "$REDIS_URL" ]; then
    REDIS_HOST=$(echo $REDIS_URL | sed -n 's/.*@\([^:]*\).*/\1/p')
    REDIS_PASSWORD=$(echo $REDIS_URL | sed -n 's/.*:\([^@]*\)@.*/\1/p')
else
    REDIS_HOST=${REDIS_HOST:-redis}
    REDIS_PASSWORD=${REDIS_PASSWORD:-redis_password_prod}
fi

# Wait for Redis
echo "🔄 Waiting for Redis at $REDIS_HOST..."
while ! redis-cli -h $REDIS_HOST -a $REDIS_PASSWORD ping > /dev/null 2>&1; do
    echo "⏳ Redis is unavailable - sleeping"
    sleep 2
done
echo "✅ Redis is ready!"

# Wait for MinIO (optional - continue if not available)
MINIO_HOST=${MINIO_ENDPOINT:-minio:9000}
echo "🔄 Checking MinIO at $MINIO_HOST..."
if curl -f http://$MINIO_HOST/minio/health/live > /dev/null 2>&1; then
    echo "✅ MinIO is ready!"
else
    echo "⚠️ MinIO is not available, continuing without it..."
fi

# Run database migrations
echo "🔧 Running database migrations..."
if npm run migration:run; then
    echo "✅ Database migrations completed!"
else
    echo "❌ Database migrations failed!"
    exit 1
fi

# Start the application
echo "🚀 Starting application server..."
exec "$@"