import { useCallback, useEffect, useRef, useState } from 'react';

type ProgressState = {
  visible: boolean;
  percent: number;
  label: string;
};

const IDLE: ProgressState = { visible: false, percent: 0, label: '' };

/**
 * Client-side progress for long upload / re-extract requests.
 * File upload bytes map to 0–40%; processing animates 40–92% until finish().
 */
export function useOperationProgress() {
  const [state, setState] = useState<ProgressState>(IDLE);
  const tickRef = useRef<number | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTick(), [clearTick]);

  const start = useCallback(
    (label: string, opts?: { hasUpload?: boolean }) => {
      clearTick();
      setState({
        visible: true,
        percent: opts?.hasUpload ? 2 : 8,
        label,
      });
      if (!opts?.hasUpload) {
        tickRef.current = window.setInterval(() => {
          setState((prev) => {
            if (!prev.visible || prev.percent >= 92) return prev;
            const step = prev.percent < 50 ? 4 : prev.percent < 75 ? 2 : 1;
            return { ...prev, percent: Math.min(92, prev.percent + step) };
          });
        }, 400);
      }
    },
    [clearTick],
  );

  const setUploadPercent = useCallback((loaded: number, total: number) => {
    if (!total) return;
    const uploadPct = Math.min(40, Math.round((loaded / total) * 40));
    setState((prev) => ({
      ...prev,
      visible: true,
      percent: Math.max(prev.percent, uploadPct),
    }));
    if (loaded >= total) {
      clearTick();
      tickRef.current = window.setInterval(() => {
        setState((prev) => {
          if (!prev.visible || prev.percent >= 92) return prev;
          const step = prev.percent < 60 ? 3 : prev.percent < 80 ? 2 : 1;
          return {
            ...prev,
            label: prev.label.includes('xử lý') ? prev.label : 'Đang xử lý / trích xuất...',
            percent: Math.min(92, Math.max(40, prev.percent) + step),
          };
        });
      }, 450);
    }
  }, [clearTick]);

  const setLabel = useCallback((label: string) => {
    setState((prev) => (prev.visible ? { ...prev, label } : prev));
  }, []);

  const finish = useCallback(async () => {
    clearTick();
    setState((prev) => ({ ...prev, visible: true, percent: 100, label: 'Hoàn thành' }));
    await new Promise((r) => setTimeout(r, 450));
    setState(IDLE);
  }, [clearTick]);

  const fail = useCallback(() => {
    clearTick();
    setState(IDLE);
  }, [clearTick]);

  return {
    progress: state,
    start,
    setUploadPercent,
    setLabel,
    finish,
    fail,
  };
}
