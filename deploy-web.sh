#!/bin/bash
# deploy-web.sh — Build and deploy History Legends to Firebase Hosting
set -e

echo "🔨 Building for production..."
npm run build

echo "🚀 Deploying to Firebase Hosting..."
npx firebase-tools deploy --only hosting

echo "✅ Deployed! Check https://historylegends-80b84.web.app"
