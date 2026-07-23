import api from './client';

export interface Campus {
  id: number;
  code: string;
  name: string;
}

export interface BghCalendarPlan {
  event_id?: number | null;
  document_id: number;
  plan_name: string;
  date: string | null;
  start_time: string | null;
  end_time?: string | null;
  campuses: string[];
  is_continuation?: boolean;
  event_end_date?: string | null;
  needs_review?: boolean;
  source?: string;
}

export interface BghCalendarData {
  scheduled_plans: BghCalendarPlan[];
  unscheduled_plans: BghCalendarPlan[];
  day_counts: Record<string, number>;
}

export interface PlanEventPayload {
  title: string;
  starts_at: string;
  ends_at?: string | null;
}

export interface PlanEventResult {
  id: number;
  document_id: number;
  title: string;
  starts_at?: string | null;
  ends_at?: string | null;
  source: string;
  needs_review: boolean;
  message: string;
}

export const calendarApi = {
  getBghCalendar: async (params: {
    start_date: string;
    end_date: string;
    campus_id?: number;
  }): Promise<BghCalendarData> => {
    const res = await api.get('/tasks/bgh-calendar', { params });
    return res.data;
  },
  updatePlanEvent: async (eventId: number, data: PlanEventPayload): Promise<PlanEventResult> => {
    const res = await api.patch(`/documents/plan-events/${eventId}`, data);
    return res.data;
  },
  createPlanEvent: async (documentId: number, data: PlanEventPayload): Promise<PlanEventResult> => {
    const res = await api.post(`/documents/${documentId}/plan-events`, data);
    return res.data;
  },
};
