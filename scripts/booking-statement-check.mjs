import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { buildDeterministicAnswer } from "../src/lib/wa/deterministic-answers.ts";
import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";

const message = "Hi I have already booked for tomorrow 7:30pm class thanks 🙏";
assert.equal(buildDeterministicAnswer(message, JAI_FACTS), null);
assert.equal(buildDeterministicAnswer("what time is tomorrow’s 7:30pm class?", JAI_FACTS)?.intent, "SCHEDULE");

// Mutation control: remove the new intent gate in memory, not the working tree.
// The original incorrect timetable must return, proving the regression detects
// this actual failure rather than simply checking a hand-written fixture.
const source = await readFile(new URL("../src/lib/wa/deterministic-answers.ts", import.meta.url), "utf8");
const mutant = source.replace("schedStrong === 0 && !isScheduleLookupFragment(raw, cfg)", "false");
assert.notEqual(mutant, source);
const js = ts.transpileModule(mutant, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace('from "./lang"', `from ${JSON.stringify(new URL("../src/lib/wa/lang.ts", import.meta.url).href)}`);
const oldBehavior = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
assert.equal(oldBehavior.buildDeterministicAnswer(message, JAI_FACTS)?.intent, "SCHEDULE");

// The actual reply generator receives the complete history + fact sheet.
// Network is fully mocked: no real model request, DB call or outbound message.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://jai-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-key";
process.env.DEEPSEEK_API_KEY = "synthetic-key";
delete process.env.JAI_STUB_LLM;
const history = [
  { role: "user", message: "Can I attend tomorrow?" },
  { role: "assistant", message: "Please use your member app to book." },
  { role: "user", message },
];
let modelBody;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input.toString());
  if (url.hostname === "jai-test.invalid" && url.pathname === "/rest/v1/jai_facts") {
    return new Response(JSON.stringify({ content: JAI_FACTS }), { headers: { "Content-Type": "application/json" } });
  }
  if (url.href === "https://api.deepseek.com/chat/completions") {
    modelBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Thanks for letting us know, Skipper 🙏 See you there!" } }] }), { headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`Unexpected network call: ${url}`);
};
const { generateReply } = await import("../src/lib/wa/jai-reply.ts");
const reply = await generateReply(history, false, "Skipper", true, "Returning member");
assert.ok(modelBody, "DeepSeek path must be called");
assert.deepEqual(modelBody.messages.slice(1), history.map(turn => ({ role: turn.role, content: turn.message })));
assert.ok(modelBody.messages[0].content.includes(JAI_FACTS));
assert.match(reply.messageText, /Thanks for letting us know/);
assert.doesNotMatch(reply.messageText, /classes:|•/);
console.log("booking-statement-check: intent regression, failing mutation control, and contextual model path passed");
