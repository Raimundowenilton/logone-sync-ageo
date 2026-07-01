import { createClient } from "@supabase/supabase-js";
import type { LogoneData } from "./logone-connector";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type SyncResult = {
  entradas_gravadas: number;
  saidas_gravadas: number;
  duplicados: number;
  erros: string[];
};

// ────────────────────────────────────────────────────────────
// GRAVA OS DADOS DO LOGONE NO SUPABASE
// Evita duplicatas verificando data + cliente + volume
// ────────────────────────────────────────────────────────────
export async function gravarDadosLogone(
  dados: LogoneData
): Promise<SyncResult> {
  const client = sb();
  const resultado: SyncResult = {
    entradas_gravadas: 0,
    saidas_gravadas: 0,
    duplicados: 0,
    erros: [],
  };

  // Busca todos os clientes para mapear nome → id
  const { data: clientes } = await client
    .from("clientes")
    .select("id, nome");
  const clienteMap = new Map(
    (clientes ?? []).map((c: any) => [c.nome.toUpperCase(), c.id])
  );

  // ── ENTRADAS (descargas de barcaças) ──────────────────────
  for (const entrada of dados.entradas) {
    if (entrada.volume_tons <= 0) continue;

    const clienteId = clienteMap.get(entrada.cliente.toUpperCase());
    if (!clienteId) {
      resultado.erros.push(
        `Cliente não encontrado: "${entrada.cliente}" (entrada: ${entrada.identificador})`
      );
      continue;
    }

    const data = entrada.inicio.slice(0, 10);

    // Verifica duplicata: mesmo cliente, data e volume aproximado (±1t)
    const { data: existe } = await client
      .from("descargas_barcacas")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("data", data)
      .gte("qtd_bg", entrada.volume_tons - 1)
      .lte("qtd_bg", entrada.volume_tons + 1)
      .limit(1);

    if (existe && existe.length > 0) {
      resultado.duplicados++;
      continue;
    }

    // Busca ou cria comboio pelo identificador
    let comboioId: string | null = null;
    if (entrada.identificador) {
      const { data: comboioExiste } = await client
        .from("comboios")
        .select("id")
        .ilike("nome", `%${entrada.identificador}%`)
        .limit(1);

      if (comboioExiste?.length) {
        comboioId = comboioExiste[0].id;
      } else {
        const { data: novoComboio } = await client
          .from("comboios")
          .insert({
            nome: entrada.identificador,
            produto: entrada.produto as "soja" | "milho",
            eta: data,
          })
          .select("id")
          .single();
        comboioId = novoComboio?.id ?? null;
      }
    }

    const { error } = await client.from("descargas_barcacas").insert({
      cliente_id: clienteId,
      comboio_id: comboioId,
      data,
      hora: 1,
      numero_bg: entrada.identificador,
      qtd_bg: entrada.volume_tons,
      previsao: false,
    });

    if (error) {
      resultado.erros.push(`Entrada ${entrada.identificador}: ${error.message}`);
    } else {
      resultado.entradas_gravadas++;
    }
  }

  // ── SAÍDAS (carregamentos de navios) ──────────────────────
  for (const saida of dados.saidas) {
    if (saida.volume_tons <= 0) continue;

    const clienteId = clienteMap.get(saida.cliente.toUpperCase());
    if (!clienteId) {
      resultado.erros.push(
        `Cliente não encontrado: "${saida.cliente}" (saída: ${saida.identificador})`
      );
      continue;
    }

    const data = saida.inicio.slice(0, 10);

    // Verifica duplicata
    const { data: existe } = await client
      .from("saidas_navio")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("data", data)
      .gte("volume", saida.volume_tons - 1)
      .lte("volume", saida.volume_tons + 1)
      .limit(1);

    if (existe && existe.length > 0) {
      resultado.duplicados++;
      continue;
    }

    // Busca navio pelo nome
    let navioId: string | null = null;
    if (saida.identificador) {
      const { data: navioExiste } = await client
        .from("navios")
        .select("id")
        .ilike("nome", `%${saida.identificador}%`)
        .limit(1);

      if (navioExiste?.length) {
        navioId = navioExiste[0].id;
      } else {
        // Cria o navio se não existir
        const { data: novoNavio } = await client
          .from("navios")
          .insert({
            nome: saida.identificador,
            cliente_id: clienteId,
            produto: saida.produto as "soja" | "milho",
            volume_previsto: saida.volume_tons,
            status: "concluido",
          })
          .select("id")
          .single();
        navioId = novoNavio?.id ?? null;
      }
    }

    const { error } = await client.from("saidas_navio").insert({
      cliente_id: clienteId,
      navio_id: navioId,
      data,
      volume: saida.volume_tons,
      previsao: false,
    });

    if (error) {
      resultado.erros.push(`Saída ${saida.identificador}: ${error.message}`);
    } else {
      resultado.saidas_gravadas++;
    }
  }

  return resultado;
}

// ────────────────────────────────────────────────────────────
// REGISTRA O SYNC NO LOG
// ────────────────────────────────────────────────────────────
export async function registrarSync(params: {
  status: "iniciado" | "sucesso" | "erro" | "parcial";
  periodo_de?: string;
  periodo_ate?: string;
  entradas_gravadas?: number;
  saidas_gravadas?: number;
  registros_duplicados?: number;
  erro_mensagem?: string;
  resposta_raw?: string;
  disparado_por?: string;
  id?: string;
}): Promise<string> {
  const client = sb();

  if (params.id) {
    // Atualiza registro existente
    await client
      .from("sync_log")
      .update({
        status: params.status,
        concluido_em: new Date().toISOString(),
        entradas_gravadas: params.entradas_gravadas ?? 0,
        saidas_gravadas: params.saidas_gravadas ?? 0,
        registros_duplicados: params.registros_duplicados ?? 0,
        erro_mensagem: params.erro_mensagem ?? null,
        resposta_raw: params.resposta_raw ?? null,
      })
      .eq("id", params.id);
    return params.id;
  }

  // Cria novo registro
  const { data } = await client
    .from("sync_log")
    .insert({
      status: params.status,
      periodo_de: params.periodo_de ?? null,
      periodo_ate: params.periodo_ate ?? null,
      entradas_gravadas: params.entradas_gravadas ?? 0,
      saidas_gravadas: params.saidas_gravadas ?? 0,
      registros_duplicados: params.registros_duplicados ?? 0,
      erro_mensagem: params.erro_mensagem ?? null,
      resposta_raw: params.resposta_raw ?? null,
      disparado_por: params.disparado_por ?? "cron",
    })
    .select("id")
    .single();

  return data?.id ?? "";
}
