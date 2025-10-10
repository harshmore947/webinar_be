import mongoose from "mongoose";
import { logInfo, logError } from "./logger";

export const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URL;

    if (!mongoUri) {
      throw new Error("MONGO_URL environment variable is not defined");
    }

    const options = {
      // Connection settings for better performance and reliability
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    await mongoose.connect(mongoUri, options);

    logInfo("✅ MongoDB connected successfully");

    // Handle connection events
    mongoose.connection.on("disconnected", () => {
      logError("❌ MongoDB disconnected");
    });

    mongoose.connection.on("error", (error) => {
      logError("❌ MongoDB connection error:", error);
    });

    mongoose.connection.on("reconnected", () => {
      logInfo("🔄 MongoDB reconnected");
    });
  } catch (error) {
    logError("❌ MongoDB connection failed:", error as Error);
    // Exit process with failure
    process.exit(1);
  }
};

export default connectDB;
