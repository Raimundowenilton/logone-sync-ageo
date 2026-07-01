import { NextRequest, NextResponse } from "next/server";
import { buscarDadosLogone } from "@/lib/logone-connector";
import { gravarDadosLogone, registrarSync } from "@/lib/sync-service";

// ── GET — status dos últimos syncs (para o painel) ──────────
export async function GET(req: NextRequest) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await sb
    .from("vw_sync_resumo")
    .select("*")
    .limit(10);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ historico: data });
}

// ── POST — dispara um sync (manual ou cron) ─────────────────
export async function POST(req: NextRequest) {
  // Valida o segredo (protege contra chamadas não autorizadas)
  const auth = req.headers.get("authorization");
  const cronSecret = `Bearer ${process.env.CRON_SECRET}`;
  const isManual = req.headers.get("x-disparado-por") === "manual";

  if (!isManual && auth !== cronSecret) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const disparadoPor = isManual ? "manual" : "cron";
  console.log(`[Sync] Iniciando sync ${disparadoPor}...`);

  // Cria registro no log
  const syncId = await registrarSync({
    status: "iniciado",
    disparado_por: disparadoPor,
  });

  try {
    // 1. Busca dados do Logone via tgsa-ai
    const { dados, rawJson } = await buscarDadosLogone(3);

    // 2. Grava no Supabase
    const resultado = await gravarDadosLogone(dados);

    // 3. Atualiza log com resultado
    const status =
      resultado.erros.length > 0 && resultado.entradas_gravadas === 0 && resultado.saidas_gravadas === 0
        ? "erro"
        : resultado.erros.length > 0
        ? "parcial"
        : "sucesso";

    await registrarSync({
      id: syncId,
      status,
      periodo_de: dados.periodo.de,
      periodo_ate: dados.periodo.ate,
      entradas_gravadas: resultado.entradas_gravadas,
      saidas_gravadas: resultado.saidas_gravadas,
      registros_duplicados: resultado.duplicados,
      erro_mensagem: resultado.erros.length > 0 ? resultado.erros.join("; ") : undefined,
      resposta_raw: rawJson,
    });

    console.log(
      `[Sync] Concluído — ${resultado.entradas_gravadas} entradas, ${resultado.saidas_gravadas} saídas, ${resultado.duplicados} duplicados`
    );

    return NextResponse.json({
      ok: true,
      sync_id: syncId,
      status,
      entradas_gravadas: resultado.entradas_gravadas,
      saidas_gravadas: resultado.saidas_gravadas,
      duplicados: resultado.duplicados,
      erros: resultado.erros,
      periodo: dados.periodo,
    });
  } catch (err: any) {
    const mensagem = err?.message ?? String(err);
    console.error("[Sync] Erro:", mensagem);

    await registrarSync({
      id: syncId,
      status: "erro",
      erro_mensagem: mensagem,
    });

    return NextResponse.json(
      { ok: false, sync_id: syncId, erro: mensagem },
      { status: 500 }
    );
  }
}
