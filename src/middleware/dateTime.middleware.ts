import { Request, Response, NextFunction } from "express";
import {
  normalizeDate,
  normalizeTime,
  validateDateNotPast,
} from "../utils/dateTimeUtils";

/**
 * Middleware to validate and normalize date and time fields in request body
 * This middleware checks if date and time are valid and not in the past
 */
export const validateDateTimeFields = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { date, time } = req.body;

    // Skip validation if date or time fields are not present
    if (!date || !time) {
      return next();
    }

    // Normalize date and time
    const normalizedDate = normalizeDate(date);
    const normalizedTime = normalizeTime(time);

    // Check if normalization failed
    if (!normalizedDate) {
      return res.status(400).json({
        success: false,
        msg: "Invalid date format. Please use YYYY-MM-DD format.",
        field: "date",
        value: date,
      });
    }

    if (!normalizedTime) {
      return res.status(400).json({
        success: false,
        msg: "Invalid time format. Please use HH:MM format.",
        field: "time",
        value: time,
      });
    }

    // Check if date is not in the past (with 60 minutes grace period)
    const errorMessage = validateDateNotPast(
      normalizedDate,
      normalizedTime,
      60
    );
    if (errorMessage) {
      return res.status(400).json({
        success: false,
        msg: errorMessage,
        fields: { date, time },
      });
    }

    // Update request body with normalized values
    req.body.date = normalizedDate;
    req.body.time = normalizedTime;

    // Log the normalization for debugging
    if (date !== normalizedDate || time !== normalizedTime) {
      console.log(
        `Date/time normalized: ${date}/${time} -> ${normalizedDate}/${normalizedTime}`
      );
    }

    next();
  } catch (error) {
    console.error("Error in date/time validation middleware:", error);
    return res.status(500).json({
      success: false,
      msg: "Server error during date/time validation",
    });
  }
};

export default validateDateTimeFields;
