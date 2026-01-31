import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server } from "socket.io";
import { YouTubeGunDuelGame } from "./youtubeGunDuel"; // تأكد من وجود هذا الملف في نفس المجلد

const app = express();
const httpServer = createServer(app);

// 1. إعداد Socket.io للاتصال بالواجهة (Overlay)
const io = new Server(httpServer, {
  path: "/socket.io",
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

// 2. تشغيل محرك لعبة اليوتيوب
// سيستخدم المفتاح السري من الـ Secrets في Replit
const youtubeGame = new YouTubeGunDuelGame(io, process.env.YOUTUBE_API_KEY || "");

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });
  next();
});

(async () => {
  // تسجيل المسارات الأساسية
  await registerRoutes(httpServer, app);

  // 3. إضافة API لبدء مراقبة بث يوتيوب من الموقع
  app.post("/api/youtube/start", async (req, res) => {
    const { broadcastId } = req.body;
    try {
      if (!broadcastId) throw new Error("Broadcast ID is required");
      const result = await youtubeGame.startMonitoring(broadcastId);
      log(`Monitoring started for: ${broadcastId}`, "YouTubeGame");
      res.json(result);
    } catch (error: any) {
      log(`Error starting monitoring: ${error.message}`, "YouTubeGame");
      res.status(500).json({ error: error.message });
    }
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      log(`YouTube Gun Duel Engine is Ready!`, "YouTubeGame");
    },
  );
})();
