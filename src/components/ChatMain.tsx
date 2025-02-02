import React, { useState } from "react";
import { Diamond, Check, Zap } from "lucide-react";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import FileUpload from "./FileUpload";
import { Message } from "../types";
import { v4 as uuidv4 } from "uuid";

const ChatMain: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [activeFile, setActiveFile] = useState<File | null>(null);

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: uuidv4(),
      content,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages([...messages, newMessage]);
    setShowWelcome(false);
  };

  const handleFileSelect = (file: File) => {
    setActiveFile(file);
    window.ipcRenderer.send("load-document", file.path);
    if (messages.length === 0) {
      setShowWelcome(false);
      // Add system message about file upload
      const systemMessage: Message = {
        id: uuidv4(),
        content: `Uploaded ${file.name}. What would you like to know about this document?`,
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages([systemMessage]);
    }
  };

  window.ipcRenderer.on("query-docs-reply", (_, ans) => {
    setMessages([
      ...messages,
      {
        id: uuidv4(),
        content: ans,
        sender: "bot",
        timestamp: new Date(),
      },
    ]);
  });

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {showWelcome ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <h1 className="text-4xl font-bold mb-2 flex items-center">
              Welcome to{" "}
              <span className="bg-violet-700 text-white px-3 py-1 ml-2">
                RAG-NAROK
              </span>
            </h1>
            <p className="text-gray-500 mb-12">
              The power of AI for your documents - Tame the knowledge!
            </p>

            {/* Features */}
            <div className="flex space-x-8 mt-8">
              {[
                { icon: Diamond, title: "Clear and precise" },
                { icon: Check, title: "Fact checking mechanism" },
                { icon: Zap, title: "Multimodel input" },
              ].map(({ icon: Icon, title }) => (
                <div key={title} className="text-center">
                  <div className="w-12 h-12 bg-violet-700 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Icon size={24} className="text-white" />
                  </div>
                  <h3 className="font-medium mb-2">{title}</h3>
                  <p className="text-sm text-gray-500">
                    Pariatur sint laborum cillum
                    <br />
                    aute consectetur irure.
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>
      <div>
        <FileUpload onFileSelect={handleFileSelect} />
        <ChatInput
          messages={messages}
          setMessages={setMessages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
};

export default ChatMain;
