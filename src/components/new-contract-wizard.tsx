"use client";

import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "signature_pad";
import { User } from "@/lib/types/database";
import { createSignedContract } from "@/app/actions/pt-contracts";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  toDataURLWhiteBg: () => string;
};

const SignaturePadCanvas = forwardRef<
  SignaturePadHandle,
  { onChange: (empty: boolean) => void }
>(function SignaturePadCanvas({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const data = padRef.current?.toData() || [];
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
      if (data.length > 0) padRef.current?.fromData(data);
      onChange(padRef.current?.isEmpty() ?? true);
    }

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#f5f5f5",
      minWidth: 1.2,
      maxWidth: 2.8,
    });
    padRef.current = pad;
    pad.addEventListener("endStroke", () => onChange(pad.isEmpty()));

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
      padRef.current = null;
    };
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    clear: () => {
      padRef.current?.clear();
      onChange(true);
    },
    toDataURLWhiteBg: () => {
      const canvas = canvasRef.current;
      if (!canvas || !padRef.current || padRef.current.isEmpty()) return "";
      // Problem: the PDF renders this image at ~50px tall; canvas is ~1200px
      // wide, so hairline strokes vanish on print. Solution: walk pixels to
      // find ink, then dilate (thicken) each ink pixel by a radius so the
      // strokes are visibly fat even after aggressive scaling by the PDF.
      const src = canvas.getContext("2d");
      if (!src) return "";
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return "";

      const srcData = src.getImageData(0, 0, w, h).data;

      // Pass 1: build a binary mask — 1 = original ink, 0 = background.
      const mask = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = srcData[(y * w + x) * 4 + 3];
          if (a > 10) mask[y * w + x] = 1;
        }
      }

      // Pass 2: dilate — any pixel within `radius` of an ink pixel becomes ink.
      // Radius ~ max(3, w/300) scales with DPR so 1x and 2x both look fat.
      const radius = Math.max(3, Math.round(w / 300));
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d");
      if (!ctx) return "";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const outImg = ctx.getImageData(0, 0, w, h);
      const outData = outImg.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Check mask in a square neighborhood of `radius`.
          let ink = false;
          const y0 = Math.max(0, y - radius);
          const y1 = Math.min(h - 1, y + radius);
          const x0 = Math.max(0, x - radius);
          const x1 = Math.min(w - 1, x + radius);
          for (let yy = y0; yy <= y1 && !ink; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
              if (mask[yy * w + xx]) {
                ink = true;
                break;
              }
            }
          }
          if (ink) {
            const i = (y * w + x) * 4;
            outData[i] = 0;
            outData[i + 1] = 0;
            outData[i + 2] = 0;
            outData[i + 3] = 255;
          }
        }
      }
      ctx.putImageData(outImg, 0, 0);
      return out.toDataURL("image/png");
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-48 touch-none block"
      style={{ touchAction: "none" }}
    />
  );
});

// Render a typed name into a PNG data URL using Dancing Script handwriting
// font so typed signatures look like real cursive on the contract PDF.
async function typedSignatureToDataURL(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const fontFamily = "'Dancing Script', 'Brush Script MT', cursive";
  // next/font uses display:swap, so on first visit the font may not be
  // rasterised yet. Force-load before drawing.
  try {
    await document.fonts.load(`700 160px ${fontFamily}`);
  } catch {
    // ignore — fall back to cursive
  }
  const canvas = document.createElement("canvas");
  // Taller canvas + bigger font so the signature fills the PDF slot.
  const w = 1200;
  const h = 360;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = 260;
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  while (ctx.measureText(trimmed).width > w - 80 && fontSize > 80) {
    fontSize -= 10;
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
  }
  ctx.fillText(trimmed, w / 2, h / 2);
  return canvas.toDataURL("image/png");
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const PAYMENT_METHODS = ["PayNow", "Cash", "Bank Transfer", "Credit Card"];

const TC_CLAUSES = [
  "All payments made are non-refundable. In the case where the Client is unable to continue training due to medical reasons or re-location abroad, we will consider grounds for refund should supporting documentation be furnished.",
  "Please book your sessions with your coach at least 24 hours prior to your intended time of training. If you need to cancel or postpone any training session, you should give your coach at least 24 hours advance notice. If you do not give sufficient notice or turn up for a session, we may forfeit the session from your package.",
  "After each session, your coach will request that you sign the attendance record. You agree that the attendance record shall be the conclusive record of your utilisation of the package purchased.",
];

const WM_CLAUSES = [
  "You warrant that you are in good physical condition and have no medical conditions which may prevent you from undergoing the personal training sessions for Muay Thai.",
  "If you have any medical condition or history, please inform your trainer prior to the commencement of the session. You acknowledge and accept that our trainers are not qualified medical professionals and are unable to give medical advice and opinions and will not be liable for statements constructed as such. You should consult your own medical professional if you are unsure about any aspect of your health.",
  "In providing you with this personal training service, you voluntarily accept the risk of injury involved in these sessions. Unless our coaches have been negligent, we do not accept liability for any injury or death in connection with the personal training services provided. We do not accept any liability for any other loss or damage unless you are able to prove that our coaches have been truly negligent.",
  "You acknowledge that you have had the opportunity to read this contract and to clarify any doubts with the owner, to your satisfaction. You acknowledge you have understood the terms of this agreement.",
  "You warrant that you have the capacity to enter into this agreement and agree to be bound by it.",
  "This agreement shall be governed by Singapore law and you agree to subject yourself to the exclusive jurisdiction of the courts of Singapore.",
];

export function NewContractWizard({
  members,
  coaches,
  defaultJmtRepName,
}: {
  members: User[];
  coaches: User[];
  defaultJmtRepName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 1: member
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [clientNricLast4, setClientNricLast4] = useState("");

  // Step 2: kid toggle
  const [isKid, setIsKid] = useState(false);
  const [kidName, setKidName] = useState("");
  const [kidAge, setKidAge] = useState<number | "">("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");

  // Step 3: package
  const [coachId, setCoachId] = useState<string>("");
  const [totalSessions, setTotalSessions] = useState<number>(20);
  const [pricePerSession, setPricePerSession] = useState<number>(80);
  const [paymentMethod, setPaymentMethod] = useState<string>("PayNow");
  const [expiryDate, setExpiryDate] = useState<string>("");

  // Step 4: T&C
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  // Step 5/6: signatures
  const clientPadRef = useRef<SignaturePadHandle>(null);
  const jmtPadRef = useRef<SignaturePadHandle>(null);
  const [clientSigEmpty, setClientSigEmpty] = useState(true);
  const [jmtSigEmpty, setJmtSigEmpty] = useState(true);
  // Client may sign by drawing (default) or by typing their name in a
  // handwriting font — touchpad/mouse drawing looks awful on desktop.
  const [clientSigMode, setClientSigMode] = useState<"draw" | "type">("draw");
  const [clientTypedName, setClientTypedName] = useState("");
  // Snapshots — captured when leaving the signing step so the data URL
  // survives after the canvas unmounts on the next step.
  const [clientSigDataUrl, setClientSigDataUrl] = useState<string>("");
  const [jmtSigDataUrl, setJmtSigDataUrl] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Derived
  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) || null,
    [members, selectedMemberId]
  );
  const selectedCoach = useMemo(
    () => coaches.find((c) => c.id === coachId) || null,
    [coaches, coachId]
  );
  const totalPrice = pricePerSession * totalSessions;

  const clientDisplayName = isKid
    ? kidName.trim() || (selectedMember?.full_name ?? newMemberName.trim())
    : selectedMember?.full_name ?? newMemberName.trim();

  // Filter members by search
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members.slice(0, 20);
    return members
      .filter(
        (m) =>
          m.full_name?.toLowerCase().includes(q) || m.phone?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [members, memberSearch]);

  // Step navigation guards
  function canGoNext(): boolean {
    if (step === 1) {
      if (creatingNew) return !!newMemberName.trim();
      return !!selectedMemberId;
    }
    if (step === 2) {
      if (!isKid) return true;
      return !!kidName.trim() && !!guardianName.trim() && !!guardianPhone.trim();
    }
    if (step === 3) {
      return (
        !!coachId &&
        totalSessions > 0 &&
        pricePerSession > 0 &&
        !!paymentMethod &&
        !!expiryDate
      );
    }
    if (step === 4) return scrolledToEnd;
    if (step === 5) {
      return clientSigMode === "type"
        ? clientTypedName.trim().length >= 2
        : !clientSigEmpty;
    }
    if (step === 6) return !jmtSigEmpty;
    return false;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // JMT signature is still mounted on step 6; client sig was snapshotted
      // when advancing from step 5.
      const jmtSig = jmtPadRef.current?.toDataURLWhiteBg() ?? jmtSigDataUrl;
      const clientSig = clientSigDataUrl;
      if (!clientSig || !jmtSig) throw new Error("Missing signature");

      const res = await createSignedContract({
        memberId: creatingNew ? null : selectedMemberId,
        newMemberFullName: creatingNew ? newMemberName.trim() : null,
        newMemberPhone: creatingNew ? newMemberPhone.trim() : null,
        clientDisplayName,
        clientNricLast4: clientNricLast4.trim() || null,
        isKid,
        kidName: isKid ? kidName.trim() : null,
        kidAge: isKid && kidAge !== "" ? Number(kidAge) : null,
        guardianName: isKid ? guardianName.trim() : null,
        guardianPhone: isKid ? guardianPhone.trim() : null,
        coachId,
        coachName: selectedCoach?.full_name ?? "",
        totalSessions,
        pricePerSession,
        paymentMethod,
        expiryDate,
        clientSignatureDataUrl: clientSig,
        jmtSignatureDataUrl: jmtSig,
        jmtRepName: defaultJmtRepName,
      });
      setResultUrl(res.pdfSignedUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create contract");
    } finally {
      setSubmitting(false);
    }
  }

  // Success screen
  if (resultUrl) {
    return (
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center">
          <p className="text-2xl mb-2">✅</p>
          <h2 className="text-lg font-semibold">Contract signed</h2>
          <p className="text-sm text-jai-text/70 mt-1">
            Download the PDF and share with {clientDisplayName} via WhatsApp or email.
          </p>
        </div>
        <a
          href={resultUrl}
          target="_blank"
          rel="noreferrer"
          className="block w-full py-3 text-center font-medium rounded-xl bg-jai-blue text-white"
        >
          📄 Download PDF
        </a>
        <button
          onClick={() => router.push("/pt")}
          className="block w-full py-3 text-center font-medium rounded-xl bg-jai-card border border-jai-border"
        >
          Back to PT
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 pb-24">
      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-6">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full ${
              n <= step ? "bg-jai-blue" : "bg-jai-border"
            }`}
          />
        ))}
      </div>

      <h1 className="text-lg font-semibold mb-1">New PT Contract</h1>
      <p className="text-xs text-jai-text/60 mb-6">
        Step {step} of 6
      </p>

      {/* Step 1: Member */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-medium">Who is the client?</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setCreatingNew(false); setSelectedMemberId(null); }}
              className={`flex-1 py-2 text-sm rounded-lg border ${
                !creatingNew
                  ? "bg-jai-blue text-white border-jai-blue"
                  : "bg-jai-card border-jai-border"
              }`}
            >
              Existing
            </button>
            <button
              onClick={() => { setCreatingNew(true); setSelectedMemberId(null); }}
              className={`flex-1 py-2 text-sm rounded-lg border ${
                creatingNew
                  ? "bg-jai-blue text-white border-jai-blue"
                  : "bg-jai-card border-jai-border"
              }`}
            >
              New client
            </button>
          </div>

          {!creatingNew ? (
            <>
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMemberId(m.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border ${
                      selectedMemberId === m.id
                        ? "bg-jai-blue/10 border-jai-blue"
                        : "bg-jai-card border-jai-border"
                    }`}
                  >
                    <p className="text-sm font-medium">{m.full_name}</p>
                    {m.phone && <p className="text-xs text-jai-text/60">{m.phone}</p>}
                  </button>
                ))}
                {filteredMembers.length === 0 && (
                  <p className="text-xs text-jai-text/50 px-2">No matches</p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Full name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={newMemberPhone}
                onChange={(e) => setNewMemberPhone(e.target.value)}
                className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-jai-text/60 uppercase tracking-wider">
              NRIC / Passport (last 4 only)
            </label>
            <input
              type="text"
              placeholder="e.g. 534J"
              maxLength={5}
              value={clientNricLast4}
              onChange={(e) => setClientNricLast4(e.target.value.toUpperCase())}
              className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Step 2: Kid */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-medium">Is this PT contract for a minor?</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setIsKid(false)}
              className={`flex-1 py-2 text-sm rounded-lg border ${
                !isKid
                  ? "bg-jai-blue text-white border-jai-blue"
                  : "bg-jai-card border-jai-border"
              }`}
            >
              No (adult)
            </button>
            <button
              onClick={() => setIsKid(true)}
              className={`flex-1 py-2 text-sm rounded-lg border ${
                isKid
                  ? "bg-jai-blue text-white border-jai-blue"
                  : "bg-jai-card border-jai-border"
              }`}
            >
              Yes (kid PT)
            </button>
          </div>

          {isKid && (
            <div className="space-y-3 bg-jai-card/50 p-3 rounded-lg border border-jai-border">
              <p className="text-xs text-jai-text/60">
                The parent/guardian will sign the contract on the kid&apos;s behalf.
              </p>
              <div>
                <label className="text-xs text-jai-text/60 uppercase tracking-wider">
                  Kid&apos;s name
                </label>
                <input
                  type="text"
                  value={kidName}
                  onChange={(e) => setKidName(e.target.value)}
                  className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-jai-text/60 uppercase tracking-wider">
                  Kid&apos;s age
                </label>
                <input
                  type="number"
                  min={3}
                  max={17}
                  value={kidAge}
                  onChange={(e) =>
                    setKidAge(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-jai-text/60 uppercase tracking-wider">
                  Guardian name
                </label>
                <input
                  type="text"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-jai-text/60 uppercase tracking-wider">
                  Guardian phone
                </label>
                <input
                  type="tel"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Package */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-medium">PT package</h2>
          <div>
            <label className="text-xs text-jai-text/60 uppercase tracking-wider">Coach</label>
            <select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-jai-text/60 uppercase tracking-wider">Sessions</label>
              <input
                type="number"
                min={1}
                value={totalSessions}
                onChange={(e) => setTotalSessions(Number(e.target.value))}
                className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-jai-text/60 uppercase tracking-wider">Price / session (S$)</label>
              <input
                type="number"
                min={0}
                step={5}
                value={pricePerSession}
                onChange={(e) => setPricePerSession(Number(e.target.value))}
                className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="bg-jai-card/50 rounded-lg p-3 border border-jai-border flex justify-between">
            <span className="text-sm text-jai-text/70">Total</span>
            <span className="text-sm font-medium">S${totalPrice.toFixed(2)}</span>
          </div>
          <div>
            <label className="text-xs text-jai-text/60 uppercase tracking-wider">Payment via</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-jai-text/60 uppercase tracking-wider">Expiry date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full mt-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Step 4: T&C Review */}
      {step === 4 && (
        <div className="space-y-3">
          <h2 className="font-medium">Review terms with client</h2>
          <p className="text-xs text-jai-text/60">
            Scroll to the bottom to confirm the client has read and accepted all terms.
          </p>
          <div
            className="bg-jai-card/50 border border-jai-border rounded-lg p-4 max-h-96 overflow-y-auto text-xs space-y-3 leading-relaxed"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
                setScrolledToEnd(true);
              }
            }}
          >
            <div className="text-center border-b border-jai-border pb-2">
              <p className="font-bold text-sm">JAI MUAY THAI</p>
              <p className="text-jai-text/60">(REG: 202239849D)</p>
              <p className="font-semibold mt-1">PERSONAL TRAINING AGREEMENT</p>
            </div>
            <p>
              I, <span className="underline">{clientDisplayName}</span>
              {clientNricLast4 ? ` (****${clientNricLast4})` : ""} (hereinafter &quot;Client&quot;) agree to enter into this service contract with Jai Muay Thai (Reg No: 202239849D) and accept the terms of this contact.
            </p>
            <div>
              <p className="font-semibold">TERMS &amp; CONDITIONS</p>
              <ol className="list-decimal pl-5 space-y-2 mt-1">
                {TC_CLAUSES.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="font-semibold">WARRANTIES &amp; MISCELLANEOUS</p>
              <ol className="list-decimal pl-5 space-y-2 mt-1">
                {WM_CLAUSES.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </div>
            <p className="text-jai-text/50 italic pt-2 border-t border-jai-border">End of terms.</p>
          </div>
          {scrolledToEnd && (
            <p className="text-xs text-green-400">✓ Client has reviewed all terms</p>
          )}
        </div>
      )}

      {/* Step 5: Client signs */}
      {step === 5 && (
        <div className="space-y-3">
          <h2 className="font-medium">
            {isKid ? "Guardian signature" : "Client signature"}
          </h2>
          <p className="text-xs text-jai-text/60">
            {isKid
              ? `${guardianName || "Guardian"} signs on behalf of ${kidName || "the minor"}.`
              : `${clientDisplayName || "Client"} to sign below.`}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setClientSigMode("draw")}
              className={`flex-1 py-2 text-xs rounded-lg border ${
                clientSigMode === "draw"
                  ? "bg-jai-blue text-white border-jai-blue"
                  : "bg-jai-card border-jai-border"
              }`}
            >
              ✍️ Draw
            </button>
            <button
              onClick={() => setClientSigMode("type")}
              className={`flex-1 py-2 text-xs rounded-lg border ${
                clientSigMode === "type"
                  ? "bg-jai-blue text-white border-jai-blue"
                  : "bg-jai-card border-jai-border"
              }`}
            >
              ⌨️ Type name
            </button>
          </div>

          {clientSigMode === "draw" ? (
            <>
              <div className="relative bg-jai-card/50 border border-jai-border rounded-lg overflow-hidden">
                <SignaturePadCanvas ref={clientPadRef} onChange={setClientSigEmpty} />
                {clientSigEmpty && (
                  <p className="absolute inset-0 flex items-center justify-center text-xs text-jai-text/40 pointer-events-none">
                    Sign here
                  </p>
                )}
              </div>
              <button
                onClick={() => clientPadRef.current?.clear()}
                className="text-xs text-jai-text/60 underline"
              >
                Clear signature
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                placeholder="Type your full name"
                value={clientTypedName}
                onChange={(e) => setClientTypedName(e.target.value)}
                className="w-full bg-jai-card border border-jai-border rounded-lg px-3 py-3 text-sm"
                autoCapitalize="words"
              />
              <div className="bg-white text-black rounded-lg border border-jai-border min-h-[120px] flex items-center justify-center px-4">
                {clientTypedName.trim() ? (
                  <span
                    style={{
                      fontFamily:
                        "var(--font-dancing-script), 'Brush Script MT', cursive",
                      fontSize: "2.5rem",
                      fontWeight: 700,
                      lineHeight: 1.1,
                    }}
                  >
                    {clientTypedName.trim()}
                  </span>
                ) : (
                  <span className="text-neutral-400 text-xs italic">
                    Your typed signature will appear here
                  </span>
                )}
              </div>
              <p className="text-[11px] text-jai-text/50 italic leading-relaxed">
                By typing your name above, you agree this acts as your legal signature under the Singapore Electronic Transactions Act.
              </p>
            </>
          )}
        </div>
      )}

      {/* Step 6: JMT signs */}
      {step === 6 && (
        <div className="space-y-3">
          <h2 className="font-medium">JMT signature</h2>
          <p className="text-xs text-jai-text/60">
            Signed for and on behalf of Jai Muay Thai by {defaultJmtRepName}.
          </p>
          <div className="relative bg-jai-card/50 border border-jai-border rounded-lg overflow-hidden">
            <SignaturePadCanvas ref={jmtPadRef} onChange={setJmtSigEmpty} />
            {jmtSigEmpty && (
              <p className="absolute inset-0 flex items-center justify-center text-xs text-jai-text/40 pointer-events-none">
                Sign here
              </p>
            )}
          </div>
          <button
            onClick={() => jmtPadRef.current?.clear()}
            className="text-xs text-jai-text/60 underline"
          >
            Clear signature
          </button>

          <div className="bg-jai-card/50 border border-jai-border rounded-lg p-3 text-xs space-y-1">
            <p className="text-jai-text/60 uppercase tracking-wider mb-1">Summary</p>
            <p>
              <span className="text-jai-text/50">Client:</span> {clientDisplayName}
              {isKid && guardianName ? ` (signed by ${guardianName})` : ""}
            </p>
            <p>
              <span className="text-jai-text/50">Coach:</span> {selectedCoach?.full_name}
            </p>
            <p>
              <span className="text-jai-text/50">Package:</span> {totalSessions} × S${pricePerSession} = S${totalPrice.toFixed(2)}
            </p>
            <p>
              <span className="text-jai-text/50">Payment:</span> {paymentMethod}
            </p>
            <p>
              <span className="text-jai-text/50">Expiry:</span> {expiryDate}
            </p>
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              {error}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          {error}
        </p>
      )}

      {/* Inline step nav — kept in-flow so mobile bottom tab bar doesn't cover it */}
      <div className="mt-6 flex gap-2">
        {step > 1 && (
          <button
            onClick={() => setStep((step - 1) as Step)}
            disabled={submitting}
            className="px-4 py-3 text-sm rounded-lg bg-jai-card border border-jai-border disabled:opacity-50 min-h-[48px]"
          >
            Back
          </button>
        )}
        <button
          onClick={async () => {
            if (step === 5) {
              // Snapshot client signature before canvas unmounts on step 6.
              // Draw mode reads the pad; type mode renders the typed name
              // into a PNG using the Dancing Script handwriting font.
              const url =
                clientSigMode === "type"
                  ? await typedSignatureToDataURL(clientTypedName)
                  : clientPadRef.current?.toDataURLWhiteBg() ?? "";
              if (!url) {
                setError("Client signature missing — please sign again.");
                return;
              }
              setClientSigDataUrl(url);
              setError(null);
            }
            if (step < 6) setStep((step + 1) as Step);
            else handleSubmit();
          }}
          disabled={!canGoNext() || submitting}
          className="flex-1 py-3 text-sm font-medium rounded-lg bg-jai-blue text-white disabled:opacity-50 min-h-[48px]"
        >
          {step < 6 ? "Next" : submitting ? "Saving..." : "Sign & generate PDF"}
        </button>
      </div>
    </div>
  );
}
