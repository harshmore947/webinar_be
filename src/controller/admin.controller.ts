import { Request, Response } from "express";
import UserModel from "../models/User.model";
import WebinarModel from "../models/Webinar.model";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { logError, logInfo } from "../utils/logger";
import { sanitizeHtml } from "../utils/sanitizeHtml";
import { combineDateTime } from "../utils/dateTimeUtils";

// Get all users with pagination
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const users = await UserModel.find()
      .select("-passwordHash -resetPasswordToken")
      .skip(skip)
      .limit(limit)
      .sort({ _id: -1 });

    const totalUsers = await UserModel.countDocuments();
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logError(`Error fetching users: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Get user by ID
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await UserModel.findById(id).select(
      "-passwordHash -resetPasswordToken"
    );

    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    res.json({ success: true, user });
  } catch (error) {
    logError(`Error fetching user: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Create new user (admin only)
export const createUser = async (req: Request, res: Response) => {
  try {
    // Handle both cases: direct body data or nested body data
    const userData = req.body.body || req.body;
    const { email, password, firstName, lastName, role } = userData;
    console.log(
      "==========[DEBUG] Incoming req.body:",
      email,
      " ",
      password,
      " ",
      firstName,
      " ",
      lastName
    );

    const existing = await UserModel.findOne({ email });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, msg: "Email already in use!" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = new UserModel({
      email,
      passwordHash: hashed,
      firstName,
      lastName,
      role,
    });

    console.log(user, "===================");

    await user.save();

    const userResponse = {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };

    res.status(201).json({
      success: true,
      msg: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
    logError(`Error creating user: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Update user (admin only)
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log("🔍 updateUser - req.body:", req.body);
    console.log("🔍 updateUser - req.body.body:", req.body.body);

    // Handle both cases: direct body data or nested body data
    const userData = req.body.body || req.body;
    const { email, firstName, lastName, role, password } = userData;
    console.log(
      "[DEBUG]=============",
      email,
      firstName,
      lastName,
      role,
      password
    );
    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ success: false, msg: "Email already in use!" });
      }
    }

    // Update fields
    if (email) user.email = email;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (role) user.role = role;

    // Update password if provided
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      user.passwordHash = hashed;
    }

    await user.save();

    const userResponse = {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };

    res.json({
      success: true,
      msg: "User updated successfully",
      user: userResponse,
    });
  } catch (error) {
    logError(`Error updating user: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Delete user (admin only)
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    // Don't allow deleting the current admin user
    if (user._id.toString() === req.user?.id) {
      return res
        .status(400)
        .json({ success: false, msg: "Cannot delete your own account" });
    }

    await UserModel.findByIdAndDelete(id);

    res.json({ success: true, msg: "User deleted successfully" });
  } catch (error) {
    logError(`Error deleting user: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Get all webinars with pagination
export const getAllWebinars = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const webinars = await WebinarModel.find()
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const totalWebinars = await WebinarModel.countDocuments();
    const totalPages = Math.ceil(totalWebinars / limit);

    res.json({
      success: true,
      webinars,
      pagination: {
        currentPage: page,
        totalPages,
        totalWebinars,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logError(`Error fetching webinars: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Get webinar by ID with all details
export const getWebinarById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const webinar = await WebinarModel.findById(id)
      .populate("hostId", "firstName lastName email")
      .populate("presenters", "firstName lastName email")
      .populate("moderators", "firstName lastName email")
      .populate("enrolledUsers", "firstName lastName email");

    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    res.json({ success: true, webinar });
  } catch (error) {
    logError(`Error fetching webinar: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Delete any webinar (admin only)
export const deleteWebinar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    await WebinarModel.findByIdAndDelete(id);

    res.json({ success: true, msg: "Webinar deleted successfully" });
  } catch (error) {
    logError(`Error deleting webinar: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Get dashboard statistics
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    // Get total counts
    const totalUsers = await UserModel.countDocuments();
    const totalWebinars = await WebinarModel.countDocuments();
    const totalAdmins = await UserModel.countDocuments({ role: "Admin" });
    const totalHosts = await UserModel.countDocuments({ role: "Host" });
    const totalAttendees = await UserModel.countDocuments({ role: "Attendee" });

    // Get recent webinars
    const recentWebinars = await WebinarModel.find()
      .populate("hostId", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title date hostId enrolledUsers");

    // Get recent users
    const recentUsers = await UserModel.find()
      .sort({ _id: -1 })
      .limit(5)
      .select("firstName lastName email role");

    // Get upcoming webinars
    const upcomingWebinars = await WebinarModel.find({
      date: { $gte: new Date() },
    })
      .populate("hostId", "firstName lastName")
      .sort({ date: 1 })
      .limit(5)
      .select("title date hostId enrolledUsers");

    // Calculate enrollment statistics
    const webinarsWithEnrollment = await WebinarModel.aggregate([
      {
        $project: {
          title: 1,
          enrollmentCount: { $size: "$enrolledUsers" },
          maxParticipants: 1,
        },
      },
    ]);

    const totalEnrollments = webinarsWithEnrollment.reduce(
      (sum, webinar) => sum + webinar.enrollmentCount,
      0
    );

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          admins: totalAdmins,
          hosts: totalHosts,
          attendees: totalAttendees,
        },
        webinars: {
          total: totalWebinars,
          totalEnrollments,
        },
        recent: {
          webinars: recentWebinars,
          users: recentUsers,
        },
        upcoming: {
          webinars: upcomingWebinars,
        },
      },
    });
  } catch (error) {
    logError(`Error fetching dashboard stats: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Search users
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { query, role } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    let searchQuery: any = {};

    if (query) {
      searchQuery.$or = [
        { firstName: { $regex: query, $options: "i" } },
        { lastName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ];
    }

    if (role) {
      searchQuery.role = role;
    }

    const users = await UserModel.find(searchQuery)
      .select("-passwordHash -resetPasswordToken")
      .skip(skip)
      .limit(limit)
      .sort({ _id: -1 });

    const totalUsers = await UserModel.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logError(`Error searching users: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Search webinars
export const searchWebinars = async (req: Request, res: Response) => {
  try {
    const { query, category } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    let searchQuery: any = {};

    if (query) {
      searchQuery.$or = [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
        { tags: { $in: [new RegExp(query as string, "i")] } },
      ];
    }

    if (category) {
      searchQuery.category = { $regex: category, $options: "i" };
    }

    const webinars = await WebinarModel.find(searchQuery)
      .populate("hostId", "firstName lastName email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const totalWebinars = await WebinarModel.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalWebinars / limit);

    res.json({
      success: true,
      webinars,
      pagination: {
        currentPage: page,
        totalPages,
        totalWebinars,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logError(`Error searching webinars: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Bulk operations
export const bulkDeleteUsers = async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, msg: "No user IDs provided" });
    }

    // Don't allow deleting the current admin user
    if (userIds.includes(req.user?.id)) {
      return res
        .status(400)
        .json({ success: false, msg: "Cannot delete your own account" });
    }

    const result = await UserModel.deleteMany({ _id: { $in: userIds } });

    res.json({
      success: true,
      msg: `${result.deletedCount} users deleted successfully`,
    });
  } catch (error) {
    logError(`Error bulk deleting users: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

export const bulkDeleteWebinars = async (req: Request, res: Response) => {
  try {
    const { webinarIds } = req.body;

    if (!Array.isArray(webinarIds) || webinarIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, msg: "No webinar IDs provided" });
    }

    const result = await WebinarModel.deleteMany({ _id: { $in: webinarIds } });

    res.json({
      success: true,
      msg: `${result.deletedCount} webinars deleted successfully`,
    });
  } catch (error) {
    logError(`Error bulk deleting webinars: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can create webinar for any host
export const createWebinarAsAdmin = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const { hostId } = req.body;

    // Validate hostId format
    if (!Types.ObjectId.isValid(hostId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid host ID format",
      });
    }

    // Validate hostId exists and has Host role
    const host = await UserModel.findById(hostId);
    if (!host) {
      return res.status(404).json({ success: false, msg: "Host not found" });
    }

    if (host.role !== "Host") {
      return res.status(400).json({
        success: false,
        msg: "Selected user must have Host role",
      });
    }

    // Normalize date and time if they exist
    let processedData = { ...req.body };

    if (req.body.date) {
      // Handle ISO date format or any other format and convert to YYYY-MM-DD
      try {
        const dateObj = new Date(req.body.date);
        if (!isNaN(dateObj.getTime())) {
          processedData.date = dateObj.toISOString().split("T")[0]; // Convert to YYYY-MM-DD
        }
      } catch (e) {
        logInfo(`Could not parse date: ${req.body.date}`);
      }
    }

    if (req.body.time) {
      // Ensure time is in HH:MM format
      try {
        const timeStr = req.body.time.toString();
        // If time includes seconds, remove them
        if (timeStr.includes(":") && timeStr.split(":").length >= 2) {
          const [hours, minutes] = timeStr.split(":");
          processedData.time = `${hours.padStart(2, "0")}:${minutes.padStart(
            2,
            "0"
          )}`;
        }
      } catch (e) {
        logInfo(`Could not parse time: ${req.body.time}`);
      }
    } else if (req.body.date && req.body.date.includes("T")) {
      // Extract time from ISO date string if time is not provided separately
      try {
        const dateObj = new Date(req.body.date);
        if (!isNaN(dateObj.getTime())) {
          const hours = dateObj.getHours().toString().padStart(2, "0");
          const minutes = dateObj.getMinutes().toString().padStart(2, "0");
          processedData.time = `${hours}:${minutes}`;
          processedData.date = dateObj.toISOString().split("T")[0];
        }
      } catch (e) {
        logInfo(`Could not extract time from date: ${req.body.date}`);
      }
    }

    // Sanitize HTML content from rich text editor
    if (processedData.agenda) {
      processedData.agenda = sanitizeHtml(processedData.agenda);
    }

    if (processedData.description) {
      processedData.description = sanitizeHtml(processedData.description);
    }

    if (processedData.productUSPs) {
      processedData.productUSPs = sanitizeHtml(processedData.productUSPs);
    }

    // Create new webinar
    const webinar = new WebinarModel({
      hostId: processedData.hostId,
      title: processedData.title,
      category: processedData.category,
      description: processedData.description,
      youtubeLiveURL: processedData.youtubeLiveURL,
      productUSPs: processedData.productUSPs,
      agenda: processedData.agenda,
      tags: processedData.tags || [],
      date: processedData.date,
      time: processedData.time,
      timezone: processedData.timezone,
      isRecurring: processedData.isRecurring || false,
      recurringType: processedData.recurringType,
      customRecurring: processedData.customRecurring,
      presenters: processedData.presenters || [],
      moderators: processedData.moderators || [],
      resources: processedData.resources || [],
      enableQA:
        processedData.enableQA !== undefined ? processedData.enableQA : true,
      enablePolls:
        processedData.enablePolls !== undefined
          ? processedData.enablePolls
          : true,
      maxParticipants: processedData.maxParticipants || "100",
      isPublic:
        processedData.isPublic !== undefined ? processedData.isPublic : false,
      createdAt: new Date(),
      updatedAt: new Date(),
      enrolledUsers: [],
    });

    await webinar.save();

    logInfo(`Admin created webinar: ${webinar.title} for host: ${hostId}`);

    res.status(201).json({
      success: true,
      msg: "Webinar created successfully",
      webinar,
    });
  } catch (error) {
    logError(`Admin webinar creation error: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can update any webinar
export const updateWebinarAsAdmin = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const { id } = req.params;

    // Validate webinarId format
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    // Check if webinar exists
    const webinar = await WebinarModel.findById(id);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Normalize date and time if they exist
    let processedData = { ...req.body };

    if (req.body.date) {
      // Handle ISO date format or any other format and convert to YYYY-MM-DD
      try {
        const dateObj = new Date(req.body.date);
        if (!isNaN(dateObj.getTime())) {
          processedData.date = dateObj.toISOString().split("T")[0]; // Convert to YYYY-MM-DD
        }
      } catch (e) {
        logInfo(`Could not parse date: ${req.body.date}`);
      }
    }

    if (req.body.time) {
      // Ensure time is in HH:MM format
      try {
        const timeStr = req.body.time.toString();
        // If time includes seconds, remove them
        if (timeStr.includes(":") && timeStr.split(":").length >= 2) {
          const [hours, minutes] = timeStr.split(":");
          processedData.time = `${hours.padStart(2, "0")}:${minutes.padStart(
            2,
            "0"
          )}`;
        }
      } catch (e) {
        logInfo(`Could not parse time: ${req.body.time}`);
      }
    }

    // Sanitize HTML content from rich text editor
    if (processedData.agenda) {
      processedData.agenda = sanitizeHtml(processedData.agenda);
    }

    if (processedData.description) {
      processedData.description = sanitizeHtml(processedData.description);
    }

    if (processedData.productUSPs) {
      processedData.productUSPs = sanitizeHtml(processedData.productUSPs);
    }

    // If changing host, verify new host exists and has Host role
    if (
      processedData.hostId &&
      processedData.hostId !== webinar.hostId.toString()
    ) {
      if (!Types.ObjectId.isValid(processedData.hostId)) {
        return res.status(400).json({
          success: false,
          msg: "Invalid host ID format",
        });
      }

      const host = await UserModel.findById(processedData.hostId);
      if (!host) {
        return res.status(404).json({
          success: false,
          msg: "Host user not found",
        });
      }

      if (host.role !== "Host") {
        return res.status(400).json({
          success: false,
          msg: "Selected user must have Host role",
        });
      }
    }

    // Update the webinar with processed data
    const updatedWebinar = await WebinarModel.findByIdAndUpdate(
      id,
      {
        ...processedData,
        updatedAt: new Date(),
      },
      { new: true }
    );

    logInfo(`Admin updated webinar: ${id}`);

    res.json({
      success: true,
      msg: "Webinar updated successfully",
      webinar: updatedWebinar,
    });
  } catch (error) {
    logError(`Admin webinar update error: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can promote a user to Host role
export const promoteToHost = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    // Check if user is already a Host
    if (user.role === "Host") {
      return res
        .status(400)
        .json({ success: false, msg: "User is already a Host" });
    }

    // Update role to Host
    user.role = "Host";
    await user.save();

    logInfo(`Admin promoted user ${userId} to Host role`);

    res.json({
      success: true,
      msg: "User promoted to Host successfully",
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logError(`Error promoting user to Host: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can demote a Host to Attendee role
export const demoteFromHost = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    // Check if user is a Host
    if (user.role !== "Host") {
      return res
        .status(400)
        .json({ success: false, msg: "User is not a Host" });
    }

    // Check if user has active webinars
    const userWebinars = await WebinarModel.find({ hostId: userId });
    if (userWebinars.length > 0) {
      return res.status(400).json({
        success: false,
        msg: "Cannot demote user with active webinars. Please reassign or delete their webinars first.",
        webinarCount: userWebinars.length,
      });
    }

    // Update role to Attendee
    user.role = "Attendee";
    await user.save();

    logInfo(`Admin demoted user ${userId} from Host to Attendee role`);

    res.json({
      success: true,
      msg: "User demoted from Host successfully",
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logError(`Error demoting user from Host: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can reassign webinars from one host to another
export const reassignWebinars = async (req: Request, res: Response) => {
  try {
    const { fromHostId, toHostId } = req.body;

    if (!fromHostId || !toHostId) {
      return res.status(400).json({
        success: false,
        msg: "Both fromHostId and toHostId are required",
      });
    }

    // Verify both users exist and toHost is a Host
    const fromHost = await UserModel.findById(fromHostId);
    const toHost = await UserModel.findById(toHostId);

    if (!fromHost) {
      return res
        .status(404)
        .json({ success: false, msg: "Source host not found" });
    }

    if (!toHost) {
      return res
        .status(404)
        .json({ success: false, msg: "Target host not found" });
    }

    if (toHost.role !== "Host") {
      return res
        .status(400)
        .json({ success: false, msg: "Target user is not a Host" });
    }

    // Update all webinars from fromHostId to toHostId
    const result = await WebinarModel.updateMany(
      { hostId: fromHostId },
      { $set: { hostId: toHostId, updatedAt: new Date() } }
    );

    logInfo(
      `Admin reassigned ${result.modifiedCount} webinars from host ${fromHostId} to ${toHostId}`
    );

    res.json({
      success: true,
      msg: `${result.modifiedCount} webinars reassigned successfully`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    logError(`Error reassigning webinars: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can assign a presenter to a webinar
export const assignPresenter = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const { webinarId, presenterId } = req.body;

    // Validate IDs format
    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    if (!Types.ObjectId.isValid(presenterId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid presenter ID format",
      });
    }

    // Check if webinar and presenter exist
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    const presenter = await UserModel.findById(presenterId);
    if (!presenter) {
      return res.status(404).json({
        success: false,
        msg: "Presenter user not found",
      });
    }

    // Check if presenter is already assigned
    if (webinar.presenters.some((p) => p.toString() === presenterId)) {
      return res.status(400).json({
        success: false,
        msg: "User is already a presenter for this webinar",
      });
    }

    // Add presenter to webinar
    webinar.presenters.push(presenterId);
    webinar.updatedAt = new Date();

    await webinar.save();

    logInfo(
      `Admin assigned user ${presenterId} as presenter for webinar ${webinarId}`
    );

    res.json({
      success: true,
      msg: "Presenter assigned successfully",
      webinar,
    });
  } catch (error) {
    logError(`Error assigning presenter: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can remove a presenter from a webinar
export const removePresenter = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const { webinarId, presenterId } = req.body;

    // Validate IDs format
    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    if (!Types.ObjectId.isValid(presenterId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid presenter ID format",
      });
    }

    // Check if webinar exists
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if presenter is assigned
    if (!webinar.presenters.some((p) => p.toString() === presenterId)) {
      return res.status(400).json({
        success: false,
        msg: "User is not a presenter for this webinar",
      });
    }

    // Remove presenter from webinar
    webinar.presenters = webinar.presenters.filter(
      (p) => p.toString() !== presenterId
    );
    webinar.updatedAt = new Date();

    await webinar.save();

    logInfo(
      `Admin removed user ${presenterId} as presenter from webinar ${webinarId}`
    );

    res.json({
      success: true,
      msg: "Presenter removed successfully",
      webinar,
    });
  } catch (error) {
    logError(`Error removing presenter: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can assign a moderator to a webinar
export const assignModerator = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const { webinarId, moderatorId } = req.body;

    // Validate IDs format
    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    if (!Types.ObjectId.isValid(moderatorId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid moderator ID format",
      });
    }

    // Check if webinar and moderator exist
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    const moderator = await UserModel.findById(moderatorId);
    if (!moderator) {
      return res.status(404).json({
        success: false,
        msg: "Moderator user not found",
      });
    }

    // Check if moderator is already assigned
    if (webinar.moderators.some((m) => m.toString() === moderatorId)) {
      return res.status(400).json({
        success: false,
        msg: "User is already a moderator for this webinar",
      });
    }

    // Add moderator to webinar
    webinar.moderators.push(moderatorId);
    webinar.updatedAt = new Date();

    await webinar.save();

    logInfo(
      `Admin assigned user ${moderatorId} as moderator for webinar ${webinarId}`
    );

    res.json({
      success: true,
      msg: "Moderator assigned successfully",
      webinar,
    });
  } catch (error) {
    logError(`Error assigning moderator: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can remove a moderator from a webinar
export const removeModerator = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const { webinarId, moderatorId } = req.body;

    // Validate IDs format
    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    if (!Types.ObjectId.isValid(moderatorId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid moderator ID format",
      });
    }

    // Check if webinar exists
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Check if moderator is assigned
    if (!webinar.moderators.some((m) => m.toString() === moderatorId)) {
      return res.status(400).json({
        success: false,
        msg: "User is not a moderator for this webinar",
      });
    }

    // Remove moderator from webinar
    webinar.moderators = webinar.moderators.filter(
      (m) => m.toString() !== moderatorId
    );
    webinar.updatedAt = new Date();

    await webinar.save();

    logInfo(
      `Admin removed user ${moderatorId} as moderator from webinar ${webinarId}`
    );

    res.json({
      success: true,
      msg: "Moderator removed successfully",
      webinar,
    });
  } catch (error) {
    logError(`Error removing moderator: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Admin can set a webinar's visibility (public/private)
export const setWebinarVisibility = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required",
      });
    }

    const { webinarId, isPublic } = req.body;

    // Validate webinarId format
    if (!Types.ObjectId.isValid(webinarId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid webinar ID format",
      });
    }

    // Check if isPublic is a boolean
    if (typeof isPublic !== "boolean") {
      return res.status(400).json({
        success: false,
        msg: "isPublic must be a boolean value",
      });
    }

    // Check if webinar exists
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Update webinar visibility
    webinar.isPublic = isPublic;
    webinar.updatedAt = new Date();

    await webinar.save();

    logInfo(
      `Admin set webinar ${webinarId} visibility to ${
        isPublic ? "public" : "private"
      }`
    );

    res.json({
      success: true,
      msg: `Webinar is now ${isPublic ? "public" : "private"}`,
      webinar,
    });
  } catch (error) {
    logError(`Error setting webinar visibility: ${(error as Error).message}`);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};
