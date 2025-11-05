import multer from "multer";
import { Request } from "express";

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter for allowed types
const allowedResourceTypes = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
];

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (allowedResourceTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Allowed types: PDF, JPEG, PNG, WebP, GIF, MP4, and WebM."
      )
    );
  }
};

// Multer configuration
export const uploadResources = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10, // Maximum 10 files at once
  },
});

// Middleware for single file upload
export const uploadSingleResource = uploadResources.single("resource");

// Middleware for multiple file upload
export const uploadMultipleResourceFiles = uploadResources.array(
  "resources",
  10
);

// Certificate template upload configuration
export const uploadCertificateTemplate = multer({
  storage,
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    // Only allow image files for certificate templates
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, JPG, and PNG images are allowed for certificate templates."
        )
      );
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for certificate templates
    files: 1, // Only one template file at a time
  },
}).single("template");

// Thumbnail upload configuration (JPEG/PNG only, 5MB)
export const uploadWebinarThumbnail = multer({
  storage,
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are allowed for thumbnails."));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("thumbnail");

// Recording upload configuration (video files, 500MB)
export const uploadWebinarRecording = multer({
  storage,
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const allowedTypes = [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
      "video/x-msvideo",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files (MP4, WebM, OGG, MOV, AVI) are allowed."));
    }
  },
  limits: { fileSize: 500 * 1024 * 1024, files: 1 }, // 500MB limit
}).single("recording");
