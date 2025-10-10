import { Request, Response } from "express";
import ChatModel from "../models/Chat.model";
import WebinarModel from "../models/Webinar.model";
import { logError, logInfo } from "../utils/logger";

// Send a new chat message
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { webinarId, message } = req.body;
    const userId = req.user?.id;

    // Verify the webinar exists
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Create new chat message
    const newMessage = new ChatModel({
      webinarId,
      userId,
      message,
      timestamp: new Date(),
    });

    await newMessage.save();

    logInfo(
      `Chat message sent - User: ${userId}, Webinar: ${webinarId}, MessageID: ${newMessage._id}`
    );

    // Return success with the created message
    return res.status(201).json({
      success: true,
      msg: "Message sent",
      chat: await ChatModel.findById(newMessage._id).populate(
        "userId",
        "firstName lastName email profileImage"
      ),
    });
  } catch (error) {
    logError(`Send chat message error: ${(error as Error).message}`);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

// Get chat messages for a webinar
export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const { limit = 50, before } = req.query;

    // Verify the webinar exists
    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Webinar not found",
      });
    }

    // Build query
    let query: any = {
      webinarId,
      isDeleted: false,
    };

    // Add pagination based on timestamp if 'before' is provided
    if (before) {
      query.timestamp = { $lt: new Date(before as string) };
    }

    // Get messages
    const messages = await ChatModel.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .populate("userId", "firstName lastName email profileImage")
      .lean();

    // Format messages for frontend consumption
    const formattedMessages = messages.reverse().map((msg) => ({
      id: msg._id.toString(),
      content: msg.message,
      timestamp: msg.timestamp,
      sender: {
        id: msg.userId?._id?.toString() || "anonymous",
        name: msg.userId
          ? `${(msg.userId as any).firstName} ${
              (msg.userId as any).lastName
            }`.trim()
          : msg.displayName || "Anonymous",
      },
      isDeleted: msg.isDeleted,
      isModerated: msg.isModerated,
    }));

    return res.json({
      success: true,
      messages: formattedMessages, // Send in chronological order with proper format
    });
  } catch (error) {
    logError(
      `Get chat messages error: ${(error as Error).message} for webinar: ${
        req.params.webinarId
      }`
    );
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

// Delete a chat message (only for message owner, moderators, or host)
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    const message = await ChatModel.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        msg: "Message not found",
      });
    }

    // Get the webinar to check if user is host/moderator
    const webinar = await WebinarModel.findById(message.webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Associated webinar not found",
      });
    }

    // Check if user has permission (own message, moderator, or host)
    const isOwner = message.userId.toString() === userId;
    const isHost = webinar.hostId.toString() === userId;
    const isModerator = webinar.moderators.some(
      (id) => id.toString() === userId
    );

    if (!(isOwner || isHost || isModerator)) {
      return res.status(403).json({
        success: false,
        msg: "You don't have permission to delete this message",
      });
    }

    // Soft delete the message
    message.isDeleted = true;
    await message.save();

    const deletedBy = isOwner ? "owner" : isHost ? "host" : "moderator";
    logInfo(
      `Chat message deleted - User: ${userId}, Webinar: ${message.webinarId}, MessageID: ${messageId}, DeletedBy: ${deletedBy}`
    );

    return res.json({
      success: true,
      msg: "Message deleted successfully",
    });
  } catch (error) {
    logError(
      `Delete chat message error: ${(error as Error).message} for messageID: ${
        req.params.messageId
      }`
    );
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};

// Moderate a message (mark as reviewed)
export const moderateMessage = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    const message = await ChatModel.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        msg: "Message not found",
      });
    }

    // Get the webinar to check if user is host/moderator
    const webinar = await WebinarModel.findById(message.webinarId);
    if (!webinar) {
      return res.status(404).json({
        success: false,
        msg: "Associated webinar not found",
      });
    }

    // Check if user has permission (moderator or host)
    const isHost = webinar.hostId.toString() === userId;
    const isModerator = webinar.moderators.some(
      (id) => id.toString() === userId
    );

    if (!(isHost || isModerator)) {
      return res.status(403).json({
        success: false,
        msg: "You don't have permission to moderate messages",
      });
    }

    // Mark the message as moderated
    message.isModerated = true;
    await message.save();

    return res.json({
      success: true,
      msg: "Message moderated successfully",
    });
  } catch (error) {
    logError(
      `Moderate chat message error: ${
        (error as Error).message
      } for messageID: ${req.params.messageId}`
    );
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
};
