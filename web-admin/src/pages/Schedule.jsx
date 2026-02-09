import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatTime = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes || 0), 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export const Schedule = () => {
  const todayIndex = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedDayLabel = useMemo(() => dayLabels[selectedDay], [selectedDay]);

  useEffect(() => {
    let mounted = true;

    const loadClasses = async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: fetchError } = await supabase
          .from('classes')
          .select('id, name, description, day_of_week, start_time, end_time, capacity, lead_coach:lead_coach_id(full_name)')
          .eq('day_of_week', dayNames[selectedDay])
          .eq('is_active', true)
          .order('start_time', { ascending: true });

        if (fetchError) throw fetchError;

        const enriched = await Promise.all(
          (data || []).map(async (classItem) => {
            const { count } = await supabase
              .from('bookings')
              .select('*', { count: 'exact', head: true })
              .eq('class_id', classItem.id)
              .neq('status', 'cancelled');

            const { data: coachData } = await supabase
              .from('class_coaches')
              .select('users:coach_id(full_name)')
              .eq('class_id', classItem.id);

            const assignedCoachNames = (coachData || [])
              .map((item) => item.users?.full_name || '')
              .filter(Boolean);

            return {
              ...classItem,
              enrolled_count: count || 0,
              assigned_coaches: assignedCoachNames,
            };
          })
        );

        if (!mounted) return;
        setClasses(enriched);
      } catch (err) {
        console.error('Failed to load schedule:', err);
        if (mounted) setError('Unable to load schedule data.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadClasses();

    return () => {
      mounted = false;
    };
  }, [selectedDay]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <p className="text-slate-400">Classes for {selectedDayLabel}.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {dayLabels.map((label, idx) => (
          <button
            key={label}
            onClick={() => setSelectedDay(idx)}
            className={`rounded-full px-4 py-2 text-sm transition border ${
              idx === selectedDay
                ? 'bg-jai-blue text-white border-jai-blue'
                : 'border-slate-800 text-slate-300 hover:border-jai-blue hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        {loading ? (
          <div className="text-slate-400">Loading schedule...</div>
        ) : error ? (
          <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-3 rounded">{error}</div>
        ) : classes.length === 0 ? (
          <div className="text-slate-400">No classes scheduled.</div>
        ) : (
          <div className="space-y-4">
            {classes.map((classItem) => (
              <div
                key={classItem.id}
                className="border border-slate-800 rounded-xl px-5 py-4 bg-slate-950/70"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-white">{classItem.name}</div>
                    <div className="text-sm text-slate-400">
                      {formatTime(classItem.start_time)} - {formatTime(classItem.end_time)}
                    </div>
                    {classItem.description ? (
                      <div className="text-xs text-slate-500 mt-2 max-w-xl">{classItem.description}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-widest text-slate-400">
                    <span>Capacity {classItem.capacity || 0}</span>
                    <span>{classItem.enrolled_count} booked</span>
                  </div>
                </div>
                <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
                  <div className="text-slate-300">
                    Lead coach: <span className="text-white">{classItem.lead_coach?.full_name || 'Unassigned'}</span>
                  </div>
                  <div className="text-slate-300">
                    Assigned coaches:{' '}
                    <span className="text-white">
                      {classItem.assigned_coaches?.length ? classItem.assigned_coaches.join(', ') : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
