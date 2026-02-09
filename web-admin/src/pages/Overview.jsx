import { useEffect, useMemo, useState } from 'react';
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
  const [stats, setStats] = useState({
    classesToday: 0,
    ptToday: 0,
    activeMembers: 0,
    activeCoaches: 0,
  });
  const [todayClasses, setTodayClasses] = useState([]);
  const [todayPT, setTodayPT] = useState([]);

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
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const [{ data: classData, error: classError }, { data: ptData, error: ptError }] = await Promise.all([
          supabase
            .from('classes')
            .select('id, name, start_time, end_time, capacity, lead_coach:lead_coach_id(full_name)')
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true)
            .order('start_time', { ascending: true }),
          supabase
            .from('pt_sessions')
            .select('id, scheduled_at, session_type, session_price, coach:coach_id(full_name), member:member_id(full_name)')
            .gte('scheduled_at', startOfDay.toISOString())
            .lte('scheduled_at', endOfDay.toISOString())
            .order('scheduled_at', { ascending: true }),
        ]);

        if (classError) throw classError;
        if (ptError) throw ptError;

        const enrichedClasses = await Promise.all(
          (classData || []).map(async (classItem) => {
            const { count } = await supabase
              .from('bookings')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', classItem.id)
              .neq('status', 'cancelled');
            return { ...classItem, enrolled_count: count || 0 };
          })
        );

        const [{ count: memberCount }, { count: coachCount }] = await Promise.all([
          supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'member')
            .eq('is_active', true),
          supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'coach')
            .eq('is_active', true),
        ]);

        if (!mounted) return;

        setTodayClasses(enrichedClasses);
        setTodayPT(ptData || []);
        setStats({
          classesToday: enrichedClasses.length,
          ptToday: (ptData || []).length,
          activeMembers: memberCount || 0,
          activeCoaches: coachCount || 0,
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
        <p className="text-slate-400">{greeting}. Here is today's admin snapshot.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {[
          { label: 'Classes Today', value: stats.classesToday },
          { label: 'PT Sessions Today', value: stats.ptToday },
          { label: 'Active Members', value: stats.activeMembers },
          { label: 'Active Coaches', value: stats.activeCoaches },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="text-xs uppercase tracking-widest text-slate-400">{item.label}</div>
            <div className="text-2xl font-semibold mt-3">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Today's Classes</h2>
            <span className="text-xs uppercase tracking-widest text-slate-400">{stats.classesToday} total</span>
          </div>
          {loading ? (
            <div className="text-slate-400">Loading classes...</div>
          ) : error ? (
            <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">{error}</div>
          ) : todayClasses.length === 0 ? (
            <div className="text-slate-400">No classes scheduled for today.</div>
          ) : (
            <div className="space-y-3">
              {todayClasses.map((classItem) => (
                <div
                  key={classItem.id}
                  className="border border-slate-800 rounded-lg px-4 py-3 bg-slate-950/70"
                >
                  <div className="font-medium text-white">{classItem.name}</div>
                  <div className="text-xs text-slate-400">
                    {formatTime(classItem.start_time)} - {formatTime(classItem.end_time)}  -  {classItem.enrolled_count} booked
                  </div>
                  <div className="text-xs text-slate-500">Lead coach: {classItem.lead_coach?.full_name || 'Unassigned'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Today's PT Sessions</h2>
            <span className="text-xs uppercase tracking-widest text-slate-400">{stats.ptToday} total</span>
          </div>
          {loading ? (
            <div className="text-slate-400">Loading PT sessions...</div>
          ) : error ? (
            <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">{error}</div>
          ) : todayPT.length === 0 ? (
            <div className="text-slate-400">No PT sessions scheduled for today.</div>
          ) : (
            <div className="space-y-3">
              {todayPT.map((session) => (
                <div
                  key={session.id}
                  className="border border-slate-800 rounded-lg px-4 py-3 bg-slate-950/70"
                >
                  <div className="font-medium text-white">{session.coach?.full_name || 'Coach'} {'->'} {session.member?.full_name || 'Member'}</div>
                  <div className="text-xs text-slate-400">
                    {formatDateTime(session.scheduled_at)}  -  {session.session_type?.replace('_', ' ') || 'PT Session'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
