import { useEffect, useState } from 'react';
import { systemApi, SystemStatus } from '../api/system';
import { useAuth } from '../context/AuthContext';

const IDLE: SystemStatus = {
  busy: false,
  job: null,
  message: null,
  started_at: null,
};

/** Poll system busy flag so all logged-in users see specific import banners. */
export function useSystemStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SystemStatus>(IDLE);

  useEffect(() => {
    if (!user) {
      setStatus(IDLE);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const schedule = (ms: number) => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      try {
        const next = await systemApi.getStatus();
        if (cancelled) return;
        setStatus(next);
        schedule(next.busy ? 4000 : 10000);
      } catch {
        if (!cancelled) schedule(15000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [user]);

  return status;
}
