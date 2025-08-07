#!/bin/bash

# ShareFlow Backend Deployment Script for Railway

echo "🚀 ShareFlow Backend Deployment Script"
echo "======================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Function to deploy backend
deploy_backend() {
    echo "📦 Preparing backend for deployment..."
    
    cd server
    
    # Check for required files
    if [ ! -f "package.json" ]; then
        echo "❌ package.json not found in server directory"
        exit 1
    fi
    
    # Login to Railway
    echo "🔐 Logging into Railway..."
    railway login
    
    # Link to project (create new if not exists)
    echo "🔗 Linking to Railway project..."
    railway link
    
    # Set environment variables
    echo "⚙️ Setting environment variables..."
    railway variables set PORT=3001
    railway variables set NODE_ENV=production
    
    read -p "Enter your Netlify URL (e.g., https://shareflow.netlify.app): " CLIENT_URL
    railway variables set CLIENT_URL=$CLIENT_URL
    
    # Deploy
    echo "🚂 Deploying to Railway..."
    railway up
    
    # Get deployment URL
    echo "✅ Deployment complete!"
    echo "🌐 Your backend URL is:"
    railway domain
    
    cd ..
}

# Function to check deployment status
check_status() {
    echo "📊 Checking deployment status..."
    cd server
    railway status
    railway logs
    cd ..
}

# Main menu
echo ""
echo "Select an option:"
echo "1) Deploy backend to Railway"
echo "2) Check deployment status"
echo "3) View logs"
echo "4) Exit"

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        deploy_backend
        ;;
    2)
        check_status
        ;;
    3)
        cd server && railway logs -f && cd ..
        ;;
    4)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac