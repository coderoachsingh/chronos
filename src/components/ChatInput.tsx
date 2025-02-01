import React, { useState, useRef } from "react";
import { ArrowUpCircle, ImagePlus } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string, image?: File) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage }) => {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.ipcRenderer.send("query-docs", {
      text: "Hello, who are you ?",
      timestamp: Date.now(),
    });

    if (input.trim() || selectedImage) {
      onSendMessage(input, selectedImage);
      setInput("");
      setSelectedImage(null);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <form className="border-t border-gray-800 p-4">
      <div className="relative">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
        />

        {/* Image preview (if selected) */}
        {selectedImage && (
          <div className="absolute bottom-full mb-2 flex">
            <img
              src={URL.createObjectURL(selectedImage)}
              alt="Selected"
              className="w-20 h-20 object-cover rounded-lg mr-2"
            />
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main input area */}
        <div className="flex items-center">
          {/* Image Upload Button */}
          <button
            type="button"
            onClick={triggerFileInput}
            className="mr-2 p-2 rounded-lg hover:bg-gray-700 transition-colors"
            title="Upload Image"
          >
            <ImagePlus size={20} className="text-gray-300" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              selectedImage ? "Add a caption..." : "Type your message..."
            }
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-4 pr-12 text-gray-300 focus:outline-none focus:border-emerald-600"
          />

          <button
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-600 p-2 rounded-lg hover:bg-emerald-700 transition-colors"
            // disabled={!input.trim() && !selectedImage}
            onClick={handleSubmit}
          >
            <ArrowUpCircle size={20} className="text-white" />
          </button>
        </div>
      </div>
    </form>
  );
};

export default ChatInput;
