export interface User {
  id: number;
  name: string;
  nickname?: string;
  email: string;
  role: 'admin' | 'user';
  department?: string;
  created_at: string;
}

export interface Document {
  id: number;
  filename: string;
  page_count: number;
  uploaded_by: number;
  uploader_name?: string;
  department?: string;
  month?: number;
  school_year?: string;
  created_at: string;
}

export interface Source {
  document_name: string;
  page_number: number;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  created_at?: string;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

export interface DashboardStats {
  total_documents: number;
  total_pages: number;
  total_users: number;
  total_conversations: number;
  total_ai_questions: number;
  openai_cost_this_month: number;
}

export interface ActivityData {
  date: string;
  conversations: number;
  questions: number;
}

export interface SearchResult {
  document_name: string;
  page_number: number;
  content: string;
  document_id: number;
}

export interface Task {
  id: number;
  title: string;
  assignee_name: string;
  assignee_id: number | null;
  deadline: string | null;
  status: string;
  document_id: number | null;
  document_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}
