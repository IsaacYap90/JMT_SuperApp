"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, isAdmin } from "@/lib/types/database";
import { NotificationBell } from "./notification-bell";

// All admin links for bottom nav
const adminMainLinks = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/pt", label: "PT", icon: "users" },
  { href: "/trial-management", label: "Trials", icon: "clipboard" },
  { href: "/leads", label: "Leads", icon: "megaphone" },
];

const adminProfileLinks = [
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/sunday-prep", label: "Sunday Prep", icon: "send" },
  { href: "/leave", label: "Leave", icon: "leave" },
];

const coachLinks = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/leave", label: "Leave", icon: "leave" },
];

// Isaac-only link
const earningLink = { href: "/earning", label: "Earning", icon: "dollar" };

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
    case "send":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      );
    case "leave":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4" />
        </svg>
      );
    case "dollar":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case "settings":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "profile":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case "megaphone":
      return (
        <svg className={cn} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
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
  const [showProfile, setShowProfile] = useState(false);

  const isIsaac = profile.full_name === "Isaac Yap";
  const admin = isAdmin(profile.role);

  // Bottom nav links — same on all screen sizes
  const mainLinks = admin ? adminMainLinks : coachLinks;

  const profileLink = { href: "/profile", label: "Profile", icon: "profile" };
  const profileLinks = admin
    ? (isIsaac ? [...adminProfileLinks, earningLink] : adminProfileLinks)
    : (isIsaac ? [profileLink, earningLink] : [profileLink]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      {/* Top bar — compact branding + notification bell */}
      <header className="fixed top-0 left-0 right-0 bg-jai-card/80 backdrop-blur-lg border-b border-jai-border z-50 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.jpg"
            alt="JAI Muay Thai"
            width={28}
            height={28}
            className="rounded-full"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold">
              JAI <span className="text-jai-blue">MUAY THAI</span>
            </span>
            <span className="text-[9px] text-jai-text/40">by IonicX AI</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <span className="text-xs text-jai-text hidden sm:inline ml-2">{profile.full_name}</span>
        </div>
      </header>

      {/* Bottom tab bar — all screen sizes */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 bg-jai-card border-t border-jai-border z-50 pb-safe">
        <div className="max-w-lg mx-auto grid" style={{ gridTemplateColumns: `repeat(${mainLinks.length + 1}, 1fr)` }}>
          {mainLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center gap-1 py-3 min-h-[48px] transition-colors ${
                  active ? "text-jai-blue" : "text-jai-text"
                }`}
              >
                <IconComponent icon={link.icon} className="w-5 h-5" />
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowProfile(true)}
            className={`flex flex-col items-center justify-center gap-1 py-3 min-h-[48px] transition-colors ${
              showProfile ? "text-jai-blue" : "text-jai-text"
            }`}
          >
            <IconComponent icon="profile" className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Profile sheet overlay */}
      {showProfile && (
        <div className="fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowProfile(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-jai-card border-t border-jai-border rounded-t-2xl p-6 pb-safe animate-slide-up max-w-lg mx-auto">
            <div className="w-10 h-1 bg-jai-border rounded-full mx-auto mb-6" />

            {/* Logo + Profile info */}
            <div className="flex flex-col items-center mb-4">
              <Image
                src="/logo.jpg"
                alt="JAI Muay Thai"
                width={56}
                height={56}
                className="rounded-full mb-2"
              />
              <p className="font-semibold">{profile.full_name}</p>
              <p className="text-jai-text text-xs capitalize">
                {profile.role === "master_admin" ? "Admin" : profile.role}
              </p>
            </div>

            {/* Extra nav links */}
            {profileLinks.length > 0 && (
              <div className="border-t border-jai-border pt-3 mb-3 space-y-1">
                {profileLinks.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setShowProfile(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        active
                          ? "bg-jai-blue/10 text-jai-blue"
                          : "text-jai-text hover:text-white"
                      }`}
                    >
                      <IconComponent icon={link.icon} className="w-5 h-5" />
                      <span className="text-sm font-medium">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* IonicX AI credit */}
            <p className="text-center text-[10px] text-jai-text/40 mt-2 mb-1">Built by IonicX AI</p>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="w-full mt-2 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium min-h-[48px] flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
