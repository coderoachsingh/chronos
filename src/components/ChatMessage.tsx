import React from "react";
import { Message } from "../types";

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.sender === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[70%] rounded-lg p-4 ${
          isUser
            ? "bg-emerald-600 text-white rounded-br-none"
            : "bg-gray-800 text-gray-200 rounded-bl-none"
        }`}
      >
        <p>{message.content}</p>
        <span className="text-xs opacity-70 mt-1 block">
          {message.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};

export default ChatMessage;
