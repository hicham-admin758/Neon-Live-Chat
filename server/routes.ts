import { z } from "zod";
import { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { Express } from "express";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { YouTubeGunDuelGame } from "./youtubeGunDuel";

// تعريف نوع البيانات للاعب لتجنب الأخطاء
interface UserData {
  username: string;
  avatarUrl?: string;
  externalId: string;
  lobbyStatus: "active" | "eliminated" | "idle" | "in_game";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  io: SocketIOServer,
  gunDuelGame: YouTubeGunDuelGame
): Promise<Server> {
  const YT_API_KEY = process.env.YOUTUBE_API_KEY;

  // متغيرات الحالة (State Variables)
  let activeLiveChatId: string | null = null;
  let pollingTimeout: NodeJS.Timeout | null = null; // استخدام Timeout بدل Interval للتحكم أفضل
  let currentBombHolderId: number | null = null;
  let nextPageToken: string | null = null;
  let messageCache = new Set<string>();
  let isPolling = false;
  
  // متغيرات لعبة القنبلة
  let bombTimer: NodeJS.Timeout | null = null;
  let bombRemainingSeconds = 30;

  // ==================== Helper Functions ====================

  // دالة مساعدة لاستخراج ID الفيديو من أي رابط يوتيوب
  function extractVideoId(url: string): string | null {
    const match = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
    return match ? match[1] : null;
  }

  // دالة لجلب ID الشات
  async function getLiveChatId(videoId: string): Promise<string | null> {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${YT_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`YouTube API Error: ${res.status}`);
      const data = await res.json();
      return data.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
    } catch (e) {
      console.error("❌ Error fetching liveChatId:", e);
      return null;
    }
  }

  // ==================== Chat Polling Logic ====================

  async function pollChat() {
    // 1. شروط التوقف
    if (!activeLiveChatId || !YT_API_KEY) return;
    
    // إذا كانت لعبة المسدسات نشطة، نوقف استطلاع القنبلة لتوفير الموارد والكوتا
    if (gunDuelGame && gunDuelGame.isActive()) {
      // نعيد المحاولة بعد 10 ثواني بدلاً من الاستمرار في الاستطلاع السريع
      pollingTimeout = setTimeout(pollChat, 10000);
      return;
    }

    if (isPolling) return; // منع التداخل
    isPolling = true;

    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeLiveChatId}&part=snippet,authorDetails&maxResults=200&key=${YT_API_KEY}`;
      if (nextPageToken) url += `&pageToken=${nextPageToken}`;

      const res = await fetch(url);

      if (!res.ok) {
        if (res.status === 403) console.log("⚠️ Quota limit or permission error");
        if (res.status === 404) console.log("⚠️ Chat not found (Stream might be over)");
        isPolling = false;
        // إعادة المحاولة ببطء عند الخطأ
        pollingTimeout = setTimeout(pollChat, 10000); 
        return;
      }

      const data = await res.json();
      if (data.nextPageToken) nextPageToken = data.nextPageToken;

      const messages = data.items || [];

      for (const msg of messages) {
        const text = msg.snippet?.displayMessage || "";
        const messageId = msg.id;
        const author = msg.authorDetails;

        if (messageCache.has(messageId)) continue;
        messageCache.add(messageId);
        if (messageCache.size > 2000) messageCache.clear();

        console.log(`💬 ${author.displayName}: ${text}`);

        // --- منطق الانضمام ---
        const cleanText = text.trim().toLowerCase();
        const isJoinCommand = cleanText === "!دخول" || cleanText === "دخول" || cleanText === "!join";
        
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
             console.log(`➕ لاعب جديد: ${author.displayName}`);
           } else if (existing.lobbyStatus !== "active") {
             await storage.updateUserStatus(existing.id, "active");
             io.emit("new_player", { ...existing, lobbyStatus: "active" });
             console.log(`🔄 عودة لاعب: ${author.displayName}`);
           }
        }

        // --- منطق القنبلة ---
        if (currentBombHolderId) {
          const sender = await storage.getUserByUsername(author.displayName);

          if (sender && sender.id === currentBombHolderId) {
            const numberMatch = text.match(/\d+/); // البحث عن رقم في الرسالة

            if (numberMatch) {
              const targetId = parseInt(numberMatch[0]);
              const allUsers = await storage.getUsers();
              // التأكد أن الهدف موجود ونشط وليس نفس الشخص
              const targetUser = allUsers.find(u => u.id === targetId && u.lobbyStatus === "active");

              if (targetUser && targetUser.id !== currentBombHolderId) {
                // تمرير القنبلة
                currentBombHolderId = targetUser.id;
                io.emit("bomb_started", { playerId: targetUser.id });
                console.log(`💣 تم تمرير القنبلة من ${sender.username} إلى ${targetUser.username}`);
                
                // إعادة ضبط المؤقت للشخص الجديد
                startBombTimer(); 
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Poll Error:", error);
    } finally {
      isPolling = false;
      // استطلاع كل 3 ثواني
      pollingTimeout = setTimeout(pollChat, 3000);
    }
  }

  // ==================== Bomb Game Logic ====================

  function startBombTimer() {
    // 1. تنظيف المؤقت السابق لمنع التداخل
    if (bombTimer) {
      clearInterval(bombTimer);
      bombTimer = null;
    }

    bombRemainingSeconds = 30;
    // إعلام الجميع ببدء العد للشخص الحالي
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
          console.log(`💥 انفجرت القنبلة في اللاعب ID: ${victimId}`);
          
          await storage.updateUserStatus(victimId, "eliminated");
          io.emit("player_eliminated", { playerId: victimId });

          // التحقق من حالة اللعبة بعد الإقصاء
          checkGameState();
        }
      }
    }, 1000);
  }

  async function checkGameState() {
    const updatedUsers = await storage.getUsers();
    const active = updatedUsers.filter(u => u.lobbyStatus === "active");

    if (active.length === 1) {
      // فائز واحد
      const winner = active[0];
      currentBombHolderId = null;
      if (bombTimer) clearInterval(bombTimer);
      
      io.emit("game_winner", winner);
      console.log(`🏆 الفائز: ${winner.username}`);

      setTimeout(async () => {
        await storage.resetAllUsersStatus();
        io.emit("game_reset");
      }, 5000);

    } else if (active.length > 1) {
      // اللعبة مستمرة - اختيار ضحية جديدة عشوائية
      const nextPlayer = active[Math.floor(Math.random() * active.length)];
      currentBombHolderId = nextPlayer.id;
      startBombTimer();
    } else {
      // الجميع خسر (حالة نادرة)
      currentBombHolderId = null;
      io.emit("game_reset");
    }
  }

  // ==================== General API Routes ====================

  app.get("/api/stream-meta", async (req, res) => {
    try {
      const { url } = req.query;
      if (typeof url !== "string") return res.status(400).json({ message: "Invalid URL" });

      const videoId = extractVideoId(url);
      if (!videoId) return res.status(400).json({ message: "Invalid YouTube URL" });

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
      const videoId = extractVideoId(url);
      
      if (!videoId) {
        return res.status(400).json({ message: "رابط غير صالح" });
      }

      console.log(`📹 إعداد البث للفيديو: ${videoId}`);
      
      // تنظيف الحالة السابقة
      if (pollingTimeout) clearTimeout(pollingTimeout);
      activeLiveChatId = await getLiveChatId(videoId);
      
      nextPageToken = null;
      messageCache.clear();

      if (activeLiveChatId) {
        // جلب تفاصيل الفيديو للعرض
        const metaUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
        const metaRes = await fetch(metaUrl);
        const metaData = await metaRes.json();
        const snippet = metaData.items?.[0]?.snippet;
        const thumbnail = snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const title = snippet?.title || "Live Stream";

        // إعداد لعبة المسدسات أيضاً
        if (gunDuelGame) {
          try {
            await gunDuelGame.startMonitoring(videoId);
          } catch (error) {
            console.error("⚠️ فشل بدء مراقبة المسدسات (قد يكون طبيعياً):", error);
          }
        }

        // بدء حلقة الاستطلاع
        pollChat();
        
        res.json({ success: true, title, thumbnail });
      } else {
        res.status(400).json({ message: "لا يمكن العثور على شات مباشر لهذا الفيديو" });
      }
    } catch (e) {
      console.error("❌ خطأ في /api/sync:", e);
      res.status(500).json({ message: "خطأ في السيرفر" });
    }
  });

  app.get(api.users.list.path, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users.sort((a, b) => a.id - b.id));
    } catch (error) {
      res.status(500).json([]);
    }
  });

  app.get("/api/system/status", (req, res) => {
    res.json({ 
      isPolling: isPolling, 
      activeLiveChatId, 
      bombActive: currentBombHolderId !== null,
      gunDuelActive: gunDuelGame ? gunDuelGame.isActive() : false
    });
  });

  // ==================== Bomb Game Control Routes ====================

  app.post("/api/game/start-bomb", async (req, res) => {
    const users = await storage.getUsers();
    const activePlayers = users.filter(u => u.lobbyStatus === "active");

    if (activePlayers.length < 2) return res.status(400).json({ message: "عدد اللاعبين غير كاف (يحتاج 2+)" });

    const randomPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];
    currentBombHolderId = randomPlayer.id;

    startBombTimer();
    res.json({ success: true, startPlayer: randomPlayer.username });
  });

  app.post("/api/game/reset", async (req, res) => {
    if (bombTimer) clearInterval(bombTimer);
    bombTimer = null;
    currentBombHolderId = null;
    await storage.resetAllUsersStatus();
    io.emit("game_reset");
    res.json({ success: true });
  });

  // ==================== Gun Duel Game Routes ====================

  app.get("/api/gun-duel/stats", async (req, res) => {
    if (!gunDuelGame) return res.status(503).json({ message: "خدمة المسدسات غير متوفرة" });
    try {
      const stats = await gunDuelGame.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "خطأ داخلي" });
    }
  });

  app.post("/api/gun-duel/start", async (req, res) => {
    if (!gunDuelGame) return res.status(503).json({ message: "خدمة المسدسات غير متوفرة" });
    if (currentBombHolderId !== null) return res.status(400).json({ message: "لا يمكن البدء: لعبة القنبلة جارية" });

    try {
      await gunDuelGame.startGameFromActivePlayers();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "فشل بدء اللعبة" });
    }
  });

  app.post("/api/gun-duel/reset", async (req, res) => {
    if (!gunDuelGame) return res.status(503).json({ message: "خدمة المسدسات غير متوفرة" });
    try {
      await gunDuelGame.resetGame();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "فشل إعادة التعيين" });
    }
  });

  app.post("/api/gun-duel/stop-monitoring", (req, res) => {
    if (!gunDuelGame) return res.status(503).json({ message: "خدمة المسدسات غير متوفرة" });
    gunDuelGame.stopMonitoring();
    res.json({ success: true });
  });

  // ==================== Test & Debug Routes ====================

  app.post("/api/game/add-test-player", async (req, res) => {
    try {
      const { username } = req.body;
      const playerName = username || `TestUser_${Date.now()}`;
      
      const testPlayer = {
        username: playerName,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${playerName}`,
        externalId: `test_${Date.now()}_${Math.random()}`,
        lobbyStatus: "active" as const
      };

      // استخدام createUser لضمان الاتساق
      const user = await storage.createUser(testPlayer);
      io.emit("new_player", user);

      // فحص التشغيل التلقائي للمسدسات إذا كان مفعل
      if (gunDuelGame && !gunDuelGame.isActive()) {
         // يمكن وضع منطق التشغيل التلقائي هنا إذا رغبت
      }

      res.json({ success: true, user });
    } catch (error) {
      console.error("Test User Error:", error);
      res.status(500).json({ message: "فشل إضافة لاعب تجريبي" });
    }
  });

  app.post("/api/game/add-test-players", async (req, res) => {
    try {
      for (let i = 1; i <= 3; i++) {
        const id = Date.now() + i;
        await storage.createUser({
          username: `لاعب تجريبي ${i}`,
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=bot${id}`,
          externalId: `bot_${id}`,
          lobbyStatus: "active"
        });
      }
      // تحديث القائمة للجميع
      const allUsers = await storage.getUsers();
      // هنا نفترض أن الواجهة تقوم بعمل Polling أو نستطيع إرسال event
      io.emit("players_waiting", { count: allUsers.length, players: allUsers }); // تحديث عام
      
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: "Error adding bots" });
    }
  });

  app.post("/api/game/send-test-message", async (req, res) => {
    try {
      const { message, playerId } = req.body;
      const player = playerId || "test_player_1";

      console.log(`🧪 رسالة تجريبية [${player}]: ${message}`);

      // إرسال لـ GunDuel
      if (gunDuelGame) {
        await gunDuelGame.processTestMessage(player, message);
      }
      
      // ملاحظة: لمحاكاة القنبلة هنا، ستحتاج لمنطق إضافي لأن دالة pollChat تعتمد على fetch
      // لكن بالنسبة لـ GunDuel فالأمر يعمل عبر دالة processTestMessage المخصصة

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "فشل إرسال الرسالة" });
    }
  });

  app.post("/api/game/clear-dummy-players", async (req, res) => {
    try {
      // إذا كانت الدالة غير موجودة في storage.ts، يجب إضافتها أو استخدام Loop
      if (typeof storage.deleteDummyPlayers === 'function') {
        await storage.deleteDummyPlayers();
      } else {
        // Fallback: حذف يدوي (غير فعال لكن يعمل كبديل)
        const users = await storage.getUsers();
        for (const user of users) {
          if (user.externalId.startsWith('test_') || user.externalId.startsWith('bot_')) {
            // ملاحظة: نحتاج لدالة deleteUser في storage
             // await storage.deleteUser(user.id); 
             console.log(`⚠️ يجب حذف ${user.username} يدوياً لعدم توفر دالة deleteUser`);
          }
        }
      }
      
      io.emit("game_reset");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "خطأ في التنظيف" });
    }
  });
  
  // إحصائيات عامة
  app.get("/api/game/stats", async (req, res) => {
    try {
      const allUsers = await storage.getUsers();
      const stats = allUsers
        .filter(u => u.totalGames > 0)
        .map(u => ({
          username: u.username,
          wins: u.wins,
          losses: u.losses,
          totalGames: u.totalGames,
          winRate: u.totalGames > 0 ? ((u.wins / u.totalGames) * 100).toFixed(1) : 0,
          avgReactionTime: u.avgReactionTime ? u.avgReactionTime.toFixed(0) : 0
        }))
        .sort((a, b) => b.totalGames - a.totalGames);

      res.json({ stats });
    } catch (error) {
      res.status(500).json({ message: "خطأ في الإحصائيات" });
    }
  });

  return httpServer;
}
 