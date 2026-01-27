import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { Server as SocketIOServer } from "socket.io";
import { api } from "@shared/routes";
import { z } from "zod";

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

  async function getLiveChatId(videoId: string) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${YT_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  }

  async function pollChat() {
    if (!activeLiveChatId || !YT_API_KEY) return;
    try {
      const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${activeLiveChatId}&part=snippet,authorDetails&key=${YT_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const messages = data.items || [];

      for (const msg of messages) {
        const text = msg.snippet.displayMessage;
        const publishTime = msg.snippet.publishedAt;

        if (lastMessageTime && publishTime <= lastMessageTime) continue;
        
        if (text.trim() === "!دخول") {
          const author = msg.authorDetails;
          const username = author.displayName;
          const avatarUrl = author.profileImageUrl;
          const externalId = author.channelId;

          const existing = await storage.getUserByUsername(username);
          if (!existing) {
            const user = await storage.createUser({
              username,
              avatarUrl,
              externalId
            });
            io.emit("new_player", user);
          }
        }
        lastMessageTime = publishTime;
      }
    } catch (e) {
      console.error("Chat polling error:", e);
    }
  }

  app.post("/api/sync", async (req, res) => {
    try {
      const { url } = req.body;
      const videoIdMatch = url.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/)([^?&]+)/);
      if (!videoIdMatch) return res.status(400).json({ message: "Invalid YouTube URL" });
      const videoId = videoIdMatch[1];

      // Get metadata
      const metaUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoId}&key=${YT_API_KEY}`;
      const metaRes = await fetch(metaUrl);
      const metaData = await metaRes.json();
      const video = metaData.items?.[0];

      if (!video) return res.status(404).json({ message: "Stream not found" });

      const thumbnail = video.snippet.thumbnails.high.url;
      const title = video.snippet.title;
      activeLiveChatId = video.liveStreamingDetails?.activeLiveChatId;

      if (pollingInterval) clearInterval(pollingInterval);
      if (activeLiveChatId) {
        pollingInterval = setInterval(pollChat, 5000);
      }

      res.json({ thumbnail, title });
    } catch (e) {
      res.status(500).json({ message: "Sync failed" });
    }
  });

  app.get(api.users.list.path, async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  app.post("/api/game/start-bomb", async (req, res) => {
    const users = await storage.getUsers();
    if (users.length === 0) return res.status(400).json({ message: "No players in the circle" });
    
    const randomIdx = Math.floor(Math.random() * users.length);
    const selectedPlayer = users[randomIdx];
    
    io.emit("bomb_started", { playerId: selectedPlayer.id });
    res.json({ success: true, playerId: selectedPlayer.id });
  });

  return httpServer;
}
