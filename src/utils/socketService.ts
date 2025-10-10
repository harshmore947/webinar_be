import { Server as SocketIOServer } from "socket.io";

// Global socket instance
let io: SocketIOServer | null = null;

// Set the socket instance (called from main server file)
export const setSocketInstance = (socketInstance: SocketIOServer) => {
  io = socketInstance;
};

// Get the socket instance
export const getSocketInstance = () => {
  return io;
};

// Emit notification to a specific user
export const emitNotificationToUser = async (
  userId: string,
  notification: {
    id: string;
    message: string;
    type: string;
    link?: string;
    createdAt: Date;
    isRead: boolean;
  }
) => {
  try {
    if (!io) {
      console.warn("Socket.IO instance not available");
      return;
    }

    // Find all sockets for this user
    const sockets = await io.fetchSockets();
    const userSockets = sockets.filter(
      (socket: any) => socket.userId === userId
    );

    if (userSockets.length > 0) {
      userSockets.forEach((socket) => {
        socket.emit("new_notification", {
          success: true,
          notification,
          timestamp: new Date().toISOString(),
        });
      });

      console.log(
        `📢 Notification sent to ${userSockets.length} socket(s) for user ${userId}`
      );
    } else {
      console.log(`🔇 No active sockets found for user ${userId}`);
    }
  } catch (error) {
    console.error("Error emitting notification to user:", error);
  }
};

// Emit notification count update to a specific user
export const emitNotificationStatsToUser = async (
  userId: string,
  stats: {
    total: number;
    unread: number;
    read: number;
  }
) => {
  try {
    if (!io) {
      console.warn("Socket.IO instance not available for stats update");
      return;
    }

    const sockets = await io.fetchSockets();
    const userSockets = sockets.filter(
      (socket: any) => socket.userId === userId
    );

    if (userSockets.length > 0) {
      userSockets.forEach((socket) => {
        socket.emit("notification_stats_update", {
          success: true,
          stats,
          timestamp: new Date().toISOString(),
        });
      });

      console.log(
        `📊 Stats update sent to ${userSockets.length} socket(s) for user ${userId}`
      );
    }
  } catch (error) {
    console.error("Error emitting stats update to user:", error);
  }
};

// Broadcast notification to all connected users (admin announcements)
export const broadcastNotificationToAll = async (notification: {
  message: string;
  type: string;
  link?: string;
}) => {
  try {
    if (!io) {
      console.warn("Socket.IO instance not available for broadcast");
      return;
    }

    io.emit("broadcast_notification", {
      success: true,
      notification: {
        ...notification,
        id: "broadcast-" + Date.now(),
        createdAt: new Date(),
        isRead: false,
      },
      timestamp: new Date().toISOString(),
    });

    console.log("📢 Broadcast notification sent to all connected users");
  } catch (error) {
    console.error("Error broadcasting notification:", error);
  }
};

// Get connected users count
export const getConnectedUsersCount = async (): Promise<number> => {
  try {
    if (!io) {
      return 0;
    }

    const sockets = await io.fetchSockets();
    return sockets.length;
  } catch (error) {
    console.error("Error getting connected users count:", error);
    return 0;
  }
};

// Get user connection status
export const isUserConnected = async (userId: string): Promise<boolean> => {
  try {
    if (!io) {
      return false;
    }

    const sockets = await io.fetchSockets();
    return sockets.some((socket: any) => socket.userId === userId);
  } catch (error) {
    console.error("Error checking user connection status:", error);
    return false;
  }
};
