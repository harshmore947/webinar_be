import { Request, Response } from "express";
import {
  clearCache,
  clearCachePattern,
  getCacheStats,
} from "../middleware/cache.middleware";
import { logInfo } from "../utils/logger";

/**
 * Controller functions for cache management
 */

// Get cache statistics
export const getCacheStatistics = (req: Request, res: Response) => {
  try {
    const stats = getCacheStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: "Failed to retrieve cache statistics",
    });
  }
};

// Clear all cache
export const clearAllCache = (req: Request, res: Response) => {
  try {
    clearCache();

    logInfo(`Cache cleared by admin: ${req.user?.id}`);

    res.json({
      success: true,
      msg: "Cache cleared successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: "Failed to clear cache",
    });
  }
};

// Clear cache by pattern
export const clearCacheByPattern = (req: Request, res: Response) => {
  try {
    const { pattern } = req.body;

    if (!pattern) {
      return res.status(400).json({
        success: false,
        msg: "Pattern is required",
      });
    }

    clearCachePattern(pattern);

    logInfo(`Cache cleared by pattern: ${pattern} by admin: ${req.user?.id}`);

    res.json({
      success: true,
      msg: `Cache entries matching '${pattern}' cleared successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: "Failed to clear cache by pattern",
    });
  }
};
