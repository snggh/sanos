import { Message as VercelMessage } from "ai";
import {
  Loader2,
  AlertCircle,
  MessageSquare,
  Copy,
  Check,
  ChevronDown,
  Trash,
  Volume2,
  Pause,
  Send,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { useChatSynth } from "@/hooks/useChatSynth";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import HtmlPreview, {
  isHtmlCodeBlock,
  extractHtmlContent,
} from "@/components/shared/HtmlPreview";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { useAppStore } from "@/stores/useAppStore";
import { appRegistry } from "@/config/appRegistry";
import {
  ToolInvocationMessage,
  type ToolInvocationPart,
} from "@/components/shared/ToolInvocationMessage";
import { useChatsStore } from "@/stores/useChatsStore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LinkPreview } from "@/components/shared/LinkPreview";
import { useThemeStore } from "@/stores/useThemeStore";
import EmojiAquarium from "@/components/shared/EmojiAquarium";

// --- Color Hashing for Usernames ---
const userColors = [
  "bg-pink-100 text-black",
  "bg-purple-100 text-black",
  "bg-indigo-100 text-black",
  "bg-teal-100 text-black",
  "bg-lime-100 text-black",
  "bg-amber-100 text-black",
  "bg-cyan-100 text-black",
  "bg-rose-100 text-black",
];

const getUserColorClass = (username?: string): string => {
  if (!username) {
    return "bg-gray-100 text-black"; // Default or fallback color
  }
  // Simple hash function
  const hash = username
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return userColors[hash % userColors.length];
};
// --- End Color Hashing ---

// Helper to decode common HTML entities so they render correctly
const decodeHtmlEntities = (str: string): string => {
  if (!str) return str;
  // Prefer DOM-based decoding when available (browser environment)
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }
  // Fallback: basic replacements (covers most common entities)
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
};

// Helper function to parse markdown and segment text
const parseMarkdown = (
  text: string
): { type: string; content: string; url?: string }[] => {
  const tokens: { type: string; content: string; url?: string }[] = [];
  let currentIndex = 0;
  // Regex to match URLs, Markdown links, bold, italic, CJK, emojis, words, spaces, or other characters
  const regex =
    /(\[([^\]]+?)\]\((https?:\/\/[^\s]+?)\))|(\*\*(.*?)\*\*)|(\*(.*?)\*)|(https?:\/\/[^\s]+)|([\p{Emoji_Presentation}\p{Extended_Pictographic}]|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[a-zA-Z0-9]+|[^\S\n]+|[^a-zA-Z0-9\s\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}*]+)/gu;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      // Markdown link: [text](url)
      tokens.push({ type: "link", content: match[2], url: match[3] });
    } else if (match[4]) {
      // Bold: **text**
      tokens.push({ type: "bold", content: match[5] });
    } else if (match[6]) {
      // Italic: *text*
      tokens.push({ type: "italic", content: match[7] });
    } else if (match[8]) {
      // Plain URL
      tokens.push({ type: "link", content: match[8], url: match[8] });
    } else if (match[9]) {
      // Other text (CJK, emoji, word, space, etc.)
      tokens.push({ type: "text", content: match[9] });
    }
    currentIndex = regex.lastIndex;
  }

  // Capture any remaining text (shouldn't happen with the current regex, but good practice)
  if (currentIndex < text.length) {
    tokens.push({ type: "text", content: text.slice(currentIndex) });
  }

  return tokens;
};

// Helper function to segment text properly for CJK and emojis
const segmentText = (
  text: string
): { type: string; content: string; url?: string }[] => {
  // First split by line breaks to preserve them
  return text.split(/(\n)/).flatMap((segment) => {
    if (segment === "\n") return [{ type: "text", content: "\n" }];
    // Parse markdown (including links) and maintain word boundaries in the segment
    return parseMarkdown(segment);
  });
};

// Helper function to check if text contains only emojis
const isEmojiOnly = (text: string): boolean => {
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  return emojiRegex.test(text);
};

const isUrlOnly = (text: string): boolean => {
  const trimmedText = text.trim();
  const urlRegex = /^https?:\/\/[^\s]+$/;
  return urlRegex.test(trimmedText);
};

// Helper function to extract user-friendly error message
const getErrorMessage = (error: Error): string => {
  if (!error.message) return "An error occurred";

  // Try to extract JSON from the error message
  const jsonMatch = error.message.match(/\{.*\}/);

  if (jsonMatch) {
    try {
      const errorData = JSON.parse(jsonMatch[0]);

      // Handle specific error types
      if (errorData.error === "rate_limit_exceeded") {
        if (errorData.isAuthenticated) {
          return `Daily AI message limit reached.`;
        } else {
          return `Login to continue chatting with Singgih.`;
        }
      }

      // Handle authentication error
      if (errorData.error === "authentication_failed") {
        return `Session expired. Please login again.`;
      }

      // Return the error field if it exists and is a string
      if (typeof errorData.error === "string") {
        return errorData.error;
      }

      // Return the message field if it exists
      if (typeof errorData.message === "string") {
        return errorData.message;
      }
    } catch {
      // If JSON parsing fails, continue to fallback
    }
  }

  // If the message starts with "Error: ", remove it for cleaner display
  if (error.message.startsWith("Error: ")) {
    return error.message.slice(7);
  }

  // Return the original message as fallback
  return error.message;
};

// --- New helper: prettify tool names ---
/**
 * Convert camelCase / PascalCase tool names to a human-readable string.
 * Example: "textEditSearchReplace" -> "Text Edit Search Replace".
 */
const formatToolName = (name: string): string =>
  name
    .replace(/([A-Z])/g, " $1") // insert space before capitals
    .replace(/^./, (ch) => ch.toUpperCase()) // capitalize first letter
    .trim();
// --- End helper: prettify tool names ---

// Helper to map an app id to a user-friendly name (falls back to formatting the id)
const getAppName = (id?: string): string => {
  if (!id) return "app";
  const entry = (appRegistry as Record<string, { name?: string }>)[id];
  return entry?.name || formatToolName(id);
};

// Define an extended message type that includes username
// Extend VercelMessage and add username and the 'human' role
interface ChatMessage extends Omit<VercelMessage, "role"> {
  // Omit the original role to redefine it
  username?: string; // Add username, make it optional for safety
  role: VercelMessage["role"] | "human"; // Allow original roles plus 'human'
  isPending?: boolean; // Add isPending flag
  serverId?: string; // Real server ID when id is a clientId
}

interface ChatMessagesProps {
  messages: ChatMessage[]; // Use the extended type
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
  onClear?: () => void;
  isRoomView: boolean; // Indicates if this is a room view (vs Singgih chat)
  roomId?: string; // Needed for message deletion calls
  isAdmin?: boolean; // Whether the current user has admin privileges (e.g. username === "singgih")
  username?: string; // Current client username (needed for delete request)
  onMessageDeleted?: (messageId: string) => void; // Callback when a message is deleted locally
  fontSize: number; // Add font size prop
  scrollToBottomTrigger: number; // Add scroll trigger prop
  highlightSegment?: { messageId: string; start: number; end: number } | null;
  isSpeaking?: boolean;
  onSendMessage?: (username: string) => void; // Callback when send message button is clicked
}

// Component to render the scroll-to-bottom button using the library's context
function ScrollToBottomButton() {
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    <AnimatePresence>
      {!isAtBottom && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ type: "spring", duration: 0.2 }}
          className={`absolute bottom-14 right-3 rounded-full z-20 flex items-center justify-center cursor-pointer select-none ${
            isMacTheme ? "relative overflow-hidden" : ""
          }`}
          style={{
            position: "absolute",
            bottom: "56px",
            right: `calc(12px + var(--sbw, 0px))`,
            width: 28,
            height: 28,
            background: isMacTheme
              ? "linear-gradient(rgba(160,160,160,0.625), rgba(255,255,255,0.625))"
              : "#ffffff",
            boxShadow: isMacTheme
              ? "0 2px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.3), inset 0 0 0 0.5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 2px 3px 1px #bbbbbb"
              : "0 1px 2px rgba(0,0,0,0.25)",
            border: isMacTheme ? undefined : "1px solid rgba(0,0,0,0.3)",
            backdropFilter: isMacTheme ? "blur(2px)" : undefined,
          }}
          onClick={() => scrollToBottom()} // Use the library's function
          aria-label="Scroll to bottom"
        >
          {isMacTheme && (
            <>
              {/* Top shine */}
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  top: "2px",
                  height: "30%",
                  width: "calc(100% - 12px)",
                  borderRadius: "12px 12px 4px 4px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.25))",
                  filter: "blur(0.2px)",
                  zIndex: 2,
                }}
              />
              {/* Bottom glow */}
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: "1px",
                  height: "38%",
                  width: "calc(100% - 4px)",
                  borderRadius: "4px 4px 8px 8px",
                  background:
                    "linear-gradient(rgba(255,255,255,0.15), rgba(255,255,255,0.55))",
                  filter: "blur(0.3px)",
                  zIndex: 1,
                }}
              />
            </>
          )}
          <ChevronDown
            className={`h-4 w-4 ${
              isMacTheme ? "text-black/70 relative z-10" : "text-neutral-800"
            }`}
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// --- NEW INNER COMPONENT ---
interface ChatMessagesContentProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
  onClear?: () => void;
  isRoomView: boolean;
  roomId?: string;
  isAdmin: boolean;
  username?: string;
  onMessageDeleted?: (messageId: string) => void;
  fontSize: number;
  scrollToBottomTrigger: number;
  highlightSegment?: { messageId: string; start: number; end: number } | null;
  isSpeaking?: boolean;
  onSendMessage?: (username: string) => void;
}

function ChatMessagesContent({
  messages,
  isLoading,
  error,
  onRetry,
  onClear,
  isRoomView,
  roomId,
  isAdmin,
  username,
  onMessageDeleted,
  fontSize,
  scrollToBottomTrigger,
  highlightSegment,
  isSpeaking,
  onSendMessage,
}: ChatMessagesContentProps) {
  const { playNote } = useChatSynth();
  const { playElevatorMusic, stopElevatorMusic, playDingSound } =
    useTerminalSounds();
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const { speak, stop, isSpeaking: localTtsSpeaking } = useTtsQueue();
  const speechEnabled = useAppStore((state) => state.speechEnabled);
  const currentTheme = useThemeStore((s) => s.current);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [speechLoadingId, setSpeechLoadingId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isInteractingWithPreview, setIsInteractingWithPreview] =
    useState(false);

  // Helper to detect if we're on a touch device
  const isTouchDevice = () => {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  };

  // Local highlight state for manual speech triggered from this component
  const [localHighlightSegment, setLocalHighlightSegment] = useState<{
    messageId: string;
    start: number;
    end: number;
  } | null>(null);
  const localHighlightQueueRef = useRef<
    { messageId: string; start: number; end: number }[]
  >([]);

  const previousMessagesRef = useRef<ChatMessage[]>([]);
  const initialMessageIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);

  // Get scrollToBottom from context - NOW SAFE TO CALL HERE
  const { scrollToBottom } = useStickToBottomContext();

  // Effect for Sound/Vibration
  useEffect(() => {
    if (
      previousMessagesRef.current.length > 0 &&
      messages.length > previousMessagesRef.current.length
    ) {
      const previousIds = new Set(
        previousMessagesRef.current.map(
          (m) => m.id || `${m.role}-${m.content.substring(0, 10)}`
        )
      );
      const newMessages = messages.filter(
        (currentMsg) =>
          !previousIds.has(
            currentMsg.id ||
              `${currentMsg.role}-${currentMsg.content.substring(0, 10)}`
          )
      );
      const newHumanMessage = newMessages.find((msg) => msg.role === "human");
      if (newHumanMessage) {
        playNote();
        if ("vibrate" in navigator) {
          navigator.vibrate(100);
        }
      }
    }
    previousMessagesRef.current = messages;
  }, [messages, playNote]);

  // Effect to capture initial message IDs
  useEffect(() => {
    if (!hasInitializedRef.current && messages.length > 0) {
      hasInitializedRef.current = true;
      previousMessagesRef.current = messages;
      initialMessageIdsRef.current = new Set(
        messages.map((m) => m.id || `${m.role}-${m.content.substring(0, 10)}`)
      );
    } else if (messages.length === 0) {
      hasInitializedRef.current = false;
    }
  }, [messages]);

  // Effect to trigger scroll to bottom
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      scrollToBottom();
    }
  }, [scrollToBottomTrigger, scrollToBottom]);

  // Clear loading indicator when TTS actually starts playing
  useEffect(() => {
    if (localTtsSpeaking && speechLoadingId) {
      setSpeechLoadingId(null);
    }
  }, [localTtsSpeaking, speechLoadingId]);

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(
        message.id || `${message.role}-${message.content.substring(0, 10)}`
      );
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
      // Fallback
      try {
        const textarea = document.createElement("textarea");
        textarea.value = message.content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedMessageId(
          message.id || `${message.role}-${message.content.substring(0, 10)}`
        );
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
    }
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (!roomId) return;
    const serverMessageId = message.serverId || message.id; // prefer serverId when present
    if (!serverMessageId) return;

    // Use DELETE method with proper authentication headers (matching deleteRoom pattern)
    const url = `/api/chat-rooms?action=deleteMessage&roomId=${roomId}&messageId=${serverMessageId}`;

    // Build headers with authentication
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Add authentication headers - get from store
    const authToken = useChatsStore.getState().authToken;
    if (username && authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
      headers["X-Username"] = username;
    }

    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: `HTTP error! status: ${res.status}` }));
        console.error("Failed to delete message", errorData);
      } else {
        // Use the actual server message ID for local removal to match store expectations
        onMessageDeleted?.(serverMessageId);
      }
    } catch (err) {
      console.error("Error deleting message", err);
    }
  };

  const isUrgentMessage = (content: string) => content.startsWith("!!!!");

  // Helper function to extract URLs from message content for link previews
  const extractUrls = (content: string): string[] => {
    const urls = new Set<string>();
    const tokens = segmentText(content);

    tokens.forEach((token) => {
      if (token.type === "link" && token.url) {
        urls.add(token.url);
      }
    });

    return Array.from(urls);
  };

  // Return the message list rendering logic
  return (
    <AnimatePresence initial={false} mode="sync">
      {messages.length === 0 && !isRoomView && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
        >
          <MessageSquare className="h-3 w-3" />
          <span>Start a new conversation?</span>
          {onClear && (
            <Button
              size="sm"
              variant="link"
              onClick={onClear}
              className="m-0 p-0 text-[16px] h-0 text-gray-500 hover:text-gray-700"
            >
              New chat
            </Button>
          )}
        </motion.div>
      )}
      {messages.map((message) => {
        const messageKey =
          message.id || `${message.role}-${message.content.substring(0, 10)}`;
        const isInitialMessage = initialMessageIdsRef.current.has(messageKey);

        const variants = { initial: { opacity: 0 }, animate: { opacity: 1 } };
        const isUrgent = isUrgentMessage(message.content);
        let bgColorClass = "";
        if (isUrgent) {
          // Urgent bubbles will be driven by inline animation; avoid bg-* and text-* so theme overrides don't interfere
          // Provide a truthy class to skip the default fallback color classes
          bgColorClass = "bg-transparent text-current";
        } else if (message.role === "user")
          bgColorClass = "bg-yellow-100 text-black";
        else if (message.role === "assistant")
          bgColorClass = "bg-blue-100 text-black";
        else if (message.role === "human")
          bgColorClass = getUserColorClass(message.username);

        // Trim leading "!!!!" for urgent messages and decode HTML entities
        const rawContent = isUrgent
          ? message.content.slice(4).trimStart()
          : message.content;
        const displayContent = decodeHtmlEntities(rawContent);

        // Detect aquarium tool calls for this assistant message
        const aquariumParts =
          message.role === "assistant"
            ? (message.parts || []).filter((p) => {
                if (p.type !== "tool-invocation") return false;
                const ti = (p as ToolInvocationPart).toolInvocation;
                return ti?.toolName === "aquarium";
              })
            : [];
        const hasAquarium = aquariumParts.length > 0;

        const combinedHighlightSeg = highlightSegment || localHighlightSegment;
        const combinedIsSpeaking = isSpeaking || localTtsSpeaking;

        const highlightActive =
          combinedIsSpeaking &&
          combinedHighlightSeg &&
          combinedHighlightSeg.messageId === message.id;

        // base background calculation no longer needed; inline animation drives color for urgent

        return (
          <motion.div
            layout="position"
            key={messageKey}
            variants={variants}
            initial={isInitialMessage ? "animate" : "initial"}
            animate="animate"
            transition={{ type: "spring", duration: 0.4 }}
            className={`flex flex-col z-10 w-full ${
              message.role === "user" ? "items-end" : "items-start"
            }`}
            style={{
              transformOrigin:
                message.role === "user" ? "bottom right" : "bottom left",
            }}
            onMouseEnter={() =>
              !isInteractingWithPreview &&
              !isTouchDevice() &&
              setHoveredMessageId(messageKey)
            }
            onMouseLeave={() =>
              !isInteractingWithPreview &&
              !isTouchDevice() &&
              setHoveredMessageId(null)
            }
            onTouchStart={(e) => {
              // Only show hover buttons on touch if not touching a link preview
              if (!isInteractingWithPreview && isTouchDevice()) {
                const target = e.target as HTMLElement;
                const isLinkPreview = target.closest("[data-link-preview]");
                if (!isLinkPreview) {
                  e.preventDefault();
                  setHoveredMessageId(messageKey);
                }
              }
            }}
          >
            <motion.div
              layout="position"
              className={`${
                currentTheme === "macosx" ? "text-[10px]" : "text-[16px]"
              } chat-messages-meta text-gray-500 mb-0.5 font-['Geneva-9'] mb-[-2px] select-text flex items-center gap-2`}
            >
              {message.role === "user" && (
                <>
                  {isAdmin && isRoomView && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{
                              opacity: hoveredMessageId === messageKey ? 1 : 0,
                              scale: 1,
                            }}
                            className="h-3 w-3 text-gray-400 hover:text-red-600 transition-colors"
                            onClick={() => deleteMessage(message)}
                            aria-label="Delete message"
                          >
                            <Trash className="h-3 w-3" />
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity: hoveredMessageId === messageKey ? 1 : 0,
                      scale: 1,
                    }}
                    className="h-3 w-3 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => copyMessage(message)}
                    aria-label="Copy message"
                  >
                    {copiedMessageId === messageKey ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </motion.button>
                </>
              )}
              <span
                className="max-w-[120px] inline-block overflow-hidden text-ellipsis whitespace-nowrap"
                title={
                  message.username || (message.role === "user" ? "You" : "Singgih")
                }
              >
                {message.username || (message.role === "user" ? "You" : "Singgih")}
              </span>{" "}
              <span className="text-gray-400 select-text">
                {message.createdAt ? (
                  (() => {
                    const messageDate = new Date(message.createdAt);
                    const today = new Date();
                    const isBeforeToday =
                      messageDate.getDate() !== today.getDate() ||
                      messageDate.getMonth() !== today.getMonth() ||
                      messageDate.getFullYear() !== today.getFullYear();

                    return isBeforeToday
                      ? messageDate.toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })
                      : messageDate.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        });
                  })()
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
              </span>
              {message.role === "assistant" && (
                <>
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity: hoveredMessageId === messageKey ? 1 : 0,
                      scale: 1,
                    }}
                    className="h-3 w-3 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => copyMessage(message)}
                    aria-label="Copy message"
                  >
                    {copiedMessageId === messageKey ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </motion.button>
                  {speechEnabled && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{
                        opacity: hoveredMessageId === messageKey ? 1 : 0,
                        scale: 1,
                      }}
                      className="h-3 w-3 text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => {
                        if (playingMessageId === messageKey) {
                          // Stop current playback
                          stop();
                          setPlayingMessageId(null);
                        } else {
                          stop();
                          // ensure any existing queue/segment cleared
                          setLocalHighlightSegment(null);
                          localHighlightQueueRef.current = [];
                          setSpeechLoadingId(null);

                          const text = displayContent.trim();
                          if (text) {
                            // Split into line-based chunks so each fetch starts immediately and
                            // the UI can advance per chunk.
                            const chunks: string[] = [];
                            const lines = text.split(/\r?\n/);

                            for (const line of lines) {
                              const trimmedLine = line.trim();
                              if (trimmedLine && trimmedLine.length > 0) {
                                chunks.push(trimmedLine);
                              }
                            }

                            if (chunks.length === 0) {
                              setPlayingMessageId(null);
                              setSpeechLoadingId(null);
                              return;
                            }

                            // Build highlight segments data – use *visible* character
                            // length (without Markdown markup like ** or []()) so the
                            // highlight aligns with what is actually rendered.
                            let charCursor = 0;
                            const segments = chunks.map((chunk) => {
                              // Calculate how many visible characters this chunk
                              // contributes by summing the lengths of the token
                              // contents produced by segmentText().
                              const visibleLen = segmentText(chunk).reduce(
                                (acc, token) => acc + token.content.length,
                                0
                              );

                              const seg = {
                                messageId: message.id || messageKey,
                                start: charCursor,
                                end: charCursor + visibleLen,
                              };
                              charCursor += visibleLen;
                              return seg;
                            });

                            localHighlightQueueRef.current = segments;
                            setLocalHighlightSegment(segments[0]);
                            setSpeechLoadingId(messageKey);

                            // Queue all chunks so network requests overlap.
                            chunks.forEach((chunk) => {
                              speak(chunk, () => {
                                // Shift queue and update highlight
                                localHighlightQueueRef.current.shift();
                                if (localHighlightQueueRef.current.length > 0) {
                                  setLocalHighlightSegment(
                                    localHighlightQueueRef.current[0]
                                  );
                                } else {
                                  setLocalHighlightSegment(null);
                                  setPlayingMessageId(null);
                                  setSpeechLoadingId(null);
                                }
                              });
                            });

                            setPlayingMessageId(messageKey);
                          } else {
                            setPlayingMessageId(null);
                            setSpeechLoadingId(null);
                          }
                        }
                      }}
                      aria-label={
                        playingMessageId === messageKey
                          ? "Stop speech"
                          : "Speak message"
                      }
                    >
                      {playingMessageId === messageKey ? (
                        speechLoadingId === messageKey ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Pause className="h-3 w-3" />
                        )
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </motion.button>
                  )}
                </>
              )}
              {isRoomView &&
                message.role === "human" &&
                onSendMessage &&
                message.username && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{
                            opacity: hoveredMessageId === messageKey ? 1 : 0,
                            scale: 1,
                          }}
                          className="h-3 w-3 text-gray-400 hover:text-blue-600 transition-colors"
                          onClick={() => onSendMessage(message.username!)}
                          aria-label="Send message"
                        >
                          <Send className="h-3 w-3" />
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Message {message.username}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              {isAdmin && isRoomView && message.role !== "user" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{
                          opacity: hoveredMessageId === messageKey ? 1 : 0,
                          scale: 1,
                        }}
                        className="h-3 w-3 text-gray-400 hover:text-red-600 transition-colors"
                        onClick={() => deleteMessage(message)}
                        aria-label="Delete message"
                      >
                        <Trash className="h-3 w-3" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </motion.div>

            {/* Render aquarium tool(s) as their own element; component styles itself as a chat bubble */}
            {hasAquarium && <EmojiAquarium />}

            {/* Show the standard message bubble if it's not URL-only (even if aquarium exists) */}
            {!isUrlOnly(displayContent) && (
              <motion.div
                layout="position"
                initial={
                  isUrgent
                    ? {
                        opacity: 0,
                        backgroundColor: "#bfdbfe",
                        color: "#111827",
                      } // quick fade-in for urgent, then color-only animation
                    : { opacity: 0 }
                }
                animate={
                  isUrgent
                    ? {
                        opacity: 1,
                        backgroundColor: [
                          "#bfdbfe", // blue-200
                          "#fecaca", // red-200 pulse
                          "#fee2e2", // red-100 final (one level lighter)
                        ],
                        color: [
                          "#111827", // black
                          "#b91c1c", // red-700 pulse
                          "#b91c1c", // red-700 final
                        ],
                      }
                    : { opacity: 1 }
                }
                transition={
                  isUrgent
                    ? {
                        opacity: { duration: 0.12, ease: "easeOut" },
                        backgroundColor: {
                          duration: 0.9,
                          ease: "easeInOut",
                          times: [0, 0.5, 1],
                        },
                        color: {
                          duration: 0.9,
                          ease: "easeInOut",
                          times: [0, 0.5, 1],
                        },
                      }
                    : undefined
                }
                className={`${`p-1.5 px-2 chat-bubble ${
                  bgColorClass ||
                  (message.role === "user"
                    ? "bg-yellow-100 text-black"
                    : "bg-blue-100 text-black")
                } ${
                  isHtmlCodeBlock(message.content).isHtml ||
                  message.parts?.some(
                    (part) =>
                      part.type === "text" &&
                      extractHtmlContent(part.text).hasHtml
                  )
                    ? "w-full"
                    : "w-fit max-w-[90%]"
                }`} min-h-[12px] rounded leading-snug font-geneva-12 break-words select-text`}
                style={{ fontSize: `${fontSize}px` }}
              >
                {message.role === "assistant" ? (
                  <motion.div className="select-text flex flex-col gap-1">
                    {message.parts?.map((part, partIndex) => {
                      const partKey = `${messageKey}-part-${partIndex}`;
                      switch (part.type) {
                        case "text": {
                          const hasXmlTags =
                            /<textedit:(insert|replace|delete)/i.test(
                              part.text
                            );
                          if (hasXmlTags) {
                            const openTags = (
                              part.text.match(
                                /<textedit:(insert|replace|delete)/g
                              ) || []
                            ).length;
                            const closeTags = (
                              part.text.match(
                                /<\/textedit:(insert|replace)>|<textedit:delete[^>]*\/>/g
                              ) || []
                            ).length;
                            if (openTags !== closeTags) {
                              return (
                                <motion.span
                                  key={partKey}
                                  initial={{ opacity: 1 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0 }}
                                  className="select-text italic"
                                >
                                  editing...
                                </motion.span>
                              );
                            }
                          }

                          const rawPartContent = isUrgentMessage(part.text)
                            ? part.text.slice(4).trimStart()
                            : part.text;
                          const displayContent =
                            decodeHtmlEntities(rawPartContent);
                          const { hasHtml, htmlContent, textContent } =
                            extractHtmlContent(displayContent);

                          return (
                            <div key={partKey} className="w-full">
                              <div className="whitespace-pre-wrap">
                                {textContent &&
                                  (() => {
                                    const tokens = segmentText(
                                      textContent.trim()
                                    );
                                    let charPos = 0;
                                    return tokens.map((segment, idx) => {
                                      const start = charPos;
                                      const end =
                                        charPos + segment.content.length;
                                      charPos = end;
                                      return (
                                        <motion.span
                                          key={`${partKey}-segment-${idx}`}
                                          initial={
                                            isInitialMessage
                                              ? { opacity: 1, y: 0 }
                                              : { opacity: 0, y: 12 }
                                          }
                                          animate={{ opacity: 1, y: 0 }}
                                          className={`select-text ${
                                            isEmojiOnly(textContent)
                                              ? "text-[24px]"
                                              : ""
                                          } ${
                                            segment.type === "bold"
                                              ? "font-bold"
                                              : segment.type === "italic"
                                              ? "italic"
                                              : ""
                                          }`}
                                          style={{
                                            userSelect: "text",
                                            fontSize: isEmojiOnly(textContent)
                                              ? undefined
                                              : `${fontSize}px`,
                                          }}
                                          transition={{
                                            duration: 0.08,
                                            delay: idx * 0.02,
                                            ease: "easeOut",
                                            onComplete: () => {
                                              if (idx % 2 === 0) {
                                                playNote();
                                              }
                                            },
                                          }}
                                        >
                                          {/* Apply highlight */}
                                          {highlightActive &&
                                          start <
                                            (combinedHighlightSeg?.end ?? 0) &&
                                          end >
                                            (combinedHighlightSeg?.start ??
                                              0) ? (
                                            <span className="animate-highlight">
                                              {segment.type === "link" &&
                                              segment.url ? (
                                                <a
                                                  href={segment.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 hover:underline"
                                                  style={{
                                                    color: isUrgent
                                                      ? "inherit"
                                                      : undefined,
                                                  }}
                                                  onClick={(e) =>
                                                    e.stopPropagation()
                                                  }
                                                >
                                                  {segment.content}
                                                </a>
                                              ) : (
                                                segment.content
                                              )}
                                            </span>
                                          ) : segment.type === "link" &&
                                            segment.url ? (
                                            <a
                                              href={segment.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline"
                                              style={{
                                                color: isUrgent
                                                  ? "inherit"
                                                  : undefined,
                                              }}
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              {segment.content}
                                            </a>
                                          ) : (
                                            segment.content
                                          )}
                                        </motion.span>
                                      );
                                    });
                                  })()}
                              </div>
                              {hasHtml && htmlContent && (
                                <HtmlPreview
                                  htmlContent={htmlContent}
                                  onInteractionChange={
                                    setIsInteractingWithPreview
                                  }
                                  isStreaming={
                                    isLoading &&
                                    message === messages[messages.length - 1]
                                  }
                                  playElevatorMusic={playElevatorMusic}
                                  stopElevatorMusic={stopElevatorMusic}
                                  playDingSound={playDingSound}
                                  className="my-1"
                                />
                              )}
                            </div>
                          );
                        }
                        case "tool-invocation": {
                          const ti = (part as ToolInvocationPart)
                            .toolInvocation;
                          if (ti?.toolName === "aquarium") {
                            // Render aquarium below the bubble separately; skip here to avoid duplicate text
                            return null;
                          }
                          return (
                            <ToolInvocationMessage
                              key={partKey}
                              part={part as ToolInvocationPart}
                              partKey={partKey}
                              isLoading={isLoading}
                              getAppName={getAppName}
                              formatToolName={formatToolName}
                              setIsInteractingWithPreview={
                                setIsInteractingWithPreview
                              }
                              playElevatorMusic={playElevatorMusic}
                              stopElevatorMusic={stopElevatorMusic}
                              playDingSound={playDingSound}
                            />
                          );
                        }
                        default:
                          return null;
                      }
                    })}

                    {/* Link Previews for Assistant Messages */}
                    {(() => {
                      const allUrls = new Set<string>();
                      message.parts?.forEach((part) => {
                        if (part.type === "text") {
                          const partContent = isUrgentMessage(part.text)
                            ? part.text.slice(4).trimStart()
                            : part.text;
                          const decodedContent =
                            decodeHtmlEntities(partContent);
                          const { textContent } =
                            extractHtmlContent(decodedContent);
                          if (textContent) {
                            extractUrls(textContent).forEach((url) =>
                              allUrls.add(url)
                            );
                          }
                        }
                      });

                      if (allUrls.size === 0) return null;

                      return (
                        <div className="flex flex-col gap-2 mt-2 w-full">
                          {Array.from(allUrls).map((url, index) => (
                            <LinkPreview
                              key={`${messageKey}-assistant-link-${index}`}
                              url={url}
                              className="w-full"
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </motion.div>
                ) : (
                  <>
                    <span
                      className={`select-text whitespace-pre-wrap ${
                        isEmojiOnly(displayContent) ? "text-[24px]" : ""
                      }`}
                      style={{
                        userSelect: "text",
                        fontSize: isEmojiOnly(displayContent)
                          ? undefined
                          : `${fontSize}px`,
                      }} // Apply font size via style prop
                    >
                      {(() => {
                        const tokens = segmentText(displayContent);
                        let charPos2 = 0;
                        return tokens.map((segment, idx) => {
                          const start2 = charPos2;
                          const end2 = charPos2 + segment.content.length;
                          charPos2 = end2;
                          const isHighlight =
                            highlightActive &&
                            start2 < (combinedHighlightSeg?.end ?? 0) &&
                            end2 > (combinedHighlightSeg?.start ?? 0);
                          const contentNode =
                            segment.type === "link" && segment.url ? (
                              <a
                                href={segment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                                style={{
                                  color: isUrgent ? "inherit" : undefined,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {segment.content}
                              </a>
                            ) : (
                              segment.content
                            );
                          return (
                            <span
                              key={`${messageKey}-segment-${idx}`}
                              className={`${
                                segment.type === "bold"
                                  ? "font-bold"
                                  : segment.type === "italic"
                                  ? "italic"
                                  : ""
                              }`}
                            >
                              {isHighlight ? (
                                <span className="bg-yellow-200 animate-highlight">
                                  {contentNode}
                                </span>
                              ) : (
                                contentNode
                              )}
                            </span>
                          );
                        });
                      })()}
                    </span>
                    {isHtmlCodeBlock(displayContent).isHtml && (
                      <HtmlPreview
                        htmlContent={isHtmlCodeBlock(displayContent).content}
                        onInteractionChange={setIsInteractingWithPreview}
                        playElevatorMusic={playElevatorMusic}
                        stopElevatorMusic={stopElevatorMusic}
                        playDingSound={playDingSound}
                      />
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* Link Previews - Only for non-assistant messages */}
            {message.role !== "assistant" &&
              (() => {
                const urls = extractUrls(displayContent);
                if (urls.length === 0) return null;

                return (
                  <div
                    className={`flex flex-col gap-2 max-w-[90%] ${
                      isUrlOnly(displayContent) ? "mt-0" : "mt-2"
                    }`}
                  >
                    {urls.map((url, index) => (
                      <LinkPreview
                        key={`${messageKey}-link-${index}`}
                        url={url}
                        className="w-full"
                      />
                    ))}
                  </div>
                );
              })()}
          </motion.div>
        );
      })}
      {error &&
        (() => {
          const errorMessage = getErrorMessage(error);

          // Check if it's a rate limit error that's handled elsewhere
          const isRateLimitError =
            errorMessage === "Daily AI message limit reached." ||
            errorMessage === "Set a username to continue chatting with Singgih.";

          // Don't show these errors in chat since they're handled by other UI
          if (isRateLimitError) return null;

          // Special handling for login message - render in gray like "Start a new conversation?"
          if (errorMessage === "Login to continue chatting with Singgih.") {
            return (
              <motion.div
                layout="position"
                key="login-message"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
              >
                <MessageSquare className="h-3 w-3" />
                <span>{errorMessage}</span>
              </motion.div>
            );
          }

          return (
            <motion.div
              layout="position"
              key="error-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 text-red-600 font-['Geneva-9'] text-[16px] antialiased pl-1 py-1"
            >
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <div className="flex-1 flex flex-row items-start justify-between gap-1">
                <span className="leading-none">{errorMessage}</span>
                {onRetry && (
                  <Button
                    size="sm"
                    variant="link"
                    onClick={onRetry}
                    className="m-0 p-0 h-auto text-red-600 text-[16px] h-[16px] hover:text-red-700"
                  >
                    Retry
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}
// --- END NEW INNER COMPONENT ---

export function ChatMessages({
  messages,
  isLoading,
  error,
  onRetry,
  onClear,
  isRoomView,
  roomId,
  isAdmin = false,
  username,
  onMessageDeleted,
  fontSize, // Destructure font size prop
  scrollToBottomTrigger, // Destructure scroll trigger prop
  highlightSegment,
  isSpeaking,
  onSendMessage,
}: ChatMessagesProps) {
  return (
    // Use StickToBottom component as the main container
    <StickToBottom
      className="flex-1 relative flex flex-col overflow-hidden w-full h-full"
      // Optional props for smooth scrolling behavior
      resize="smooth"
      initial="instant"
    >
      {/* StickToBottom.Content wraps the actual scrollable content */}
      <StickToBottom.Content className="flex flex-col gap-1 p-3 pt-12 pb-14">
        {/* Render the inner component here */}
        <ChatMessagesContent
          messages={messages}
          isLoading={isLoading}
          error={error}
          onRetry={onRetry}
          onClear={onClear}
          isRoomView={isRoomView}
          roomId={roomId}
          isAdmin={isAdmin}
          username={username}
          onMessageDeleted={onMessageDeleted}
          fontSize={fontSize}
          scrollToBottomTrigger={scrollToBottomTrigger}
          highlightSegment={highlightSegment}
          isSpeaking={isSpeaking}
          onSendMessage={onSendMessage}
        />
      </StickToBottom.Content>

      {/* Render the scroll-to-bottom button */}
      <ScrollToBottomButton />
    </StickToBottom>
  );
}
