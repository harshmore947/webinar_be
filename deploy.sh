#!/bin/bash

###############################################################################
# Webinar Backend Deployment Script
# 
# This script automates the deployment process on a VPS
# 
# Usage: ./deploy.sh
###############################################################################

set -e  # Exit on error

echo "🚀 Starting Webinar Backend Deployment..."
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    print_error "Please do not run this script as root"
    exit 1
fi

# 1. Pull latest code
print_info "Pulling latest code from repository..."
if git pull origin main; then
    print_success "Code updated successfully"
else
    print_error "Failed to pull latest code"
    exit 1
fi

# 2. Check if .env exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    print_info "Please create .env file with required variables"
    print_info "See VPS_DEPLOYMENT_GUIDE.md for details"
    exit 1
fi

print_success ".env file found"

# 3. Install dependencies
print_info "Installing dependencies..."
if npm install; then
    print_success "Dependencies installed"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# 4. Build application
print_info "Building TypeScript..."
if npm run build; then
    print_success "Build completed successfully"
else
    print_error "Build failed"
    exit 1
fi

# 5. Run database migrations (if any)
# Uncomment if you have migrations
# print_info "Running database migrations..."
# npm run migrate

# 6. Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_info "PM2 not found. Installing PM2..."
    sudo npm install -g pm2
    print_success "PM2 installed"
fi

# 7. Create logs directory if it doesn't exist
mkdir -p logs
print_success "Logs directory ready"

# 8. Check if application is already running
if pm2 list | grep -q "webinar-api"; then
    print_info "Application is running. Restarting..."
    pm2 restart webinar-api
    print_success "Application restarted"
else
    print_info "Starting application for the first time..."
    
    # Check if ecosystem.config.js exists
    if [ -f ecosystem.config.js ]; then
        pm2 start ecosystem.config.js
    else
        pm2 start dist/index.js --name webinar-api
    fi
    
    print_success "Application started"
    
    # Save PM2 process list
    pm2 save
    print_success "PM2 configuration saved"
fi

# 9. Show application status
echo ""
print_info "Application Status:"
pm2 list

# 10. Show logs for a few seconds
echo ""
print_info "Recent logs:"
pm2 logs webinar-api --lines 20 --nostream

echo ""
echo "============================================"
print_success "Deployment completed successfully! 🎉"
echo ""
print_info "Useful commands:"
echo "  - View logs: pm2 logs webinar-api"
echo "  - Monitor: pm2 monit"
echo "  - Restart: pm2 restart webinar-api"
echo "  - Stop: pm2 stop webinar-api"
echo ""

