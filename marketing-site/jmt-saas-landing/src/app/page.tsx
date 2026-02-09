import {
  AppWindow,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

const pricing = [
  {
    name: "Starter",
    price: "$49",
    subtitle: "For new studios and small teams",
    features: ["Branded booking experience", "Member management", "Automations"],
  },
  {
    name: "Growth",
    price: "$99",
    subtitle: "For scaling gyms",
    features: ["Multi-location support", "Advanced reporting", "Priority onboarding"],
    highlight: true,
  },
  {
    name: "Elite",
    price: "$99",
    subtitle: "For enterprise performance",
    features: ["Custom workflows", "Dedicated success lead", "SLA support"],
  },
];

const features = [
  {
    title: "Branded App",
    description: "Launch a premium member app with your logo, colors, and messaging.",
    icon: AppWindow,
  },
  {
    title: "Web Admin",
    description: "Run your entire operation from a clean, modern admin dashboard.",
    icon: LayoutDashboard,
  },
  {
    title: "Booking",
    description: "Flexible scheduling, waitlists, and automated reminders that reduce no-shows.",
    icon: CalendarCheck,
  },
  {
    title: "Payroll",
    description: "Automate instructor payroll with real-time performance tracking.",
    icon: CreditCard,
  },
];

const comparisonRows = [
  {
    label: "Monthly cost",
    values: ["$49 - $99", "$180+", "$200+"] as const,
  },
  {
    label: "Transaction fees",
    values: ["0%", "2.95%+", "3%+"] as const,
  },
  {
    label: "Branded app",
    values: ["Yes", "Limited", "Yes"] as const,
  },
  {
    label: "Booking + waitlists",
    values: ["Yes", "Yes", "Yes"] as const,
  },
  {
    label: "Payroll automation",
    values: ["Yes", "Add-on", "Add-on"] as const,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="container-padding mx-auto max-w-6xl pt-12">
        <nav className="flex items-center justify-between text-sm font-semibold text-ink/80">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/10 text-brand">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-base">JMT</span>
          </div>
          <div className="hidden items-center gap-6 md:flex">
            <span>Features</span>
            <span>Pricing</span>
            <span>Compare</span>
          </div>
          <button className="primary-button">Book a Demo</button>
        </nav>
      </header>

      <main>
        <section className="container-padding mx-auto max-w-6xl pb-16 pt-20">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-white/80 px-4 py-2 text-xs font-semibold text-brand">
                <ShieldCheck className="h-4 w-4" />
                0% transaction fees
              </div>
              <h1 className="text-gradient text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Stop Overpaying for Gym Software
              </h1>
              <p className="mt-5 text-lg text-ink/70">
                Save $2,600/year vs Glofox. Zero transaction fees.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button className="primary-button">Book a Demo</button>
                <div className="flex items-center gap-3 text-sm text-ink/60">
                  <Users className="h-4 w-4 text-brand" />
                  Trusted by performance-first gyms
                </div>
              </div>
            </div>
            <div className="card p-6 sm:p-8">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-brand">Setup</p>
                  <p className="mt-1 text-3xl font-semibold text-ink">$1,500</p>
                </div>
                <BadgeCheck className="h-8 w-8 text-brand" />
              </div>
              <p className="mt-4 text-sm text-ink/70">
                One-time onboarding with migration, custom branding, and team training.
              </p>
              <div className="mt-6 space-y-4">
                {[
                  "Switch from Mindbody or Glofox in 2 weeks",
                  "Keep 100% of your payments",
                  "Dedicated launch specialist",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-ink/70">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand/10 text-brand">
                      <BadgeCheck className="h-4 w-4" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="container-padding mx-auto max-w-6xl pb-20">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="text-3xl font-semibold text-ink">Pricing built for growth</h2>
              <p className="mt-2 text-sm text-ink/70">Transparent monthly plans. Setup fee $1,500.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-4 py-2 text-xs font-semibold text-brand">
              0% fees on every payment
            </div>
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {pricing.map((plan) => (
              <div
                key={plan.name}
                className={`card p-6 ${plan.highlight ? "border-brand/50 bg-white" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-ink">{plan.name}</h3>
                  {plan.highlight && (
                    <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                      Most Popular
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-ink/60">{plan.subtitle}</p>
                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-semibold text-ink">{plan.price}</span>
                  <span className="text-sm text-ink/60">/month</span>
                </div>
                <div className="mt-6 space-y-3 text-sm text-ink/70">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4 text-brand" />
                      {feature}
                    </div>
                  ))}
                </div>
                <button className="mt-8 w-full rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow">
                  Book a Demo
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="container-padding mx-auto max-w-6xl pb-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-8">
              <h2 className="text-3xl font-semibold text-ink">Everything your gym needs to run smarter</h2>
              <p className="mt-3 text-sm text-ink/70">
                A single platform for branded experiences, staff operations, and revenue growth.
              </p>
              <div className="mt-8 grid gap-4">
                {features.map((feature) => (
                  <div key={feature.title} className="surface p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/10 text-brand">
                        <feature.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-base font-semibold text-ink">{feature.title}</p>
                        <p className="text-sm text-ink/70">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-8">
              <h2 className="text-3xl font-semibold text-ink">Why JMT wins</h2>
              <p className="mt-3 text-sm text-ink/70">
                Faster launches, lower costs, and white-glove support.
              </p>
              <div className="mt-8 space-y-4 text-sm text-ink/70">
                {[
                  "Launch your branded app in days, not months.",
                  "Lower monthly costs with 0% transaction fees.",
                  "Real-time insights for revenue, retention, and instructor pay.",
                  "Dedicated success team that knows gym operations.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-1 grid h-6 w-6 place-items-center rounded-full bg-brand/10 text-brand">
                      <BadgeCheck className="h-4 w-4" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="container-padding mx-auto max-w-6xl pb-24">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 bg-white/80 px-6 py-5">
              <div>
                <h2 className="text-2xl font-semibold text-ink">JMT vs the legacy platforms</h2>
                <p className="mt-1 text-sm text-ink/60">Compare JMT to Glofox and Mindbody.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-4 py-2 text-xs font-semibold text-brand">
                No payment markup
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/70 text-xs uppercase text-ink/50">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Feature</th>
                    <th className="px-6 py-4 font-semibold">JMT</th>
                    <th className="px-6 py-4 font-semibold">Glofox</th>
                    <th className="px-6 py-4 font-semibold">Mindbody</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="border-t border-ink/10">
                      <td className="px-6 py-4 font-medium text-ink">{row.label}</td>
                      {row.values.map((value, index) => (
                        <td key={value + index} className="px-6 py-4 text-ink/70">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/60 bg-white/70">
        <div className="container-padding mx-auto flex flex-col items-center justify-between gap-4 py-8 text-sm text-ink/70 md:flex-row">
          <span>JMT Muay Thai Software</span>
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            info@jaimuaythai.com
          </span>
        </div>
      </footer>
    </div>
  );
}
