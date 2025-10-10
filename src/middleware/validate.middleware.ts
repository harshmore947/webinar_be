import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";

export const validate = (schema: ZodSchema<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("🔍 Validation middleware - incoming data:", {
        params: req.params,
        body: req.body,
        query: req.query,
      });

      // Parse the entire request object (params, body, query)
      const validatedData = schema.parse({
        params: req.params,
        body: req.body,
        query: req.query,
      });

      console.log("🔍 Validation middleware - validated data:", validatedData);

      // Assign validated data back to request
      if (validatedData.params) req.params = validatedData.params;
      if (validatedData.body) {
        // If the schema has a body property, extract the nested body data
        if (validatedData.body.body) {
          console.log(
            "🔍 Extracting nested body data:",
            validatedData.body.body
          );
          req.body = validatedData.body.body;
        } else {
          console.log("🔍 Using direct body data:", validatedData.body);
          req.body = validatedData.body;
        }
      }
      if (validatedData.query) req.query = validatedData.query;

      console.log("🔍 Validation middleware - final req.body:", req.body);

      next();
    } catch (error) {
      // Enhanced error handling with logging
      if (error instanceof ZodError) {
        console.log("❌ Validation failed:", {
          requestBody: req.body,
          requestParams: req.params,
          requestQuery: req.query,
          errors: error.issues,
        });

        return res.status(400).json({
          success: false,
          msg: "Validation failed",
          errors: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};
