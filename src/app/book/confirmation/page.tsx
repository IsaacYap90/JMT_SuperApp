export default function ConfirmationPage({
  searchParams,
}: {
  searchParams: { name?: string; date?: string; time?: string; class?: string };
}) {
  const name = searchParams.name || "there";
  const date = searchParams.date || "";
  const time = searchParams.time || "";
  const className = searchParams.class || "";

  return (
    <div className="space-y-6">
      {/* Success */}
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-green-400">Booking Confirmed!</h2>
        <p className="text-jai-text text-sm mt-2">
          Hi {name}, your trial class is booked.
        </p>
      </div>

      {/* Booking details */}
      <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm uppercase text-jai-text tracking-wide">Your Booking</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-jai-text">Class</span>
            <span className="font-medium">{className}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-jai-text">Date</span>
            <span className="font-medium">{date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-jai-text">Time</span>
            <span className="font-medium">{time}</span>
          </div>
        </div>
      </div>

      {/* Venue info */}
      <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm uppercase text-jai-text tracking-wide">Venue</h3>
        <div className="text-sm space-y-1">
          <p className="font-medium">JAI Muay Thai</p>
          <p className="text-jai-text">Link@AMK #03-17</p>
          <p className="text-jai-text">3 Ang Mo Kio Street 62, S569139</p>
          <p className="text-jai-text mt-2">
            Nearest MRT: <span className="text-white">Yio Chu Kang</span>
          </p>
        </div>
        <a
          href="https://maps.google.com/?q=JAI+Muay+Thai+Link+AMK+Singapore"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center py-2.5 bg-jai-blue/10 text-jai-blue border border-jai-blue/20 rounded-lg text-sm font-medium min-h-[44px] leading-[44px]"
        >
          Open in Google Maps
        </a>
      </div>

      {/* What to bring */}
      <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-sm uppercase text-jai-text tracking-wide">What to Bring</h3>
        <ul className="text-sm space-y-2 text-jai-text">
          <li className="flex items-start gap-2">
            <span className="text-jai-blue mt-0.5">&#x2022;</span>
            Comfortable workout clothes
          </li>
          <li className="flex items-start gap-2">
            <span className="text-jai-blue mt-0.5">&#x2022;</span>
            Towel
          </li>
          <li className="flex items-start gap-2">
            <span className="text-jai-blue mt-0.5">&#x2022;</span>
            Water bottle
          </li>
          <li className="flex items-start gap-2">
            <span className="text-jai-blue mt-0.5">&#x2022;</span>
            Please arrive <span className="text-white font-medium">15 minutes early</span>
          </li>
        </ul>
      </div>

      {/* WhatsApp contact */}
      <a
        href={`https://wa.me/6591234567?text=${encodeURIComponent(`Hi! I've just booked a trial class at JAI Muay Thai.\n\nName: ${name}\nClass: ${className}\nDate: ${date}\nTime: ${time}\n\nSee you there!`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center py-3 bg-green-600 text-white rounded-xl text-sm font-semibold min-h-[48px] leading-[48px]"
      >
        Message Us on WhatsApp
      </a>
    </div>
  );
}
