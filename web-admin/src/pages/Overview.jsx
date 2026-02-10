import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, CalendarClock, CalendarDays, ChevronRight, ClipboardList, Users } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const formatTime = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes || 0), 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDateTime = (isoString) => {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const Overview = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todayClasses, setTodayClasses] = useState([]);
  const [actionItems, setActionItems] = useState({
    pendingLeaves: 0,
    pendingPayments: 0,
    expiringMemberships: 0,
  });

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      setLoading(true);
      setError('');
      try {
        const today = new Date();
        const dayOfWeek = dayNames[today.getDay()];

        const singaporeOffset = 8 * 60 * 60 * 1000;
        const todayInSG = new Date(today.getTime() + singaporeOffset);
        const year = todayInSG.getUTCFullYear();
        const month = todayInSG.getUTCMonth();
        const day = todayInSG.getUTCDate();
        const startOfTodayUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        const endOfTodayUTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

        const windowEndUTC = new Date(Date.UTC(year, month, day + 7, 23, 59, 59, 999));

        const [
          { data: classData, error: classError },
          { count: pendingLeaveCount, error: leaveError },
          { count: pendingPaymentCount, error: paymentError },
          { count: expiringCount, error: membershipError },
        ] = await Promise.all([
          supabase
            .from('classes')
            .select('*, lead_coach:lead_coach_id(full_name)')
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true)
            .order('start_time', { ascending: true }),
          supabase
            .from('leave_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('pt_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('payment_approved', false),
          supabase
            .from('memberships')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active')
            .gte('end_date', startOfTodayUTC.toISOString())
            .lte('end_date', windowEndUTC.toISOString()),
        ]);

        if (classError) throw classError;
        if (leaveError) throw leaveError;
        if (paymentError) throw paymentError;
        if (membershipError) throw membershipError;

        const enrichedClasses = await Promise.all(
          (classData || []).map(async (classItem) => {
            const { count } = await supabase
              .from('class_enrollments')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', classItem.id)
              .neq('status', 'cancelled');
            return { ...classItem, enrolled_count: count || 0 };
          })
        );

        if (!mounted) return;

        setTodayClasses(enrichedClasses);
        setActionItems({
          pendingLeaves: pendingLeaveCount || 0,
          pendingPayments: pendingPaymentCount || 0,
          expiringMemberships: expiringCount || 0,
        });
      } catch (err) {
        console.error('Failed to load overview:', err);
        if (mounted) setError('Unable to load overview data.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadOverview();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-slate-400">{greeting}. Here are today’s priorities and classes.</p>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">Action Items</h2>
            <p className="text-sm text-slate-400">High-priority items that need attention.</p>
          </div>
          <span className="text-xs uppercase tracking-widest text-slate-500">Today</span>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-slate-900 p-2 text-jai-blue">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm text-slate-400">Pending Leave Requests</div>
                <div className="text-2xl font-semibold text-white">
                  {loading ? '—' : actionItems.pendingLeaves}
                </div>
              </div>
            </div>
            <Link
              to="/hr"
              className="text-sm text-slate-300 hover:text-white flex items-center gap-1"
            >
              Review <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-slate-900 p-2 text-emerald-300">
                <Banknote className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm text-slate-400">Pending PT Payments</div>
                <div className="text-2xl font-semibold text-white">
                  {loading ? '—' : actionItems.pendingPayments}
                </div>
              </div>
            </div>
            <Link
              to="/earnings"
              className="text-sm text-slate-300 hover:text-white flex items-center gap-1"
            >
              Review <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-slate-900 p-2 text-amber-300">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm text-slate-400">Expiring Memberships (7 days)</div>
                <div className="text-2xl font-semibold text-white">
                  {loading ? '—' : actionItems.expiringMemberships}
                </div>
              </div>
            </div>
            <Link
              to="/members"
              className="text-sm text-slate-300 hover:text-white flex items-center gap-1"
            >
              View <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-jai-blue" />
            <h2 className="text-lg font-semibold">Today's Classes</h2>
          </div>
          <span className="text-xs uppercase tracking-widest text-slate-400">{todayClasses.length} total</span>
        </div>
        {loading ? (
          <div className="text-slate-400">Loading classes...</div>
        ) : error ? (
          <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">{error}</div>
        ) : todayClasses.length === 0 ? (
          <div className="text-slate-400">No classes scheduled for today.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {todayClasses.map((classItem) => (
              <div key={classItem.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-4">
                <div>
                  <div className="font-medium text-white">{classItem.name}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatTime(classItem.start_time)} - {formatTime(classItem.end_time)}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {classItem.enrolled_count} booked
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Lead coach: <span className="text-slate-300">{classItem.lead_coach?.full_name || 'Unassigned'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
