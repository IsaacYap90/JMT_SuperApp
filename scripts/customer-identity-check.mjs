import {
  canonicalCustomerIdentifiers,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "../src/lib/customer-identity.ts";

const cases = [
  ["local SG mobile", () => normalizeCustomerPhone("9123 4567"), "+6591234567"],
  ["local SG landline", () => normalizeCustomerPhone("6123-4567"), "+6561234567"],
  ["SG country code", () => normalizeCustomerPhone("65 9123 4567"), "+6591234567"],
  ["SG explicit E.164", () => normalizeCustomerPhone("+65 (9123) 4567"), "+6591234567"],
  ["international 00", () => normalizeCustomerPhone("0060 12-345 6789"), "+60123456789"],
  ["international plus", () => normalizeCustomerPhone("+44 20 7946 0958"), "+442079460958"],
  ["ambiguous foreign digits", () => normalizeCustomerPhone("60123456789"), null],
  ["malformed extension", () => normalizeCustomerPhone("91234567 ext 2"), null],
  ["email is not phone", () => normalizeCustomerPhone("a@example.com"), null],
  ["normal email", () => normalizeCustomerEmail("  Person+Lead@Example.COM "), "person+lead@example.com"],
  ["email missing public suffix", () => normalizeCustomerEmail("person@localhost"), null],
  ["email double dot", () => normalizeCustomerEmail("person..x@example.com"), null],
  [
    "combined identifiers",
    () => canonicalCustomerIdentifiers({ phone: "81234567", email: " A@Example.sg " }),
    { phoneE164: "+6581234567", emailNormalized: "a@example.sg" },
  ],
];

let failed = 0;
for (const [name, run, expected] of cases) {
  const got = run();
  const pass = JSON.stringify(got) === JSON.stringify(expected);
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}`);
  if (!pass) console.log(`     got ${JSON.stringify(got)}, want ${JSON.stringify(expected)}`);
}

console.log(`\n${failed ? `${failed} CASE(S) FAILED` : "ALL IDENTITY CASES PASSED"}`);
process.exit(failed ? 1 : 0);

