export interface Message {
  id: string;
  content: string;
  sender: "user" | "bot";
  timestamp: Date;
}

export interface ChatState {
  messages: Message[];
  isTyping: boolean;
}
