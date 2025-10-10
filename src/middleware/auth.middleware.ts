import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JWTPayload {
  id: string;
  role: string;
}

// Extended Request interface with user property
export interface AuthRequest extends Request {
  user?: {
    id: string;
    userId?: string;
    role: string;
  };
}

/**
 * Unified authentication middleware that verifies JWT tokens
 */
export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, msg: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET! as string
    ) as JWTPayload;
    req.user = { id: decoded.id, userId: decoded.id, role: decoded.role };
    next();
  } catch (error) {
    res.status(401).json({ success: false, msg: "Invalid or expired token" });
  }
};

/**
 * Authorization middleware that checks for required roles
 * @param roles - Array of allowed roles
 */
const checkRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        msg: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }

    next();
  };
};

// Role-specific middleware using the unified checkRole function
export const requireAdmin = checkRole(["Admin"]);
export const requireHostOrAdmin = checkRole(["Host", "Admin"]);
