import api from './client';

export type TimetableSlot = {
  id: number;
  teacher_id: number;
  teacher_name?: string | null;
  teacher_code?: string | null;
  teacher_department?: string | null;
  class_id: number;
  class_name?: string | null;
  campus_id: number;
  campus_code?: string | null;
  day_of_week: number;
  period: number;
  session: string;
  period_label: string;
};

export type ClassRoom = {
  id: number;
  name: string;
  grade?: number | null;
  campus_id: number;
  campus_code?: string | null;
};

export type TimetableImportResult = {
  campus_id: number;
  campus_code: string;
  slots_created: number;
  classes_created: number;
  teachers_matched: number;
  teachers_unmatched: string[];
  errors: string[];
  message: string;
};

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
  substitute_teacher_id?: number | null;
  substitute_teacher_name?: string | null;
  status: string;
  created_at?: string | null;
};

export const substitutesApi = {
  listTeachers: async (campusId?: number): Promise<{
    id: number;
    name: string;
    teacher_code?: string | null;
    department?: string | null;
    campus_id?: number | null;
  }[]> => {
    const res = await api.get('/substitutes/teachers', {
      params: campusId ? { campus_id: campusId } : undefined,
    });
    return res.data;
  },

  listClasses: async (campusId?: number): Promise<ClassRoom[]> => {
    const res = await api.get('/substitutes/classes', {
      params: campusId ? { campus_id: campusId } : undefined,
    });
    return res.data;
  },

  createClass: async (payload: {
    name: string;
    campus_id: number;
    grade?: number | null;
  }): Promise<ClassRoom> => {
    const res = await api.post('/substitutes/classes', payload);
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

  createSlot: async (payload: {
    teacher_id: number;
    class_id: number;
    campus_id: number;
    day_of_week: number;
    period: number;
  }): Promise<TimetableSlot> => {
    const res = await api.post('/substitutes/timetable', payload);
    return res.data;
  },

  updateSlot: async (
    id: number,
    payload: Partial<{
      teacher_id: number;
      class_id: number;
      day_of_week: number;
      period: number;
    }>,
  ): Promise<TimetableSlot> => {
    const res = await api.patch(`/substitutes/timetable/${id}`, payload);
    return res.data;
  },

  deleteSlot: async (id: number): Promise<void> => {
    await api.delete(`/substitutes/timetable/${id}`);
  },

  importTimetable: async (file: File, campusId: number): Promise<TimetableImportResult> => {
    const form = new FormData();
    form.append('file', file);
    form.append('campus_id', String(campusId));
    const res = await api.post('/substitutes/timetable/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  mySubstitutes: async (): Promise<{ items: SubstituteAssignment[]; count: number }> => {
    const res = await api.get('/substitutes/mine');
    return res.data;
  },

  mySubstitutesCount: async (): Promise<number> => {
    const res = await api.get('/substitutes/mine/count');
    return res.data.count ?? 0;
  },
};
