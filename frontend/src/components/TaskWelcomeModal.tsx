import { useNavigate } from 'react-router-dom';

interface TaskWelcomeModalProps {
  userName: string;
  taskCount: number;
  onClose: () => void;
}

export default function TaskWelcomeModal({ userName, taskCount, onClose }: TaskWelcomeModalProps) {
  const navigate = useNavigate();
  const firstName = userName.split(' ').slice(-1)[0] || userName;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-welcome-title"
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-primary-100 overflow-hidden animate-fade-in"
      >
        <div className="bg-gradient-to-br from-primary-50 via-white to-amber-50 px-6 pt-8 pb-6 text-center">
          <div className="text-5xl mb-3 select-none">
            {taskCount > 0 ? '📌' : '🎉'}
          </div>
          <h2 id="task-welcome-title" className="text-xl font-bold text-gray-900">
            Xin chào, {firstName}!
          </h2>
          {taskCount > 0 ? (
            <p className="mt-3 text-gray-600 leading-relaxed">
              Hiện tại bạn có{' '}
              <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-bold text-lg">
                {taskCount}
              </span>{' '}
              công việc cần hoàn thành nhé~
            </p>
          ) : (
            <p className="mt-3 text-gray-600 leading-relaxed">
              Tuyệt vời! Bạn không còn công việc nào đang chờ hoàn thành.
              <span className="block mt-1 text-primary-600 font-medium">Cứ nghỉ ngơi một chút nhé ✨</span>
            </p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            {taskCount > 0 ? 'Cố lên nha, mình tin bạn làm được! 💪' : 'Hôm nay là một ngày nhẹ nhàng~'}
          </p>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2">
          {taskCount > 0 && (
            <button
              onClick={() => {
                onClose();
                navigate('/tasks');
              }}
              className="w-full py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors"
            >
              Xem công việc ngay
            </button>
          )}
          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
              taskCount > 0
                ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {taskCount > 0 ? 'Đã hiểu rồi!' : 'Tuyệt, cảm ơn!'}
          </button>
        </div>
      </div>
    </div>
  );
}
