# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

sanOS is a web-based agentic AI desktop environment inspired by classic macOS. It features multiple built-in applications, authentic desktop interfaces, and system context-aware AI agents. The project includes virtual filesystems, theme switching (System 7, Aqua, Windows XP/98), and comprehensive app ecosystem.

## Development Commands

### Essential Commands
- `bun dev` - Start development server (port from $PORT env or 5173)
- `bun run build` - Build for production (TypeScript compile + Vite build)
- `bun run lint` - Run ESLint with TypeScript support
- `bun run preview` - Preview production build

### Utility Scripts
- `bun scripts/clear-chat-data.js` - Clear chat room data
- `bun run scripts/generate-icon-manifest.ts` - Generate icon manifests
- `bun run scripts/generate-wallpaper-manifest.ts` - Generate wallpaper manifests

## Architecture Overview

### Core System Architecture
- **App Registry System**: All applications registered in `src/config/appRegistry.ts` with window configurations, metadata, and component references
- **Window Manager**: Multi-instance window management with theme-aware chrome and controls
- **State Management**: Zustand stores per app domain (e.g., `useChatsStore`, `usePaintStore`) plus global `useAppStore`
- **Theme System**: Four switchable UI themes in `src/themes/` with theme-specific fonts, icons, wallpapers, and controls
- **Virtual File System**: Local persistence with backup/restore in `src/utils/indexedDB.ts`

### App Structure Pattern
Each app follows a consistent structure in `src/apps/[app-name]/`:
```
├── components/           # App-specific UI components
├── hooks/               # Custom hooks for app logic
├── index.tsx           # Main app export and registration
└── utils/              # App-specific utilities (optional)
```

App components are named `[AppName]AppComponent.tsx` and receive standardized `AppProps`. Menu bars follow `[AppName]MenuBar.tsx` pattern.

### State Management Patterns
- **App-specific stores**: Domain-specific Zustand stores (e.g., `usePaintStore` for drawing state)
- **Global state**: `useAppStore` for window management, focus, theme switching
- **Context providers**: `AppContext` provides app navigation and state coordination
- **Local storage**: Persistent state via IndexedDB with migration utilities

### Key Architectural Decisions
- **Component isolation**: Apps are self-contained modules with clear boundaries
- **Shared UI layer**: Common components in `src/components/ui/` using shadcn/ui + Radix
- **Theme abstraction**: `ThemedIcon` component handles icon variations across themes
- **API integration**: Vercel Functions in `/api` for AI chat, transcription, and external services

## Technology Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS 4.x with custom theme CSS
- **UI Components**: shadcn/ui built on Radix UI primitives
- **State**: Zustand for app state, React Context for coordination
- **Audio**: Tone.js for synthesis, Wavesurfer.js for visualization
- **3D Graphics**: Three.js for visual effects and backgrounds
- **AI Integration**: Vercel AI SDK with multiple provider support
- **Icons**: Lucide React + custom theme-specific icon sets

## Development Guidelines

### Adding New Apps
1. Create app directory in `src/apps/[app-name]/`
2. Implement `[AppName]AppComponent.tsx` with `AppProps` interface
3. Create app object with `id`, `name`, `icon`, `component`, `metadata`
4. Register in `src/config/appRegistry.ts` with window configuration
5. Add app ID to `src/config/appIds.ts`

### Working with Themes
- Use `ThemedIcon` component for icons that vary by theme
- Access current theme via `useThemeStore()` 
- Theme-specific assets in `public/icons/[theme]/` and `public/wallpapers/`
- Custom CSS properties defined in `src/styles/themes.css`

### State Management
- Create Zustand store in `src/stores/use[Domain]Store.ts` for complex app state
- Use React state for simple component-local state
- Persist important state to IndexedDB via utilities in `src/utils/indexedDB.ts`

### API Development
- API routes in `/api` using Vercel Functions
- Rate limiting via `api/utils/rate-limit.js`
- AI model configuration in `api/utils/aiModels.ts`

## Component Patterns

### Available shadcn/ui Components
Run `bunx --bun shadcn@latest add [component]` to add:
- Standard: button, card, dialog, dropdown-menu, input, label, select, slider, switch, table, tabs, tooltip
- Custom implementations: audio-input-button, audio-bars, volume-bar, dial

### Window Management
Apps receive these standard props:
```typescript
interface AppProps {
  appId: AppId;
  instanceId: string;
  initialData?: any;
}
```

### File System Integration
- Virtual filesystem via `useFilesStore()` and `useFileSystem()` hook
- File operations: create, read, write, delete with persistence
- Import/export functionality for app data and user content