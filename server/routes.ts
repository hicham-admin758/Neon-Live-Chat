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

  io.on("connection", (socket) => {
    console.log("New client connected");

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  app.get(api.users.list.path, async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  app.post(api.users.create.path, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) {
        return res.status(200).json(existing);
      }
      const user = await storage.createUser(input);
      // Emit to all clients
      io.emit("new_player", user);
      res.status(201).json(user);
    } catch (err) {
        if (err instanceof z.ZodError) {
          res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join('.'),
          });
        } else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
  });

  return httpServer;
}
