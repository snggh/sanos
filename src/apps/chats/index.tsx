import { BaseApp } from "../base/types";
import { ChatsAppComponent } from "./components/ChatsAppComponent";

export const helpItems = [
  {
    icon: "💬",
    title: "Chat with Singgih",
    description:
      "Type your message to chat with Singgih, generate code, or help with sanOS.",
  },
  {
    icon: "#️⃣",
    title: "Join Chat Rooms",
    description: "Connect with netizens in public chat rooms.",
  },
  {
    icon: "🎤",
    title: "Push to Talk",
    description:
      "Hold Space or tap the microphone button to record and send voice messages.",
  },
  {
    icon: "📝",
    title: "Control TextEdit",
    description:
      "Ask Singgih to read, insert, replace, or delete lines in your open TextEdit document.",
  },
  {
    icon: "🚀",
    title: "Control Apps",
    description:
      "Ask Singgih to launch or close other applications like Internet Explorer or Video Player.",
  },
  {
    icon: "💾",
    title: "Save Transcript",
    description:
      "Save your current chat conversation with Singgih as a Markdown file.",
  },
];

export const appMetadata = {
  name: "Chats",
  version: "1.0",
  creator: {
    name: "Singgih",
    url: "https://singgih.dev",
  },
  github: "https://github.com/snggh/sanos",
  icon: "/icons/default/question.png",
};

export const ChatsApp: BaseApp = {
  id: "chats",
  name: "Chats",
  icon: { type: "image", src: appMetadata.icon },
  description: "Chat with Singgih, your personal AI assistant",
  component: ChatsAppComponent,
  helpItems,
  metadata: appMetadata,
};
