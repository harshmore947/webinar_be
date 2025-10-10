import { Request, Response, NextFunction } from "express";
import WebinarModel from "../models/Webinar.model";

/**
 * Middleware to validate and normalize date formats in webinar requests
 */
export const validateWebinarDates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Only process if there's a date in the request
    if (req.body.date) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.date)) {
        return res.status(400).json({
          success: false,
          msg: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      // If modifying an existing webinar, check the year
      if (req.params.id) {
        try {
          const webinar = await WebinarModel.findById(req.params.id);
          if (webinar) {
            const newDateParts = req.body.date.split("-");
            const newYear = parseInt(newDateParts[0]);
            const currentYear = new Date().getFullYear();

            // If the year is more than 1 year in the past, normalize it to current year
            if (newYear < currentYear - 1) {
              req.body.date = `${currentYear}-${newDateParts[1]}-${newDateParts[2]}`;
              console.log(
                `Normalized date from ${newDateParts.join("-")} to ${req.body.date}`
              );
            }
          }
        } catch (error) {
          console.error(
            "Error checking webinar for date normalization:",
            error
          );
          // Continue with request even if this check fails
        }
      }
    }

    // Validate time format if present
    if (req.body.time && !/^\d{2}:\d{2}(:\d{2})?$/.test(req.body.time)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid time format. Please use HH:MM or HH:MM:SS format.",
      });
    }

    next();
  } catch (error) {
    console.error("Error in validateWebinarDates middleware:", error);
    next();
  }
};
