#!/bin/bash
# Local deploy script - builds images on server and deploys
# Usage: ./deploy-local.sh
set -e

SERVER="ubuntu@43.133.56.234"
SERVER_PASS="Www.950pp.com"
DOCKER_USER="111leo1"
DOCKER_PASS="dckr_pat_4zzCv3s8xyEEKIsqQ6KlTXkBAG8"

echo "📦 Packaging source..."
tar -czf /tmp/oms-deploy.tar.gz \
  --exclude='./backend/node_modules' \
  --exclude='./frontend/node_modules' \
  --exclude='./frontend/.next' \
  --exclude='./.git' \
  --exclude='./.github' \
  --exclude='./.env.server' \
  -C oms-instance-v2 .

echo "📤 Uploading to server..."
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no /tmp/oms-deploy.tar.gz $SERVER:/tmp/

echo "🔨 Building & deploying on server..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER << ENDSSH
  set -e
  mkdir -p /tmp/oms-src
  tar -xzf /tmp/oms-deploy.tar.gz -C /tmp/oms-src

  # Login to Docker Hub
  docker login -u $DOCKER_USER -p $DOCKER_PASS

  # Build images
  echo "Building backend..."
  docker build -t $DOCKER_USER/oms-backend:latest /tmp/oms-src/backend

  echo "Building frontend..."
  docker build -t $DOCKER_USER/oms-frontend:latest /tmp/oms-src/frontend

  # Push to Docker Hub
  echo "Pushing images..."
  docker push $DOCKER_USER/oms-backend:latest
  docker push $DOCKER_USER/oms-frontend:latest

  # Deploy
  /opt/oms/deploy.sh

  # Cleanup
  rm -rf /tmp/oms-src /tmp/oms-deploy.tar.gz
  echo "✅ Done!"
ENDSSH

echo "🎉 Deployment complete! Visit http://43.133.56.234"
