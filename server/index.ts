import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server } from "socket.io";
import { YouTubeGunDuelGame } from "./youtubeGunDuel"; // تأكد من وجود هذا الملف في نفس المجلد

(async () => {
  try {
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

// 🎯 دالة استخراج Video ID من رابط اليوتيوب
function extractYouTubeVideoId(url: string): string | null {
  try {
    // إزالة المسافات والتأكد من وجود قيمة
    const cleanUrl = url.trim();
    if (!cleanUrl) return null;

    // إذا كان المدخل هو ID فقط (11 حرف)
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
      return cleanUrl;
    }

    // محاولة تحويل النص لـ URL
    let urlObj: URL;
    try {
      urlObj = new URL(cleanUrl);
    } catch {
      // إذا لم يكن URL كامل، نحاول إضافة البروتوكول
      urlObj = new URL(`https://${cleanUrl}`);
    }

    const hostname = urlObj.hostname.toLowerCase();

    // 1️⃣ روابط youtube.com العادية
    // مثال: https://www.youtube.com/watch?v=dQw4w9WgXcQ
    if (hostname.includes('youtube.com')) {
      // استخراج من query parameter "v"
      const videoId = urlObj.searchParams.get('v');
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return videoId;
      }

      // 2️⃣ روابط البث المباشر
      // مثال: https://www.youtube.com/live/dQw4w9WgXcQ
      const liveMatch = urlObj.pathname.match(/\/live\/([a-zA-Z0-9_-]{11})/);
      if (liveMatch && liveMatch[1]) {
        return liveMatch[1];
      }

      // 3️⃣ روابط embed
      // مثال: https://www.youtube.com/embed/dQw4w9WgXcQ
      const embedMatch = urlObj.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch && embedMatch[1]) {
        return embedMatch[1];
      }

      // 4️⃣ روابط v/
      // مثال: https://www.youtube.com/v/dQw4w9WgXcQ
      const vMatch = urlObj.pathname.match(/\/v\/([a-zA-Z0-9_-]{11})/);
      if (vMatch && vMatch[1]) {
        return vMatch[1];
      }
    }

    // 5️⃣ روابط youtu.be المختصرة
    // مثال: https://youtu.be/dQw4w9WgXcQ
    if (hostname.includes('youtu.be')) {
      const shortMatch = urlObj.pathname.match(/\/([a-zA-Z0-9_-]{11})/);
      if (shortMatch && shortMatch[1]) {
        return shortMatch[1];
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing YouTube URL:', error);
    return null;
  }
}

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
    try {
      const { broadcastId: rawInput } = req.body;

      // التحقق من وجود المدخل
      if (!rawInput) {
        throw new Error("Broadcast ID or YouTube URL is required");
      }

      log(`Received input: ${rawInput}`, "YouTubeGame");

      // استخراج الـ Video ID من الرابط
      const videoId = extractYouTubeVideoId(rawInput);

      if (!videoId) {
        throw new Error(
          "Invalid YouTube URL or Video ID. Please provide a valid YouTube video/live stream URL or ID."
        );
      }

      log(`Extracted Video ID: ${videoId}`, "YouTubeGame");

      // بدء المراقبة باستخدام الـ ID المستخرج
      const result = await youtubeGame.startMonitoring(videoId);

      log(`✅ Monitoring started successfully for: ${videoId}`, "YouTubeGame");

      res.json({
        success: true,
        videoId: videoId,
        liveChatId: result.liveChatId,
        message: "Monitoring started successfully"
      });

    } catch (error: any) {
      log(`❌ Error starting monitoring: ${error.message}`, "YouTubeGame");
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // 4. إضافة API لإيقاف المراقبة
  app.post("/api/youtube/stop", async (req, res) => {
    try {
      youtubeGame.stopMonitoring();
      log(`🛑 Monitoring stopped`, "YouTubeGame");
      res.json({ success: true, message: "Monitoring stopped" });
    } catch (error: any) {
      log(`❌ Error stopping monitoring: ${error.message}`, "YouTubeGame");
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // 5. إضافة API للإحصائيات
  app.get("/api/youtube/stats", async (req, res) => {
    try {
      const stats = await youtubeGame.getStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });

  // 6. إضافة API لإعادة تعيين اللعبة
  app.post("/api/youtube/reset", async (req, res) => {
    try {
      await youtubeGame.resetGame();
      log(`🔄 Game reset`, "YouTubeGame");
      res.json({ success: true, message: "Game reset successfully" });
    } catch (error: any) {
      log(`❌ Error resetting game: ${error.message}`, "YouTubeGame");
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
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
      log(`YouTube Gun Duel Engine is Ready! 🎮`, "YouTubeGame");
    },
  );
  } catch (error) {
    console.error("Fatal error starting server:", error);
    process.exit(1);
  }
})();
