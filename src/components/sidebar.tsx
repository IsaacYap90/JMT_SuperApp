"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, isAdmin } from "@/lib/types/database";

const adminLinks = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/pt", label: "PT Sessions", icon: "users" },
];

const coachLinks = [
  { href: "/", label: "My Schedule", icon: "calendar" },
  { href: "/pt", label: "My PT Clients", icon: "users" },
];

function IconComponent({ icon, className }: { icon: string; className?: string }) {
  const cn = className || "w-5 h-5";
  switch (icon) {
    case "grid":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "users":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar({ profile }: { profile: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const links = isAdmin(profile.role) ? adminLinks : coachLinks;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-64 bg-jai-card border-r border-jai-border z-50 flex-col">
        <div className="p-6 border-b border-jai-border">
          <h1 className="text-xl font-bold">
            JAI <span className="text-jai-blue">MUAY THAI</span>
          </h1>
          <p className="text-jai-text text-sm mt-1 capitalize">
            {profile.role === "master_admin" ? "Admin" : profile.role} Dashboard
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active
                    ? "bg-jai-blue/10 text-jai-blue"
                    : "text-jai-text hover:text-white hover:bg-white/5"
                }`}
              >
                <IconComponent icon={link.icon} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-jai-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{profile.full_name}</p>
              <p className="text-xs text-jai-text capitalize">
                {profile.role === "master_admin" ? "Admin" : profile.role}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-jai-text hover:text-white transition-colors p-2"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-jai-card border-t border-jai-border z-50 flex items-center justify-around px-2 pb-safe">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center gap-1 py-3 px-4 min-w-[64px] min-h-[48px] justify-center transition-colors ${
                active ? "text-jai-blue" : "text-jai-text"
              }`}
            >
              <IconComponent icon={link.icon} className="w-6 h-6" />
              <span className="text-[10px] font-medium">{link.label}</span>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 py-3 px-4 min-w-[64px] min-h-[48px] justify-center text-jai-text"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="text-[10px] font-medium">Logout</span>
        </button>
      </nav>
    </>
  );
}
