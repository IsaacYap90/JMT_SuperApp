"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

function LoginPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-jai-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/logo.jpg"
            alt="JAI Muay Thai"
            width={140}
            height={140}
            className="rounded-full mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-white">
            JAI <span className="text-jai-blue">MUAY THAI</span>
          </h1>
          <p className="text-jai-text mt-2">JMT OS Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-jai-text mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-jai-card border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
              placeholder="you@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-jai-text mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-jai-card border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue transition-colors"
              placeholder="Enter password"
              required
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-jai-blue text-white font-semibold rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 transition-all"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="text-center text-[10px] text-jai-text/50 mt-6">Built by IonicX AI</p>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(LoginPageContent), {
  ssr: false,
});
