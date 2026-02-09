import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const employmentOptions = [
  { value: 'part_time', label: 'Part-time' },
  { value: 'full_time', label: 'Full-time' },
];

export const Coaches = () => {
  const [coaches, setCoaches] = useState([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [employmentType, setEmploymentType] = useState('part_time');
  const [hourlyRate, setHourlyRate] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [startDate, setStartDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchCoaches = async () => {
    try {
      const { data, error: dbError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, employment_type, hourly_rate, base_salary, start_date, is_active')
        .eq('role', 'coach')
        .order('full_name');

      if (dbError) throw dbError;
      setCoaches(data || []);
    } catch (err) {
      console.error('Error fetching coaches:', err);
    }
  };

  useEffect(() => {
    fetchCoaches();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: 'JMT1234',
          full_name: fullName.trim(),
          role: 'coach',
          user_token: session?.access_token,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create coach');

      if (result.user?.id) {
        await supabase
          .from('users')
          .update({
            phone: phone.trim() || null,
            employment_type: employmentType,
            hourly_rate: employmentType === 'part_time' ? (parseFloat(hourlyRate) || null) : null,
            base_salary: employmentType === 'full_time' ? (parseFloat(baseSalary) || null) : null,
            start_date: startDate || null,
            is_first_login: true,
          })
          .eq('id', result.user.id);
      }

      setFullName('');
      setEmail('');
      setPhone('');
      setEmploymentType('part_time');
      setHourlyRate('');
      setBaseSalary('');
      setStartDate('');
      await fetchCoaches();
    } catch (err) {
      setError(err.message || 'Failed to create coach');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Coaches</h1>
        <p className="text-slate-400">Master admin only. Create new coach accounts.</p>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <form className="grid md:grid-cols-3 gap-4 items-end" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm mb-2">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="Coach Full Name"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="coach@jmt.com"
              type="email"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="+65 9000 0000"
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Employment Type</label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
            >
              {employmentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-2">Hourly Rate</label>
            <input
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="e.g. 80"
              type="number"
              step="0.01"
              disabled={employmentType !== 'part_time'}
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Base Salary</label>
            <input
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="e.g. 3500"
              type="number"
              step="0.01"
              disabled={employmentType !== 'full_time'}
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Start Date</label>
            <input
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              type="date"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-lg bg-jai-blue hover:bg-[#007acc] transition text-white font-medium md:col-span-3"
          >
            {loading ? 'Creating...' : 'Add Coach'}
          </button>
        </form>
        {error ? (
          <div className="mt-4 text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">
            {error}
          </div>
        ) : null}
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Coach Directory</h2>
        <div className="space-y-3">
          {coaches.length === 0 ? (
            <p className="text-slate-500">No coaches found.</p>
          ) : (
            coaches.map((coach) => (
              <div
                key={coach.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-800 rounded-lg px-4 py-3 bg-slate-950/70"
              >
                <div>
                  <div className="font-medium text-white">{coach.full_name || 'Unknown Name'}</div>
                  <div className="text-xs text-slate-400">{coach.email}</div>
                  <div className="text-xs text-slate-500">{coach.phone || 'No phone'}</div>
                </div>
                <div className="text-right text-xs uppercase tracking-widest text-slate-400">
                  <div>{coach.employment_type ? coach.employment_type.replace('_', ' ') : 'Employment not set'}</div>
                  <div className="text-slate-500">
                    {coach.employment_type === 'part_time'
                      ? `Hourly: ${coach.hourly_rate || 'N/A'}`
                      : `Base: ${coach.base_salary || 'N/A'}`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
