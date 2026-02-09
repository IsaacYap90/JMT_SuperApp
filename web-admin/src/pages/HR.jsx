import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Coaches } from './Coaches'; // Re-use the existing component for now

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

const PayslipList = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingId, setMarkingId] = useState(null);

  const fetchPayslips = async () => {
    setLoading(true);
    setError('');
    try {
      const [
        { data: coachData, error: coachError },
        { data: payslipData, error: payslipError },
      ] = await Promise.all([
        supabase
          .from('users')
          .select('id, full_name, email, employment_type, is_active')
          .eq('role', 'coach')
          .order('full_name', { ascending: true }),
        supabase
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
            created_at
          `)
          .eq('month', selectedMonth)
          .eq('year', selectedYear)
          .order('created_at', { ascending: false }),
      ]);

      if (coachError) throw coachError;
      if (payslipError) throw payslipError;

      const payslipMap = new Map((payslipData || []).map((payslip) => [payslip.user_id, payslip]));
      const mergedRows = (coachData || []).map((coach) => ({
        coach,
        payslip: payslipMap.get(coach.id) || null,
      }));

      setPayslips(payslipData || []);
      setRows(mergedRows);
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
      ) : rows.length === 0 ? (
        <div className="text-slate-400">No coaches found.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const payslip = row.payslip;
            const coach = row.coach;
            const statusLabel = payslip?.status || 'not_generated';
            const employment = payslip?.employment_type || coach?.employment_type;
            return (
              <div
                key={coach.id}
                className="border border-slate-800 rounded-xl px-5 py-4 bg-slate-950/70"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">
                      {coach?.full_name || 'Coach'}
                    </div>
                    <div className="text-xs text-slate-400">{coach?.email}</div>
                    <div className="text-xs text-slate-500">
                      {months[selectedMonth - 1]} {selectedYear}  -  {employment ? employment.replace('_', ' ') : 'Employment not set'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">
                      Gross {payslip ? formatCurrency(payslip.gross_pay || 0) : 'N/A'}
                    </div>
                    <div className="text-lg font-semibold">
                      Net {payslip ? formatCurrency(payslip.net_pay || 0) : 'N/A'}
                    </div>
                    <div className="text-xs text-slate-500">
                      Payment date: {payslip ? formatDate(payslip.payment_date) : 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-widest text-slate-400">
                  <span>Status: {statusLabel.replace('_', ' ')}</span>
                  {payslip && payslip.status !== 'paid' ? (
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
            );
          })}
        </div>
      )}
    </div>
  );
};

const LeaveManagement = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('leave_requests')
        .select(`
          id,
          leave_type,
          start_date,
          end_date,
          reason,
          status,
          created_at,
          coach:coach_id(full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setRequests(data || []);
    } catch (err) {
      console.error('Failed to fetch leave requests:', err);
      setError('Unable to load leave requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const formatLeaveDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getLeaveDays = (start, end) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleDecision = async (requestId, status) => {
    if (!user?.id) {
      setError('You must be signed in to review leave requests.');
      return;
    }
    setUpdatingId(requestId);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('leave_requests')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) throw updateError;
      await fetchRequests();
    } catch (err) {
      console.error('Failed to update leave request:', err);
      setError('Failed to update leave request.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Leave Management</h2>
          <p className="text-slate-400 text-sm">Approve or reject coach leave requests.</p>
        </div>
        <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800 w-fit">
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              filter === 'pending'
                ? 'bg-jai-blue text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              filter === 'all'
                ? 'bg-jai-blue text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Requests
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400">Loading leave requests...</div>
      ) : error ? (
        <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/50 p-2 rounded">{error}</div>
      ) : requests.length === 0 ? (
        <div className="text-slate-400">
          {filter === 'pending' ? 'No pending leave requests.' : 'No leave requests found.'}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="border border-slate-800 rounded-xl px-5 py-4 bg-slate-950/70">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <div className="font-semibold text-white">{request.coach?.full_name || 'Coach'}</div>
                  <div className="text-xs text-slate-400">{request.coach?.email}</div>
                  <div className="text-xs text-slate-500">
                    {request.leave_type === 'annual' ? 'Annual Leave' : 'Medical Leave'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-300">
                    {formatLeaveDate(request.start_date)} - {formatLeaveDate(request.end_date)}
                  </div>
                  <div className="text-xs text-slate-500">{getLeaveDays(request.start_date, request.end_date)} day(s)</div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">
                    Status: {request.status}
                  </div>
                </div>
              </div>
              {request.reason ? (
                <div className="mt-3 text-sm text-slate-400">Reason: {request.reason}</div>
              ) : null}
              {request.status === 'pending' ? (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => handleDecision(request.id, 'rejected')}
                    disabled={updatingId === request.id}
                    className="rounded-lg border border-red-500/60 text-red-300 hover:text-red-200 px-4 py-2 text-sm"
                  >
                    {updatingId === request.id ? 'Updating...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => handleDecision(request.id, 'approved')}
                    disabled={updatingId === request.id}
                    className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white px-4 py-2 text-sm"
                  >
                    {updatingId === request.id ? 'Updating...' : 'Approve'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AttendancePanel = () => {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-2">Attendance</h2>
      <p className="text-slate-400">Attendance tools are coming soon.</p>
    </div>
  );
};

const DocumentsPanel = () => {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-2">Documents</h2>
      <p className="text-slate-400">Upload and manage HR documents soon.</p>
    </div>
  );
};

export const HR = () => {
  const [activeTab, setActiveTab] = useState('payslips'); // 'payslips' | 'coaches' | 'leave' | 'attendance' | 'documents'

  const tabs = [
    { id: 'payslips', label: 'Payslips' },
    { id: 'coaches', label: 'Coaches' },
    { id: 'leave', label: 'Leave' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">HR Management</h1>
          <p className="text-slate-400">Manage payroll and staff profiles.</p>
        </div>
        
        <div className="flex flex-wrap gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-800 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-jai-blue text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'payslips' ? <PayslipList /> : null}
      {activeTab === 'coaches' ? <Coaches /> : null}
      {activeTab === 'leave' ? <LeaveManagement /> : null}
      {activeTab === 'attendance' ? <AttendancePanel /> : null}
      {activeTab === 'documents' ? <DocumentsPanel /> : null}
    </div>
  );
};
