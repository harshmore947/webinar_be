import rateLimit, { Options } from "express-rate-limit";

export const createRateLimiter = (options?: Partial<Options>) => {
  // In development, use much higher limits to avoid blocking
  const isDevelopment =
    process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

  return rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isDevelopment ? 1000 : 5, // Much higher limit in development
    message: {
      msg: "Too many request. please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
};
