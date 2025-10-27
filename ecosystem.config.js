/**
 * PM2 Ecosystem Configuration
 * 
 * This file configures how PM2 manages the application
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 delete ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'webinar-api',
      
      // Entry point
      script: './dist/index.js',
      
      // Instance configuration
      instances: 'max', // Use all available CPU cores (cluster mode)
      exec_mode: 'cluster', // Enable cluster mode for better performance
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
      },
      
      // Logging configuration
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Memory management
      max_memory_restart: '1G', // Restart if memory exceeds 1GB
      
      // Auto-restart configuration
      watch: false, // Don't watch for file changes in production
      autorestart: true, // Auto-restart on crash
      max_restarts: 10, // Maximum restarts within restart_delay
      min_uptime: '10s', // Minimum uptime before considering app stable
      
      // Graceful shutdown
      kill_timeout: 5000, // Wait 5 seconds before force kill
      wait_ready: false,
      listen_timeout: 3000,
      
      // Error handling
      restart_delay: 4000, // Delay between restarts (ms)
      exp_backoff_restart_delay: 100, // Exponential backoff for restarts
      
      // Source map support (helpful for debugging)
      source_map_support: true,
      
      // Ignore watch (if watch is enabled)
      ignore_watch: [
        'node_modules',
        'logs',
        '.git',
        'dist',
      ],
      
      // Additional environment variables for different environments
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000,
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
  
  /**
   * Deployment configuration (optional)
   * Uncomment and configure if you want to use PM2 deploy
   */
  /*
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'your-vps-ip',
      ref: 'origin/main',
      repo: 'git@github.com:username/repo.git',
      path: '/home/ubuntu/webinar-backend',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': '',
      'post-setup': '',
    },
    staging: {
      user: 'ubuntu',
      host: 'staging-vps-ip',
      ref: 'origin/develop',
      repo: 'git@github.com:username/repo.git',
      path: '/home/ubuntu/webinar-backend-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
    },
  },
  */
};

