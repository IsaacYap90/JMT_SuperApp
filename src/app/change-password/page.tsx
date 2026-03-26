"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { changePassword } from "@/app/actions/auth";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await changePassword(password);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-jai-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/logo.jpg"
            alt="JAI Muay Thai"
            width={100}
            height={100}
            className="rounded-full mx-auto mb-4"
          />
          <h1 className="text-xl font-bold text-white">Set Your Password</h1>
          <p className="text-jai-text text-sm mt-2">
            Please change your password before continuing
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-jai-text mb-1">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-jai-card border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
              placeholder="Min 6 characters"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm text-jai-text mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-3 bg-jai-card border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
              placeholder="Re-enter password"
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-jai-blue text-white font-semibold rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 transition-all"
          >
            {loading ? "Updating..." : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
