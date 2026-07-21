import api from './client';

export interface Campus {
  id: number;
  code: string;
  name: string;
}

export interface BghCalendarTask {
  id: number;
  title: string;
  deadline: string | null;
  has_scheduled_time: boolean;
  campuses: string[];
  document_name: string | null;
}

export interface BghCalendarData {
  scheduled_tasks: BghCalendarTask[];
  unscheduled_tasks: BghCalendarTask[];
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
