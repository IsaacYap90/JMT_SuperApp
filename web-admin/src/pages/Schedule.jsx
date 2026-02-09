import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const getWeekDays = () => {
  const today = new Date();
  const currentDay = today.getDay(); // 0 (Sun) - 6 (Sat)
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - currentDay);
  
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return {
      index: i,
      label: d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' }), // "Tue, 10 Feb"
      date: d
    };
  });
};

export const Schedule = () => {
  const todayIndex = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [classes, setClasses] = useState([]);
  
  const weekDays = useMemo(() => getWeekDays(), []);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editClass, setEditClass] = useState(null); // null = new class
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    start_time: '',
    end_time: '',
    capacity: 20,
    lead_coach_id: ''
  });
  
  const [coaches, setCoaches] = useState([]);

  useEffect(() => {
    // Fetch coaches for dropdown
    const loadCoaches = async () => {
      const { data } = await supabase.from('users').select('id, full_name').eq('role', 'coach');
      setCoaches(data || []);
    };
    loadCoaches();
  }, []);

  const loadClasses = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('classes')
        .select('id, name, description, day_of_week, start_time, end_time, capacity, lead_coach_id, lead_coach:lead_coach_id(full_name)')
        .eq('day_of_week', dayNames[selectedDay])
        .eq('is_active', true)
        .order('start_time', { ascending: true });

      if (fetchError) throw fetchError;

      const enriched = await Promise.all(
        (data || []).map(async (classItem) => {
          const { count } = await supabase
            .from('class_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', classItem.id)
            .neq('status', 'cancelled');
          return { ...classItem, enrolled_count: count || 0 };
        })
      );
      setClasses(enriched);
    } catch (err) {
      console.error(err);
      setError('Unable to load schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, [selectedDay]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editClass) {
        // Update
        await supabase
          .from('classes')
          .update({ ...formData })
          .eq('id', editClass.id);
      } else {
        // Create
        await supabase
          .from('classes')
          .insert({
            ...formData,
            day_of_week: dayNames[selectedDay],
            is_active: true
          });
      }
      setIsModalOpen(false);
      loadClasses();
    } catch (err) {
      alert('Error saving class');
    }
  };

  const openModal = (cls = null) => {
    setEditClass(cls);
    setFormData(cls ? {
      name: cls.name,
      start_time: cls.start_time,
      end_time: cls.end_time,
      capacity: cls.capacity,
      lead_coach_id: cls.lead_coach_id || '' // Note: You might need to fetch the ID if join only returned name
    } : {
      name: '',
      start_time: '18:00',
      end_time: '19:00',
      capacity: 20,
      lead_coach_id: ''
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Schedule</h1>
          <p className="text-slate-400">Manage classes for {weekDays[selectedDay]?.label}.</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-jai-blue hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
        >
          + Add Class
        </button>
      </div>

      {/* Day Picker */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {weekDays.map((day) => (
          <button
            key={day.index}
            onClick={() => setSelectedDay(day.index)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
              day.index === selectedDay
                ? 'bg-slate-800 text-white border border-jai-blue'
                : 'bg-slate-900/50 text-slate-400 border border-transparent hover:bg-slate-800'
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 min-h-[300px]">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="w-8 h-8 border-4 border-jai-blue border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-red-400">{error}</div>
        ) : classes.length === 0 ? (
          <div className="text-slate-500 text-center py-10">No classes scheduled for this day.</div>
        ) : (
          <div className="grid gap-4">
            {classes.map((cls) => (
              <div 
                key={cls.id}
                onClick={() => openModal(cls)}
                className="group flex bg-slate-950 border border-slate-800 rounded-xl p-4 hover:border-jai-blue transition cursor-pointer"
              >
                {/* Time Column */}
                <div className="w-24 border-r border-slate-800 pr-4 flex flex-col justify-center items-center mr-4 group-hover:border-slate-700">
                  <div className="text-lg font-bold text-white">{formatTime(cls.start_time)}</div>
                  <div className="text-xs text-slate-500">{formatTime(cls.end_time)}</div>
                </div>

                {/* Info */}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white group-hover:text-jai-blue transition">{cls.name}</h3>
                  <div className="text-sm text-slate-400 mt-1">
                    Coach: <span className="text-slate-200">{cls.lead_coach?.full_name || 'TBA'}</span>
                  </div>
                </div>

                {/* Capacity */}
                <div className="flex flex-col items-end justify-center pl-4">
                  <div className="text-2xl font-bold text-slate-200">{cls.enrolled_count}<span className="text-sm text-slate-500 font-normal">/{cls.capacity}</span></div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Booked</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{editClass ? 'Edit Class' : 'New Class'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Class Name</label>
                <input 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Start Time</label>
                  <input 
                    type="time"
                    value={formData.start_time}
                    onChange={e => setFormData({...formData, start_time: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">End Time</label>
                  <input 
                    type="time"
                    value={formData.end_time}
                    onChange={e => setFormData({...formData, end_time: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">Capacity</label>
                  <input 
                    type="number"
                    value={formData.capacity}
                    onChange={e => setFormData({...formData, capacity: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Lead Coach</label>
                  <select 
                    value={formData.lead_coach_id}
                    onChange={e => setFormData({...formData, lead_coach_id: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select Coach</option>
                    {coaches.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-jai-blue hover:bg-blue-700 py-2 rounded-lg font-bold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
