import React from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import ChatMain from "./components/ChatMain";

const App: React.FC = () => {
  return (
    <div className="flex h-screen bg-zinc-900 text-gray-300">
      <Sidebar />
      <ChatMain />
    </div>
  );
};

export default App;

