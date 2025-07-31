import { useChat } from "ai/react";
import { useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useChatsStore } from "@/stores/useChatsStore";

// Helper function to get system state for AI chat
const getSystemState = () => {
  const appStore = useAppStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const chatsStore = useChatsStore.getState();

  const currentVideo = videoStore.getCurrentVideo();
  const currentTrack = ipodStore.tracks[ipodStore.currentIndex];

  // Use new instance-based model
  const openInstances = Object.values(appStore.instances).filter(
    (inst) => inst.isOpen
  );

  const foregroundInstanceId =
    appStore.instanceOrder.length > 0
      ? appStore.instanceOrder[appStore.instanceOrder.length - 1]
      : null;

  const foregroundInstance = foregroundInstanceId
    ? appStore.instances[foregroundInstanceId]
    : null;

  const foregroundApp = foregroundInstance?.appId || null;

  const backgroundApps = openInstances
    .filter((inst) => inst.instanceId !== foregroundInstanceId)
    .map((inst) => inst.appId);

  return {
    // Keep legacy apps for backward compatibility; include instances
    apps: appStore.apps,
    instances: appStore.instances,
    username: chatsStore.username,
    authToken: chatsStore.authToken,
    runningApps: {
      foreground: foregroundApp,
      background: backgroundApps,
      instanceWindowOrder: appStore.instanceOrder,
    },
    internetExplorer: {
      url: ieStore.url,
      year: ieStore.year,
      status: ieStore.status,
      currentPageTitle: ieStore.currentPageTitle,
      aiGeneratedHtml: ieStore.aiGeneratedHtml,
    },
    video: {
      currentVideo: currentVideo
        ? {
            id: currentVideo.id,
            url: currentVideo.url,
            title: currentVideo.title,
            artist: currentVideo.artist,
          }
        : null,
      isPlaying: videoStore.isPlaying,
      loopAll: videoStore.loopAll,
      loopCurrent: videoStore.loopCurrent,
      isShuffled: videoStore.isShuffled,
    },
    ipod: {
      currentTrack: currentTrack
        ? {
            id: currentTrack.id,
            url: currentTrack.url,
            title: currentTrack.title,
            artist: currentTrack.artist,
          }
        : null,
      isPlaying: ipodStore.isPlaying,
      loopAll: ipodStore.loopAll,
      loopCurrent: ipodStore.loopCurrent,
      isShuffled: ipodStore.isShuffled,
    },
  };
};

interface UseSanChatProps {
  currentRoomId: string | null;
  onScrollToBottom: () => void;
  roomMessages?: Array<{
    username: string;
    content: string;
    userId?: string;
    timestamp?: string;
  }>;
}

export function useSanChat({
  currentRoomId,
  onScrollToBottom,
  roomMessages = [],
}: UseSanChatProps) {
  // Pull current auth credentials from store (reactive)
  const { authToken, username } = useChatsStore();

  // Build auth headers once per render (updates when authToken/username change)
  const authHeaders: Record<string, string> = {};
  if (authToken && username) {
    authHeaders["Authorization"] = `Bearer ${authToken}`;
    authHeaders["X-Username"] = username;
  }

  // Create a separate AI chat hook for @san mentions in chat rooms
  const {
    messages: sanMessages,
    isLoading: isSanLoading,
    append: appendToSan,
    stop: stopSan,
  } = useChat({
    maxSteps: 5,
    body: {
      systemState: getSystemState(),
    },
    headers: authHeaders,
    onFinish: async (message) => {
      // When AI finishes responding, send the response to the chat room
      if (currentRoomId && message.role === "assistant") {
        // Send as a regular message to the room
        // We'll need to call the API directly since we want it to appear from 'singgih'
        const headers: HeadersInit = { "Content-Type": "application/json" };

        if (authToken && username) {
          headers["Authorization"] = `Bearer ${authToken}`;
          headers["X-Username"] = username;
        }

        await fetch(`/api/chat-rooms?action=sendMessage`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            roomId: currentRoomId,
            username: "san",
            content: message.content,
          }),
        });

        // Trigger scroll after AI response is sent to room
        onScrollToBottom();
      }
    },
  });

  const handleSanMention = useCallback(
    async (messageContent: string) => {
      // Get recent chat room messages as context (last 20 messages)
      const recentMessages = roomMessages
        .slice(-20)
        .map((msg) => `${msg.username}: ${msg.content}`)
        .join("\n");

      // Include chat room context in the system state
      const systemStateWithChat = {
        ...getSystemState(),
        chatRoomContext: {
          roomId: currentRoomId,
          recentMessages: recentMessages,
          mentionedMessage: messageContent,
        },
      };

      // Send the message content to AI with chat room context
      await appendToSan(
        {
          role: "user",
          content: messageContent,
        },
        {
          body: { systemState: systemStateWithChat },
        }
      );
    },
    [appendToSan, roomMessages, currentRoomId]
  );

  const detectAndProcessMention = useCallback(
    (input: string): { isMention: boolean; messageContent: string } => {
      if (input.startsWith("@san ")) {
        // Extract the message content after @san
        const messageContent = input.substring(4).trim();
        return { isMention: true, messageContent };
      } else if (input === "@san") {
        // If they just typed @san without a message, treat it as a nudge
        return { isMention: true, messageContent: "👋 *nudge sent*" };
      }
      return { isMention: false, messageContent: "" };
    },
    []
  );

  return {
    sanMessages,
    isSanLoading,
    stopSan,
    handleSanMention,
    detectAndProcessMention,
  };
}
