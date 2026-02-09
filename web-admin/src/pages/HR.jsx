import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const formatCurrency = (amount) => {
  if (Number.isNaN(amount)) return 'N/A';
  return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const HR = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingId, setMarkingId] = useState(null);

  const fetchPayslips = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('payslips')
        .select(`
          id,
          user_id,
          month,
          year,
          employment_type,
          gross_pay,
          net_pay,
          status,
          payment_date,
          created_at,
          users:user_id(full_name, email)
        `)
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setPayslips(data || []);
    } catch (err) {
      console.error('Failed to fetch payslips:', err);
      setError('Unable to load payslips.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayslips();
  }, [selectedMonth, selectedYear]);

  const totals = useMemo(() => {
    return payslips.reduce(
      (acc, payslip) => {
        acc.gross += payslip.gross_pay || 0;
        acc.net += payslip.net_pay || 0;
        return acc;
      },
      { gross: 0, net: 0 }
    );
  }, [payslips]);

  const handleMarkPaid = async (payslipId) => {
    setMarkingId(payslipId);
    try {
      const { error: updateError } = await supabase
        .from('payslips')
        .update({
          status: 'paid',
          payment_date: new Date().toISOString(),
        })
        .eq('id', payslipId);

      if (updateError) throw updateError;
      await fetchPayslips();
    } catch (err) {
      console.error('Failed to mark paid:', err);
      setError('Failed to update payslip status.');
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">HR</h1>
        <p className="text-slate-400">Payslips by month with payout status.</p>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2"
            >
              {months.map((month, idx) => (
                <option key={month} value={idx + 1}>{month}</option>
              ))}
            </select>
            <input
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              type="number"
              className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 w-28"
            />
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-300">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Gross</div>
              <div className="text-lg font-semibold">{formatCurrency(totals.gross)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-400">Net</div>
              <div className="text-lg font-semibold">{formatCurrency(totals.net)}</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading payslips...</div>
        ) : error ? (
          <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">{error}</div>
        ) : payslips.length === 0 ? (
          <div className="text-slate-400">No payslips for this period.</div>
        ) : (
          <div className="space-y-3">
            {payslips.map((payslip) => (
              <div
                key={payslip.id}
                className="border border-slate-800 rounded-xl px-5 py-4 bg-slate-950/70"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">
                      {payslip.users?.full_name || 'Coach'}
                    </div>
                    <div className="text-xs text-slate-400">{payslip.users?.email}</div>
                    <div className="text-xs text-slate-500">
                      {months[payslip.month - 1]} {payslip.year}  -  {payslip.employment_type?.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">Gross {formatCurrency(payslip.gross_pay || 0)}</div>
                    <div className="text-lg font-semibold">Net {formatCurrency(payslip.net_pay || 0)}</div>
                    <div className="text-xs text-slate-500">Payment date: {formatDate(payslip.payment_date)}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                  <span>Status: {payslip.status}</span>
                  {payslip.status !== 'paid' ? (
                    <button
                      onClick={() => handleMarkPaid(payslip.id)}
                      disabled={markingId === payslip.id}
                      className="rounded-lg bg-jai-blue hover:bg-[#007acc] transition text-white text-xs font-medium px-3 py-2"
                    >
                      {markingId === payslip.id ? 'Updating...' : 'Mark Paid'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
