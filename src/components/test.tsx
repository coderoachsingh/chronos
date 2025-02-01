// App.jsx
import React, { useState, useEffect } from "react";
const { ipcRenderer } = window.require("electron");

function App() {
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // Listen for messages from Python
    ipcRenderer.on("python-message", (event, data) => {
      setMessages((prev) => [...prev, data]);
    });

    // Listen for Python errors
    ipcRenderer.on("python-error", (event, error) => {
      console.error("Python error:", error);
      setMessages((prev) => [...prev, { type: "error", error }]);
    });

    // Cleanup
    return () => {
      ipcRenderer.removeAllListeners("python-message");
      ipcRenderer.removeAllListeners("python-error");
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Send query to main process
      await ipcRenderer.invoke("query-docs", {
        text: query,
        timestamp: Date.now(),
      });
      setQuery("");
    } catch (error) {
      console.error("Failed to send query:", error);
    }
  };

  return (
    <div className="p-4">
      <form onSubmit={handleSubmit} className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border p-2 mr-2"
          placeholder="Enter your query..."
        />
        <button type="submit" className="bg-blue-500 text-white p-2">
          Send
        </button>
      </form>

      <div className="messages">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-2 mb-2 rounded ${
              msg.type === "error" ? "bg-red-100" : "bg-gray-100"
            }`}
          >
            {msg.type === "error" ? (
              <p className="text-red-600">{msg.error}</p>
            ) : (
              <p>{msg.results}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
