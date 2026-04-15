export const metadata = {
  title: "Privacy Policy — Jai Muay Thai",
  description: "How Jai Muay Thai collects, uses, and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  const lastUpdated = "15 April 2026";

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {lastUpdated}</p>

        <section className="prose prose-gray max-w-none space-y-6 text-[15px] leading-relaxed">
          <p>
            Jai Muay Thai Pte. Ltd. (UEN 202239849D, &ldquo;we&rdquo;, &ldquo;our&rdquo;,
            &ldquo;us&rdquo;) operates the website jaimuaythai.com and related booking,
            lead, and coaching platforms (&ldquo;the Services&rdquo;). This policy
            explains what personal data we collect, how we use it, and the rights
            you have over your data. We comply with the Singapore Personal Data
            Protection Act 2012 (PDPA).
          </p>

          <h2 className="text-xl font-semibold mt-8">1. Data we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Contact details</strong> — name, phone number, email address — when
              you submit a trial booking, enquiry form, or Facebook / Instagram lead form
              linked to our page.
            </li>
            <li>
              <strong>Interest details</strong> — which class or programme you enquired
              about, preferred schedule, guardian information (for minors).
            </li>
            <li>
              <strong>Account data</strong> — for coaches and administrators only:
              email, role, and activity within the internal dashboard.
            </li>
            <li>
              <strong>Technical data</strong> — IP address, browser and device metadata
              for security and abuse prevention.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-8">2. How we use your data</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To contact you about a trial class, booking, or enquiry you submitted.</li>
            <li>To schedule and manage your classes or personal training sessions.</li>
            <li>
              To send reminders, confirmations, and service updates via WhatsApp,
              SMS, email, or phone call.
            </li>
            <li>To improve our services, coaching quality, and class scheduling.</li>
            <li>To comply with legal, tax, and accounting obligations in Singapore.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-8">3. Legal basis</h2>
          <p>
            We process your data based on your consent (when you submit a form or book a
            class), and to perform the service you requested. For employees and coaches,
            we process data to fulfil our contractual obligations.
          </p>

          <h2 className="text-xl font-semibold mt-8">4. Sharing your data</h2>
          <p>
            We do not sell your personal data. We only share it with:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              Our coaches and staff, strictly for the purpose of contacting you or
              delivering the class you booked.
            </li>
            <li>
              Service providers that host and process our data on our behalf:
              Supabase (database), Vercel (hosting), Meta / WhatsApp (messaging),
              Telegram (internal staff alerts), Google (calendar). These providers
              are bound by their own privacy commitments.
            </li>
            <li>
              Regulators or law-enforcement authorities, only when we are required by law.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-8">5. Data retention</h2>
          <p>
            Active member and PT client data is retained while you have an active
            relationship with us. Lead and trial enquiry data is kept for up to 24
            months so we can follow up on your enquiry. You may request deletion of
            your data at any time (see section 7).
          </p>

          <h2 className="text-xl font-semibold mt-8">6. Security</h2>
          <p>
            We use industry-standard measures to protect your data: encrypted
            connections (HTTPS), role-based access control, and least-privilege access
            to our database. Only authorised staff can view member and lead records.
          </p>

          <h2 className="text-xl font-semibold mt-8">7. Your rights</h2>
          <p>Under the PDPA, you have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Request access to the personal data we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>
              Request deletion of your data, subject to any legal retention
              obligations we may have.
            </li>
            <li>Withdraw your consent to marketing communications at any time.</li>
          </ul>
          <p>
            To exercise any of these rights, email us at{" "}
            <a
              href="mailto:info@jaimuaythai.com"
              className="text-blue-600 underline"
            >
              info@jaimuaythai.com
            </a>
            . We will respond within 30 days.
          </p>

          <h2 className="text-xl font-semibold mt-8">8. Facebook / Instagram lead forms</h2>
          <p>
            When you submit a lead form on our Facebook or Instagram page, Meta
            shares your submitted details (name, contact, interest) with us so we can
            respond to your enquiry. We only request fields necessary for us to
            contact you about your enquiry. You may request deletion of this data at
            any time using the email above.
          </p>

          <h2 className="text-xl font-semibold mt-8">9. Cookies</h2>
          <p>
            Our internal dashboard uses essential cookies for login and session
            management. Our public booking pages do not use analytics or advertising
            cookies.
          </p>

          <h2 className="text-xl font-semibold mt-8">10. Children</h2>
          <p>
            For kids&rsquo; programmes, we collect guardian contact details. Children
            under 13 must have a parent or guardian submit their information on
            their behalf.
          </p>

          <h2 className="text-xl font-semibold mt-8">11. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. The latest version will
            always be available at this URL, with the &ldquo;last updated&rdquo; date
            at the top.
          </p>

          <h2 className="text-xl font-semibold mt-8">12. Contact</h2>
          <p>
            Jai Muay Thai Pte. Ltd.
            <br />
            UEN: 202239849D
            <br />
            Registered address: 3 Ang Mo Kio Street 62, #03-17, LINK@AMK,
            Singapore 569139
            <br />
            Email:{" "}
            <a
              href="mailto:info@jaimuaythai.com"
              className="text-blue-600 underline"
            >
              info@jaimuaythai.com
            </a>
            <br />
            Website:{" "}
            <a
              href="https://jaimuaythai.com"
              className="text-blue-600 underline"
            >
              jaimuaythai.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
