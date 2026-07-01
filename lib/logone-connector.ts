/**
 * Conector Logone via tgsa-ai.vercel.app
 *
 * Fluxo:
 *  1. Autentica com credenciais (env vars)
 *  2. Cria uma thread nova
 *  3. Envia prompt pedindo dados dos últimos N dias em JSON
 *  4. Faz polling até a IA responder (máx 90s)
 *  5. Extrai e retorna o JSON estruturado
 */

const BASE = "https://tgsa-ai.vercel.app";
const MAX_POLL_MS = 90_000;   // 90 segundos de espera máxima
const POLL_INTERVAL_MS = 3_000; // verifica a cada 3 segundos

export type LogoneEntrada = {
  identificador: string;
  inicio: string;
  fim: string | null;
  cliente: string;
  volume_tons: number;
  produto: string;
};

export type LogoneSaida = {
  identificador: string;
  inicio: string;
  fim: string | null;
  cliente: string;
  volume_tons: number;
  produto: string;
};

export type LogoneEstoque = {
  cliente: string;
  saldo_tons: number;
};

export type LogoneData = {
  data_sync: string;
  periodo: { de: string; ate: string };
  entradas: LogoneEntrada[];
  saidas: LogoneSaida[];
  estoque_atual: LogoneEstoque[];
};

// ────────────────────────────────────────────
// 1. AUTENTICAÇÃO
// ────────────────────────────────────────────
async function autenticar(): Promise<string> {
  const email = process.env.TGSA_EMAIL;
  const password = process.env.TGSA_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Variáveis TGSA_EMAIL e TGSA_PASSWORD não configuradas no Vercel."
    );
  }

  const res = await fetch(`${BASE}/api/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(
      `Falha na autenticação tgsa-ai: status ${res.status}. Verifique TGSA_EMAIL e TGSA_PASSWORD.`
    );
  }

  // Extrai cookie de sessão do header set-cookie
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    return setCookie.split(";")[0];
  }

  // Tenta pegar token do body
  const body = await res.json().catch(() => ({}));
  const token =
    body?.access_token ??
    body?.token ??
    body?.session?.access_token ??
    null;

  if (token) return `Bearer ${token}`;

  throw new Error("Autenticação bem-sucedida mas sem cookie/token na resposta.");
}

// ────────────────────────────────────────────
// 2. CRIAR THREAD
// ────────────────────────────────────────────
async function criarThread(cookie: string): Promise<string> {
  const res = await fetch(`${BASE}/api/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ title: "Sync Terminal Novo Remanso" }),
  });

  if (!res.ok) throw new Error(`Erro ao criar thread: ${res.status}`);
  const body = await res.json();
  return body?.thread_id ?? body?.id ?? body?.data?.id;
}

// ────────────────────────────────────────────
// 3. ENVIAR MENSAGEM COM PROMPT
// ────────────────────────────────────────────
async function enviarPrompt(
  cookie: string,
  threadId: string,
  diasAtras: number
): Promise<void> {
  const hoje = new Date();
  const de = new Date(hoje);
  de.setDate(de.getDate() - diasAtras);
  const deStr = de.toISOString().slice(0, 10);
  const ateStr = hoje.toISOString().slice(0, 10);

  const prompt = `Analise as operações do terminal de Novo Remanso dos últimos ${diasAtras} dias (de ${deStr} até ${ateStr}).

Retorne SOMENTE um JSON válido, sem markdown, sem texto explicativo, sem blocos de código. Apenas o JSON puro:

{
  "data_sync": "${new Date().toISOString()}",
  "periodo": { "de": "${deStr}", "ate": "${ateStr}" },
  "entradas": [
    {
      "identificador": "nome da barcaça ou comboio",
      "inicio": "YYYY-MM-DDTHH:MM:SS",
      "fim": "YYYY-MM-DDTHH:MM:SS ou null",
      "cliente": "ADM ou COFCO ou BUNGE ou LDC",
      "volume_tons": 0.0,
      "produto": "soja ou milho"
    }
  ],
  "saidas": [
    {
      "identificador": "nome do navio",
      "inicio": "YYYY-MM-DDTHH:MM:SS",
      "fim": "YYYY-MM-DDTHH:MM:SS ou null",
      "cliente": "ADM ou COFCO ou BUNGE ou LDC",
      "volume_tons": 0.0,
      "produto": "soja ou milho"
    }
  ],
  "estoque_atual": [
    {
      "cliente": "ADM ou COFCO ou BUNGE ou LDC",
      "saldo_tons": 0.0
    }
  ]
}

Onde:
- "entradas" = operações com SENTIDO = ENTRADA (descargas de barcaças)
- "saidas" = operações com SENTIDO = SAÍDA (carregamentos de navios)
- "estoque_atual" = saldo físico atual por cliente no terminal
- Use APENAS os clientes: ADM, COFCO, BUNGE, LDC
- volume_tons deve usar QUANTIDADE_PROCESSO
- produto deve ser "soja" ou "milho" em letras minúsculas`;

  // Tenta endpoint de chat
  const endpoints = [
    { url: `/api/threads/${threadId}/messages`, body: { role: "user", content: prompt } },
    { url: `/api/chat`, body: { thread_id: threadId, message: prompt, role: "user" } },
    { url: `/api/chat.json`, body: { thread_id: threadId, content: prompt } },
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${BASE}${ep.url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(ep.body),
    });
    if (res.ok) return;
  }

  throw new Error("Não foi possível enviar o prompt para o tgsa-ai.");
}

// ────────────────────────────────────────────
// 4. POLLING — aguarda resposta da IA
// ────────────────────────────────────────────
async function aguardarResposta(
  cookie: string,
  threadId: string
): Promise<string> {
  const inicio = Date.now();

  while (Date.now() - inicio < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(
      `${BASE}/api/threads?messages&thread_id=${threadId}`,
      { headers: { Cookie: cookie } }
    );

    if (!res.ok) continue;

    const mensagens: any[] = await res.json();

    // Busca a última mensagem do assistente que não seja tool_call puro
    const assistantMsgs = mensagens
      .filter((m) => m?.message?.role === "assistant")
      .sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    for (const msg of assistantMsgs) {
      const content = msg?.message?.content ?? [];
      for (const block of content) {
        // Texto final sem tool_call pendente
        if (block.type === "text" && block.text?.trim().startsWith("{")) {
          return block.text.trim();
        }
        if (block.type === "ai" && !block.tool_calls?.length && block.text?.includes("{")) {
          // Extrai JSON do texto
          const match = block.text.match(/\{[\s\S]*\}/);
          if (match) return match[0];
        }
        // Resultado de tool_result com JSON
        if (block.type === "tool_result" && typeof block.content === "string") {
          const match = block.content.match(/\{[\s\S]*\}/);
          if (match) return match[0];
        }
      }
    }
  }

  throw new Error(
    `Timeout: tgsa-ai não respondeu em ${MAX_POLL_MS / 1000} segundos.`
  );
}

// ────────────────────────────────────────────
// 5. PARSE DO JSON RETORNADO
// ────────────────────────────────────────────
function parsearResposta(raw: string): LogoneData {
  // Remove possíveis marcadores de markdown
  const limpo = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const parsed = JSON.parse(limpo);

  // Normaliza campos para garantir compatibilidade
  return {
    data_sync: parsed.data_sync ?? new Date().toISOString(),
    periodo: parsed.periodo ?? { de: "", ate: "" },
    entradas: (parsed.entradas ?? []).map((e: any) => ({
      identificador: e.identificador ?? e.navio ?? e.nome ?? "Sem nome",
      inicio: e.inicio ?? e.inicio_operacao ?? new Date().toISOString(),
      fim: e.fim ?? e.fim_operacao ?? null,
      cliente: normalizarCliente(e.cliente ?? e.proprietario ?? ""),
      volume_tons: Number(e.volume_tons ?? e.quantidade ?? 0),
      produto: (e.produto ?? "soja").toLowerCase(),
    })),
    saidas: (parsed.saidas ?? []).map((s: any) => ({
      identificador: s.identificador ?? s.navio ?? s.nome ?? "Sem nome",
      inicio: s.inicio ?? s.inicio_operacao ?? new Date().toISOString(),
      fim: s.fim ?? s.fim_operacao ?? null,
      cliente: normalizarCliente(s.cliente ?? s.proprietario ?? ""),
      volume_tons: Number(s.volume_tons ?? s.quantidade ?? 0),
      produto: (s.produto ?? "soja").toLowerCase(),
    })),
    estoque_atual: (parsed.estoque_atual ?? []).map((e: any) => ({
      cliente: normalizarCliente(e.cliente ?? ""),
      saldo_tons: Number(e.saldo_tons ?? e.saldo ?? 0),
    })),
  };
}

function normalizarCliente(nome: string): string {
  const n = nome.toUpperCase().trim();
  if (n.includes("ADM")) return "ADM";
  if (n.includes("COFCO")) return "COFCO";
  if (n.includes("BUNGE")) return "BUNGE";
  if (n.includes("LDC") || n.includes("LOUIS")) return "LDC";
  return nome;
}

// ────────────────────────────────────────────
// FUNÇÃO PRINCIPAL — ponto de entrada
// ────────────────────────────────────────────
export async function buscarDadosLogone(
  diasAtras = 3
): Promise<{ dados: LogoneData; rawJson: string }> {
  console.log("[Logone] Iniciando autenticação...");
  const cookie = await autenticar();

  console.log("[Logone] Criando thread...");
  const threadId = await criarThread(cookie);

  console.log("[Logone] Enviando prompt de extração...");
  await enviarPrompt(cookie, threadId, diasAtras);

  console.log("[Logone] Aguardando resposta da IA...");
  const rawJson = await aguardarResposta(cookie, threadId);

  console.log("[Logone] Parseando resposta...");
  const dados = parsearResposta(rawJson);

  console.log(
    `[Logone] OK — ${dados.entradas.length} entradas, ${dados.saidas.length} saídas`
  );

  return { dados, rawJson };
}
