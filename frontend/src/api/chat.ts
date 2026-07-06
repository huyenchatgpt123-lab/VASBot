import api from './client';
import { Conversation, ChatMessage, Source } from '../types';

export const chatApi = {
  sendMessage: async (question: string, conversationId?: number) => {
    const res = await api.post('/chat', {
      question,
      conversation_id: conversationId,
    });
    return res.data as {
      answer: string;
      sources: Source[];
      conversation_id: number;
    };
  },
  getConversations: async (): Promise<Conversation[]> => {
    const res = await api.get('/conversations');
    return res.data;
  },
  getConversation: async (id: number) => {
    const res = await api.get(`/conversations/${id}`);
    return res.data as {
      id: number;
      title: string;
      created_at: string;
      messages: ChatMessage[];
    };
  },
  deleteConversation: async (id: number) => {
    const res = await api.delete(`/conversations/${id}`);
    return res.data;
  },
};
