import "express";

declare module "express" {
  export interface Request {
    user?: {
      id: string;
      userId?: string;
      role: string;
    };
  }
}
