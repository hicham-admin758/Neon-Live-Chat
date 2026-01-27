import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InsertUser } from "@shared/routes";
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

// Hook for fetching initial users
export function useUsers() {
  return useQuery({
    queryKey: [api.users.list.path],
    queryFn: async () => {
      const res = await fetch(api.users.list.path);
      if (!res.ok) throw new Error("Failed to fetch users");
      return api.users.list.responses[200].parse(await res.json());
    },
  });
}

// Hook for real-time game circle updates
export function useGameCircle() {
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const socketInstance = io();
    setSocket(socketInstance);

    // Listen for new players
    socketInstance.on("new_player", (newUser: unknown) => {
      console.log("New player joined:", newUser);
      // Invalidate query to refetch the list, or optimistically update
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [queryClient]);

  return { isConnected: !!socket };
}
