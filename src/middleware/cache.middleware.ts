import { Request, Response, NextFunction } from "express";
import { logInfo } from "../utils/logger";

interface CacheItem {
  data: any;
  expiry: number;
}

// In-memory cache store
const cacheStore: Map<string, CacheItem> = new Map();

// Cache options interface
interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyFn?: (req: Request) => string; // Function to generate custom cache key
}

/**
 * Generates a cache key from the request
 * @param req Express request object
 * @returns Cache key
 */
const defaultKeyGenerator = (req: Request): string => {
  const method = req.method;
  const url = req.originalUrl || req.url;
  const queryParams = JSON.stringify(req.query);
  const body = req.method === "GET" ? "" : JSON.stringify(req.body);

  // For GET requests, we only care about the URL and query params
  if (method === "GET") {
    return `${method}:${url}:${queryParams}`;
  }

  // For other methods, include the body in the cache key
  return `${method}:${url}:${queryParams}:${body}`;
};

/**
 * Middleware to cache API responses in memory
 * @param options Cache configuration options
 * @returns Express middleware
 */
export const cacheMiddleware = (options: CacheOptions = {}) => {
  const ttl = options.ttl || 300; // Default TTL: 5 minutes (300 seconds)
  const keyFn = options.keyFn || defaultKeyGenerator;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests unless specified in options
    if (req.method !== "GET" && !options.keyFn) {
      return next();
    }

    const key = keyFn(req);
    const now = Date.now();

    // Check if we have a valid cached response
    if (cacheStore.has(key)) {
      const cacheItem = cacheStore.get(key)!;

      // If cache hasn't expired
      if (cacheItem.expiry > now) {
        logInfo(`Cache hit for: ${key}`);
        return res.json(cacheItem.data);
      } else {
        // Clean up expired cache
        cacheStore.delete(key);
        logInfo(`Cache expired for: ${key}`);
      }
    }

    // Store the original res.json method
    const originalJson = res.json;

    // Override res.json method to cache the response
    res.json = function (body: any) {
      // Store in cache
      cacheStore.set(key, {
        data: body,
        expiry: now + ttl * 1000,
      });

      logInfo(`Cache set for: ${key}`);

      // Call the original json method
      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Clear all items from the cache
 */
export const clearCache = (): void => {
  cacheStore.clear();
  logInfo("Cache cleared");
};

/**
 * Clear specific cache entry
 * @param key Cache key to clear
 * @returns boolean indicating if an entry was removed
 */
export const clearCacheKey = (key: string): boolean => {
  const result = cacheStore.delete(key);
  if (result) {
    logInfo(`Cache cleared for key: ${key}`);
  }
  return result;
};

/**
 * Clear cache entries matching a pattern
 * @param pattern String or RegExp to match against cache keys
 */
export const clearCachePattern = (pattern: string | RegExp): void => {
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

  const keysToDelete: string[] = [];
  cacheStore.forEach((_, key) => {
    if (regex.test(key)) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => cacheStore.delete(key));
  logInfo(
    `Cleared ${keysToDelete.length} cache entries matching pattern: ${pattern}`
  );
};

/**
 * Get cache statistics
 * @returns Object with cache statistics
 */
export const getCacheStats = () => {
  const now = Date.now();
  let activeEntries = 0;
  let expiredEntries = 0;

  cacheStore.forEach((item) => {
    if (item.expiry > now) {
      activeEntries++;
    } else {
      expiredEntries++;
    }
  });

  return {
    totalEntries: cacheStore.size,
    activeEntries,
    expiredEntries,
  };
};

/**
 * Periodically clean expired cache entries
 * @param interval Interval in milliseconds (default: 5 minutes)
 */
export const startCacheCleanup = (
  interval: number = 5 * 60 * 1000
): NodeJS.Timeout => {
  return setInterval(() => {
    const now = Date.now();
    let removedCount = 0;

    cacheStore.forEach((item, key) => {
      if (item.expiry <= now) {
        cacheStore.delete(key);
        removedCount++;
      }
    });

    if (removedCount > 0) {
      logInfo(`Cache cleanup: removed ${removedCount} expired entries`);
    }
  }, interval);
};
