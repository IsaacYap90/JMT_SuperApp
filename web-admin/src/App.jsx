import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { DashboardLayout } from './components/DashboardLayout';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Schedule } from './pages/Schedule';
import { Members } from './pages/Members';
import { Bookings } from './pages/Bookings';
import { Coaches } from './pages/Coaches';
import { Earnings } from './pages/Earnings';
import { HR } from './pages/HR';

export const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth />}>
          <Route element={<DashboardLayout />}>
            <Route element={<RequireRole allow={['master_admin', 'admin']} />}>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="overview" element={<Overview />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="members" element={<Members />} />
              <Route path="bookings" element={<Bookings />} />
            </Route>

            <Route element={<RequireRole allow={['master_admin']} />}>
              <Route path="coaches" element={<Coaches />} />
              <Route path="earnings" element={<Earnings />} />
              <Route path="hr" element={<HR />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);
