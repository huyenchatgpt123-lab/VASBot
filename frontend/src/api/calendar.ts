import api from './client';

export interface Campus {
  id: number;
  code: string;
  name: string;
}

export interface BghCalendarPlan {
  document_id: number;
  plan_name: string;
  date: string | null;
  start_time: string | null;
  campuses: string[];
  is_continuation?: boolean;
  event_end_date?: string | null;
}

export interface BghCalendarData {
  scheduled_plans: BghCalendarPlan[];
  unscheduled_plans: BghCalendarPlan[];
  day_counts: Record<string, number>;
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
};
