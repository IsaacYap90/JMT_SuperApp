import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const RequireRole = ({ allow }) => {
  const { role } = useAuth();

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  if (!allow.includes(role)) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-200">
        You do not have access to this area.
      </div>
    );
  }

  return <Outlet />;
};
