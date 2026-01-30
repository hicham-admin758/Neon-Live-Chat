import { z } from "zod";
import { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { Express } from "express";
import { storage } from "./storage";
import { api } from "@shared/routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
  });

  const YT_API_KEY = process.env.YOUTUBE_API_KEY;
  let activeLiveChatId: string | null = null;
  let pollingInterval: NodeJS.Timeout | null = null;
  let lastMessageTime: string | null = null;
  let currentBombHolderId: number | null = null;
  let nextPageToken: string | null = null;
  let messageCache = new Set<string>();
  let reconnectAttempts = 0;
  let isPolling = false;

  // دالة لجلب ID الشات
  async function getLiveChatId(videoId: string): Promise<string | null> {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${YT_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
    } catch (e) {
      console.error("❌ Error fetching liveChatId:", e);
      return null;
    }
  }

  // الدالة الرئيسية لاستطلاع الشات (The Brain)
  async function pollChat() {
    if (!activeLiveChatId || !YT_API_KEY || isPolling) return;

    isPolling = true;

    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeLiveChatId}&part=snippet,authorDetails&maxResults=200&key=${YT_API_KEY}`;
      if (nextPageToken) url += `&pageToken=${nextPageToken}`;

      const res = await fetch(url);

      // التعامل مع الأخطاء
      if (!res.ok) {
        if (res.status === 403) console.log("⚠️ Quota limit or permission error");
        isPolling = false;
        return;
      }

      const data = await res.json();
      if (data.nextPageToken) nextPageToken = data.nextPageToken;

      const messages = data.items || [];

      for (const msg of messages) {
        const text = msg.snippet?.displayMessage || "";
        const messageId = msg.id;
        const author = msg.authorDetails;

        // تجاهل الرسائل القديمة والمكررة
        if (messageCache.has(messageId)) continue;
        messageCache.add(messageId);

        // تنظيف الكاش إذا كبر جداً
        if (messageCache.size > 2000) messageCache.clear();

        console.log(`💬 ${author.displayName}: ${text}`);

        // 1️⃣ منطق الانضمام (Join Logic)
        const isJoinCommand = text.includes("!دخول") || /!?(دخول|join|انضمام)/i.test(text);
        if (isJoinCommand) {
           const existing = await storage.getUserByUsername(author.displayName);
           if (!existing) {
             const user = await storage.createUser({
               username: author.displayName,
               avatarUrl: author.profileImageUrl,
               externalId: author.channelId,
               lobbyStatus: "active"
             });
             io.emit("new_player", user);
             console.log(`✅ لاعب جديد انضم: ${author.displayName}`);
           } else if (existing.lobbyStatus !== "active") {
             await storage.updateUserStatus(existing.id, "active");
             io.emit("new_player", { ...existing, lobbyStatus: "active" });
             console.log(`✅ لاعب عاد للمشاركة: ${author.displayName}`);
           }
        }

        // 2️⃣ منطق القنبلة الذكي (Smart Bomb Logic)
        if (currentBombHolderId) {
          const sender = await storage.getUserByUsername(author.displayName);

          if (sender && sender.id === currentBombHolderId) {
            // استخراج الأرقام من الرسالة (مثلاً: "مرر لـ 17" -> يستخرج 17)
            const numberMatch = text.match(/\d+/);

            if (numberMatch) {
              const targetId = parseInt(numberMatch[0]);
              const allUsers = await storage.getUsers();
              const targetUser = allUsers.find(u => u.id === targetId);

              if (targetUser && targetUser.lobbyStatus === "active" && targetUser.id !== currentBombHolderId) {
                currentBombHolderId = targetUser.id;
                io.emit("bomb_started", { playerId: targetUser.id });
                console.log(`✅ تم تمرير القنبلة إلى ${targetUser.username}`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Poll Error:", error);
    } finally {
      isPolling = false;
    }
  }

  // ==================== API Routes ====================

  app.get("/api/stream-meta", async (req, res) => {
    try {
      const { url } = req.query;
      if (typeof url !== "string") return res.status(400).json({ message: "Invalid URL" });
      
      const videoIdMatch = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
      if (!videoIdMatch) return res.status(400).json({ message: "Invalid YouTube URL" });
      
      const videoId = videoIdMatch[1];
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
      const ytRes = await fetch(apiUrl);
      const data = await ytRes.json();
      
      if (!data.items?.[0]) {
        return res.json({ 
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          title: "يوتيوب مباشر"
        });
      }
      
      const snippet = data.items[0].snippet;
      res.json({
        thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url,
        title: snippet.title
      });
    } catch (e) {
      res.status(500).json({ message: "Internal error" });
    }
  });

  app.post("/api/sync", async (req, res) => {
    try {
      const { url } = req.body;
      const videoIdMatch = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
      if (!videoIdMatch) return res.status(400).json({ message: "رابط غير صالح" });

      const videoId = videoIdMatch[1];
      activeLiveChatId = await getLiveChatId(videoId);

      if (pollingInterval) clearInterval(pollingInterval);

      // إعادة تعيين اللعبة عند المزامنة الجديدة
      nextPageToken = null;
      messageCache.clear();

      if (activeLiveChatId) {
        // جلب البيانات الأساسية للفيديو
        const metaUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
        const metaRes = await fetch(metaUrl);
        const metaData = await metaRes.json();
        const snippet = metaData.items?.[0]?.snippet;
        const thumbnail = snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const title = snippet?.title || "Live Stream";

        // ⚡ تسريع الاستطلاع إلى 3 ثواني بدلاً من 10
        pollingInterval = setInterval(pollChat, 3000);
        res.json({ success: true, title, thumbnail });
        console.log("✅ Started polling for chat:", activeLiveChatId);
      } else {
        res.status(400).json({ message: "لا يوجد شات مباشر" });
      }
    } catch (e) {
      res.status(500).json({ message: "خطأ في السيرفر" });
    }
  });

  app.get(api.users.list.path, async (req, res) => {
    const users = await storage.getUsers();
    // ترتيب اللاعبين حسب الـ ID لضمان الثبات
    res.json(users.sort((a, b) => a.id - b.id));
  });

  let bombTimer: NodeJS.Timeout | null = null;
  let bombRemainingSeconds = 30;

  function startBombTimer() {
    if (bombTimer) clearInterval(bombTimer);
    bombRemainingSeconds = 30;
    io.emit("bomb_started", { playerId: currentBombHolderId, seconds: bombRemainingSeconds });

    bombTimer = setInterval(async () => {
      bombRemainingSeconds--;
      io.emit("bomb_tick", { seconds: bombRemainingSeconds });

      if (bombRemainingSeconds <= 0) {
        if (bombTimer) {
          clearInterval(bombTimer);
          bombTimer = null;
        }
        
        if (currentBombHolderId) {
          const victimId = currentBombHolderId;
          await storage.updateUserStatus(victimId, "eliminated");
          io.emit("player_eliminated", { playerId: victimId });

          const updatedUsers = await storage.getUsers();
          const active = updatedUsers.filter(u => u.lobbyStatus === "active");

          if (active.length === 1) {
            const winner = active[0];
            currentBombHolderId = null;
            io.emit("game_winner", winner);
            
            setTimeout(async () => {
              await storage.resetAllUsersStatus();
              io.emit("game_reset");
            }, 5000);
          } else if (active.length > 1) {
            const nextPlayer = active[Math.floor(Math.random() * active.length)];
            currentBombHolderId = nextPlayer.id;
            // Recursively start timer for the next player
            startBombTimer();
          }
        }
      }
    }, 1000);
  }

  app.post("/api/game/start-bomb", async (req, res) => {
    const users = await storage.getUsers();
    const activePlayers = users.filter(u => u.lobbyStatus === "active");

    if (activePlayers.length < 2) return res.status(400).json({ message: "عدد اللاعبين غير كاف" });

    const randomPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];
    currentBombHolderId = randomPlayer.id;
    
    startBombTimer();
    res.json({ success: true });
  });

  app.post("/api/game/eliminate", async (req, res) => {
    const { playerId } = req.body;
    await storage.updateUserStatus(playerId, "eliminated");
    io.emit("player_eliminated", { playerId });

    const users = await storage.getUsers();
    const active = users.filter(u => u.lobbyStatus === "active");

    // 🏆 منطق الفوز
    if (active.length === 1) {
      const winner = active[0];
      currentBombHolderId = null;
      io.emit("game_winner", winner);
      console.log(`🏆 الفائز هو: ${winner.username}`);
      
      // إعادة التشغيل التلقائي بعد 5 ثوانٍ
      setTimeout(async () => {
        await storage.resetAllUsersStatus();
        io.emit("game_reset");
        console.log("🔄 تم إعادة تشغيل اللعبة تلقائياً");
      }, 5000);
    } 
    // استمرار اللعبة
    else if (active.length > 1) {
      // نقل القنبلة لشخص عشوائي آخر إذا كان حامل القنبلة هو من خسر
      if (playerId === currentBombHolderId) {
         const nextPlayer = active[Math.floor(Math.random() * active.length)];
         currentBombHolderId = nextPlayer.id;
         io.emit("bomb_started", { playerId: nextPlayer.id });
      }
    } else {
        // الكل خسر
        currentBombHolderId = null;
        io.emit("game_reset");
    }

    res.json({ success: true });
  });

  app.post("/api/game/reset", async (req, res) => {
    await storage.resetAllUsersStatus();
    currentBombHolderId = null;
    io.emit("game_reset");
    res.json({ success: true });
  });

  app.post("/api/game/clear-participants", async (req, res) => {
    await storage.deleteAllUsers();
    currentBombHolderId = null;
    io.emit("game_reset");
    res.json({ success: true });
  });

  app.get("/api/system/status", (req, res) => {
      res.json({ isPolling: !!pollingInterval, activeLiveChatId });
  });

  return httpServer;
}
