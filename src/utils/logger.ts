import winston, { format } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Simple console format
const consoleFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.colorize({ all: true }),
  format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Simple file format
const fileFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Create file transports
const transports: winston.transport[] = [
  // General app logs
  new DailyRotateFile({
    filename: path.join(logsDir, "app-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "7d",
    format: fileFormat,
  }),

  // Error logs only
  new DailyRotateFile({
    filename: path.join(logsDir, "error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "14d",
    format: fileFormat,
    level: "error",
  }),
];

// Add console output for development
if (process.env.NODE_ENV !== "production") {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transports,
  exitOnError: false,
});

// Simple logging functions
export const logError = (message: string, error?: Error) => {
  logger.error(error ? `${message}: ${error.message}` : message);
};

export const logInfo = (message: string) => {
  logger.info(message);
};

export const logWarn = (message: string) => {
  logger.warn(message);
};

export const logDebug = (message: string) => {
  logger.debug(message);
};

// Stream for HTTP logging middleware
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

export default logger;
