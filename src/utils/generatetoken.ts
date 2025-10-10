import jwt from "jsonwebtoken";
import { Types } from "mongoose";

export const generateToken = (id: Types.ObjectId, role: string) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET! as string, {
    expiresIn: "7d",
  });
};
