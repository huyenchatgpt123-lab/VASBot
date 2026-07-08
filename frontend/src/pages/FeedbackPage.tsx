import { useAuth } from '../context/AuthContext';
import UserFeedbackView from './UserFeedbackView';
import AdminFeedbackView from './AdminFeedbackView';

export default function FeedbackPage() {
  const { isAdmin } = useAuth();
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {isAdmin ? <AdminFeedbackView /> : <UserFeedbackView />}
    </div>
  );
}
