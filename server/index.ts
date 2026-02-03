import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server } from "socket.io";
import { YouTubeGunDuelGame } from "./youtubeGunDuel";
// import { MultiplayerDuelGame } from "./multiplayerDuel"; // فعل هذا فقط إذا كان الملف موجوداً

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// دالة تسجيل السجلات (Logs)
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// دالة استخراج معرف الفيديو
function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = input.match(regex);
  return match ? match[1] : null;
}

(async () => {
  try {
    const app = express();
    const httpServer = createServer(app);

    // 1. إعدادات قراءة البيانات
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // 2. إعداد Socket.io
    const io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // 3. جلب المفتاح وتهيئة اللعبة
    const apiKey = process.env.YOUTUBE_API_KEY || "";
    if (!apiKey) {
      console.warn("⚠️ تحذير: YOUTUBE_API_KEY غير موجود في ملف .env");
    }

    const youtubeGame = new YouTubeGunDuelGame(io, apiKey);
    
    // تسجيل الطلبات في الكونسول
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

    // ==========================================
    // ✅ الإصلاح الحاسم هنا: تمرير 4 متغيرات بدلاً من 2
    // ==========================================
    await registerRoutes(httpServer, app, io, youtubeGame); 


    // --- مسارات التحكم اليدوي في اللعبة (Fallback APIs) ---

    // 1. بدء المراقبة
    app.post("/api/youtube/start", async (req, res) => {
      try {
        const { broadcastId: rawInput } = req.body;
        if (!rawInput) throw new Error("Broadcast ID required");

        const videoId = extractYouTubeVideoId(rawInput);
        if (!videoId) throw new Error("رابط غير صحيح");

        const result = await youtubeGame.startMonitoring(videoId);
        res.json({ success: true, liveChatId: result.liveChatId });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 2. إيقاف المراقبة
    app.post("/api/youtube/stop", async (req, res) => {
      try {
        youtubeGame.stopMonitoring();
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 3. الإحصائيات
    app.get("/api/youtube/stats", async (req, res) => {
      try {
        const stats = await youtubeGame.getStats();
        res.json(stats);
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 4. إعادة الضبط
    app.post("/api/youtube/reset", async (req, res) => {
      try {
        await youtubeGame.resetGame();
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // معالجة الأخطاء
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error(err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    // تشغيل Vite أو Static Files
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // تشغيل السيرفر
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
      log(`serving on port ${port}`);
      log(`🚀 YouTube Gun Duel Engine Ready!`, "System");
    });

  } catch (error) {
    console.error("Fatal error starting server:", error);
    process.exit(1);
  }
})();

await registerRoutes(httpServer, app, io, youtubeGame