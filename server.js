import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DEMO_MODE = process.env.DEMO_MODE !== "false";
app.disable("x-powered-by");
app.use(express.json({ limit: "24kb" }));
app.use(express.static(root, { extensions: ["html"] }));

const PROVIDERS = {
  gpt: { name: "GPT", key: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  gemini: { name: "Gemini", key: "GEMINI_API_KEY", model: "GEMINI_MODEL" },
  claude: { name: "Claude", key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" },
  perplexity: { name: "Perplexity", key: "PERPLEXITY_API_KEY", model: "PERPLEXITY_MODEL" },
  grok: { name: "Grok", key: "XAI_API_KEY", model: "XAI_MODEL" }
};

const DEMO_TEXT = {
  gpt: "질문의 핵심 조건을 정리하고 여러 관점을 종합하겠습니다. 판단 기준과 예외를 구분해 결론을 제시합니다.",
  gemini: "다른 가능성과 배경 맥락을 함께 살펴보겠습니다. 한 가지 관점에 치우치지 않도록 대안도 비교합니다.",
  claude: "주장의 전제와 논리적 연결을 검토하겠습니다. 근거가 충분한 부분과 추가 확인이 필요한 부분을 나누겠습니다.",
  perplexity: "사실 확인이 필요한 주장은 신뢰할 수 있는 원문 자료로 검증해야 합니다. 현재 응답은 로컬 데모라 출처 조회를 수행하지 않습니다.",
  grok: "반대 관점에서 가정을 점검하고 빠진 변수를 찾아보겠습니다. 결론이 성립하지 않는 조건도 함께 검토합니다."
};

function getConfig(id) {
  const p = PROVIDERS[id];
  if (!p) throw new Error("지원하지 않는 AI 참가자입니다.");
  return { key: process.env[p.key], model: process.env[p.model], name: p.name };
}

function isConfigured(id) {
  const { key, model } = getConfig(id);
  return Boolean(key && model && !model.startsWith("replace-"));
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Provider returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function requestOpenAICompatible({ baseUrl, key, model, messages, provider }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 900 }),
    signal: AbortSignal.timeout(90000)
  });
  const data = await readJson(response);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(`${provider} returned an empty response`);
  return text.trim();
}

async function callProvider(id, system, prompt) {
  const { key, model, name } = getConfig(id);
  if (!key || !model || model.startsWith("replace-")) {
    throw new Error(`${name}: 로컬 .env에 API 키와 사용 가능한 모델 ID가 설정되지 않았습니다.`);
  }
  const messages = [{ role: "system", content: system }, { role: "user", content: prompt }];

  if (id === "gpt") {
    // OpenAI recommends the Responses API for new projects.
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, instructions: system, input: prompt, max_output_tokens: 900, store: false }),
      signal: AbortSignal.timeout(90000)
    });
    const data = await readJson(response);
    const output = data.output_text || (data.output || []).flatMap(item => item.content || [])
      .filter(part => part.type === "output_text").map(part => part.text).join("\\n");
    if (!output.trim()) throw new Error("GPT returned an empty response");
    return output.trim();
  }
  if (id === "perplexity") {
    return requestOpenAICompatible({ baseUrl: "https://api.perplexity.ai", key, model, messages, provider: name });
  }
  if (id === "grok") {
    // xAI documents the Responses API as its preferred interface; use it here.
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: [{ role: "system", content: system }, { role: "user", content: prompt }], store: false }),
      signal: AbortSignal.timeout(90000)
    });
    const data = await readJson(response);
    const output = (data.output || []).flatMap(item => item.content || [])
      .filter(part => part.type === "output_text").map(part => part.text).join("\n");
    if (!output.trim()) throw new Error("Grok returned an empty response");
    return output.trim();
  }
  if (id === "claude") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, system, max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(90000)
    });
    const data = await readJson(response);
    const output = (data.content || []).filter(part => part.type === "text").map(part => part.text).join("\n");
    if (!output.trim()) throw new Error("Claude returned an empty response");
    return output.trim();
  }
  if (id === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 900, temperature: 0.5 }
      }),
      signal: AbortSignal.timeout(90000)
    });
    const data = await readJson(response);
    const output = (data.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("\n");
    if (!output.trim()) throw new Error("Gemini returned an empty response");
    return output.trim();
  }
  throw new Error("Provider adapter not implemented");
}

function demoReply(id, round, question, previous) {
  const prefix = round === 1 ? "독립 의견" : round === 2 ? "상호 비평" : "최종 의견";
  const critique = previous?.length ? `\n\n검토 대상 의견 요약: ${previous.map(x => `${x.name}: ${x.text.slice(0, 220)}`).join("\n")}` : "";
  return `[${prefix} · 데모]\n${DEMO_TEXT[id]}\n\n질문: ${question}${critique}\n\n※ 실제 모델 응답이 아닌 로컬 데모 문장입니다.`;
}

async function runOne(id, round, question, previous) {
  const provider = PROVIDERS[id];
  if (DEMO_MODE) {
    return { id, name: provider.name, round, status: "demo", text: demoReply(id, round, question, previous) };
  }
  if (!isConfigured(id)) {
    return { id, name: provider.name, round, status: "not_configured", error: "API 키 또는 모델 ID가 설정되지 않았습니다." };
  }
  const previousText = previous?.length
    ? previous.map(x => `[${x.name}]\n${x.text}`).join("\n\n")
    : "아직 다른 참가자의 의견은 없습니다.";
  const instructions = [
    "당신은 AFC 토론 참가자입니다. 한국어로 답하고, 사실과 추론을 구분하며, 모르는 것은 모른다고 말하세요.",
    round === 1 ? "1라운드: 질문에 대한 독립적인 답변을 작성하세요. 핵심 주장, 이유, 불확실성을 포함하세요." :
    round === 2 ? "2라운드: 아래 다른 참가자의 의견을 비판적으로 검토하세요. 동의점, 논리적 약점, 빠진 근거를 구체적으로 제시하세요." :
    "3라운드: 다른 의견과 비판을 반영해 최종 입장을 제시하세요. 바뀐 점과 유지한 점을 설명하세요."
  ].join("\n");
  const prompt = `토론 질문: ${question}\n\n다른 참가자 의견:\n${previousText}\n\n900자 이내로 답변하세요.`;
  try {
    const text = await callProvider(id, instructions, prompt);
    return { id, name: provider.name, round, status: "success", text };
  } catch (error) {
    return { id, name: provider.name, round, status: "error", error: error.message };
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    mode: DEMO_MODE ? "demo" : "live",
    providers: Object.fromEntries(Object.keys(PROVIDERS).map(id => [id, {
      name: PROVIDERS[id].name,
      configured: isConfigured(id)
    }]))
  });
});

app.post("/api/debate", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  const ids = Array.isArray(req.body?.participants) ? [...new Set(req.body.participants)] : [];
  if (!question || question.length > 2000) return res.status(400).json({ error: "질문은 1~2000자로 입력해 주세요." });
  if (!ids.length || ids.length > 5 || ids.some(id => !PROVIDERS[id])) return res.status(400).json({ error: "참가 AI를 1~5개 선택해 주세요." });
  const rounds = req.body?.rounds === 2 ? 2 : 3;
  if (!DEMO_MODE && !isConfigured("gpt")) return res.status(400).json({ error: "최종 심판에 사용할 GPT API 설정이 필요합니다." });

  const transcript = [];
  for (let round = 1; round <= rounds; round++) {
    const previous = transcript.filter(item => item.round === round - 1);
    const results = await Promise.all(ids.map(id => runOne(id, round, question, previous)));
    transcript.push(...results);
  }
  const successful = transcript.filter(item => item.status === "success" || item.status === "demo");
  let judge;
  if (DEMO_MODE) {
    judge = {
      status: "demo",
      text: "데모 심판: 실제 AI 판정이 아닙니다. 실제 모드에서는 GPT가 세 라운드의 참가자 답변을 모두 읽고 공통점, 쟁점, 근거의 강도, 남은 불확실성을 종합합니다."
    };
  } else if (!successful.length) {
    judge = { status: "error", text: "성공한 AI 응답이 없어 최종 판정을 만들 수 없습니다." };
  } else {
    const fullTranscript = successful.map(x => `[${x.name} · ROUND ${x.round}]\n${x.text}`).join("\n\n");
    try {
      const text = await callProvider("gpt",
        "당신은 AFC의 중립적인 최종 심판입니다. 참가자들의 주장을 공정하게 비교하고, 근거가 약한 주장은 약하다고 밝혀야 합니다. 한국어로 답하세요.",
        `원래 질문: ${question}\n\n전체 토론 기록:\n${fullTranscript}\n\n다음 항목으로 최종 판정하세요: 1) 핵심 결론 2) 참가자 간 합의점 3) 주요 쟁점과 근거 비교 4) 남은 불확실성 5) 실용적인 답변.`);
      judge = { status: "success", text };
    } catch (error) {
      judge = { status: "error", text: `GPT 최종 심판 실패: ${error.message}` };
    }
  }
  res.json({ mode: DEMO_MODE ? "demo" : "live", transcript, judge });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API endpoint not found" });
  res.sendFile(path.join(root, "index.html"), error => error && next(error));
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`AFC local server: http://127.0.0.1:${PORT}`);
  console.log(`Mode: ${DEMO_MODE ? "DEMO (no provider API calls)" : "LIVE (provider API calls enabled)"}`);
});