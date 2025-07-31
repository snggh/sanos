import React from "react";
import { Send, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ChatRoom } from "@/types/chat";
import { useSound, Sounds } from "@/hooks/useSound";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { useChatsStore } from "@/stores/useChatsStore";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Extracted ChatRoomSidebar component
interface ChatRoomSidebarProps {
  rooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  onRoomSelect: (room: ChatRoom | null) => void;
  onAddRoom: () => void;
  onDeleteRoom?: (room: ChatRoom) => void;
  isVisible: boolean;
  isAdmin: boolean;
  /** When rendered inside mobile/overlay mode, occupies full width and hides right border */
  isOverlay?: boolean;
  username?: string | null;
}

export const ChatRoomSidebar: React.FC<ChatRoomSidebarProps> = ({
  rooms,
  currentRoom,
  onRoomSelect,
  onAddRoom,
  onDeleteRoom,
  isVisible,
  isAdmin,
  isOverlay = false,
  username,
}) => {
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const unreadCounts = useChatsStore((state) => state.unreadCounts);

  // Theme detection for border styling
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isWindowsLegacyTheme = isXpTheme;

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col font-geneva-12 text-[12px] bg-neutral-100",
        isOverlay
          ? `w-full border-b ${
              isWindowsLegacyTheme
                ? "border-[#919b9c]"
                : currentTheme === "macosx"
                ? "border-black/10"
                : "border-black"
            }`
          : `w-56 border-r h-full overflow-hidden ${
              isWindowsLegacyTheme
                ? "border-[#919b9c]"
                : currentTheme === "macosx"
                ? "border-black/10"
                : "border-black"
            }`
      )}
    >
      <div
        className={cn(
          "py-3 px-3 flex flex-col",
          isOverlay ? "" : "flex-1 overflow-hidden"
        )}
      >
        <div className="flex justify-between items-center mb-2 flex-shrink-0">
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-[14px] pl-1">Chats</h2>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddRoom}
                  className="flex items-center text-xs hover:bg-black/5 w-[24px] h-[24px]"
                >
                  <Send className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New Chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div
          className={cn(
            "space-y-1 overscroll-contain",
            isOverlay
              ? "flex-1 overflow-y-auto min-h-0" // Only scroll when content overflows
              : "flex-1 overflow-y-auto min-h-0"
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Singgih (@singgih) Chat Selection */}
          <div
            className={cn(
              "p-2 py-1",
              currentRoom === null ? "bg-black text-white" : "hover:bg-black/5"
            )}
            onClick={() => {
              playButtonClick();
              onRoomSelect(null);
            }}
          >
            @singgih
          </div>
          {/* Chat Rooms List */}
          {Array.isArray(rooms) &&
            (() => {
              // Sort rooms: private rooms first, then public rooms
              const privateRooms = rooms.filter(
                (room) => room.type === "private"
              );
              const publicRooms = rooms.filter(
                (room) => room.type !== "private"
              );
              const sortedRooms = [...privateRooms, ...publicRooms];

              return sortedRooms.map((room) => {
                const unreadCount = unreadCounts[room.id] || 0;
                const hasUnread = unreadCount > 0;

                return (
                  <div
                    key={room.id}
                    className={cn(
                      "group relative p-2 py-1",
                      currentRoom?.id === room.id
                        ? "bg-black text-white"
                        : "hover:bg-black/5"
                    )}
                    onClick={() => {
                      playButtonClick();
                      onRoomSelect(room);
                    }}
                  >
                    <div className="flex items-center">
                      <span>
                        {room.type === "private"
                          ? getPrivateRoomDisplayName(room, username ?? null)
                          : `#${room.name}`}
                      </span>
                      {(hasUnread || room.type !== "private") && (
                        <span
                          className={cn(
                            "text-[10px] ml-1.5 transition-opacity",
                            hasUnread
                              ? "text-orange-600"
                              : currentRoom?.id === room.id
                              ? "text-white/40"
                              : "text-black/40",
                            hasUnread || room.userCount > 0
                              ? "opacity-100"
                              : currentRoom?.id === room.id
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          {hasUnread
                            ? `${unreadCount >= 20 ? "20+" : unreadCount} new`
                            : `${room.userCount} online`}
                        </span>
                      )}
                    </div>
                    {((isAdmin && room.type !== "private") ||
                      room.type === "private") &&
                      onDeleteRoom && (
                        <button
                          className={cn(
                            "absolute right-1 top-1/2 transform -translate-y-1/2 transition-opacity text-gray-500 hover:text-red-500 p-1 rounded hover:bg-black/5",
                            currentRoom?.id === room.id
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            playButtonClick();
                            onDeleteRoom(room);
                          }}
                          aria-label={
                            room.type === "private"
                              ? "Leave conversation"
                              : "Delete room"
                          }
                          title={
                            room.type === "private"
                              ? "Leave conversation"
                              : "Delete room"
                          }
                        >
                          <Trash className="w-3 h-3" />
                        </button>
                      )}
                  </div>
                );
              });
            })()}
        </div>
      </div>
    </div>
  );
};
