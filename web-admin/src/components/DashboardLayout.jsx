import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from './Sidebar';

export const DashboardLayout = () => {
  const { user, role, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6">
          <div className="text-sm text-slate-400">
            Signed in as <span className="text-white">{user?.email}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-slate-400">
              {role || 'unknown role'}
            </span>
            <button
              onClick={signOut}
              className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
