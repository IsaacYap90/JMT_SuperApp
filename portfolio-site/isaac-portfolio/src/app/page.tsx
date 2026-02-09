const services = [
  {
    title: "Gym Apps",
    detail: "Member onboarding, class schedules, and retention flows."
  },
  {
    title: "Booking Systems",
    detail: "Automated scheduling with payments and smart reminders."
  },
  {
    title: "Custom Dashboards",
    detail: "Real-time metrics that keep operations lean."
  }
];

const highlights = [
  "3 portals",
  "Fully branded",
  "Integrated payroll"
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-0 h-[520px] w-[520px] rounded-full bg-ember/15 blur-[140px]" />
        <div className="absolute bottom-0 left-0 h-[420px] w-[420px] rounded-full bg-white/10 blur-[180px]" />
        <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(10,11,15,0.8)_50%,rgba(10,11,15,1)_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(#ffffff_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-20 px-6 pb-20 pt-12 sm:px-10">
        <header className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm uppercase tracking-[0.35em] text-mist">
            <span className="h-2 w-2 rounded-full bg-ember shadow-glow" />
            Isaac Yap
          </div>
          <nav className="flex flex-wrap gap-6 text-sm text-mist">
            <a className="transition hover:text-white" href="#services">
              Services
            </a>
            <a className="transition hover:text-white" href="#case-study">
              Case Study
            </a>
            <a className="transition hover:text-white" href="#about">
              About
            </a>
            <a className="transition hover:text-white" href="#contact">
              Contact
            </a>
          </nav>
        </header>

        <section className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div className="space-y-8">
            <p className="text-xs uppercase tracking-[0.4em] text-mist">
              Minimalist. High-speed. Dark mode.
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Mobile Apps for Small Business. Built with AI. Delivered Fast.
            </h1>
            <p className="text-base text-mist sm:text-lg">
              Isaac Yap builds lean mobile products that launch quickly and scale
              with your operations. Every feature is designed to save time and
              keep teams moving.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5">
                Start a project
              </button>
              <button className="rounded-full border border-steel px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/60 hover:text-white">
                View case study
              </button>
            </div>
          </div>
          <div className="rounded-3xl border border-steel/70 bg-night/80 p-8 shadow-[0_40px_120px_rgba(0,0,0,0.4)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.4em] text-mist">
              Availability
            </p>
            <div className="mt-6 space-y-4">
              <p className="text-2xl font-semibold">
                Shipping MVPs in 21-30 days.
              </p>
              <p className="text-sm text-mist">
                Focused sprint cycles, AI-accelerated delivery, and tight
                feedback loops.
              </p>
              <div className="rounded-2xl border border-steel/50 bg-ink/60 p-4">
                <p className="text-xs uppercase tracking-[0.32em] text-mist">
                  Starting at ,000.
                </p>
                <p className="mt-2 text-sm text-white/70">
                  Transparent scoping and fast iterations.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-mist">
                Services
              </p>
              <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
                AI-enhanced product builds.
              </h2>
            </div>
            <p className="max-w-md text-sm text-mist">
              Gym Apps, Booking Systems, Custom Dashboards. Built for operators
              who want speed, clarity, and clean execution.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.title}
                className="rounded-2xl border border-steel/70 bg-night/70 p-6 transition hover:-translate-y-1 hover:border-white/40"
              >
                <h3 className="text-lg font-semibold">{service.title}</h3>
                <p className="mt-3 text-sm text-mist">{service.detail}</p>
                <div className="mt-8 text-xs uppercase tracking-[0.35em] text-ember">
                  Starting at ,000.
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="case-study" className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.4em] text-mist">
              Case Study
            </p>
            <h2 className="text-3xl font-semibold sm:text-4xl">
              JMT Super App
            </h2>
            <p className="text-sm text-mist">
              Delivered a high-speed mobile platform with three distinct
              portals, custom branding, and a payroll-ready operations layer.
            </p>
            <div className="flex flex-wrap gap-3">
              {highlights.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-steel/70 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/80"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-steel/70 bg-night/80 p-8">
            <div className="space-y-6">
              <div className="rounded-2xl border border-steel/60 bg-ink/70 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-mist">
                  Outcome
                </p>
                <p className="mt-3 text-sm text-white/80">
                  Unified experience across operations, staff, and customers
                  with real-time payroll visibility.
                </p>
              </div>
              <div className="rounded-2xl border border-steel/60 bg-ink/70 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-mist">
                  Delivery
                </p>
                <p className="mt-3 text-sm text-white/80">
                  4-week MVP build, rolling releases, and AI-assisted QA.
                </p>
              </div>
              <div className="rounded-2xl border border-steel/60 bg-ink/70 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-mist">
                  Stack
                </p>
                <p className="mt-3 text-sm text-white/80">
                  React Native, Next.js admin portals, and automated reporting.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-steel/70 bg-night/80 p-8">
            <p className="text-xs uppercase tracking-[0.4em] text-mist">About</p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Isaac Yap. Developer & Entrepreneur. Efficiency obsessed.
            </h2>
            <p className="mt-6 text-sm text-mist">
              Isaac partners with founders to design mobile products that
              compress timelines and reduce operational drag. Every build
              prioritizes clarity, velocity, and measurable business impact.
            </p>
          </div>
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-steel/70 bg-ink/80 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-mist">
                Values
              </p>
              <ul className="mt-4 space-y-3 text-sm text-white/80">
                <li>Ship fast, iterate faster.</li>
                <li>Obsess over operations.</li>
                <li>Build with focus and finish strong.</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-steel/70 bg-ink/80 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-mist">
                Focus
              </p>
              <p className="mt-4 text-sm text-white/80">
                AI automation, growth analytics, and frictionless UX.
              </p>
            </div>
          </div>
        </section>

        <section id="contact" className="space-y-8">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-mist">
              Contact
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Let&apos;s ship your next product.
            </h2>
          </div>
          <form className="grid gap-6 rounded-3xl border border-steel/70 bg-night/80 p-8 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.3em] text-mist">
                Name
              </label>
              <input
                className="rounded-xl border border-steel/70 bg-ink/80 px-4 py-3 text-sm text-white placeholder:text-mist focus:border-white/70 focus:outline-none"
                placeholder="Your name"
                type="text"
                name="name"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.3em] text-mist">
                Email
              </label>
              <input
                className="rounded-xl border border-steel/70 bg-ink/80 px-4 py-3 text-sm text-white placeholder:text-mist focus:border-white/70 focus:outline-none"
                placeholder="you@company.com"
                type="email"
                name="email"
                required
              />
            </div>
            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.3em] text-mist">
                Project details
              </label>
              <textarea
                className="min-h-[140px] rounded-xl border border-steel/70 bg-ink/80 px-4 py-3 text-sm text-white placeholder:text-mist focus:border-white/70 focus:outline-none"
                placeholder="Tell me about your idea, timeline, and goals."
                name="details"
                required
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-mist">
                Expect a reply within 24 hours.
              </p>
              <button
                type="submit"
                className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5"
              >
                Send request
              </button>
            </div>
          </form>
        </section>

        <footer className="border-t border-steel/60 pt-6 text-xs uppercase tracking-[0.35em] text-mist">
          Built by Isaac Yap · Mobile apps for small business
        </footer>
      </div>
    </div>
  );
}
