import { useState, useEffect, useRef } from 'react';
import { chatApi } from '../api/chat';
import { Conversation, ChatMessage, Source } from '../types';

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const data = await chatApi.getConversations();
      setConversations(data);
    } catch {
      /* ignore */
    }
  };

  const loadConversation = async (id: number) => {
    try {
      const data = await chatApi.getConversation(id);
      setActiveConvId(id);
      setMessages(data.messages);
      setHistoryOpen(false);
    } catch {
      /* ignore */
    }
  };

  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setHistoryOpen(false);
  };

  const handleDeleteConv = async (id: number) => {
    try {
      await chatApi.deleteConversation(id);
      if (activeConvId === id) {
        handleNewChat();
      }
      loadConversations();
    } catch {
      /* ignore */
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const result = await chatApi.sendMessage(question, activeConvId ?? undefined);
      setActiveConvId(result.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.answer, sources: result.sources },
      ]);
      loadConversations();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Có lỗi xảy ra. Vui lòng thử lại.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const historyPanel = (
    <>
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <button
          onClick={handleNewChat}
          className="flex-1 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          + Cuộc trò chuyện mới
        </button>
        <button
          onClick={() => setHistoryOpen(false)}
          className="lg:hidden ml-2 p-2 text-gray-400 hover:text-gray-600"
          aria-label="Đóng lịch sử"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
              activeConvId === conv.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex-1 min-w-0" onClick={() => loadConversation(conv.id)}>
              <p className="text-sm font-medium truncate">{conv.title}</p>
              <p className="text-xs text-gray-400">
                {new Date(conv.created_at).toLocaleDateString('vi-VN')}
              </p>
            </div>
            <button
              onClick={() => handleDeleteConv(conv.id)}
              className="opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs p-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="flex h-full relative">
      {historyOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setHistoryOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Chat history — desktop fixed panel */}
      <div className="hidden lg:flex w-72 bg-white border-r border-gray-200 flex-col shrink-0">
        {historyPanel}
      </div>

      {/* Chat history — mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:hidden ${
          historyOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {historyPanel}
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="lg:hidden px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Lịch sử
          </button>
          <button
            onClick={handleNewChat}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            + Mới
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center text-2xl mb-4">
                💬
              </div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                Chào mừng đến VABot
              </h2>
              <p className="text-gray-500 max-w-md text-sm sm:text-base">
                Hỏi bất kỳ câu hỏi về tài liệu nội bộ. AI sẽ trả lời dựa trên nội dung tài liệu đã upload.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 sm:px-5 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-1">Nguồn:</p>
                    {msg.sources.map((src: Source, i: number) => (
                      <p key={i} className="text-xs text-gray-500 break-words">
                        {src.document_name} — Trang {src.page_number}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-5 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 sm:p-4 border-t border-gray-200 bg-white">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Nhập câu hỏi..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-base"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:shrink-0"
            >
              Gửi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
