import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Home = () => {
  const { role } = useAuth();

  if (role === 'master_admin' || role === 'admin') {
    return <Navigate to="/overview" replace />;
  }

  return (
    <div className="text-slate-200">
      Your account does not have a recognized role.
    </div>
  );
};
