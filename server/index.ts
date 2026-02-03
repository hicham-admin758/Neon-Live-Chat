import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Server } from "socket.io";
import { YouTubeGunDuelGame } from "./youtubeGunDuel";

// إعداد السجلات (Logs)
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// دالة ذكية لاستخراج معرف الفيديو من الرابط
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

    // 1. إعدادات السيرفر الأساسية
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // 2. إعداد الـ Socket.io (المسؤول عن تحديث قائمة اللاعبين فوراً)
    const io = new Server(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });

    // 3. تهيئة محرك لعبة يوتيوب
    const apiKey = process.env.YOUTUBE_API_KEY || "";
    const youtubeGame = new YouTubeGunDuelGame(io, apiKey);

    // تسجيل الطلبات لمراقبة الأداء
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - start;
        if (req.path.startsWith("/api")) {
          log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
        }
      });
      next();
    });

    // ==========================================
    // 🔥 الربط الذهبي: تمرير كل الأدوات لملف الروابط
    // هذا السطر يربط (السيرفر، التطبيق، التنبيهات، محرك اللعبة)
    // ==========================================
    await registerRoutes(httpServer, app, io, youtubeGame); 

    // --- مسارات التحكم في يوتيوب (API) ---

    app.post("/api/youtube/start", async (req, res) => {
      try {
        const { broadcastId: rawInput } = req.body;
        const videoId = extractYouTubeVideoId(rawInput);
        if (!videoId) throw new Error("رابط يوتيوب غير صحيح");
        const result = await youtubeGame.startMonitoring(videoId);
        log(`✅ بدأ رصد الشات للفيديو: ${videoId}`, "YouTubeGame");
        res.json({ success: true, videoId, liveChatId: result.liveChatId });
      } catch (error: any) {
        log(`❌ خطأ: ${error.message}`, "YouTubeGame");
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post("/api/youtube/stop", (req, res) => {
      youtubeGame.stopMonitoring();
      log("🛑 تم إيقاف الرصد", "YouTubeGame");
      res.json({ success: true });
    });

    app.post("/api/youtube/reset", async (req, res) => {
      await youtubeGame.resetGame();
      log("🔄 تم إعادة ضبط اللعبة", "YouTubeGame");
      res.json({ success: true });
    });

    // معالجة الأخطاء
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      console.error("Internal Error:", err);
      res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
    });

    // إعداد واجهة Vite (Development) أو الملفات الثابتة (Production)
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // تشغيل السيرفر النهائي
    const port = 5000;
    httpServer.listen({ port, host: "0.0.0.0" }, () => {
      log(`🚀 السيرفر جاهز ويعمل على المنفذ ${port}`);
      log(`🔗 تأكد من وضع API Key في ملف .env`, "System");
    });

  } catch (error) {
    console.error("خطأ فادح في السيرفر:", error);
    process.exit(1);
  }
})();
