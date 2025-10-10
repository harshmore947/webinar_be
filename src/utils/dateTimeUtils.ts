/**
 * Utility functions for handling date and time operations
 */

/**
 * Normalizes a date string to YYYY-MM-DD format
 * @param dateString Any valid date string
 * @returns Normalized date string in YYYY-MM-DD format or null if invalid
 */
export const normalizeDate = (dateString: string): string | null => {
  try {
    if (!dateString) return null;

    // Check if already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;

    // Try to parse the date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;

    // Extract year, month, and day
    const year = date.getFullYear();
    // Ensure year is reasonable (between 2000 and 2100)
    if (year < 2000 || year > 2100) return null;

    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error normalizing date:", error);
    return null;
  }
};

/**
 * Normalizes a time string to HH:MM format
 * @param timeString Any valid time string
 * @returns Normalized time string in HH:MM format or null if invalid
 */
export const normalizeTime = (timeString: string): string | null => {
  try {
    if (!timeString) return null;

    // Check if already in HH:MM format
    if (/^\d{2}:\d{2}$/.test(timeString)) return timeString;

    // Try to extract hours and minutes from various formats
    let hours: number;
    let minutes: number;

    // Handle formats like "15:30", "3:30 PM", etc.
    const timeMatch = timeString.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);

    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      minutes = parseInt(timeMatch[2]);

      // Handle AM/PM if present
      if (timeMatch[3] && timeMatch[3].toUpperCase() === "PM" && hours < 12) {
        hours += 12;
      } else if (
        timeMatch[3] &&
        timeMatch[3].toUpperCase() === "AM" &&
        hours === 12
      ) {
        hours = 0;
      }
    } else {
      // Try parsing as a date and extracting time
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return null;

      hours = date.getHours();
      minutes = date.getMinutes();
    }

    // Validate hours and minutes
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    // Format to HH:MM
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  } catch (error) {
    console.error("Error normalizing time:", error);
    return null;
  }
};

/**
 * Combines date and time strings into a single Date object
 * @param dateStr Date in YYYY-MM-DD format
 * @param timeStr Time in HH:MM format
 * @returns Combined Date object or null if invalid
 */
export const combineDateTime = (
  dateStr: string,
  timeStr: string
): Date | null => {
  try {
    // Normalize inputs first
    const normalizedDate = normalizeDate(dateStr);
    const normalizedTime = normalizeTime(timeStr);

    if (!normalizedDate || !normalizedTime) return null;

    // Combine date and time
    const [year, month, day] = normalizedDate.split("-").map(Number);
    const [hours, minutes] = normalizedTime.split(":").map(Number);

    // JavaScript months are 0-indexed
    const combinedDate = new Date(year, month - 1, day, hours, minutes);

    // Validate the result
    if (isNaN(combinedDate.getTime())) return null;

    return combinedDate;
  } catch (error) {
    console.error("Error combining date and time:", error);
    return null;
  }
};

/**
 * Checks if a date is in the past (with an optional grace period)
 * @param date Date to check
 * @param graceMinutes Minutes of grace period (default: 0)
 * @returns true if date is in the past (beyond grace period), false otherwise
 */
export const isDatePast = (date: Date, graceMinutes: number = 0): boolean => {
  const now = new Date();
  const graceMilliseconds = graceMinutes * 60 * 1000;

  // Add grace period to the date being checked
  const effectiveDate = new Date(date.getTime() + graceMilliseconds);

  return effectiveDate < now;
};

/**
 * Validates that a date is not in the past
 * @param dateStr Date string in YYYY-MM-DD format
 * @param timeStr Time string in HH:MM format
 * @param graceMinutes Minutes of grace period (default: 60)
 * @returns Error message if invalid, empty string if valid
 */
export const validateDateNotPast = (
  dateStr: string,
  timeStr: string,
  graceMinutes: number = 60
): string => {
  const combinedDate = combineDateTime(dateStr, timeStr);

  if (!combinedDate) {
    return "Invalid date or time format";
  }

  if (isDatePast(combinedDate, graceMinutes)) {
    return "Webinar date and time must be in the future";
  }

  return ""; // No error
};
