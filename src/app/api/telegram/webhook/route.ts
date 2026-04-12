import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
  };
};

async function sendReply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function POST(req: NextRequest) {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "no bot token" }, { status: 500 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const msg = update.message;
  if (!msg?.text) {
    return NextResponse.json({ ok: true, skipped: "no text" });
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Only handle /start commands
  if (!text.startsWith("/start")) {
    return NextResponse.json({ ok: true, skipped: "not /start" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "supabase env missing" }, { status: 500 });
  }
  const supabase = createClient(url, key);

  // Deep-link: /start <user_id>
  const parts = text.split(/\s+/);
  const userId = parts[1] || "";

  if (!userId) {
    await sendReply(
      token,
      chatId,
      "Welcome! To link your account, please use the personal link your admin shared with you."
    );
    return NextResponse.json({ ok: true, action: "plain_start" });
  }

  // Validate user exists and is coach/admin
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (userErr || !user) {
    await sendReply(token, chatId, "Sorry, I couldn't find your account. Please check with your admin.");
    return NextResponse.json({ ok: true, action: "user_not_found" });
  }

  if (!["coach", "admin", "master_admin"].includes(user.role)) {
    await sendReply(token, chatId, "Telegram alerts are only available for coaches and admins.");
    return NextResponse.json({ ok: true, action: "not_coach" });
  }

  // Save chat_id + Telegram username
  const tgUsername = msg.from?.username || null;
  const { error: updateErr } = await supabase
    .from("users")
    .update({ telegram_chat_id: String(chatId) })
    .eq("id", userId);

  if (updateErr) {
    console.error("[telegram-webhook] update failed:", updateErr.message);
    await sendReply(token, chatId, "Something went wrong linking your account. Please try again.");
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  await sendReply(
    token,
    chatId,
    `Linked! Hey ${user.full_name}, you'll now receive JMT alerts here.`
  );

  console.log(
    `[telegram-webhook] linked ${user.full_name} (${userId}) → chat ${chatId}${tgUsername ? ` @${tgUsername}` : ""}`
  );

  return NextResponse.json({ ok: true, action: "linked", userId, chatId });
}
