"use client";

import { useState } from "react";
import { User } from "@/lib/types/database";
import { updateEmail, updatePhone, changePassword } from "@/app/actions/auth";
import { useRouter } from "next/navigation";

export function ProfilePageClient({ profile }: { profile: User }) {
  const router = useRouter();

  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone || "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [phoneMsg, setPhoneMsg] = useState("");

  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const handleEmailSave = async () => {
    if (email === profile.email) return;
    setEmailSaving(true);
    setEmailMsg("");
    try {
      await updateEmail(email);
      setEmailMsg("Email updated");
      router.refresh();
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : "Failed");
    }
    setEmailSaving(false);
  };

  const handlePhoneSave = async () => {
    if (phone === (profile.phone || "")) return;
    setPhoneSaving(true);
    setPhoneMsg("");
    try {
      await updatePhone(phone);
      setPhoneMsg("Phone updated");
      router.refresh();
    } catch (err) {
      setPhoneMsg(err instanceof Error ? err.message : "Failed");
    }
    setPhoneSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg("");
    if (newPw.length < 6) {
      setPwMsg("Password must be at least 6 characters");
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg("Passwords do not match");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(newPw);
      setPwMsg("Password changed successfully");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "Failed");
    }
    setPwSaving(false);
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Profile</h1>

      {/* Name (read-only) */}
      <section className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wide">Account</h2>
        <div>
          <label className="block text-sm text-jai-text mb-1">Name</label>
          <p className="px-4 py-3 bg-jai-bg border border-jai-border rounded-lg text-white/60">
            {profile.full_name}
          </p>
        </div>
        <div>
          <label className="block text-sm text-jai-text mb-1">Role</label>
          <p className="px-4 py-3 bg-jai-bg border border-jai-border rounded-lg text-white/60 capitalize">
            {profile.role === "master_admin" ? "Admin" : profile.role}
          </p>
        </div>
      </section>

      {/* Email */}
      <section className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wide">Email</h2>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 px-4 py-3 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
          />
          <button
            onClick={handleEmailSave}
            disabled={emailSaving || email === profile.email}
            className="px-4 py-3 bg-jai-blue text-white text-sm font-medium rounded-lg hover:bg-jai-blue/90 disabled:opacity-40 transition-all"
          >
            {emailSaving ? "..." : "Save"}
          </button>
        </div>
        {emailMsg && (
          <p className={`text-sm ${emailMsg.includes("updated") ? "text-green-400" : "text-red-400"}`}>
            {emailMsg}
          </p>
        )}
      </section>

      {/* Phone */}
      <section className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wide">Phone</h2>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 91234567"
            className="flex-1 px-4 py-3 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
          />
          <button
            onClick={handlePhoneSave}
            disabled={phoneSaving || phone === (profile.phone || "")}
            className="px-4 py-3 bg-jai-blue text-white text-sm font-medium rounded-lg hover:bg-jai-blue/90 disabled:opacity-40 transition-all"
          >
            {phoneSaving ? "..." : "Save"}
          </button>
        </div>
        {phoneMsg && (
          <p className={`text-sm ${phoneMsg.includes("updated") ? "text-green-400" : "text-red-400"}`}>
            {phoneMsg}
          </p>
        )}
      </section>

      {/* Change Password */}
      <section className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wide">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password (min 6 chars)"
            className="w-full px-4 py-3 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
            required
            minLength={6}
          />
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-4 py-3 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
            required
            minLength={6}
          />
          {pwMsg && (
            <p className={`text-sm ${pwMsg.includes("successfully") ? "text-green-400" : "text-red-400"}`}>
              {pwMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            className="w-full py-3 bg-jai-blue text-white text-sm font-semibold rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 transition-all"
          >
            {pwSaving ? "Updating..." : "Update Password"}
          </button>
        </form>
      </section>
    </div>
  );
}
