import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import router from "./routes";
import { logger } from "./lib/logger";
import { initializeDatabase } from "@workspace/db/src/init";
import { setupSocketHandlers, setIoInstance } from "./lib/socket";

const app: Express = express();

// Initialize database on startup
let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Ensure DB is initialized for all routes
app.use(async (req, res, next) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (error) {
    logger.error({ err: error }, "Database initialization failed");
    res.status(500).json({ error: "Database initialization failed" });
  }
});

app.use("/api", router);

const frontendDir = path.resolve(
  process.env.APP_FRONTEND_DIR || "artifacts/html-to-apk-studio/dist/public",
);

if (existsSync(frontendDir)) {
  app.use(express.static(frontendDir, { index: "index.html" }));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/") && req.accepts("html")) {
      res.sendFile(path.join(frontendDir, "index.html"));
      return;
    }
    next();
  });
}

// Create HTTP server and attach Socket.io
export const httpServer = createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

// Setup Socket.io handlers
setupSocketHandlers(io);
setIoInstance(io);

export default app;