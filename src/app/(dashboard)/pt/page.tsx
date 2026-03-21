import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User, PtPackage, isAdmin } from "@/lib/types/database";

export default async function PtPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profileData) redirect("/login");
  const profile = profileData as unknown as User;

  let query = supabase
    .from("pt_packages")
    .select(
      "*, member:users!pt_packages_user_id_fkey(*), coach:users!pt_packages_preferred_coach_id_fkey(*)"
    )
    .order("created_at", { ascending: false });

  if (profile.role === "coach") {
    query = query.eq("preferred_coach_id", user.id);
  }

  const { data } = await query;
  const ptPackages = (data || []) as unknown as PtPackage[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {isAdmin(profile.role) ? "PT Packages" : "My PT Clients"}
      </h1>

      <div className="bg-jai-card border border-jai-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-jai-border text-left text-sm text-jai-text">
              <th className="p-4">Member</th>
              {isAdmin(profile.role) && <th className="p-4">Coach</th>}
              <th className="p-4">Package</th>
              <th className="p-4">Remaining</th>
              <th className="p-4">Expiry</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {ptPackages.map((pt) => {
              const remaining = pt.total_sessions - pt.sessions_used;
              return (
                <tr
                  key={pt.id}
                  className="border-b border-jai-border last:border-b-0"
                >
                  <td className="p-4 font-medium">
                    {pt.member?.full_name || "—"}
                  </td>
                  {isAdmin(profile.role) && (
                    <td className="p-4 text-jai-text">
                      {pt.coach?.full_name || "—"}
                    </td>
                  )}
                  <td className="p-4">
                    <span
                      className={
                        remaining <= 0
                          ? "text-red-400"
                          : remaining <= 2
                          ? "text-yellow-400"
                          : "text-jai-blue"
                      }
                    >
                      {pt.sessions_used}/{pt.total_sessions}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={
                        remaining <= 0
                          ? "text-red-400"
                          : remaining <= 2
                          ? "text-yellow-400"
                          : ""
                      }
                    >
                      {remaining}
                    </span>
                  </td>
                  <td className="p-4 text-jai-text">
                    {pt.expiry_date || "—"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        pt.status === "active"
                          ? "bg-green-500/10 text-green-400"
                          : pt.status === "expired"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-jai-text/10 text-jai-text"
                      }`}
                    >
                      {pt.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {ptPackages.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin(profile.role) ? 6 : 5}
                  className="p-4 text-jai-text text-center"
                >
                  No PT packages found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
