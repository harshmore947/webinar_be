import { Request, Response, NextFunction } from "express";

/**
 * Middleware to validate query parameters for user search
 */
export const validateSearchQuery = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { query } = req.query;

  // Check if query exists and is a string
  if (!query || typeof query !== "string") {
    return res.status(400).json({
      success: false,
      msg: "Search query is required",
      errors: [
        {
          path: "query",
          message: "Query parameter is required and must be a string",
        },
      ],
    });
  }

  // Check query length
  if (query.length < 1) {
    return res.status(400).json({
      success: false,
      msg: "Search query must not be empty",
      errors: [
        {
          path: "query",
          message: "Query must be at least 1 character long",
        },
      ],
    });
  }

  if (query.length > 100) {
    return res.status(400).json({
      success: false,
      msg: "Search query too long",
      errors: [
        {
          path: "query",
          message: "Query must not exceed 100 characters",
        },
      ],
    });
  }

  // Query is valid, proceed to next middleware
  next();
};

export default validateSearchQuery;
