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
  const MAX_RECONNECT_ATTEMPTS = 5;
  let isPolling = false;

  // دالة ذكية للحصول على liveChatId مع إعادة المحاولة التلقائية
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
          reconnectAttempts = 0;
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

  // دالة محسّنة لجلب الرسائل مع دعم nextPageToken
  async function pollChat() {
    if (!activeLiveChatId || !YT_API_KEY) {
      console.warn(`⚠️ تخطي الاستطلاع: activeLiveChatId=${activeLiveChatId}, hasAPIKey=${!!YT_API_KEY}`);
      return;
    }

    if (isPolling) {
      console.log(`⏳ استطلاع جاري بالفعل، التخطي...`);
      return;
    }

    isPolling = true;

    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeLiveChatId}&part=snippet,authorDetails&maxResults=200&key=${YT_API_KEY}`;

      if (nextPageToken) {
        url += `&pageToken=${nextPageToken}`;
        console.log(`📄 استخدام pageToken للتمرير`);
      }

      console.log(`🔄 استطلاع الدردشة...`);
      const res = await fetch(url);

      if (res.status === 403) {
        const errorData = await res.json().catch(() => ({}));
        console.error("❌ خطأ 403 (Quota Limit):", JSON.stringify(errorData));

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const waitTime = 5000 * reconnectAttempts;
          console.log(`🔄 محاولة إعادة الاتصال ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} بعد ${waitTime/1000}s...`);

          setTimeout(() => {
            nextPageToken = null;
            messageCache.clear();
            isPolling = false;
          }, waitTime);
        } else {
          console.error("❌ تم الوصول للحد الأقصى من محاولات إعادة الاتصال");
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

      if (data.nextPageToken) {
        nextPageToken = data.nextPageToken;
        console.log(`✅ تم تحديث pageToken للتمرير التالي`);
      }

      console.log(`📨 تم استقبال ${messages.length} رسالة`);

      let newMessagesCount = 0;

      for (const msg of messages) {
        try {
          const text = msg.snippet?.displayMessage || "";
          const publishTime = msg.snippet?.publishedAt;
          const messageId = msg.id;

          if (!text || !publishTime || !messageId) {
            continue;
          }

          if (messageCache.has(messageId)) {
            continue;
          }

          if (lastMessageTime && publishTime <= lastMessageTime) {
            continue;
          }

          messageCache.add(messageId);
          newMessagesCount++;

          if (messageCache.size > 1000) {
            const oldestMessages = Array.from(messageCache).slice(0, 500);
            oldestMessages.forEach(id => messageCache.delete(id));
            console.log(`🗑️ تم تنظيف ${oldestMessages.length} رسالة قديمة من الذاكرة`);
          }

          const cleanText = text.trim();
          const author = msg.authorDetails;
          console.log(`💬 [${author?.displayName || 'Unknown'}]: "${cleanText}"`);

          const lowerText = cleanText.toLowerCase();
          const normalizedText = cleanText
            .replace(/\s+/g, '')
            .replace(/[!！｜]/g, '!');

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
            const username = author?.displayName;
            const avatarUrl = author?.profileImageUrl;
            const externalId = author?.channelId;

            if (!username || !externalId) {
              console.warn("⚠️ معلومات المستخدم غير كاملة");
              continue;
            }

            try {
              const existing = await storage.getUserByUsername(username);
              if (!existing) {
                const user = await storage.createUser({
                  username,
                  avatarUrl: avatarUrl || "",
                  externalId,
                  lobbyStatus: "active"
                });

                io.emit("new_player", user);
                console.log(`✅ [لاعب جديد]: ${username} (ID: ${user.id})`);
              } else if (existing.lobbyStatus !== "active") {
                await storage.updateUserStatus(existing.id, "active");
                io.emit("new_player", { ...existing, lobbyStatus: "active" });
                console.log(`🔄 [إعادة تفعيل لاعب]: ${username} (ID: ${existing.id})`);
              } else {
                console.log(`ℹ️ [لاعب موجود بالفعل]: ${username} (ID: ${existing.id})`);
              }
            } catch (storageError) {
              console.error("❌ خطأ في إضافة اللاعب:", storageError);
            }
          }

          // منطق تمرير القنبلة - استخدام Display ID (رقم الترتيب)
          if (currentBombHolderId) {
            const senderName = author?.displayName;

            if (!senderName) continue;

            try {
              const sender = await storage.getUserByUsername(senderName);

              // التحقق من أن المرسل هو حامل القنبلة
              if (sender && sender.id === currentBombHolderId) {
                // جلب قائمة اللاعبين النشطين فقط
                const allUsers = await storage.getUsers();
                const activePlayers = allUsers.filter(u => u.lobbyStatus === "active");

                // إنشاء خريطة Display ID → User
                // Display ID يبدأ من 1 ويزيد تدريجياً
                const displayIdMap = new Map<number, typeof activePlayers[0]>();
                activePlayers.forEach((player, index) => {
                  const displayId = index + 1; // الترتيب يبدأ من 1
                  displayIdMap.set(displayId, player);
                });

                // استخراج الرقم من الرسالة باستخدام RegExp
                const numberMatch = cleanText.match(/\d+/);

                if (numberMatch) {
                  const targetDisplayId = parseInt(numberMatch[0]);

                  // التحقق من صحة الرقم
                  if (!isNaN(targetDisplayId) && targetDisplayId >= 1) {
                    // البحث عن اللاعب باستخدام Display ID
                    const targetUser = displayIdMap.get(targetDisplayId);

                    if (targetUser) {
                      // التحقق من أن اللاعب المستهدف ليس نفس حامل القنبلة
                      if (targetUser.id !== currentBombHolderId) {
                        // تمرير القنبلة
                        currentBombHolderId = targetUser.id;
                        io.emit("bomb_started", { playerId: targetUser.id });

                        console.log(`💣 [تمرير القنبلة]: ${sender.username} → ${targetUser.username}`);
                        console.log(`   Display ID: #${targetDisplayId} → Database ID: ${targetUser.id}`);
                      } else {
                        console.warn(`⚠️ اللاعب حاول تمرير القنبلة لنفسه`);
                        io.emit("bomb_transfer_failed", { 
                          reason: "cannot_transfer_to_self",
                          displayId: targetDisplayId 
                        });
                      }
                    } else {
                      console.warn(`⚠️ رقم الترتيب ${targetDisplayId} غير موجود`);
                      console.log(`   اللاعبون النشطون: ${activePlayers.length} لاعب (1-${activePlayers.length})`);

                      io.emit("bomb_transfer_failed", { 
                        reason: "player_not_found",
                        displayId: targetDisplayId,
                        maxPlayers: activePlayers.length
                      });
                    }
                  } else {
                    console.warn(`⚠️ رقم غير صالح: ${targetDisplayId}`);
                  }
                }
              }
            } catch (bombError) {
              console.error("❌ خطأ في تمرير القنبلة:", bombError);
            }
          }

          lastMessageTime = publishTime;
        } catch (msgError) {
          console.error("❌ خطأ في معالجة الرسالة:", msgError);
        }
      }

      if (newMessagesCount > 0) {
        console.log(`✅ تمت معالجة ${newMessagesCount} رسالة جديدة`);
      }

      reconnectAttempts = 0;

    } catch (e) {
      console.error("❌ خطأ في استطلاع الدردشة:", e);

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`🔄 إعادة المحاولة ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      }
    } finally {
      isPolling = false;
    }
  }

  // ==================== Routes ====================

  app.post("/api/sync", async (req, res) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "رابط غير صالح" });
      }

      const videoIdMatch = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
      if (!videoIdMatch) {
        return res.status(400).json({ message: "رابط YouTube غير صالح" });
      }
      const videoId = videoIdMatch[1];

      console.log(`🎥 محاولة المزامنة مع الفيديو: ${videoId}`);

      let thumbnail = "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=1000";
      let title = "البث المباشر";

      try {
        const metaUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${YT_API_KEY}`;
        const metaRes = await fetch(metaUrl);
        const metaData = await metaRes.json();

        const video = metaData.items?.[0];

        if (video) {
          const thumbnails = video.snippet?.thumbnails;
          thumbnail = thumbnails?.maxres?.url || thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || thumbnail;
          title = video.snippet?.title || title;
          activeLiveChatId = video.liveStreamingDetails?.activeLiveChatId || null;
        } else {
          thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }
      } catch (e) {
        console.error("⚠️ خطأ في جلب البيانات الوصفية، استخدام القيم الافتراضية:", e);
        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }

      if (!activeLiveChatId) {
        console.log("🔍 لم يتم العثور على activeLiveChatId، محاولة الحصول عليه...");
        activeLiveChatId = await getLiveChatId(videoId);
      }

      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log("⏹️ تم إيقاف الاستطلاع السابق");
      }

      nextPageToken = null;
      messageCache.clear();
      lastMessageTime = null;
      reconnectAttempts = 0;
      isPolling = false;

      if (activeLiveChatId) {
        console.log(`✅ بدء استطلاع الدردشة لـ: ${activeLiveChatId}`);
        pollChat();
        pollingInterval = setInterval(pollChat, 10000);

        res.json({ thumbnail, title, success: true });
      } else {
        console.error("❌ لا يوجد activeLiveChatId متاح لبدء الاستطلاع");
        res.status(400).json({ 
          message: "لا يمكن العثور على دردشة مباشرة نشطة لهذا الفيديو",
          thumbnail,
          title
        });
      }
    } catch (e) {
      console.error("❌ فشلت عملية المزامنة:", e);
      res.status(500).json({ message: "فشلت عملية المزامنة" });
    }
  });

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
          thumbnail: video.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          title: video.snippet?.title || "البث المباشر"
        });
      } else {
        res.status(404).json({ message: "لم يتم العثور على الفيديو" });
      }
    } catch (e) {
      console.error("❌ خطأ في جلب البيانات الوصفية:", e);
      res.status(500).json({ message: "فشل جلب البيانات" });
    }
  });

  app.get(api.users.list.path, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (e) {
      console.error("❌ خطأ في جلب قائمة المستخدمين:", e);
      res.status(500).json({ message: "فشل جلب المستخدمين" });
    }
  });

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

  io.on("connection", (socket) => {
    console.log(`🔌 اتصال جديد: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`❌ انقطاع الاتصال: ${socket.id}`);
    });
  });

  httpServer.on('close', () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      console.log("🛑 تم إيقاف الاستطلاع عند إغلاق الخادم");
    }
  });

  console.log("✅ تم تهيئة جميع المسارات بنجاح");
  console.log(`📋 مسار قائمة اللاعبين: ${api.users.list.path}`);

  return httpServer;
}
