"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/types/database";

export type LeadStatus = "new" | "contacted" | "converted" | "lost";

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  interest: string | null;
  source: string;
  meta_form_id: string | null;
  meta_lead_id: string | null;
  status: LeadStatus;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export async function getLeads(): Promise<Lead[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdmin(profile.role)) return [];

  const db = createAdminClient();
  const { data } = await db
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  return (data || []) as Lead[];
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdmin(profile.role)) throw new Error("Not authorized");

  const db = createAdminClient();
  const { error } = await db
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) throw new Error(error.message);
}

export async function updateLeadNotes(leadId: string, notes: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdmin(profile.role)) throw new Error("Not authorized");

  const db = createAdminClient();
  const { error } = await db
    .from("leads")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) throw new Error(error.message);
}
