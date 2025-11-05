import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import WebinarModel from "./models/Webinar.model";
import ChatModel from "./models/Chat.model";
import UserModel from "./models/User.model";
import { PollModel } from "./models/Poll.model";
import { VoteModel } from "./models/Vote.model";
import { logInfo, logError } from "./utils/logger";
import { setSocketInstance } from "./utils/socketService";
import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";

interface ChatUser {
  id: string;
  name: string;
  isHost: boolean;
  isModerator: boolean;
  isPresenter: boolean;
  isAuthenticated: boolean;
}

export const initializeSocketIO = (server: HTTPServer) => {
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
    // Socket.IO will automatically upgrade to websocket when available
    transports: ["polling", "websocket"],
    // WebSocket-specific optimizations
    upgradeTimeout: 30000, // 30 seconds for upgrade timeout
    pingTimeout: 60000, // 60 seconds before considering connection lost
    pingInterval: 25000, // 25 seconds between pings
    // Connection limits and performance
    maxHttpBufferSize: 1e6, // 1MB max message size
    allowEIO3: true, // Support older clients
    // Compression for socket.io packets (reduces bandwidth)
    perMessageDeflate: {
      threshold: 1024, // Only compress messages larger than 1KB
    },
    // HTTP compression
    httpCompression: {
      threshold: 1024,
    },
    // Connection state recovery (reconnection improvements)
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
  });

  // Set the socket instance for notifications
  setSocketInstance(io);

  const AUTH_COOKIE_NAME = "token";

  const extractTokenFromSocket = (socket: Socket): string | undefined => {
    const { auth, headers } = socket.handshake;

    const headerToken = headers.authorization?.replace("Bearer ", "");
    if (headerToken && headerToken !== "null" && headerToken !== "undefined") {
      return headerToken;
    }

    const authToken =
      typeof auth?.token === "string" ? auth.token : undefined;
    if (authToken && authToken !== "null" && authToken !== "undefined") {
      return authToken;
    }

    const cookieHeader = headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }

    const tokenFromCookie = cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`))
      ?.split("=")[1];

    if (!tokenFromCookie) {
      return undefined;
    }

    try {
      const decodedToken = decodeURIComponent(tokenFromCookie);
      return decodedToken && decodedToken !== "null" && decodedToken !== "undefined"
        ? decodedToken
        : undefined;
    } catch (error) {
      logError(`Failed to decode auth cookie for socket ${socket.id}: ${(error as Error).message}`);
      return undefined;
    }
  };

  // Middleware for authentication (optional)
  io.use(async (socket, next) => {
    try {
      const token = extractTokenFromSocket(socket);

      if (!token) {
        return next();
      }

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

  logInfo(`Socket ${socket.id} authenticated`);
      }
    } catch (error) {
      logError(`Socket authentication failed for ${socket.id}: ${(error as Error).message}`);
    } finally {
      next();
    }
  });

  io.on("connection", (socket) => {
    logInfo(
      `New socket connection: ${socket.id} (Total: ${io.engine.clientsCount})`
    );

    // Join webinar room
    socket.on(
      "join_webinar",
      async (data: { webinarId: string; displayName?: string }) => {
        try {
          const { webinarId, displayName } = data;
          const authenticatedUser = (socket as any).user;

          // Validate webinar exists
          const webinar = await WebinarModel.findById(webinarId).populate(
            "hostId moderators presenters"
          );
          if (!webinar) {
            socket.emit("error", { message: "Webinar not found" });
            return;
          }

          // Check if webinar is accessible (public or user has access)
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
            webinar.presenters.some(
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

          // Send poll history
          const pollHistory = await PollModel.find({
            webinarId,
          })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

          const formattedPolls = pollHistory.map((poll: any) => ({
            id: poll._id.toString(),
            question: poll.question,
            options: poll.options,
            createdBy: {
              id: poll.createdBy?.toString() || "anonymous",
              name: "Poll Creator",
            },
            createdAt: poll.createdAt,
            expiresAt: poll.expiresAt,
            allowMultipleVotes: poll.allowMultipleVotes,
            isAnonymous: poll.isAnonymous,
            totalVotes: poll.totalVotes,
            isActive: poll.isActive,
          }));

          socket.emit("poll_history", { polls: formattedPolls });

          // Notify others about user joining
          socket.to(webinarId).emit("user_joined", {
            user: {
              id: chatUser.id,
              name: chatUser.name,
              isHost: chatUser.isHost,
              isModerator: chatUser.isModerator,
              isPresenter: chatUser.isPresenter,
              isAuthenticated: chatUser.isAuthenticated,
            },
          });

          // Broadcast updated connected users list to all clients in the room
          setTimeout(() => {
            const room = io.sockets.adapter.rooms.get(webinarId);
            if (room) {
              const userMap = new Map<string, ChatUser>();
              
              // Deduplicate users by ID (same user may have multiple socket connections)
              for (const socketId of room) {
                const socketInRoom = io.sockets.sockets.get(socketId);
                if (socketInRoom && (socketInRoom as any).chatUser) {
                  const user = (socketInRoom as any).chatUser;
                  // Only add if not already in map, or update to maintain highest privileges
                  if (!userMap.has(user.id) || 
                      (user.isHost || user.isModerator || user.isPresenter)) {
                    userMap.set(user.id, {
                      id: user.id,
                      name: user.name,
                      isHost: user.isHost,
                      isModerator: user.isModerator,
                      isPresenter: user.isPresenter,
                      isAuthenticated: user.isAuthenticated,
                    });
                  }
                }
              }
              
              const connectedUsers = Array.from(userMap.values());
              
              io.to(webinarId).emit("connected_users", {
                users: connectedUsers,
              });

              // Emit real-time analytics snapshot (current viewers)
              io.to(webinarId).emit("analytics_update", {
                webinarId,
                currentViewers: connectedUsers.length,
                updatedAt: new Date().toISOString(),
              });
            }
          }, 100);

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

    // Get connected users in a webinar room
    socket.on("get_connected_users", async (data: { webinarId: string }) => {
      try {
        const { webinarId } = data;
        const room = io.sockets.adapter.rooms.get(webinarId);

        if (!room) {
          socket.emit("connected_users", { users: [] });
          return;
        }

        const userMap = new Map<string, ChatUser>();

        // Get all sockets in the room and deduplicate by user ID
        for (const socketId of room) {
          const socketInRoom = io.sockets.sockets.get(socketId);
          if (socketInRoom && (socketInRoom as any).chatUser) {
            const chatUser = (socketInRoom as any).chatUser;
            // Only add if not already in map, or update to maintain highest privileges
            if (!userMap.has(chatUser.id) || 
                (chatUser.isHost || chatUser.isModerator || chatUser.isPresenter)) {
              userMap.set(chatUser.id, {
                id: chatUser.id,
                name: chatUser.name,
                isHost: chatUser.isHost,
                isModerator: chatUser.isModerator,
                isPresenter: chatUser.isPresenter,
                isAuthenticated: chatUser.isAuthenticated,
              });
            }
          }
        }

        const connectedUsers = Array.from(userMap.values());

        socket.emit("connected_users", { users: connectedUsers });
        logInfo(
          `Sent connected users list for webinar ${webinarId}: ${connectedUsers.length} users`
        );
      } catch (error) {
        logError(`Error getting connected users: ${(error as Error).message}`);
        socket.emit("error", { message: "Failed to get connected users" });
      }
    });

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

    // Handle poll creation (only for admin, host, or moderator)
    socket.on(
      "create_poll",
      async (data: {
        question: string;
        options: string[];
        duration?: number; // in minutes
        allowMultipleVotes?: boolean;
        isAnonymous?: boolean;
      }) => {
        try {
          const {
            question,
            options,
            duration,
            allowMultipleVotes = false,
            isAnonymous = true,
          } = data;
          const webinarId = (socket as any).webinarId;
          const chatUser = (socket as any).chatUser;
          const authenticatedUser = (socket as any).user;

          if (!webinarId || !chatUser) {
            socket.emit("error", { message: "You must join a webinar first" });
            return;
          }

          // Check if user has permission to create polls
          const isAdmin = authenticatedUser?.role === "Admin";
          if (
            !chatUser.isHost &&
            !chatUser.isModerator &&
            !chatUser.isPresenter &&
            !isAdmin
          ) {
            socket.emit("error", {
              message:
                "Only admin, host, moderators, or presenters can create polls",
            });
            return;
          }

          // Validate poll data
          if (!question || question.trim().length === 0) {
            socket.emit("error", { message: "Poll question is required" });
            return;
          }

          if (!options || options.length < 2) {
            socket.emit("error", {
              message: "Poll must have at least 2 options",
            });
            return;
          }

          if (options.length > 10) {
            socket.emit("error", {
              message: "Poll cannot have more than 10 options",
            });
            return;
          }

          // Create poll options with unique IDs
          const pollOptions = options.map((option, index) => ({
            id: `option_${index + 1}`,
            text: option.trim(),
            votes: 0,
          }));

          // Calculate expiration date if duration is provided
          const expiresAt = duration
            ? new Date(Date.now() + duration * 60 * 1000)
            : undefined;

          // Create and save poll
          const newPoll = new PollModel({
            webinarId,
            question: question.trim(),
            options: pollOptions,
            createdBy: chatUser.isAuthenticated ? chatUser.id : null,
            expiresAt,
            allowMultipleVotes,
            isAnonymous,
            isActive: true,
            totalVotes: 0,
          });

          await newPoll.save();

          // Prepare poll data for broadcast
          const pollData = {
            id: (newPoll._id as any).toString(),
            question: newPoll.question,
            options: newPoll.options,
            createdBy: {
              id: chatUser.id,
              name: chatUser.name,
            },
            createdAt: newPoll.createdAt,
            expiresAt: newPoll.expiresAt,
            allowMultipleVotes: newPoll.allowMultipleVotes,
            isAnonymous: newPoll.isAnonymous,
            totalVotes: 0,
            isActive: true,
          };

          // Broadcast poll to all users in the webinar room
          io.to(webinarId).emit("new_poll", pollData);

          logInfo(`Poll created in webinar ${webinarId} by ${chatUser.name}`);
        } catch (error) {
          logError(`Error creating poll: ${(error as Error).message}`);
          socket.emit("error", { message: "Failed to create poll" });
        }
      }
    );

    // Handle voting
    socket.on(
      "cast_vote",
      async (data: { pollId: string; optionId: string }) => {
        try {
          const { pollId, optionId } = data;
          const webinarId = (socket as any).webinarId;
          const chatUser = (socket as any).chatUser;

          if (!webinarId || !chatUser) {
            socket.emit("error", { message: "You must join a webinar first" });
            return;
          }

          // Find the poll
          const poll = await PollModel.findById(pollId);
          if (!poll) {
            socket.emit("error", { message: "Poll not found" });
            return;
          }

          // Check if poll is active and not expired
          if (!poll.isActive) {
            socket.emit("error", { message: "This poll is no longer active" });
            return;
          }

          if (poll.expiresAt && new Date() > poll.expiresAt) {
            socket.emit("error", { message: "This poll has expired" });
            return;
          }

          // Check if option exists
          const option = poll.options.find((opt) => opt.id === optionId);
          if (!option) {
            socket.emit("error", { message: "Invalid poll option" });
            return;
          }

          // Check if user has already voted (unless multiple votes allowed)
          const existingVote = await VoteModel.findOne({
            pollId,
            $or: [
              { userId: chatUser.isAuthenticated ? chatUser.id : null },
              { sessionId: !chatUser.isAuthenticated ? socket.id : null },
            ],
          });

          if (existingVote && !poll.allowMultipleVotes) {
            socket.emit("error", {
              message: "You have already voted in this poll",
            });
            return;
          }

          // Create new vote
          const newVote = new VoteModel({
            pollId,
            webinarId,
            userId: chatUser.isAuthenticated ? chatUser.id : null,
            sessionId: !chatUser.isAuthenticated ? socket.id : null,
            optionId,
            userDisplayName: chatUser.name,
          });

          await newVote.save();

          // Update poll vote counts
          const optionIndex = poll.options.findIndex(
            (opt) => opt.id === optionId
          );
          poll.options[optionIndex].votes += 1;
          poll.totalVotes += 1;
          await poll.save();

          // Prepare updated poll data
          const updatedPollData = {
            id: (poll._id as any).toString(),
            question: poll.question,
            options: poll.options,
            totalVotes: poll.totalVotes,
            isActive: poll.isActive,
          };

          // Broadcast updated poll results to all users
          io.to(webinarId).emit("poll_updated", updatedPollData);

          logInfo(
            `Vote cast in poll ${pollId} by ${chatUser.name} in webinar ${webinarId}`
          );
        } catch (error) {
          logError(`Error casting vote: ${(error as Error).message}`);
          socket.emit("error", { message: "Failed to cast vote" });
        }
      }
    );

    // Handle poll closure (only for poll creator, admin, host, or moderator)
    socket.on("close_poll", async (data: { pollId: string }) => {
      try {
        const { pollId } = data;
        const webinarId = (socket as any).webinarId;
        const chatUser = (socket as any).chatUser;
        const authenticatedUser = (socket as any).user;

        if (!webinarId || !chatUser) {
          socket.emit("error", { message: "You must join a webinar first" });
          return;
        }

        // Find the poll
        const poll = await PollModel.findById(pollId);
        if (!poll) {
          socket.emit("error", { message: "Poll not found" });
          return;
        }

        // Check permissions
        const isAdmin = authenticatedUser?.role === "Admin";
        const isPollCreator =
          poll.createdBy && poll.createdBy.toString() === chatUser.id;

        if (
          !isPollCreator &&
          !chatUser.isHost &&
          !chatUser.isModerator &&
          !chatUser.isPresenter &&
          !isAdmin
        ) {
          socket.emit("error", {
            message: "You don't have permission to close this poll",
          });
          return;
        }

        // Close the poll
        poll.isActive = false;
        await poll.save();

        // Broadcast poll closure to all users
        io.to(webinarId).emit("poll_closed", {
          pollId,
          finalResults: {
            question: poll.question,
            options: poll.options,
            totalVotes: poll.totalVotes,
          },
        });

        logInfo(
          `Poll ${pollId} closed by ${chatUser.name} in webinar ${webinarId}`
        );
      } catch (error) {
        logError(`Error closing poll: ${(error as Error).message}`);
        socket.emit("error", { message: "Failed to close poll" });
      }
    });

    // Send poll history when user joins
    socket.on("get_polls", async () => {
      try {
        const webinarId = (socket as any).webinarId;

        if (!webinarId) {
          socket.emit("error", { message: "You must join a webinar first" });
          return;
        }

        // Get active polls for this webinar
        const polls = await PollModel.find({
          webinarId,
          isActive: true,
          $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
        }).sort({ createdAt: -1 });

        const pollsData = polls.map((poll) => ({
          id: (poll._id as any).toString(),
          question: poll.question,
          options: poll.options,
          createdAt: poll.createdAt,
          expiresAt: poll.expiresAt,
          allowMultipleVotes: poll.allowMultipleVotes,
          isAnonymous: poll.isAnonymous,
          totalVotes: poll.totalVotes,
          isActive: poll.isActive,
        }));

        socket.emit("polls_history", { polls: pollsData });
      } catch (error) {
        logError(`Error getting polls: ${(error as Error).message}`);
        socket.emit("error", { message: "Failed to get polls" });
      }
    });

    // NOTIFICATION HANDLERS
    // =====================

    // Join user-specific notification room
    socket.on("join_notifications", async () => {
      try {
        const authenticatedUser = (socket as any).user;
        if (authenticatedUser) {
          const notificationRoom = `notifications_${authenticatedUser.id}`;
          await socket.join(notificationRoom);
          logInfo(
            `User ${authenticatedUser.name} joined notification room: ${notificationRoom}`
          );

          socket.emit("notification_connection_status", {
            success: true,
            message: "Connected to real-time notifications",
            userId: authenticatedUser.id,
          });
        } else {
          socket.emit("notification_connection_status", {
            success: false,
            message: "Authentication required for notifications",
          });
        }
      } catch (error) {
        logError(
          `Error joining notification room: ${(error as Error).message}`
        );
        socket.emit("notification_connection_status", {
          success: false,
          message: "Failed to join notification room",
        });
      }
    });

    // Leave user-specific notification room
    socket.on("leave_notifications", async () => {
      try {
        const authenticatedUser = (socket as any).user;
        if (authenticatedUser) {
          const notificationRoom = `notifications_${authenticatedUser.id}`;
          await socket.leave(notificationRoom);
          logInfo(
            `User ${authenticatedUser.name} left notification room: ${notificationRoom}`
          );
        }
      } catch (error) {
        logError(
          `Error leaving notification room: ${(error as Error).message}`
        );
      }
    });

    // Request notification stats update
    socket.on("request_notification_stats", async () => {
      try {
        const authenticatedUser = (socket as any).user;
        if (!authenticatedUser) {
          socket.emit("notification_stats_error", {
            success: false,
            message: "Authentication required",
          });
          return;
        }

        // Import here to avoid circular dependency
        const NotificationModel =
          require("./models/Notification.model").default;
        const { Types } = require("mongoose");

        const stats = await NotificationModel.aggregate([
          { $match: { userId: new Types.ObjectId(authenticatedUser.id) } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              unread: {
                $sum: {
                  $cond: [{ $eq: ["$isRead", false] }, 1, 0],
                },
              },
              read: {
                $sum: {
                  $cond: [{ $eq: ["$isRead", true] }, 1, 0],
                },
              },
            },
          },
        ]);

        const result = stats[0] || { total: 0, unread: 0, read: 0 };

        socket.emit("notification_stats_update", {
          success: true,
          stats: result,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logError(
          `Error getting notification stats: ${(error as Error).message}`
        );
        socket.emit("notification_stats_error", {
          success: false,
          message: "Failed to get notification stats",
        });
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

        // Broadcast updated connected users list after user leaves
        setTimeout(() => {
          const room = io.sockets.adapter.rooms.get(webinarId);
          const userMap = new Map<string, ChatUser>();

          if (room) {
            // Deduplicate users by ID (same user may have multiple socket connections)
            for (const socketId of room) {
              const socketInRoom = io.sockets.sockets.get(socketId);
              if (socketInRoom && (socketInRoom as any).chatUser) {
                const user = (socketInRoom as any).chatUser;
                // Only add if not already in map, or update to maintain highest privileges
                if (!userMap.has(user.id) || 
                    (user.isHost || user.isModerator || user.isPresenter)) {
                  userMap.set(user.id, {
                    id: user.id,
                    name: user.name,
                    isHost: user.isHost,
                    isModerator: user.isModerator,
                    isPresenter: user.isPresenter,
                    isAuthenticated: user.isAuthenticated,
                  });
                }
              }
            }
          }

          const connectedUsers = Array.from(userMap.values());

          io.to(webinarId).emit("connected_users", { users: connectedUsers });
          io.to(webinarId).emit("analytics_update", {
            webinarId,
            currentViewers: connectedUsers.length,
            updatedAt: new Date().toISOString(),
          });
        }, 100);

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
};
