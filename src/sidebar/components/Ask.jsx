import React, { useState } from 'react';

/**
 * Ask component - placeholder for now
 * Will implement full AI chat functionality in next phase
 */
function Ask() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-lg font-medium mb-2">Ask about your browser context</p>
            <p className="text-sm">Ask questions across all your open tabs and work history</p>
            <p className="text-xs mt-4 text-gray-400">Configure your API key in Settings first</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="mb-4">
              <div className={`text-sm ${msg.role === 'user' ? 'text-blue-600' : 'text-gray-900'}`}>
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-200 p-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your work..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
        />
        <button
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 w-full"
          onClick={() => {
            if (input.trim()) {
              setMessages([...messages, { role: 'user', text: input }]);
              setInput('');
            }
          }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}

export default Ask;
