const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";
const MINIMAX_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

export function isMinimaxConfigured(): boolean {
  return !!MINIMAX_API_KEY;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface MinimaxOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export async function minimaxChat(options: MinimaxOptions): Promise<string> {
  const res = await fetch(MINIMAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens ?? 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax API HTTP error ${res.status}: ${err}`);
  }

  const data = await res.json();

  if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
    throw new Error(`MiniMax API error: ${data.base_resp.status_msg ?? "unknown"} (code ${data.base_resp.status_code})`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("MiniMax API returned empty response");
  }

  return content;
}
