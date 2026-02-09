export const Bookings = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <p className="text-slate-400">Upcoming reservations and class attendance.</p>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: 'Today', value: '24' },
            { label: 'This Week', value: '138' },
            { label: 'No-shows', value: '3' }
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400">{stat.label}</div>
              <div className="text-2xl font-semibold mt-2">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
