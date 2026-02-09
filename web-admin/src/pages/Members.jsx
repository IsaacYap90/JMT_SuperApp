import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getMembershipStatus = (member) => {
  const activeMembership = member.memberships?.find((m) => m.status === 'active');
  if (activeMembership) return { label: 'Active', color: 'text-emerald-400' };
  return { label: 'No Membership', color: 'text-slate-400' };
};

export const Members = () => {
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, created_at, memberships(status, end_date)')
        .eq('role', 'member')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setMembers(data || []);
    } catch (err) {
      console.error('Failed to fetch members:', err);
      setError('Unable to load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const filtered = useMemo(() => {
    let list = members;

    if (query) {
      const lowered = query.toLowerCase();
      list = list.filter((member) =>
        member.full_name?.toLowerCase().includes(lowered) ||
        member.email?.toLowerCase().includes(lowered)
      );
    }

    if (filter === 'active') {
      list = list.filter((member) => member.memberships?.some((m) => m.status === 'active'));
    }
    if (filter === 'expired') {
      list = list.filter((member) => !member.memberships?.some((m) => m.status === 'active'));
    }

    return list;
  }, [members, query, filter]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
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
          role: 'member',
          user_token: session?.access_token,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create member');

      if (result.user?.id && phone.trim()) {
        await supabase
          .from('users')
          .update({ phone: phone.trim() })
          .eq('id', result.user.id);
      }

      setFullName('');
      setEmail('');
      setPhone('');
      await fetchMembers();
    } catch (err) {
      setCreateError(err.message || 'Failed to create member');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-slate-400">Search, add, and review member roster.</p>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Add Member</h2>
        <form className="grid md:grid-cols-3 gap-4 items-end" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm mb-2">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="Member Full Name"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="member@jmt.com"
              type="email"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Phone (optional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
              placeholder="+65 9000 0000"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="h-11 rounded-lg bg-jai-blue hover:bg-[#007acc] transition text-white font-medium md:col-span-3"
          >
            {creating ? 'Creating...' : 'Create Member'}
          </button>
        </form>
        {createError ? (
          <div className="mt-4 text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">
            {createError}
          </div>
        ) : null}
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members"
            className="w-full md:max-w-sm rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jai-blue"
          />
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
            {['all', 'active', 'expired'].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`rounded-full px-3 py-1 border ${
                  filter === tab
                    ? 'border-jai-blue text-white'
                    : 'border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading members...</div>
        ) : error ? (
          <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">{error}</div>
        ) : (
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="text-slate-500">No members found.</div>
            ) : (
              filtered.map((member) => {
                const status = getMembershipStatus(member);
                return (
                  <div
                    key={member.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-800 rounded-lg px-4 py-3 bg-slate-950/70"
                  >
                    <div>
                      <div className="font-medium text-white">{member.full_name || 'No Name'}</div>
                      <div className="text-xs text-slate-400">{member.email}</div>
                      <div className="text-xs text-slate-500">Joined {formatDate(member.created_at)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs uppercase tracking-widest ${status.color}`}>{status.label}</div>
                      <div className="text-xs text-slate-500">{member.phone || 'No phone'}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
