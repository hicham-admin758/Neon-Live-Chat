import { z } from "zod";
import { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { Express } from "express";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
    },
  });

  const YT_API_KEY = process.env.YOUTUBE_API_KEY;
  let activeLiveChatId: string | null = null;
  let pollingInterval: NodeJS.Timeout | null = null;
  let lastMessageTime: string | null = null;
  let currentBombHolderId: number | null = null;
  let nextPageToken: string | null = null; // إضافة للتمرير الذكي
  let messageCache = new Set<string>(); // لمنع التكرار
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  let isPolling = false; // منع التداخل في الطلبات

  // دالة ذكية للحصول على liveChatId مع إعادة المحاولة
  async function getLiveChatId(videoId: string, retries = 3): Promise<string | null> {
    console.log(`🔍 محاولة الحصول على liveChatId للفيديو: ${videoId} (محاولة ${4 - retries}/3)`);

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${YT_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
          console.error(`❌ خطأ HTTP ${res.status} في المحاولة ${attempt + 1}`);
          if (attempt < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
            continue;
          }
          return null;
        }

        const data = await res.json();
        const chatId = data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;

        if (chatId) {
          console.log(`✅ تم العثور على liveChatId بنجاح`);
          reconnectAttempts = 0; // إعادة تعيين عداد المحاولات
          return chatId;
        }

        console.warn(`⚠️ لم يتم العثور على liveChatId في المحاولة ${attempt + 1}`);

        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
        }
      } catch (e) {
        console.error(`❌ خطأ في المحاولة ${attempt + 1}:`, e);
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
        }
      }
    }

    return null;
  }

  // دالة محسّنة لجلب الرسائل مع دعم التمرير pageToken
  async function pollChat() {
    if (!activeLiveChatId || !YT_API_KEY) {
      console.warn(`⚠️ تخطي الاستطلاع: activeLiveChatId=${activeLiveChatId}, hasAPIKey=${!!YT_API_KEY}`);
      return;
    }

    // منع التداخل في الطلبات
    if (isPolling) {
      console.log(`⏳ استطلاع جاري بالفعل، التخطي...`);
      return;
    }

    isPolling = true;

    try {
      // بناء URL مع pageToken للتمرير الذكي
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeLiveChatId}&part=snippet,authorDetails&maxResults=200&key=${YT_API_KEY}`;

      if (nextPageToken) {
        url += `&pageToken=${nextPageToken}`;
        console.log(`📄 استخدام pageToken للتمرير: ${nextPageToken.substring(0, 20)}...`);
      }

      console.log(`🔄 استطلاع الدردشة...`);
      const res = await fetch(url);

      // معالجة أخطاء API بذكاء
      if (res.status === 403) {
        const errorData = await res.json().catch(() => ({}));
        console.error("❌ خطأ 403 في YouTube API:", JSON.stringify(errorData));

        // محاولة إعادة الاتصال
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`🔄 محاولة إعادة الاتصال ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
          setTimeout(() => {
            nextPageToken = null;
            messageCache.clear();
          }, 5000 * reconnectAttempts);
        }
        isPolling = false;
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "خطأ غير معروف");
        console.error(`❌ خطأ في YouTube API (${res.status}): ${errorText}`);
        isPolling = false;
        return;
      }

      const data = await res.json();
      const messages = data.items || [];

      // تحديث pageToken للدورة القادمة (الحل الأساسي لمشكلة التمرير)
      if (data.nextPageToken) {
        nextPageToken = data.nextPageToken;
        console.log(`✅ تم تحديث pageToken للتمرير التالي`);
      }

      // حفظ pollingIntervalMillis المقترح من YouTube
      const pollingInterval = data.pollingIntervalMillis || 15000;

      console.log(`📨 تم استقبال ${messages.length} رسالة`);

      let newMessagesCount = 0;

      for (const msg of messages) {
        const text = msg.snippet.displayMessage;
        const publishTime = msg.snippet.publishedAt;
        const messageId = msg.id;

        // تخطي الرسائل المكررة باستخدام messageId
        if (messageCache.has(messageId)) {
          continue;
        }

        // تخطي الرسائل القديمة
        if (lastMessageTime && publishTime <= lastMessageTime) {
          continue;
        }

        messageCache.add(messageId);
        newMessagesCount++;

        // تنظيف الذاكرة المؤقتة إذا أصبحت كبيرة جداً
        if (messageCache.size > 1000) {
          const oldestMessages = Array.from(messageCache).slice(0, 500);
          oldestMessages.forEach(id => messageCache.delete(id));
        }

        const cleanText = text.trim();
        console.log(`💬 [${msg.authorDetails.displayName}]: "${cleanText}"`);

        // مطابقة ذكية لأوامر الانضمام - دعم أوسع
        const lowerText = cleanText.toLowerCase();
        const normalizedText = cleanText
          .replace(/\s+/g, '') // إزالة المسافات
          .replace(/[!！｜]/g, '!'); // توحيد علامات التعجب

        const joinPatterns = [
          /^!+دخول$/i,
          /^دخول!+$/i,
          /^!+join$/i,
          /^join!+$/i,
          /دخول/i,
          /join/i,
        ];

        const isJoinCommand = joinPatterns.some(pattern => 
          pattern.test(normalizedText) || pattern.test(lowerText)
        );

        if (isJoinCommand) {
          const author = msg.authorDetails;
          const username = author.displayName;
          const avatarUrl = author.profileImageUrl;
          const externalId = author.channelId;

          const existing = await storage.getUserByUsername(username);
          if (!existing) {
            const user = await storage.createUser({
              username,
              avatarUrl,
              externalId,
              lobbyStatus: "active"
            });
            io.emit("new_player", user);
            console.log(`✅ [لاعب جديد]: ${username}`);
          } else if (existing.lobbyStatus !== "active") {
            await storage.updateUserStatus(existing.id, "active");
            io.emit("new_player", { ...existing, lobbyStatus: "active" });
            console.log(`🔄 [إعادة تفعيل لاعب]: ${username}`);
          } else {
            console.log(`ℹ️ [لاعب موجود بالفعل]: ${username}`);
          }
        }

        // منطق تمرير القنبلة - محسّن وأكثر أماناً
        if (currentBombHolderId) {
          const author = msg.authorDetails;
          const senderName = author.displayName;
          const sender = await storage.getUserByUsername(senderName);

          if (sender && sender.id === currentBombHolderId) {
            // استخراج الرقم من الرسالة بذكاء
            const numberMatch = cleanText.match(/\d+/);
            if (numberMatch) {
              const targetId = parseInt(numberMatch[0]);

              if (!isNaN(targetId) && targetId !== currentBombHolderId) {
                const targetUser = await storage.getUser(targetId);
                if (targetUser && targetUser.lobbyStatus === "active") {
                  currentBombHolderId = targetId;
                  io.emit("bomb_started", { playerId: targetId });
                  console.log(`💣 [تمرير القنبلة]: ${sender.username} (${sender.id}) → اللاعب ${targetId}`);
                } else {
                  console.warn(`⚠️ اللاعب ${targetId} غير نشط أو غير موجود`);
                }
              }
            }
          }
        }

        lastMessageTime = publishTime;
      }

      if (newMessagesCount > 0) {
        console.log(`✅ تمت معالجة ${newMessagesCount} رسالة جديدة`);
      }

      // إعادة تعيين عداد محاولات الاتصال عند النجاح
      reconnectAttempts = 0;

    } catch (e) {
      console.error("❌ خطأ في استطلاع الدردشة:", e);

      // محاولة إعادة الاتصال
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`🔄 إعادة المحاولة ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      }
    } finally {
      isPolling = false;
    }
  }

  // نقطة نهاية المزامنة المحسّنة
  app.post("/api/sync", async (req, res) => {
    try {
      const { url } = req.body;
      const videoIdMatch = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
      if (!videoIdMatch) {
        return res.status(400).json({ message: "رابط YouTube غير صالح" });
      }
      const videoId = videoIdMatch[1];

      console.log(`🎥 محاولة المزامنة مع الفيديو: ${videoId}`);

      // الحصول على البيانات الوصفية
      let thumbnail = "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=1000";
      let title = "البث المباشر";

      try {
        const metaUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${YT_API_KEY}`;
        const metaRes = await fetch(metaUrl);
        const metaData = await metaRes.json();

        const video = metaData.items?.[0];

        if (video) {
          const thumbnails = video.snippet.thumbnails;
          thumbnail = thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url;
          title = video.snippet.title;
          activeLiveChatId = video.liveStreamingDetails?.activeLiveChatId;
        } else {
          thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }
      } catch (e) {
        console.error("⚠️ خطأ في جلب البيانات الوصفية، استخدام القيم الافتراضية:", e);
        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }

      // إذا لم نحصل على activeLiveChatId، محاولة الحصول عليه بذكاء
      if (!activeLiveChatId) {
        console.log("🔍 لم يتم العثور على activeLiveChatId، محاولة الحصول عليه...");
        activeLiveChatId = await getLiveChatId(videoId);
      }

      // إيقاف الاستطلاع السابق
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log("⏹️ تم إيقاف الاستطلاع السابق");
      }

      // إعادة تعيين حالة التمرير
      nextPageToken = null;
      messageCache.clear();
      lastMessageTime = null;
      reconnectAttempts = 0;

      if (activeLiveChatId) {
        console.log(`✅ بدء استطلاع الدردشة لـ: ${activeLiveChatId}`);
        // بدء الاستطلاع الفوري ثم كل 10 ثواني
        pollChat();
        pollingInterval = setInterval(pollChat, 10000);
      } else {
        console.error("❌ لا يوجد activeLiveChatId متاح لبدء الاستطلاع");
        return res.status(400).json({ 
          message: "لا يمكن العثور على دردشة مباشرة نشطة لهذا الفيديو" 
        });
      }

      res.json({ thumbnail, title, success: true });
    } catch (e) {
      console.error("❌ فشلت عملية المزامنة:", e);
      res.status(500).json({ message: "فشلت عملية المزامنة" });
    }
  });

  // نقطة نهاية البيانات الوصفية للبث
  app.get("/api/stream-meta", async (req, res) => {
    const { url } = req.query;
    if (typeof url !== "string") {
      return res.status(400).json({ message: "رابط غير صالح" });
    }

    const videoIdMatch = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
    if (!videoIdMatch) {
      return res.status(400).json({ message: "رابط YouTube غير صالح" });
    }
    const videoId = videoIdMatch[1];

    try {
      const metaUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
      const metaRes = await fetch(metaUrl);
      const metaData = await metaRes.json();
      const video = metaData.items?.[0];

      if (video) {
        res.json({
          thumbnail: video.snippet.thumbnails.high.url,
          title: video.snippet.title
        });
      } else {
        res.status(404).json({ message: "لم يتم العثور على الفيديو" });
      }
    } catch (e) {
      console.error("❌ خطأ في جلب البيانات الوصفية:", e);
      res.status(500).json({ message: "فشل جلب البيانات" });
    }
  });

  // نقطة نهاية قائمة المستخدمين
  app.get("/api/users/list", async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (e) {
      console.error("❌ خطأ في جلب قائمة المستخدمين:", e);
      res.status(500).json({ message: "فشل جلب المستخدمين" });
    }
  });

  // بدء لعبة القنبلة
  app.post("/api/game/start-bomb", async (req, res) => {
    try {
      const users = await storage.getUsers();
      const activePlayers = users.filter(u => u.lobbyStatus === "active");

      if (activePlayers.length < 2) {
        return res.status(400).json({ 
          message: "يجب وجود لاعبين على الأقل لبدء اللعبة" 
        });
      }

      const randomIdx = Math.floor(Math.random() * activePlayers.length);
      const selectedPlayer = activePlayers[randomIdx];

      currentBombHolderId = selectedPlayer.id;
      io.emit("bomb_started", { playerId: selectedPlayer.id });

      console.log(`💣 بدء اللعبة - القنبلة مع: ${selectedPlayer.username} (${selectedPlayer.id})`);

      res.json({ 
        success: true, 
        playerId: selectedPlayer.id,
        playerName: selectedPlayer.username 
      });
    } catch (e) {
      console.error("❌ خطأ في بدء اللعبة:", e);
      res.status(500).json({ message: "فشل بدء اللعبة" });
    }
  });

  // إقصاء لاعب
  app.post("/api/game/eliminate", async (req, res) => {
    try {
      const { playerId } = req.body;
      if (!playerId) {
        return res.status(400).json({ message: "معرف اللاعب مطلوب" });
      }

      await storage.updateUserStatus(playerId, "eliminated");

      if (currentBombHolderId === playerId) {
        currentBombHolderId = null;
      }

      io.emit("player_eliminated", { playerId });
      console.log(`❌ تم إقصاء اللاعب: ${playerId}`);

      const activeUsers = await storage.getUsers();
      const stillActive = activeUsers.filter(u => u.lobbyStatus === "active");

      if (stillActive.length === 1) {
        io.emit("game_winner", stillActive[0]);
        currentBombHolderId = null;
        console.log(`🏆 الفائز: ${stillActive[0].username}`);
      } else if (stillActive.length > 1 && currentBombHolderId === null) {
        const nextIdx = Math.floor(Math.random() * stillActive.length);
        currentBombHolderId = stillActive[nextIdx].id;
        io.emit("bomb_started", { playerId: currentBombHolderId });
        console.log(`💣 القنبلة انتقلت إلى: ${stillActive[nextIdx].username}`);
      }

      res.json({ success: true });
    } catch (e) {
      console.error("❌ خطأ في إقصاء اللاعب:", e);
      res.status(500).json({ message: "فشل إقصاء اللاعب" });
    }
  });

  // إعادة تعيين اللعبة
  app.post("/api/game/reset", async (req, res) => {
    try {
      await storage.resetAllUsersStatus();
      currentBombHolderId = null;
      io.emit("game_reset");
      console.log("🔄 تمت إعادة تعيين اللعبة");
      res.json({ success: true });
    } catch (e) {
      console.error("❌ خطأ في إعادة التعيين:", e);
      res.status(500).json({ message: "فشلت إعادة التعيين" });
    }
  });

  // حذف جميع المشاركين
  app.post("/api/game/clear-participants", async (req, res) => {
    try {
      await storage.deleteAllUsers();
      currentBombHolderId = null;
      nextPageToken = null;
      messageCache.clear();
      io.emit("game_reset");
      console.log("🗑️ تم حذف جميع المشاركين");
      res.json({ success: true });
    } catch (e) {
      console.error("❌ خطأ في حذف المشاركين:", e);
      res.status(500).json({ message: "فشل حذف المشاركين" });
    }
  });

  // نقطة نهاية حالة النظام (ميزة جديدة)
  app.get("/api/system/status", (req, res) => {
    res.json({
      activeLiveChatId,
      isPolling: !!pollingInterval,
      currentBombHolder: currentBombHolderId,
      reconnectAttempts,
      messageCacheSize: messageCache.size,
      hasNextPageToken: !!nextPageToken,
      uptime: process.uptime()
    });
  });

  // تنظيف عند إغلاق الخادم
  httpServer.on('close', () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      console.log("🛑 تم إيقاف الاستطلاع عند إغلاق الخادم");
    }
  });

  console.log("✅ تم تهيئة جميع المسارات بنجاح");
  return httpServer;
}
