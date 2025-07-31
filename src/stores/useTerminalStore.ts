import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface TerminalCommand {
  command: string;
  timestamp: number;
}

interface TerminalStoreState {
  commandHistory: TerminalCommand[];
  currentPath: string;
  setCommandHistory: (history: TerminalCommand[] | ((prev: TerminalCommand[]) => TerminalCommand[])) => void;
  addCommand: (cmd: string) => void;
  setCurrentPath: (path: string) => void;
  reset: () => void;
}

const STORE_VERSION = 1;
const STORE_NAME = "sanos:terminal";

export const useTerminalStore = create<TerminalStoreState>()(
  persist(
    (set) => ({
      commandHistory: [],
      currentPath: "/", // default root
      setCommandHistory: (historyOrFn) =>
        set((state) => {
          const newHistory =
            typeof historyOrFn === "function"
              ? (historyOrFn as (prev: TerminalCommand[]) => TerminalCommand[])(
                  state.commandHistory
                )
              : historyOrFn;
          return { commandHistory: newHistory };
        }),
      addCommand: (cmd) =>
        set((state) => ({
          commandHistory: [
            ...state.commandHistory,
            { command: cmd, timestamp: Date.now() },
          ].slice(-500), // keep last 500 cmds
        })),
      setCurrentPath: (path) => set({ currentPath: path }),
      reset: () => set({ commandHistory: [], currentPath: "/" }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        commandHistory: state.commandHistory,
        currentPath: state.currentPath,
      }),
      migrate: (persistedState, version) => {
        // Attempt to migrate from old localStorage keys if present
        if (!persistedState || version < STORE_VERSION) {
          try {
            const rawHistory = localStorage.getItem(
              "terminal:commandHistory" // legacy key from APP_STORAGE_KEYS.terminal.COMMAND_HISTORY
            );
            const rawCurrentPath = localStorage.getItem(
              "terminal:currentPath" // legacy key
            );
            const history: TerminalCommand[] = rawHistory
              ? JSON.parse(rawHistory)
              : [];
            const path = rawCurrentPath || "/";
            // Clean up old keys
            if (rawHistory) localStorage.removeItem("terminal:commandHistory");
            if (rawCurrentPath)
              localStorage.removeItem("terminal:currentPath");
            return {
              commandHistory: history,
              currentPath: path,
            } as Partial<TerminalStoreState>;
          } catch (e) {
            console.warn("[TerminalStore] Migration failed", e);
          }
        }
        return persistedState as Partial<TerminalStoreState>;
      },
    }
  )
); 