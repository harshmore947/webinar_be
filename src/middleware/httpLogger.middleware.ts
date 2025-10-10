import morgan from "morgan";
import { morganStream } from "../utils/logger";

// Simple HTTP logging middleware
const httpLogger = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  { stream: morganStream }
);

// Enhanced logger for development
const enhancedHttpLogger = morgan("combined", {
  stream: morganStream,
  skip: (req, res) =>
    process.env.NODE_ENV === "production" && res.statusCode < 400,
});

export { enhancedHttpLogger };
export default httpLogger;
