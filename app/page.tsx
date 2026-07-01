"use client";

import { useState, useEffect, useCallback } from "react";

type SyncLog = {
  id: string;
  iniciado_em: string;
  status: string;
  entradas_gravadas: number;
  saidas_gravadas: number;
  registros_duplicados: number;
  erro_mensagem: string | null;
  disparado_por: string;
  duracao_segundos: number | null;
  periodo_de: string | null;
  periodo_ate: string | null;
};

const STATUS_COR: Record<string, { bg: string; text: string }> = {
  sucesso:  { bg: "#4F904C22", text: "#4F904C" },
  erro:     { bg: "#ff525222", text: "#ff5252" },
  parcial:  { bg: "#EE813322", text: "#EE8133" },
  iniciado: { bg: "#AFD24822", text: "#AFD248" },
};

export default function App() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncando, setSyncando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: "ok" | "erro" | "info" } | null>(null);
  const [ultimoSync, setUltimoSync] = useState<SyncLog | null>(null);

  const carregarLogs = useCallback(async () => {
    const res = await fetch("/api/sync").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      const lista = data.historico ?? [];
      setLogs(lista);
      setUltimoSync(lista[0] ?? null);
    }
  }, []);

  useEffect(() => { carregarLogs(); }, [carregarLogs]);

  async function syncManual() {
    setSyncando(true);
    setMsg({ texto: "Conectando ao tgsa-ai e buscando dados do Logone...", tipo: "info" });

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "x-disparado-por": "manual" },
      });
      const data = await res.json();

      if (data.ok) {
        setMsg({
          texto: `✅ Sync concluído — ${data.entradas_gravadas} entradas e ${data.saidas_gravadas} saídas gravadas no terminal${data.duplicados > 0 ? ` (${data.duplicados} duplicatas ignoradas)` : ""}`,
          tipo: "ok",
        });
      } else {
        setMsg({ texto: `❌ Erro: ${data.erro}`, tipo: "erro" });
      }
      carregarLogs();
    } catch (e: any) {
      setMsg({ texto: `❌ Erro de conexão: ${e.message}`, tipo: "erro" });
    } finally {
      setSyncando(false);
    }
  }

  const fmtData = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const fmtDataCurta = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", color: "#e6e9ef", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#333B5A", borderBottom: "1px solid #1f2430", padding: "14px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#AFD248", letterSpacing: -0.5 }}>AGEO</span>
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)" }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Conector Logone → Terminal Novo Remanso</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Sincronização automática via tgsa-ai · 3x por dia</div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Cards de status */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <div style={{ background: "#151821", border: "1px solid #1f2430", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Último sync</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {ultimoSync ? fmtData(ultimoSync.iniciado_em) : "Nenhum ainda"}
            </div>
            {ultimoSync && (
              <div style={{ marginTop: 6, display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 10, background: STATUS_COR[ultimoSync.status]?.bg, color: STATUS_COR[ultimoSync.status]?.text }}>
                {ultimoSync.status}
              </div>
            )}
          </div>
          <div style={{ background: "#151821", border: "1px solid #1f2430", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Registros gravados (último sync)</div>
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#AFD248" }}>{ultimoSync?.entradas_gravadas ?? "—"}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>entradas</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#EE8133" }}>{ultimoSync?.saidas_gravadas ?? "—"}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>saídas</div>
              </div>
            </div>
          </div>
          <div style={{ background: "#151821", border: "1px solid #1f2430", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Agendamento automático</div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              🟢 6h BRT — 1º turno<br />
              🟢 14h BRT — 2º turno<br />
              🟢 22h BRT — 3º turno
            </div>
          </div>
        </div>

        {/* Botão de sync manual */}
        <div style={{ background: "#151821", border: "1px solid #1f2430", borderRadius: 12, padding: "20px 22px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Sincronização manual</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
            Busca operações dos <strong style={{ color: "#e6e9ef" }}>últimos 3 dias</strong> no Logone (via tgsa-ai) e grava entradas de barcaças, saídas de navios e estoque no terminal. Duplicatas são ignoradas automaticamente.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button
              onClick={syncManual}
              disabled={syncando}
              style={{
                background: syncando ? "#1f2430" : "linear-gradient(135deg, #51B24F, #4F904C)",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "11px 28px", fontSize: 14, fontWeight: 700,
                cursor: syncando ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              {syncando ? "⏳ Sincronizando..." : "🔄 Sincronizar agora"}
            </button>

            {msg && (
              <div style={{
                fontSize: 13, padding: "8px 14px", borderRadius: 8,
                background: msg.tipo === "ok" ? "#4F904C22" : msg.tipo === "erro" ? "#ff525222" : "#AFD24822",
                color: msg.tipo === "ok" ? "#4F904C" : msg.tipo === "erro" ? "#ff5252" : "#AFD248",
                maxWidth: 460,
              }}>
                {msg.texto}
              </div>
            )}
          </div>
        </div>

        {/* Histórico */}
        <div style={{ background: "#151821", border: "1px solid #1f2430", borderRadius: 12, padding: "20px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Histórico de sincronizações</div>
            <button
              onClick={carregarLogs}
              style={{ background: "none", border: "1px solid #1f2430", color: "#9aa39b", borderRadius: 8, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}
            >
              Atualizar
            </button>
          </div>

          {logs.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
              Nenhum sync registrado ainda. Execute um sync manual ou aguarde o agendamento automático das 6h, 14h ou 22h.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
                <thead>
                  <tr style={{ color: "#6b7280", textAlign: "left", borderBottom: "1px solid #1f2430" }}>
                    {["Data/hora","Status","Período","Entradas","Saídas","Duplic.","Disparado","Duração","Erro"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "8px 10px", color: "#9aa39b" }}>{fmtData(log.iniciado_em)}</td>
                      <td style={{ padding: "8px 10px" }}>
                        <span style={{ background: STATUS_COR[log.status]?.bg, color: STATUS_COR[log.status]?.text, padding: "2px 9px", borderRadius: 10, fontWeight: 600 }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", color: "#9aa39b" }}>
                        {fmtDataCurta(log.periodo_de)} → {fmtDataCurta(log.periodo_ate)}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#AFD248", fontWeight: 700 }}>{log.entradas_gravadas}</td>
                      <td style={{ padding: "8px 10px", color: "#EE8133", fontWeight: 700 }}>{log.saidas_gravadas}</td>
                      <td style={{ padding: "8px 10px", color: "#6b7280" }}>{log.registros_duplicados}</td>
                      <td style={{ padding: "8px 10px", color: "#6b7280" }}>{log.disparado_por}</td>
                      <td style={{ padding: "8px 10px", color: "#6b7280" }}>{log.duracao_segundos != null ? `${log.duracao_segundos}s` : "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#ff5252", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={log.erro_mensagem ?? ""}>
                        {log.erro_mensagem ? log.erro_mensagem.slice(0, 40) + "..." : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info box */}
        <div style={{ background: "#1a2a1a", border: "1px solid #2d4a2d", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "#9aa39b", lineHeight: 1.7 }}>
            <strong style={{ color: "#AFD248" }}>💡 Como funciona o sync</strong><br />
            1. O conector autentica no <strong style={{ color: "#e6e9ef" }}>tgsa-ai.vercel.app</strong> com suas credenciais<br />
            2. Envia um prompt pedindo as operações dos últimos 3 dias no formato JSON<br />
            3. A IA do tgsa-ai roda as queries no Logone e retorna os dados<br />
            4. O conector grava entradas (descargas de barcaças) e saídas (carregamentos de navios) no Supabase do terminal<br />
            5. Duplicatas são ignoradas automaticamente — sem risco de gravar o mesmo dado duas vezes
          </div>
        </div>
      </div>
    </div>
  );
}
