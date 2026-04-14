"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/types/database";
import { revalidatePath } from "next/cache";
import { createHash, randomUUID } from "crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ContractPdfDoc, ContractPdfData } from "@/lib/contract-pdf";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdmin(profile.role as "admin" | "master_admin" | "coach" | "member"))
    throw new Error("Not authorized");
  return { id: user.id, name: profile.full_name || "Admin" };
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid data URL");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

function formatExpiryDisplay(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function todayDisplay(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

export type CreateSignedContractPayload = {
  // Member selection (existing or new)
  memberId: string | null;
  newMemberFullName?: string | null;
  newMemberPhone?: string | null;

  // Client identity at sign time
  clientDisplayName: string;
  clientNricLast4: string | null;

  // Kid PT
  isKid: boolean;
  kidName?: string | null;
  kidAge?: number | null;
  guardianName?: string | null;
  guardianPhone?: string | null;

  // Package
  coachId: string;
  coachName: string;
  totalSessions: number;
  pricePerSession: number;
  paymentMethod: string;
  expiryDate: string | null;

  // Signatures (PNG data URLs from signature_pad)
  clientSignatureDataUrl: string;
  jmtSignatureDataUrl: string;
  jmtRepName: string;
};

export type CreateSignedContractResult = {
  contractId: string;
  packageId: string;
  pdfSignedUrl: string;
};

export async function createSignedContract(
  payload: CreateSignedContractPayload
): Promise<CreateSignedContractResult> {
  const auth = await requireAdmin();
  const admin = createAdminClient();

  // 1. Resolve member — create if new
  let memberId = payload.memberId;
  if (!memberId) {
    if (!payload.newMemberFullName?.trim()) throw new Error("Member name required");
    const newId = randomUUID();
    const { error } = await admin.from("users").insert({
      id: newId,
      full_name: payload.newMemberFullName.trim(),
      phone: payload.newMemberPhone?.trim() || null,
      role: "member",
      is_active: true,
      email: `pt_${newId.slice(0, 8)}@jmt.local`,
    });
    if (error) throw new Error(`Create member: ${error.message}`);
    memberId = newId;
  }

  const totalPrice = payload.pricePerSession * payload.totalSessions;

  // 2. Create pt_package
  const { data: pkgRow, error: pkgErr } = await admin
    .from("pt_packages")
    .insert({
      user_id: memberId,
      preferred_coach_id: payload.coachId,
      total_sessions: payload.totalSessions,
      sessions_used: 0,
      price_paid: totalPrice,
      expiry_date: payload.expiryDate,
      status: "active",
      guardian_name: payload.isKid ? payload.guardianName?.trim() || null : null,
      guardian_phone: payload.isKid ? payload.guardianPhone?.trim() || null : null,
      is_kid: payload.isKid,
      kid_name: payload.isKid ? payload.kidName?.trim() || null : null,
      kid_age: payload.isKid ? payload.kidAge ?? null : null,
    })
    .select("id")
    .single();
  if (pkgErr || !pkgRow) throw new Error(`Create package: ${pkgErr?.message}`);
  const packageId = pkgRow.id as string;

  // 3. Upload signature PNGs to private bucket
  const clientSigBuf = dataUrlToBuffer(payload.clientSignatureDataUrl);
  const jmtSigBuf = dataUrlToBuffer(payload.jmtSignatureDataUrl);

  const clientSigPath = `${packageId}/client-${Date.now()}.png`;
  const jmtSigPath = `${packageId}/jmt-${Date.now()}.png`;

  const { error: cse } = await admin.storage
    .from("pt-signatures")
    .upload(clientSigPath, clientSigBuf, { contentType: "image/png", upsert: false });
  if (cse) throw new Error(`Upload client signature: ${cse.message}`);

  const { error: jse } = await admin.storage
    .from("pt-signatures")
    .upload(jmtSigPath, jmtSigBuf, { contentType: "image/png", upsert: false });
  if (jse) throw new Error(`Upload JMT signature: ${jse.message}`);

  // 4. Render PDF (embed original data URLs for crispness)
  const pdfData: ContractPdfData = {
    clientName: payload.clientDisplayName,
    clientNricLast4: payload.clientNricLast4,
    isKid: payload.isKid,
    kidName: payload.kidName ?? null,
    kidAge: payload.kidAge ?? null,
    guardianName: payload.guardianName ?? null,
    coachName: payload.coachName,
    totalSessions: payload.totalSessions,
    pricePerSession: payload.pricePerSession,
    totalPrice,
    paymentMethod: payload.paymentMethod,
    expiryDate: formatExpiryDisplay(payload.expiryDate),
    clientSignatureDataUrl: payload.clientSignatureDataUrl,
    jmtSignatureDataUrl: payload.jmtSignatureDataUrl,
    jmtRepName: payload.jmtRepName,
    signedDateDisplay: todayDisplay(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuf = await renderToBuffer(React.createElement(ContractPdfDoc, { data: pdfData }) as any);
  const pdfSha256 = createHash("sha256").update(pdfBuf).digest("hex");
  const pdfPath = `${packageId}/contract-${Date.now()}.pdf`;

  const { error: pe } = await admin.storage
    .from("pt-contracts")
    .upload(pdfPath, pdfBuf, { contentType: "application/pdf", upsert: false });
  if (pe) throw new Error(`Upload PDF: ${pe.message}`);

  // 5. Insert pt_contracts row
  const { data: cRow, error: ce } = await admin
    .from("pt_contracts")
    .insert({
      package_id: packageId,
      client_user_id: memberId,
      client_name_snapshot: payload.clientDisplayName,
      client_nric_last4: payload.clientNricLast4,
      is_kid: payload.isKid,
      kid_name: payload.isKid ? payload.kidName?.trim() || null : null,
      kid_age: payload.isKid ? payload.kidAge ?? null : null,
      guardian_name: payload.isKid ? payload.guardianName?.trim() || null : null,
      guardian_phone: payload.isKid ? payload.guardianPhone?.trim() || null : null,
      coach_name_snapshot: payload.coachName,
      total_sessions: payload.totalSessions,
      price_per_session: payload.pricePerSession,
      total_price: totalPrice,
      payment_method: payload.paymentMethod,
      expiry_date: payload.expiryDate,
      client_signature_path: clientSigPath,
      jmt_signature_path: jmtSigPath,
      pdf_path: pdfPath,
      pdf_sha256: pdfSha256,
      created_by: auth.id,
    })
    .select("id")
    .single();
  if (ce || !cRow) throw new Error(`Insert contract: ${ce?.message}`);

  const { data: signed } = await admin.storage
    .from("pt-contracts")
    .createSignedUrl(pdfPath, 60 * 60 * 24 * 7); // 7 days

  revalidatePath("/pt");
  return {
    contractId: cRow.id as string,
    packageId,
    pdfSignedUrl: signed?.signedUrl ?? "",
  };
}

export async function getContractPdfSignedUrl(contractId: string): Promise<string> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("pt_contracts")
    .select("pdf_path")
    .eq("id", contractId)
    .single();
  if (error || !row) throw new Error("Contract not found");

  const { data: signed } = await admin.storage
    .from("pt-contracts")
    .createSignedUrl(row.pdf_path as string, 60 * 60 * 24 * 7);
  if (!signed?.signedUrl) throw new Error("Could not generate download link");
  return signed.signedUrl;
}
