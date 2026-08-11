import api from './client';

export type SubstituteStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | string;

export type SubstituteAssignment = {
  id: number;
  date: string;
  period: number;
  session: string;
  period_label: string;
  class_id: number;
  class_name?: string | null;
  campus_id: number;
  campus_code?: string | null;
  absent_teacher_id: number;
  absent_teacher_name?: string | null;
  absent_teacher_department?: string | null;
  substitute_teacher_id?: number | null;
  substitute_teacher_name?: string | null;
  substitute_teacher_department?: string | null;
  status: SubstituteStatus;
  confirmed_at?: string | null;
  confirmed_by_id?: number | null;
  rejection_reason?: string | null;
  cancel_reason?: string | null;
  created_at?: string | null;
};

export type TeacherOption = {
  id: number;
  name: string;
  teacher_code?: string | null;
  department?: string | null;
  campus_id?: number | null;
};

export type AbsentPeriodItem = {
  date: string;
  day_of_week: number;
  period: number;
  session: string;
  period_label: string;
  class_id: number;
  class_name?: string | null;
  campus_id: number;
  campus_code?: string | null;
  already_assigned: boolean;
  existing_assignment_id?: number | null;
  existing_substitute_name?: string | null;
};

export type SuggestTeacherItem = {
  user_id: number;
  name: string;
  teacher_code?: string | null;
  department?: string | null;
  campus_id?: number | null;
  same_department: boolean;
  tier_label: string;
  periods_that_day: number;
  substitutes_this_week: number;
  is_busy?: boolean;
  busy_reason?: string | null;
};

export type AssignItem = {
  absent_teacher_id: number;
  substitute_teacher_id: number;
  class_id: number;
  campus_id: number;
  date: string;
  period: number;
};

export type TimetableSlot = {
  id: number;
  teacher_id: number;
  teacher_name?: string | null;
  class_id: number;
  class_name?: string | null;
  campus_id: number;
  campus_code?: string | null;
  day_of_week: number;
  period: number;
  session: string;
  period_label: string;
};

export type TimetableImportResult = {
  campuses: string[];
  slots_created: number;
  slots_updated: number;
  classes_created: number;
  teachers_matched: number;
  teachers_unmatched: string[];
  errors: string[];
  message: string;
};

export const substitutesApi = {
  listTeachers: async (campusId?: number): Promise<TeacherOption[]> => {
    const res = await api.get('/substitutes/teachers', {
      params: campusId ? { campus_id: campusId } : undefined,
    });
    return res.data;
  },

  listAssignments: async (params: {
    from_date: string;
    to_date: string;
    campus_id?: number;
  }): Promise<SubstituteAssignment[]> => {
    const res = await api.get('/substitutes/assignments', { params });
    return res.data;
  },

  absentPeriods: async (payload: {
    absent_teacher_id: number;
    dates: string[];
  }): Promise<AbsentPeriodItem[]> => {
    const res = await api.post('/substitutes/absent-periods', payload);
    return res.data;
  },

  suggestions: async (params: {
    absent_teacher_id: number;
    on_date: string;
    period: number;
    class_id: number;
    campus_id: number;
    limit?: number;
    q?: string;
  }): Promise<SuggestTeacherItem[]> => {
    const res = await api.get('/substitutes/suggestions', { params });
    return res.data;
  },

  assign: async (items: AssignItem[]): Promise<{
    created: number;
    items: SubstituteAssignment[];
    errors: string[];
    message: string;
  }> => {
    const res = await api.post('/substitutes/assign', { items });
    return res.data;
  },

  confirmAssignment: async (id: number): Promise<SubstituteAssignment> => {
    const res = await api.post(`/substitutes/assignments/${id}/confirm`);
    return res.data;
  },

  rejectAssignment: async (id: number, reason: string): Promise<SubstituteAssignment> => {
    const res = await api.post(`/substitutes/assignments/${id}/reject`, { reason });
    return res.data;
  },

  cancelAssignment: async (id: number, reason: string): Promise<SubstituteAssignment> => {
    const res = await api.post(`/substitutes/assignments/${id}/cancel`, { reason });
    return res.data;
  },

  reassignAssignment: async (
    id: number,
    substituteTeacherId: number,
    reason?: string,
  ): Promise<SubstituteAssignment & {
    notified?: boolean;
    notify_message?: string;
    previous_substitute_teacher_id?: number | null;
  }> => {
    const res = await api.post(`/substitutes/assignments/${id}/reassign`, {
      substitute_teacher_id: substituteTeacherId,
      reason: reason || undefined,
    });
    return res.data;
  },

  mySubstitutes: async (params?: {
    teacher_id?: number;
    from_date?: string;
    to_date?: string;
  }): Promise<{ items: SubstituteAssignment[]; count: number }> => {
    const res = await api.get('/substitutes/mine', { params });
    return res.data;
  },

  mySubstitutesCount: async (): Promise<number> => {
    const res = await api.get('/substitutes/mine/count');
    return res.data.count ?? 0;
  },

  myTimetableSummary: async (): Promise<{
    has_timetable: boolean;
    slot_count: number;
    substitute_count: number;
    has_upcoming_substitutes: boolean;
  }> => {
    const res = await api.get('/substitutes/mine/summary');
    return res.data;
  },

  myTimetable: async (teacherId?: number): Promise<TimetableSlot[]> => {
    const res = await api.get('/substitutes/mine/timetable', {
      params: teacherId ? { teacher_id: teacherId } : undefined,
    });
    return res.data;
  },

  listTimetable: async (params?: {
    campus_id?: number;
    teacher_id?: number;
    class_id?: number;
  }): Promise<TimetableSlot[]> => {
    const res = await api.get('/substitutes/timetable', { params });
    return res.data;
  },

  importTimetable: async (file: File): Promise<TimetableImportResult> => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post('/substitutes/timetable/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
