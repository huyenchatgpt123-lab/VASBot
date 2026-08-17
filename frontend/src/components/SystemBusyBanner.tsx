type Props = {
  busy: boolean;
  message?: string | null;
  job?: string | null;
};

export default function SystemBusyBanner({ busy, message, job }: Props) {
  if (!busy || !message) return null;

  const accent =
    job === 'import_timetable'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : job === 'import_users'
        ? 'border-sky-200 bg-sky-50 text-sky-950'
        : 'border-primary-200 bg-primary-50 text-primary-950';

  return (
    <div className={`mx-4 mt-3 sm:mx-6 rounded-lg border px-3 py-2.5 ${accent}`} role="status">
      <div className="flex items-start gap-2.5">
        <svg
          className="animate-spin h-4 w-4 mt-0.5 shrink-0 opacity-80"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="text-sm font-medium leading-snug">{message}</p>
      </div>
    </div>
  );
}
