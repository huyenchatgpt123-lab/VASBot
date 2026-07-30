type Props = {
  visible: boolean;
  percent: number;
  label?: string;
};

export default function OperationProgressBar({ visible, percent, label }: Props) {
  if (!visible) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="fixed bottom-0 inset-x-0 z-[70] pointer-events-none">
      <div className="mx-auto max-w-3xl px-4 pb-4">
        <div className="pointer-events-auto rounded-xl border border-primary-100 bg-white/95 shadow-lg backdrop-blur px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-gray-800 truncate">
              {label || 'Đang xử lý...'}
            </p>
            <span className="text-sm font-semibold tabular-nums text-primary-700 shrink-0">
              {clamped}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-primary-50 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-600 transition-[width] duration-300 ease-out"
              style={{ width: `${clamped}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
