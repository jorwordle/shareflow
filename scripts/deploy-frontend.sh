#!/bin/bash

# ShareFlow Frontend Deployment Script for Netlify

echo "🚀 ShareFlow Frontend Deployment Script"
echo "======================================="

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "❌ Netlify CLI not found. Installing..."
    npm install -g netlify-cli
fi

# Function to deploy frontend
deploy_frontend() {
    echo "📦 Preparing frontend for deployment..."
    
    cd frontend
    
    # Check for required files
    if [ ! -f "package.json" ]; then
        echo "❌ package.json not found in frontend directory"
        exit 1
    fi
    
    # Install dependencies
    echo "📚 Installing dependencies..."
    npm install
    
    # Get Railway backend URL
    read -p "Enter your Railway backend URL (e.g., https://shareflow-server.up.railway.app): " BACKEND_URL
    
    # Create/update .env.production
    echo "⚙️ Setting environment variables..."
    echo "NEXT_PUBLIC_SERVER_URL=$BACKEND_URL" > .env.production
    
    # Build the project
    echo "🔨 Building production bundle..."
    npm run build
    
    if [ $? -ne 0 ]; then
        echo "❌ Build failed"
        exit 1
    fi
    
    # Login to Netlify
    echo "🔐 Logging into Netlify..."
    netlify login
    
    # Deploy to Netlify
    echo "☁️ Deploying to Netlify..."
    netlify deploy --prod --dir=.next
    
    # Get deployment URL
    echo "✅ Deployment complete!"
    echo "🌐 Your frontend URL is:"
    netlify status
    
    cd ..
}

# Function to setup continuous deployment
setup_continuous() {
    echo "🔄 Setting up continuous deployment..."
    
    cd frontend
    
    # Initialize Netlify site
    netlify init
    
    # Link to Git repository
    echo "📎 Linking to Git repository..."
    netlify link
    
    # Configure build settings
    echo "⚙️ Configuring build settings..."
    netlify env:set NEXT_PUBLIC_SERVER_URL
    
    echo "✅ Continuous deployment configured!"
    echo "Future pushes to your repository will trigger automatic deployments."
    
    cd ..
}

# Function to check deployment status
check_status() {
    echo "📊 Checking deployment status..."
    cd frontend
    netlify status
    netlify env:list
    cd ..
}

# Main menu
echo ""
echo "Select an option:"
echo "1) Deploy frontend to Netlify"
echo "2) Setup continuous deployment"
echo "3) Check deployment status"
echo "4) Open Netlify dashboard"
echo "5) Exit"

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        deploy_frontend
        ;;
    2)
        setup_continuous
        ;;
    3)
        check_status
        ;;
    4)
        netlify open
        ;;
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac