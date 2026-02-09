import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const formatCurrency = (amount) => {
  if (Number.isNaN(amount)) return 'N/A';
  return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export const Earnings = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('pt_sessions')
        .select(`
          id,
          scheduled_at,
          session_price,
          session_type,
          commission_amount,
          payment_amount,
          coach_verified,
          member_verified,
          payment_approved,
          cancelled_at,
          coach:coach_id(full_name, email),
          member:member_id(full_name, email)
        `)
        .eq('coach_verified', true)
        .eq('member_verified', true)
        .eq('payment_approved', false)
        .is('cancelled_at', null)
        .order('scheduled_at', { ascending: true });

      if (fetchError) {
        console.error('[Earnings] PT sessions query failed. Check RLS for admin access to pt_sessions.', {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code,
          userId: user?.id,
        });
        throw fetchError;
      }
      setSessions(data || []);
    } catch (err) {
      console.error('Failed to fetch PT sessions:', err);
      setError('Unable to load PT payments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const totalPending = useMemo(() => {
    return sessions.reduce((sum, session) => {
      const fallback = (session.session_price || 0) * 0.5;
      const amount = session.payment_amount ?? session.commission_amount ?? fallback;
      return sum + (amount || 0);
    }, 0);
  }, [sessions]);

  const handleApprove = async (session) => {
    if (!user?.id) return;
    setApprovingId(session.id);
    try {
      const fallback = (session.session_price || 0) * 0.5;
      const amount = session.payment_amount ?? session.commission_amount ?? fallback;

      const { error: updateError } = await supabase
        .from('pt_sessions')
        .update({
          payment_approved: true,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          payment_amount: amount,
        })
        .eq('id', session.id);

      if (updateError) throw updateError;

      await loadSessions();
    } catch (err) {
      console.error('Failed to approve payment:', err);
      setError('Failed to approve payment.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Earnings</h1>
        <p className="text-slate-400">PT sessions awaiting payment approval.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="text-xs uppercase tracking-widest text-slate-400">Pending Sessions</div>
          <div className="text-2xl font-semibold mt-3">{sessions.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="text-xs uppercase tracking-widest text-slate-400">Pending Payout</div>
          <div className="text-2xl font-semibold mt-3">{formatCurrency(totalPending)}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="text-xs uppercase tracking-widest text-slate-400">Approval Window</div>
          <div className="text-2xl font-semibold mt-3">Weekly</div>
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        {loading ? (
          <div className="text-slate-400">Loading PT sessions...</div>
        ) : error ? (
          <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="text-slate-400">No pending PT payments.</div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const fallback = (session.session_price || 0) * 0.5;
              const amount = session.payment_amount ?? session.commission_amount ?? fallback;
              return (
                <div
                  key={session.id}
                  className="border border-slate-800 rounded-xl px-5 py-4 bg-slate-950/70"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{session.coach?.full_name || 'Coach'} {'->'} {session.member?.full_name || 'Member'}</div>
                      <div className="text-xs text-slate-400">
                        {formatDateTime(session.scheduled_at)}  -  {session.session_type?.replace('_', ' ') || 'PT Session'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white">{formatCurrency(amount)}</div>
                      <div className="text-xs text-slate-500">Session price: {formatCurrency(session.session_price || 0)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => handleApprove(session)}
                      disabled={approvingId === session.id}
                      className="rounded-lg bg-jai-blue hover:bg-[#007acc] transition text-white text-sm font-medium px-4 py-2"
                    >
                      {approvingId === session.id ? 'Approving...' : 'Approve Payment'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
