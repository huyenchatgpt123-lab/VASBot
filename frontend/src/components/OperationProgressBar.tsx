type Props = {
  visible: boolean;
  percent: number;
  label?: string;
  className?: string;
};

/** Inline progress row — render inside the modal that started the operation. */
export default function OperationProgressBar({ visible, percent, label, className }: Props) {
  if (!visible) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className={`rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2.5 ${className || ''}`}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="text-xs font-medium text-primary-900 truncate">
          {label || 'Đang xử lý...'}
        </p>
        <span className="text-xs font-semibold tabular-nums text-primary-800 shrink-0">
          {clamped}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/80 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary-600 transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
