import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import WebinarModel from "./models/Webinar.model";
import ChatModel from "./models/Chat.model";
import UserModel from "./models/User.model";
import { logInfo, logError } from "./utils/logger";
import jwt from "jsonwebtoken";

interface ChatUser {
  id: string;
  name: string;
  isHost: boolean;
  isModerator: boolean;
  isPresenter: boolean;
  isAuthenticated: boolean;
}

interface SocketData {
  userId?: string;
  webinarId?: string;
  user?: ChatUser;
}

export function setupWebSocketServer(server: HTTPServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: [
        "https://webinar-fe-xi-ruddy.vercel.app",

        process.env.CLIENT_URL || "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
    // CRITICAL FIX: Start with polling for better Render compatibility
    transports: ["polling", "websocket"],
  });

  // Middleware for authentication (optional)
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace("Bearer ", "");

      if (token && token !== "null" && token !== "undefined") {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        const user = await UserModel.findById(decoded.id).select(
          "firstName lastName email role"
        );

        if (user) {
          (socket as any).userId = user._id.toString();
          (socket as any).user = {
            id: user._id.toString(),
            name: `${user.firstName} ${user.lastName}`.trim() || user.email,
            email: user.email,
            role: user.role,
          };
        }
      }
      next();
    } catch (error) {
      // Continue without authentication for anonymous users
      next();
    }
  });

  io.on("connection", (socket) => {
    logInfo(`New socket connection: ${socket.id}`);

    // Join webinar room
    socket.on(
      "join_webinar",
      async (data: { webinarId: string; displayName?: string }) => {
        try {
          const { webinarId, displayName } = data;

          // Validate webinar exists
          const webinar =
            await WebinarModel.findById(webinarId).populate(
              "hostId moderators presenters"
            );
          if (!webinar) {
            socket.emit("error", { message: "Webinar not found" });
            return;
          }

          // Check if webinar is accessible (public or user has access)
          const authenticatedUser = (socket as any).user;
          const isHost =
            authenticatedUser &&
            webinar.hostId._id.toString() === authenticatedUser.id;
          const isModerator =
            authenticatedUser &&
            webinar.moderators.some(
              (mod: any) => mod._id.toString() === authenticatedUser.id
            );
          const isPresenter =
            authenticatedUser &&
            webinar.presenters?.some(
              (presenter: any) =>
                presenter._id.toString() === authenticatedUser.id
            );
          const isAdmin = authenticatedUser?.role === "Admin";
          
          // Check if user is enrolled (for paid webinars)
          const isEnrolled =
            authenticatedUser &&
            webinar.enrolledUsers?.some(
              (enrolledUserId: any) =>
                enrolledUserId.toString() === authenticatedUser.id
            );

          // Check access to private webinar
          if (!webinar.isPublic && !isHost && !isModerator && !isPresenter && !isAdmin && !isEnrolled) {
            socket.emit("error", { message: "This webinar is private. You don't have access." });
            return;
          }

          // Store user info in socket
          (socket as any).webinarId = webinarId;
          const chatUser: ChatUser = {
            id: authenticatedUser?.id || socket.id,
            name: authenticatedUser?.name || displayName || "Anonymous",
            isHost: isHost || false,
            isModerator: isModerator || false,
            isPresenter: isPresenter || false,
            isAuthenticated: !!authenticatedUser,
          };
          (socket as any).chatUser = chatUser;

          // Join the webinar room
          socket.join(webinarId);

          logInfo(`User ${chatUser.name} joined webinar ${webinarId}`);

          // Send chat history
          const chatHistory = await ChatModel.find({
            webinarId,
            isDeleted: false,
          })
            .sort({ timestamp: -1 })
            .limit(100)
            .populate("userId", "firstName lastName email")
            .lean();

          const formattedHistory = chatHistory.reverse().map((msg: any) => ({
            id: msg._id.toString(),
            content: msg.message,
            timestamp: msg.timestamp,
            sender: {
              id: msg.userId?._id?.toString() || "anonymous",
              name: msg.userId
                ? `${msg.userId.firstName} ${msg.userId.lastName}`.trim()
                : msg.displayName || "Anonymous",
            },
            isDeleted: msg.isDeleted,
            isModerated: msg.isModerated,
          }));

          socket.emit("chat_history", { messages: formattedHistory });

          // Notify others about user joining
          socket.to(webinarId).emit("user_joined", {
            user: {
              id: chatUser.id,
              name: chatUser.name,
              isHost: chatUser.isHost,
              isModerator: chatUser.isModerator,
            },
          });

          // Send success response
          socket.emit("joined_webinar", {
            success: true,
            webinarId,
            user: chatUser,
          });
        } catch (error) {
          logError(`Error joining webinar: ${(error as Error).message}`);
          socket.emit("error", { message: "Failed to join webinar" });
        }
      }
    );

    // Handle chat messages
    socket.on("send_message", async (data: { content: string }) => {
      try {
        const { content } = data;
        const webinarId = (socket as any).webinarId;
        const chatUser = (socket as any).chatUser;

        if (!webinarId || !chatUser) {
          socket.emit("error", { message: "You must join a webinar first" });
          return;
        }

        if (!content || content.trim().length === 0) {
          socket.emit("error", { message: "Message cannot be empty" });
          return;
        }

        if (content.length > 500) {
          socket.emit("error", {
            message: "Message too long (max 500 characters)",
          });
          return;
        }

        // Save message to database
        const newChatMessage = new ChatModel({
          webinarId,
          userId: chatUser.isAuthenticated ? chatUser.id : null,
          message: content.trim(),
          timestamp: new Date(),
          displayName: chatUser.isAuthenticated ? null : chatUser.name,
          isDeleted: false,
          isModerated: false,
        });

        await newChatMessage.save();

        // Prepare message for broadcast
        const messageToSend = {
          id: (newChatMessage._id as any).toString(),
          content: newChatMessage.message,
          timestamp: newChatMessage.timestamp,
          sender: {
            id: chatUser.id,
            name: chatUser.name,
          },
          isDeleted: false,
          isModerated: false,
        };

        // Broadcast to all users in the webinar room
        io.to(webinarId).emit("new_message", messageToSend);

        logInfo(`Message sent in webinar ${webinarId} by ${chatUser.name}`);
      } catch (error) {
        logError(`Error sending message: ${(error as Error).message}`);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Handle message deletion (only for message sender, host, or moderator)
    socket.on("delete_message", async (data: { messageId: string }) => {
      try {
        const { messageId } = data;
        const webinarId = (socket as any).webinarId;
        const chatUser = (socket as any).chatUser;

        if (!webinarId || !chatUser) {
          socket.emit("error", { message: "You must join a webinar first" });
          return;
        }

        const message = await ChatModel.findById(messageId);
        if (!message) {
          socket.emit("error", { message: "Message not found" });
          return;
        }

        // Check permissions
        const isMessageOwner =
          (message.userId && message.userId.toString() === chatUser.id) ||
          (!message.userId && message.displayName === chatUser.name);

        if (!isMessageOwner && !chatUser.isHost && !chatUser.isModerator) {
          socket.emit("error", {
            message: "You don't have permission to delete this message",
          });
          return;
        }

        // Soft delete the message
        message.isDeleted = true;
        await message.save();

        // Notify all users in the room
        io.to(webinarId).emit("message_deleted", { messageId });

        logInfo(
          `Message ${messageId} deleted by ${chatUser.name} in webinar ${webinarId}`
        );
      } catch (error) {
        logError(`Error deleting message: ${(error as Error).message}`);
        socket.emit("error", { message: "Failed to delete message" });
      }
    });

    // Handle user disconnection
    socket.on("disconnect", () => {
      const webinarId = (socket as any).webinarId;
      const chatUser = (socket as any).chatUser;

      if (webinarId && chatUser) {
        socket.to(webinarId).emit("user_left", {
          user: {
            id: chatUser.id,
            name: chatUser.name,
          },
        });
        logInfo(`User ${chatUser.name} left webinar ${webinarId}`);
      }

      logInfo(`Socket disconnected: ${socket.id}`);
    });

    // Handle ping/pong for connection health
    socket.on("ping", () => {
      socket.emit("pong");
    });
  });

  logInfo("Socket.IO server initialized successfully");
  return io;
}
