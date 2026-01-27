import { useState, useEffect } from "react";
import { Youtube, Link as LinkIcon, Wifi, WifiOff, Loader2 } from "lucide-react";
import { io, Socket } from "socket.io-client";

export function ConnectionHeader() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io({
      path: "/socket.io",
    });
    setSocket(newSocket);

    newSocket.on("connect", () => setStatus("connected"));
    newSocket.on("disconnect", () => setStatus("disconnected"));

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleSync = () => {
    if (!url) return;
    setStatus("connecting");
    // Simulate sync logic - in a real app, this would send the URL to the backend
    setTimeout(() => {
      setStatus("connected");
      console.log("Syncing with YouTube URL:", url);
    }, 1500);
  };

  return (
    <div className="fixed top-0 left-0 w-full z-[1100] px-4 py-3">
      <div className="max-w-[1000px] mx-auto bg-black/60 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-3 md:p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 shrink-0">
            {status === "connected" ? (
              <>
                <Wifi size={14} className="text-green-400" />
                <span className="text-[0.75rem] font-bold text-green-400 uppercase tracking-wider">Connected</span>
              </>
            ) : status === "connecting" ? (
              <>
                <Loader2 size={14} className="text-yellow-400 animate-spin" />
                <span className="text-[0.75rem] font-bold text-yellow-400 uppercase tracking-wider">Syncing</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-red-400" />
                <span className="text-[0.75rem] font-bold text-red-400 uppercase tracking-wider">Disconnected</span>
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="relative flex-1 w-full">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400">
              <Youtube size={18} />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/live/..."
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/50 transition-all text-sm"
            />
          </div>

          {/* Action Button */}
          <button
            onClick={handleSync}
            disabled={status === "connecting"}
            className="w-full md:w-auto px-6 py-2 bg-gradient-to-r from-[#8a2be2] to-[#00ffff] text-white font-bold rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-purple-500/20"
          >
            <LinkIcon size={16} />
            <span>Start Sync</span>
          </button>
        </div>
      </div>
    </div>
  );
}
