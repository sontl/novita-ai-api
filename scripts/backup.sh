#!/bin/bash

# Backup script for Novita GPU Instance API
set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="novita-gpu-api-backup-$TIMESTAMP"

echo "💾 Starting backup process..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup archive
echo "📦 Creating backup archive: $BACKUP_NAME.tar.gz"

tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='coverage' \
    --exclude='.git' \
    --exclude='backups' \
    --exclude='logs/*.log' \
    .env \
    docker-compose*.yml \
    Dockerfile \
    package*.json \
    src/ \
    scripts/ \
    logs/ \
    config/ 2>/dev/null || true

# Backup Docker image
if command -v docker > /dev/null 2>&1; then
    echo "🐳 Backing up Docker image..."
    
    if docker images | grep -q "novita-gpu-instance-api"; then
        docker save novita-gpu-instance-api:latest | gzip > "$BACKUP_DIR/$BACKUP_NAME-image.tar.gz"
        echo "✅ Docker image backed up"
    else
        echo "⚠️  Docker image not found, skipping image backup"
    fi
fi

# Backup database/state if exists
if [ -d "data" ]; then
    echo "💽 Backing up data directory..."
    tar -czf "$BACKUP_DIR/$BACKUP_NAME-data.tar.gz" data/
fi

# Create backup manifest
echo "📋 Creating backup manifest..."
cat > "$BACKUP_DIR/$BACKUP_NAME-manifest.txt" << EOF
Novita GPU Instance API Backup
==============================

Backup Date: $(date)
Backup Name: $BACKUP_NAME
Hostname: $(hostname)
User: $(whoami)

Files Included:
- Configuration files (.env, docker-compose.yml)
- Source code (src/)
- Scripts (scripts/)
- Logs (logs/)
- Package files (package.json, package-lock.json)

Docker Image:
$(docker images novita-gpu-instance-api:latest --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}" 2>/dev/null || echo "No Docker image found")

System Info:
- OS: $(uname -a)
- Docker Version: $(docker --version 2>/dev/null || echo "Docker not available")
- Docker Compose Version: $(docker-compose --version 2>/dev/null || echo "Docker Compose not available")

Backup Size:
$(ls -lh "$BACKUP_DIR/$BACKUP_NAME"* | awk '{print $5 "\t" $9}')
EOF

# Cleanup old backups (keep last 5)
echo "🧹 Cleaning up old backups..."
cd "$BACKUP_DIR"
ls -t novita-gpu-api-backup-*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f || true
ls -t novita-gpu-api-backup-*-image.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f || true
ls -t novita-gpu-api-backup-*-data.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f || true
ls -t novita-gpu-api-backup-*-manifest.txt 2>/dev/null | tail -n +6 | xargs rm -f || true

# Summary
echo ""
echo "✅ Backup completed successfully!"
echo "📁 Backup location: $BACKUP_DIR"
echo "📦 Backup files:"
ls -lh "$BACKUP_DIR/$BACKUP_NAME"*

echo ""
echo "To restore from this backup:"
echo "  1. Extract: tar -xzf $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo "  2. Load Docker image: docker load < $BACKUP_DIR/$BACKUP_NAME-image.tar.gz"
echo "  3. Configure environment and deploy"