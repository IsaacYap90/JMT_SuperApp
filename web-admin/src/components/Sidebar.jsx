import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const allItems = [
  { label: 'Overview', to: '/overview', roles: ['master_admin', 'admin'] },
  { label: 'Schedule', to: '/schedule', roles: ['master_admin', 'admin'] },
  { label: 'Members', to: '/members', roles: ['master_admin', 'admin'] },
  { label: 'Bookings', to: '/bookings', roles: ['master_admin', 'admin'] },
  { label: 'Coaches', to: '/coaches', roles: ['master_admin'] },
  { label: 'Earnings', to: '/earnings', roles: ['master_admin'] },
  { label: 'HR', to: '/hr', roles: ['master_admin'] }
];

export const Sidebar = () => {
  const { role } = useAuth();

  return (
    <aside className="w-64 bg-slate-900/80 border-r border-slate-800 min-h-screen p-6">
      <div className="mb-8">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">JMT</div>
        <div className="text-xl font-semibold text-white">Admin Portal</div>
      </div>
      <nav className="flex flex-col gap-2">
        {allItems
          .filter((item) => item.roles.includes(role))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-jai-blue text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
      </nav>
    </aside>
  );
};
