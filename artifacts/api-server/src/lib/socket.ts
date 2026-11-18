import { Server as SocketIOServer, Socket } from "socket.io";
import { sqlite } from "@workspace/db";
import { usersTable, chatMessagesTable, chatSettingsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import crypto from "node:crypto";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    isPremium: boolean;
  };
}

const connectedUsers = new Map<string, { socketId: string; userId: string; name: string; isAdmin: boolean }>();
let ioInstance: SocketIOServer | null = null;

export function setIoInstance(io: SocketIOServer) {
  ioInstance = io;
}

export function getIoInstance(): SocketIOServer | null {
  return ioInstance;
}

export function setupSocketHandlers(io: SocketIOServer) {
  ioInstance = io;

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return next(new Error("Authentication required"));
      }

      const session = sqlite
        .prepare(
          `SELECT s.*, u.id as user_id, u.email, u.name, u.is_admin, u.premium_expires_at, u.is_banned
           FROM sessions s
           JOIN users u ON s.user_id = u.id
           WHERE s.token = ? AND s.expires_at > strftime('%s', 'now') AND u.is_banned = 0`
        )
        .get(token) as any;

      if (!session) {
        return next(new Error("Invalid or expired session"));
      }

      const isPremium = session.premium_expires_at ? new Date(session.premium_expires_at) > new Date() : false;

      socket.userId = session.user_id;
      socket.user = {
        id: session.user_id,
        email: session.email,
        name: session.name,
        isAdmin: Boolean(session.is_admin),
        isPremium,
      };

      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    if (!socket.user) return;

    // Track connected user
    connectedUsers.set(socket.id, {
      socketId: socket.id,
      userId: socket.user.id,
      name: socket.user.name,
      isAdmin: socket.user.isAdmin,
    });

    // Join world chat room
    socket.join("world-chat");

    // Send current online users
    socket.emit("users:online", Array.from(connectedUsers.values()).map(u => ({
      userId: u.userId,
      name: u.name,
      isAdmin: u.isAdmin,
    })));

    // Broadcast user joined
    socket.to("world-chat").emit("user:joined", {
      userId: socket.user.id,
      name: socket.user.name,
      isAdmin: socket.user.isAdmin,
    });

    // Send recent messages
    sendRecentMessages(socket);

    // Handle new message
    socket.on("chat:message", async (data: { content: string; replyToId?: string; messageType?: "text" | "image" }) => {
      await handleChatMessage(socket, data);
    });

    // Handle typing indicator
    socket.on("chat:typing", (data: { isTyping: boolean }) => {
      socket.to("world-chat").emit("user:typing", {
        userId: socket.user!.id,
        name: socket.user!.name,
        isTyping: data.isTyping,
      });
    });

    // Handle message read
    socket.on("chat:read", (data: { messageId: string }) => {
      // Could track read receipts here
    });

    // Handle admin commands
    socket.on("chat:admin", (data: { command: string; args: string[] }) => {
      handleAdminCommand(socket, data);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      connectedUsers.delete(socket.id);
      socket.to("world-chat").emit("user:left", {
        userId: socket.user!.id,
        name: socket.user!.name,
      });
    });
  });
}

async function sendRecentMessages(socket: AuthenticatedSocket) {
  const messages = sqlite
    .prepare(
      `SELECT m.*, u.name, u.is_admin
       FROM chat_messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.is_deleted = 0
       ORDER BY m.created_at DESC
       LIMIT 100`
    )
    .all() as any[];

  socket.emit("chat:history", messages.reverse().map(formatMessage));
}

async function handleChatMessage(socket: AuthenticatedSocket, data: { content: string; replyToId?: string; messageType?: "text" | "image" }) {
  const { content, replyToId, messageType = "text" } = data;

  if (!content || content.trim().length === 0) {
    socket.emit("chat:error", { message: "Message cannot be empty" });
    return;
  }

  if (content.length > 5000) {
    socket.emit("chat:error", { message: "Message too long (max 5000 characters)" });
    return;
  }

  // Rate limiting
  const now = Date.now();
  const lastMessageTime = (socket as any).lastMessageTime || 0;
  const minInterval = socket.user!.isPremium ? 1000 : 3000; // 1s premium, 3s free

  if (now - lastMessageTime < minInterval) {
    socket.emit("chat:error", { message: `Please wait ${(minInterval / 1000).toFixed(1)}s between messages` });
    return;
  }
  (socket as any).lastMessageTime = now;

  const messageId = crypto.randomUUID();
  const createdAt = Math.floor(now / 1000);

  // Insert message
  sqlite
    .prepare(
      `INSERT INTO chat_messages (id, user_id, content, message_type, reply_to_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(messageId, socket.user!.id, content.trim(), messageType, replyToId || null, createdAt, createdAt);

  // Get the inserted message with user info
  const message = sqlite
    .prepare(
      `SELECT m.*, u.name, u.is_admin
       FROM chat_messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.id = ?`
    )
    .get(messageId) as any;

  const formatted = formatMessage(message);

  // Broadcast to all in world chat
  ioInstance?.to("world-chat").emit("chat:message", formatted);
}

function formatMessage(message: any) {
  return {
    id: message.id,
    userId: message.user_id,
    userName: message.name,
    userIsAdmin: Boolean(message.is_admin),
    content: message.content,
    messageType: message.message_type,
    imageUrl: message.image_url,
    replyToId: message.reply_to_id,
    createdAt: message.created_at * 1000, // Convert to ms
    updatedAt: message.updated_at * 1000,
  };
}

function handleAdminCommand(socket: AuthenticatedSocket, data: { command: string; args: string[] }) {
  if (!socket.user?.isAdmin) {
    socket.emit("chat:error", { message: "Admin privileges required" });
    return;
  }

  const { command, args } = data;

  switch (command) {
    case "announce": {
      const message = args.join(" ");
      if (!message) {
        socket.emit("chat:error", { message: "Usage: /announce <message>" });
        return;
      }
      const announcementId = crypto.randomUUID();
      const createdAt = Math.floor(Date.now() / 1000);
      sqlite
        .prepare(
          `INSERT INTO chat_messages (id, user_id, content, message_type, created_at, updated_at)
           VALUES (?, ?, ?, 'announcement', ?, ?)`
        )
        .run(announcementId, socket.user!.id, `[ANNOUNCEMENT] ${message}`, createdAt, createdAt);

      const announcement = sqlite
        .prepare(
          `SELECT m.*, u.name, u.is_admin
           FROM chat_messages m
           JOIN users u ON m.user_id = u.id
           WHERE m.id = ?`
        )
        .get(announcementId) as any;

      ioInstance?.to("world-chat").emit("chat:message", formatMessage(announcement));
      break;
    }

    case "mute": {
      const targetUserId = args[0];
      const duration = parseInt(args[1] || "0", 10); // minutes, 0 = permanent
      if (!targetUserId) {
        socket.emit("chat:error", { message: "Usage: /mute <userId> [minutes]" });
        return;
      }
      // Implementation would add mute to database
      socket.emit("chat:system", { message: `User ${targetUserId} muted for ${duration || "permanent"} minutes` });
      break;
    }

    case "ban": {
      const targetUserId = args[0];
      if (!targetUserId) {
        socket.emit("chat:error", { message: "Usage: /ban <userId>" });
        return;
      }
      sqlite.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").run(targetUserId);
      // Disconnect user if online
      for (const [socketId, user] of connectedUsers.entries()) {
        if (user.userId === targetUserId) {
          ioInstance?.to(socketId).emit("chat:error", { message: "You have been banned from chat" });
          ioInstance?.sockets.sockets.get(socketId)?.disconnect();
        }
      }
      ioInstance?.to("world-chat").emit("chat:system", { message: `User ${targetUserId} has been banned` });
      break;
    }

    case "clear": {
      // Only clear messages from database (admin can see all)
      sqlite.prepare("DELETE FROM chat_messages WHERE message_type != 'system'").run();
      ioInstance?.to("world-chat").emit("chat:cleared");
      break;
    }

    default:
      socket.emit("chat:error", { message: `Unknown command: ${command}` });
  }
}