// Shown instantly on every dashboard navigation and on cold home-screen open,
// so users see a skeleton UI instead of a white "hang" while server components
// resolve Supabase auth + profile lookup.
export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen bg-jai-bg animate-pulse">
      {/* Desktop sidebar skeleton */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-jai-card border-r border-jai-border flex-col overflow-hidden">
        <div className="p-6 border-b border-jai-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="h-2 w-16 rounded bg-white/5" />
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-white/5" />
          ))}
        </nav>
      </aside>

      {/* Main content skeleton */}
      <main className="flex-1 px-4 pt-4 pb-24 md:px-6 md:pt-6 lg:px-8 lg:pt-8 lg:pb-8 ml-0 lg:ml-64 space-y-4">
        <div className="h-8 w-40 rounded bg-white/10" />
        <div className="h-4 w-64 rounded bg-white/5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-jai-card border border-jai-border" />
          ))}
        </div>
        <div className="h-40 rounded-xl bg-jai-card border border-jai-border mt-4" />
      </main>

      {/* Mobile bottom nav skeleton */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-jai-card border-t border-jai-border grid grid-cols-5 pb-safe">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex flex-col items-center justify-center py-3 gap-1">
            <div className="w-5 h-5 rounded bg-white/10" />
            <div className="w-8 h-2 rounded bg-white/5" />
          </div>
        ))}
      </nav>
    </div>
  );
}
