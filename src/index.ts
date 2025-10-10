import express, { Application, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import http from "http";
import { connectDB } from "./utils/databaseConnection";
import routes from "./route/index";
import logger, { logInfo, logError } from "./utils/logger";
import httpLogger, {
  enhancedHttpLogger,
} from "./middleware/httpLogger.middleware";
import { startAllCronJobs } from "./utils/node-cron";
import { startCacheCleanup } from "./middleware/cache.middleware";
// Import WebSocket setup function
import { initializeSocketIO } from "./socketio";
import { handlePaymentSuccess } from "./controller/stripe.controller";
import { certificateQueue } from "./utils/certificateQueue";
import "dotenv/config";

const app: Application = express();
// Create HTTP server
const server = http.createServer(app);

// Enable trust proxy for accurate IP addresses
app.set("trust proxy", 1);

// Disable X-Powered-By header for security
app.disable("x-powered-by");

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// Compression middleware - compress all responses
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6, // Good balance of speed vs compression
    threshold: 1024, // Only compress responses larger than 1KB
  })
);

// CORS configuration - more restrictive for production
const allowedOrigins = [
  "https://webinar-fe-xi-ruddy.vercel.app",
  process.env.CLIENT_URL?.replace(/\/$/, ""), // Remove trailing slash if present
  process.env.CLIENT_URL, // Keep original with trailing slash if present
  "http://localhost:3000",
  "http://localhost:5173",
  "https://webinar-fe-xi.vercel.app",
  "https://webinar-fe-xi.vercel.app/",
  "https://webinar-fe-xi-ruddy.vercel.app/",
].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // For development, allow any localhost
      if (
        process.env.NODE_ENV !== "production" &&
        origin.includes("localhost")
      ) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// HTTP request logging middleware
app.use(httpLogger);
app.use(enhancedHttpLogger);

// CORS debugging middleware
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    logInfo(`CORS preflight request from origin: ${req.headers.origin}`);
  }
  next();
});

// Stripe webhook endpoint - must be before express.json()
app.post(
  "/api/payment/webhook",
  express.raw({ type: "application/json" }),
  handlePaymentSuccess
);

// Body parsing middleware with limits
app.use(
  express.urlencoded({
    extended: false,
    limit: "10mb", // Prevent large payload attacks
  })
);
app.use(
  express.json({
    limit: "10mb", // Prevent large payload attacks
  })
);
app.use(cookieParser());

// Database connection
connectDB();

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: `${process.uptime().toFixed(2)}s`,
  });
});

// API routes
app.use("/api", routes);

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.send("Webinar Management API is running!");
});

// Global error handler
app.use((error: Error, req: Request, res: Response, next: Function) => {
  logError(`Error on ${req.method} ${req.url}`, error);

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error.message,
  });
});

// 404 handler
app.use("*", (req: Request, res: Response) => {
  logInfo(`404 - Route not found: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 3001;

// Setup WebSocket server
const io = initializeSocketIO(server);

// Start server
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  logInfo(
    `Server started successfully on port ${PORT} (${
      process.env.NODE_ENV || "development"
    })`
  );

  // Initialize certificate queue
  certificateQueue
    .isReady()
    .then(() => {
      logInfo("Certificate queue initialized successfully");
    })
    .catch((error: any) => {
      logError("Failed to initialize certificate queue:", error);
    });

  // Start all cron jobs (reminders + certificates)
  startAllCronJobs();

  // Start cache cleanup process (run every 10 minutes)
  const cacheCleanupInterval = 10 * 60 * 1000; // 10 minutes
  startCacheCleanup(cacheCleanupInterval);
  logInfo(
    `Cache cleanup process started with ${
      cacheCleanupInterval / 60000
    } minute interval`
  );
});

// Set server timeout
server.timeout = 30000; // 30 seconds

// Handle server errors
server.on("error", (error: Error) => {
  logError("Server startup error", error);
});
server.on("error", (error: Error) => {
  logError("Server startup error", error);
});
