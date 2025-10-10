import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";

export const validateQuery = (schema: ZodSchema<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate req.query instead of req.body
      schema.parse({ query: req.query });
      next();
    } catch (error) {
      //error handling for zod
      if (error instanceof ZodError) {
        const errors = error.issues.map((e: any) => ({
          path: e.path.join("."),
          message: e.message,
        }));
        return res.status(400).json({
          success: false,
          msg: "validation error",
          errors,
        });
      }
      next(error);
    }
  };
};
