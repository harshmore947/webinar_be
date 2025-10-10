/**
 * Simplified backend configuration
 */

export const config = {
  // Server configuration
  port: process.env.PORT || 3000,

  // Database
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/webinar_db",

  // JWT
  jwtSecret: process.env.JWT_SECRET || "your-secret-key",
  jwtExpiry: process.env.JWT_EXPIRY || "7d",

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",

  // WebSocket
  websocketPath: "/ws/chat",

  // Chat configuration
  maxMessagesPerRoom: 100,
  heartbeatInterval: 30000, // 30 seconds

  // Rate limiting (if needed later)
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100, // limit each IP to 100 requests per windowMs

  // Environment
  isDevelopment: process.env.NODE_ENV !== "production",
  isProduction: process.env.NODE_ENV === "production",
};
