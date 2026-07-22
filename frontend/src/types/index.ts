export interface UserPermissions {
  can_upload: boolean;
  can_manage_tasks: boolean;
  can_delete_documents: boolean;
  scope_all_departments: boolean;
}

export interface Department {
  id: number;
  name: string;
  sort_order: number;
  user_count: number;
}

export interface User {
  id: number;
  name: string;
  nickname?: string;
  email: string;
  role: 'admin' | 'user';
  department?: string;
  department_id?: number;
  position?: string;
  position_id?: number;
  permissions?: UserPermissions;
  must_change_password?: boolean;
  created_at: string;
}

export interface Position {
  id: number;
  name: string;
  can_upload: boolean;
  can_manage_tasks: boolean;
  can_delete_documents: boolean;
  scope_all_departments: boolean;
  sort_order: number;
  user_count: number;
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
  plan_title?: string | null;
  plan_event_at?: string | null;
  plan_event_end_at?: string | null;
  created_at: string;
}

export interface CloudinaryStats {
  storage_bytes: number;
  file_count: number;
}

export interface OpenAILineItemCost {
  line_item: string;
  cost_usd: number;
}

export interface DashboardStats {
  total_documents: number;
  total_pages: number;
  total_users: number;
  openai_cost_usd: number;
  openai_cost_vnd: number;
  openai_cost_source: 'openai_billing' | 'internal';
  openai_cost_note?: string | null;
  openai_line_items?: OpenAILineItemCost[] | null;
  cloudinary?: CloudinaryStats | null;
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
