import { Types } from "mongoose";

// Available database fields that can be used in certificates
export interface AvailableField {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "email";
  category: "webinar" | "user" | "system";
  description: string;
}

// Certificate field mapping with visual positioning
export interface CertificateFieldMapping {
  fieldKey: string; // Key from available fields (e.g., "title", "userName", "date")
  label: string; // Display label
  position: {
    x: number; // X coordinate in pixels
    y: number; // Y coordinate in pixels
  };
  style: {
    fontSize: number;
    fontColor: string;
    fontFamily: string;
    fontWeight: "normal" | "bold" | "light";
    alignment: "left" | "center" | "right";
    rotation?: number;
  };
  format?: string; // For dates and numbers (e.g., "MM/DD/YYYY", "$0,0.00")
}

// Certificate configuration stored in webinar
export interface CertificateConfiguration {
  enabled: boolean;
  templateUrl: string; // Cloudinary URL of uploaded template
  templatePublicId: string; // Cloudinary public ID for deletion
  selectedFields: string[]; // Array of field keys selected from available fields
  fieldMappings: CertificateFieldMapping[]; // Visual mapping of fields
  dimensions: {
    width: number;
    height: number;
  };
  autoGenerate: boolean; // Auto-generate after webinar ends
  requireAttendance: boolean; // Only for users who attended
  minimumDuration?: number; // Minimum attendance duration in minutes
}

// Data structure for generating individual certificate
export interface CertificateGenerationData {
  webinarId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  fieldData: Record<string, string | number>; // Dynamic field values
  certificateNumber: string;
}

// Available webinar and user fields for certificate generation
export const AVAILABLE_CERTIFICATE_FIELDS: AvailableField[] = [
  // User fields
  {
    key: "userName",
    label: "User Full Name",
    type: "text",
    category: "user",
    description: "Enrolled user's full name (firstName + lastName)",
  },
  {
    key: "userFirstName",
    label: "User First Name",
    type: "text",
    category: "user",
    description: "Enrolled user's first name only",
  },
  {
    key: "userLastName",
    label: "User Last Name",
    type: "text",
    category: "user",
    description: "Enrolled user's last name only",
  },
  {
    key: "userEmail",
    label: "User Email",
    type: "email",
    category: "user",
    description: "Enrolled user's email address",
  },

  // Webinar fields
  {
    key: "title",
    label: "Webinar Title",
    type: "text",
    category: "webinar",
    description: "Title of the webinar",
  },
  {
    key: "description",
    label: "Webinar Description",
    type: "text",
    category: "webinar",
    description: "Description of the webinar",
  },
  {
    key: "category",
    label: "Webinar Category",
    type: "text",
    category: "webinar",
    description: "Category of the webinar",
  },
  {
    key: "date",
    label: "Webinar Date",
    type: "date",
    category: "webinar",
    description: "Date when the webinar was held",
  },
  {
    key: "time",
    label: "Webinar Time",
    type: "text",
    category: "webinar",
    description: "Time when the webinar started",
  },
  {
    key: "duration",
    label: "Webinar Duration",
    type: "text",
    category: "webinar",
    description: "Duration of the webinar",
  },
  {
    key: "hostName",
    label: "Host Name",
    type: "text",
    category: "webinar",
    description: "Name of the webinar host",
  },

  // System fields
  {
    key: "certificateNumber",
    label: "Certificate Number",
    type: "text",
    category: "system",
    description: "Unique certificate identification number",
  },
  {
    key: "completionDate",
    label: "Completion Date",
    type: "date",
    category: "system",
    description: "Date when the certificate was generated",
  },
  {
    key: "currentDate",
    label: "Current Date",
    type: "date",
    category: "system",
    description: "Today's date",
  },
];
