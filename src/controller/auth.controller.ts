import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import UserModel from "../models/User.model";
import { generateToken } from "../utils/generatetoken";
import { sendMail } from "../utils/mailer";
import { generateWelcomeEmailTemplate } from "../utils/emailTemplates";
import { logInfo, logError, logWarn } from "../utils/logger";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite:
    process.env.NODE_ENV === "production"
      ? ("none" as const)
      : ("lax" as const),
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      logWarn(
        `Registration attempt with existing email: ${email} (IP: ${req.ip})`
      );
      return res.status(400).json({
        success: false,
        msg: "Email already in use!",
      });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new UserModel({
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      role,
    });

    await user.save();
    logInfo(`User registered successfully: ${email} (${role})`);

    // Generate JWT token
    const token = generateToken(user._id, user.role);
    res.cookie("token", token, COOKIE_OPTIONS);

    // Send welcome email
    try {
      const emailTemplate = generateWelcomeEmailTemplate({
        firstName,
        role,
        email,
      });
      await sendMail({
        to: email,
        subject: "Welcome to Change Networks Webinar Platform",
        html: emailTemplate,
      });
      logInfo(`Welcome email sent to: ${email}`);
    } catch (emailError) {
      logError(
        `Failed to send welcome email to ${email}:`,
        emailError as Error
      );
    }

    res.status(201).json({
      success: true,
      msg: "User registered successfully",
    });
  } catch (error) {
    logError("Error in registerUser:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error during registration",
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    console.log("📥 Login request received:", {
      body: req.body,
      email: req.body.email,
      hasPassword: !!req.body.password,
      passwordLength: req.body.password?.length,
    });

    const { email, password } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user) {
      logWarn(`Login attempt with invalid email: ${email} (IP: ${req.ip})`);
      return res.status(400).json({
        success: false,
        msg: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      logWarn(
        `Login attempt with invalid password for: ${email} (IP: ${req.ip})`
      );
      return res.status(400).json({
        success: false,
        msg: "Invalid credentials",
      });
    }

    const token = generateToken(user._id, user.role);
    res.cookie("token", token, COOKIE_OPTIONS);

    logInfo(`User logged in: ${email} (${user.role})`);
    res.json({ success: true, msg: "Logged in successfully" });
  } catch (error) {
    logError("Error in loginUser:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite:
        process.env.NODE_ENV === "production"
          ? ("none" as const)
          : ("lax" as const),
    });

    logInfo(`User logged out: ${req.user?.id}`);
    res.json({ success: true, msg: "Logged out successfully" });
  } catch (error) {
    logError("Error in logoutUser:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.user?.id).select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "User not found",
      });
    }

    res.status(200).json(user);
  } catch (error) {
    logError("Error in getProfile:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user) {
      logWarn(
        `Password reset attempt with non-existent email: ${email} (IP: ${req.ip})`
      );
      return res.status(404).json({
        success: false,
        msg: "User not found",
      });
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    user.resetPasswordCode = verificationCode;
    user.resetPasswordCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send verification code email
    await sendMail({
      to: user.email,
      subject: "Password Reset Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hello ${user.firstName},</p>
          <p>Your verification code is: <strong style="font-size: 24px; color: #4361ee;">${verificationCode}</strong></p>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    logInfo(`Password reset email sent to: ${user.email}`);
    res.json({ success: true, msg: "Password reset email sent." });
  } catch (error) {
    logError("Error in forgotPassword:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

export const verifyResetCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    const user = await UserModel.findOne({
      email,
      resetPasswordCode: code,
      resetPasswordCodeExpires: { $gt: new Date() },
    });

    if (!user) {
      logWarn(`Invalid reset code verification for: ${email} (IP: ${req.ip})`);
      return res.status(400).json({
        success: false,
        msg: "Invalid or expired verification code",
      });
    }

    res.json({
      success: true,
      msg: "Verification code confirmed",
      email: user.email,
    });
  } catch (error) {
    logError("Error in verifyResetCode:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, password } = req.body;

    const user = await UserModel.findOne({
      email,
      resetPasswordCode: code,
      resetPasswordCodeExpires: { $gt: new Date() },
    });

    if (!user) {
      logWarn(`Invalid password reset attempt for: ${email} (IP: ${req.ip})`);
      return res.status(400).json({
        success: false,
        msg: "Invalid or expired verification code",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.passwordHash = hashedPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordCodeExpires = undefined;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    logInfo(`Password reset completed for: ${user.email}`);
    res.json({ success: true, msg: "Password has been reset successfully" });
  } catch (error) {
    logError("Error in resetPassword:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

export const searchUsersAll = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        msg: "Search query is required",
      });
    }

    const searchRegex = new RegExp(query, "i");
    const searchCriteria = {
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { role: searchRegex },
      ],
    };

    const users = await UserModel.find(searchCriteria)
      .select("firstName lastName email role")
      .limit(20);

    res.json({
      success: true,
      users,
      count: users.length,
    });
  } catch (error) {
    logError("Error in searchUsersAll:", error as Error);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};
