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

export interface DashboardStats {
  total_documents: number;
  total_pages: number;
  total_users: number;
  openai_cost_this_month: number;
}

export interface ActivityData {
  date: string;
  documents: number;
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
