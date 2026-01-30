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
  let nextPageToken: string | null = null;
  let messageCache = new Set<string>();
  let currentBombHolderId: number | null = null;
  let isPolling = false;
  let gameActive = false; // تتبع حالة اللعبة لتقليل الاستهلاك

  // --- وظائف مساعدة ذكية ---

  async function checkWinner() {
    const users = await storage.getUsers();
    const active = users.filter(u => u.lobbyStatus === "active");

    if (active.length === 1 && gameActive) {
      const winner = active[0];
      gameActive = false;
      currentBombHolderId = null;
      io.emit("game_winner", winner);
      console.log(`🏆 الفائز المكتشف: ${winner.username}`);
      return true;
    }
    return false;
  }

  async function pollChat() {
    // ذكاء اصطناعي: لا تسحب بيانات إذا لم يكن هناك شات أو كوتا
    if (!activeLiveChatId || !YT_API_KEY || isPolling) return;

    isPolling = true;
    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeLiveChatId}&part=snippet,authorDetails&maxResults=200&key=${YT_API_KEY}`;
      if (nextPageToken) url += `&pageToken=${nextPageToken}`;

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403) console.error("⚠️ خطأ في الكوتا - توقف مؤقتاً");
        return;
      }

      const data = await res.json();
      nextPageToken = data.nextPageToken || nextPageToken;
      const messages = data.items || [];

      for (const msg of messages) {
        const text = msg.snippet?.displayMessage || "";
        const messageId = msg.id;
        const author = msg.authorDetails;

        if (messageCache.has(messageId)) continue;
        messageCache.add(messageId);
        if (messageCache.size > 1000) messageCache.clear();

        // 1. منطق الانضمام الذكي
        if (/!?(دخول|join|انضمام)/i.test(text)) {
          const existing = await storage.getUserByUsername(author.displayName);
          if (!existing) {
            const user = await storage.createUser({
              username: author.displayName,
              avatarUrl: author.profileImageUrl,
              externalId: author.channelId,
              lobbyStatus: "active"
            });
            io.emit("new_player", user);
          } else if (existing.lobbyStatus !== "active") {
            await storage.updateUserStatus(existing.id, "active");
            io.emit("new_player", { ...existing, lobbyStatus: "active" });
          }
        }

        // 2. منطق التمرير الذكي (Smart Pass)
        if (currentBombHolderId && gameActive) {
          const sender = await storage.getUserByUsername(author.displayName);
          if (sender && sender.id === currentBombHolderId) {
            // استخراج الرقم بذكاء أو المنشن
            const numberMatch = text.match(/\d+/);
            if (numberMatch) {
              const targetId = parseInt(numberMatch[0]);
              const allUsers = await storage.getUsers();
              const targetUser = allUsers.find(u => u.id === targetId && u.lobbyStatus === "active");

              if (targetUser && targetUser.id !== currentBombHolderId) {
                currentBombHolderId = targetUser.id;
                io.emit("bomb_started", { playerId: targetUser.id });
                console.log(`✅ مررت لـ ${targetUser.username}`);
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

  // --- API Routes ---

  app.post("/api/sync", async (req, res) => {
    const { url } = req.body;
    const videoIdMatch = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
    if (!videoIdMatch) return res.status(400).json({ message: "رابط غير صالح" });

    activeLiveChatId = await (async (id) => {
      try {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${id}&key=${YT_API_KEY}`);
        const d = await r.json();
        return d.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
      } catch { return null; }
    })(videoIdMatch[1]);

    if (activeLiveChatId) {
      if (pollingInterval) clearInterval(pollingInterval);
      // ذكاء: التحديث كل 4 ثوانٍ لتوفير الكوتا وضمان السرعة
      pollingInterval = setInterval(pollChat, 4000);
      res.json({ success: true });
    } else {
      res.status(400).json({ message: "البث غير مباشر أو الشات مغلق" });
    }
  });

  app.post("/api/game/start-bomb", async (req, res) => {
    const users = await storage.getUsers();
    const active = users.filter(u => u.lobbyStatus === "active");
    if (active.length < 2) return res.status(400).json({ message: "تحتاج لاعبين اثنين على الأقل" });

    gameActive = true;
    const randomPlayer = active[Math.floor(Math.random() * active.length)];
    currentBombHolderId = randomPlayer.id;
    io.emit("bomb_started", { playerId: randomPlayer.id });
    res.json({ success: true });
  });

  app.post("/api/game/eliminate", async (req, res) => {
    const { playerId } = req.body;
    await storage.updateUserStatus(playerId, "eliminated");
    io.emit("player_eliminated", { playerId });

    // فحص الفوز فوراً بعد الاستبعاد
    const won = await checkWinner();
    if (!won && playerId === currentBombHolderId) {
      // نقل القنبلة لشخص آخر إذا كان المستبعد هو حاملها
      const active = (await storage.getUsers()).filter(u => u.lobbyStatus === "active");
      const next = active[Math.floor(Math.random() * active.length)];
      currentBombHolderId = next.id;
      io.emit("bomb_started", { playerId: next.id });
    }
    res.json({ success: true });
  });

  app.post("/api/game/reset", async (req, res) => {
    await storage.resetAllUsersStatus();
    currentBombHolderId = null;
    gameActive = false;
    io.emit("game_reset");
    res.json({ success: true });
  });

  app.get(api.users.list.path, async (req, res) => {
    const users = await storage.getUsers();
    res.json(users.sort((a, b) => a.id - b.id));
  });

  return httpServer;
}
export const GameCircle = () =>