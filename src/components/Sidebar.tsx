import React from "react";
import { MessageSquare, Diamond, RefreshCcw } from "lucide-react";

const Sidebar: React.FC = () => {
  return (
    <div className="w-64 border-r border-gray-800 p-4 flex flex-col">
      {/* User Profile */}
      <div className="flex items-center space-x-3 p-3 bg-gray-800 rounded-lg mb-4">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
          <Diamond size={16} className="text-white" />
        </div>
        <div>
          <h3 className="font-medium">Guest Account</h3>
          <p className="text-sm text-gray-500">Free to use</p>
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        <button className="flex items-center space-x-3 w-full p-3 hover:bg-gray-800 rounded-lg">
          <MessageSquare size={16} />
          <span className="text-sm truncate">How to write an impacting...</span>
        </button>
        {/* ... other chat history items ... */}
      </div>

      {/* New Chat Button */}
      <button className="w-full p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg mb-4 flex items-center justify-center space-x-2">
        <span>+</span>
        <span>Start a new chat</span>
      </button>

      {/* Bottom Menu */}
      <div className="space-y-2">
        <button className="flex items-center space-x-3 w-full p-3 hover:bg-gray-800 rounded-lg">
          <RefreshCcw size={16} />
          <span className="text-sm">Clear all conversations</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
