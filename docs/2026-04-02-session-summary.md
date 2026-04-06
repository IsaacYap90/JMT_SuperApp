# JMT Dashboard — Session Summary — 2 April 2026

## Receipt Upload Feature (NEW)

### New Files
- **`src/app/api/extract-receipt/route.ts`** — API route that accepts file uploads (image/PDF), converts to base64, sends to OpenAI GPT-4o-mini vision API for OCR extraction
  - Returns JSON: `{ amount, date, type, description }`
  - Type detection: salary, pt_weekly, bonus, other
  - Strips markdown code fences from GPT response before parsing

### Modified Files
- **`src/components/earning-client.tsx`**
  - Added `uploading` state and `handleUpload()` function
  - Added "Upload" button (with camera icon) next to "+ Add" button in the earnings tab header
  - Accepts `image/*` and `.pdf` files
  - On successful OCR: pre-fills the Add Entry form with extracted data and opens it
  - On failure: shows alert to enter manually
  - Fixed date input being too tall on iOS — changed `min-h-[44px]` to `h-[44px] appearance-none`

### Environment
- Added `OPENAI_API_KEY` to Vercel production environment via CLI

---

## Schedule Tab — Interactive PT Cards (Enhancement)

### New Files
- **`src/components/pt-card.tsx`** — extracted shared `PtCard` component
  - Clickable card that expands to show phone number and status action buttons
  - Status buttons: Completed, No Show, Cancelled
  - Calls `coachUpdatePtStatus` server action to update status
  - Shows coloured borders based on status (green=done, amber=no show, red=cancelled)
  - Shows end time in addition to start time

### Modified Files
- **`src/components/coach-schedule.tsx`**
  - Added import for shared `PtCard`
  - Added `ptSession` field to `ScheduleItem` type
  - PT items in the schedule now render as interactive `PtCard` instead of static divs
  - Class items remain as static cards

- **`src/components/coach-dashboard.tsx`**
  - Removed local `PtCard` function definition
  - Now imports from shared `./pt-card`
  - Removed unused `useState` and `useRouter` imports

---

## Deployments
1. Receipt upload feature + UI (production)
2. OpenAI API key added + redeploy (production)
3. PT card extraction + date input fix (production)
