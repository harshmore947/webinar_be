import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../utils/databaseConnection";
import UserModel from "../models/User.model";

async function createOrUpdateAdmin() {
  await connectDB();

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Password@123";

  const existing = await UserModel.findOne({ email: adminEmail });
  const hashed = await bcrypt.hash(adminPassword, 10);

  if (existing) {
    existing.firstName = process.env.SEED_ADMIN_FIRSTNAME || "Admin";
    existing.lastName = process.env.SEED_ADMIN_LASTNAME || "User";
    existing.role = "Admin" as any;
    existing.passwordHash = hashed;
    await existing.save();
    console.log(`Updated existing admin: ${adminEmail}`);
  } else {
    const user = new UserModel({
      firstName: process.env.SEED_ADMIN_FIRSTNAME || "Admin",
      lastName: process.env.SEED_ADMIN_LASTNAME || "User",
      email: adminEmail,
      password: adminPassword, // some codepaths expect `password` pre-save; we set both to be safe
      passwordHash: hashed,
      role: "Admin",
    } as any);
    await user.save();
    console.log(`Created new admin: ${adminEmail}`);
  }

  await mongoose.connection.close();
}

createOrUpdateAdmin().catch(async (err) => {
  console.error("Admin seed error:", err);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
