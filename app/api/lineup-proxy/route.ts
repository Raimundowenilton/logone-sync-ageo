// app/api/lineup-proxy/route.ts
// Sem dependência de cheerio — parsing via regex nativo

import { NextResponse } from 'next/server';

const SOURCE_URL = 'https://tgsa.bluemarble.com.br/lineup/lineup-dashboard';

export const revalidate = 120;

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: { 'User-Agent': 'AGEO-Lineup-Proxy/1.0' },
      next: { revalidate: 120 },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();

    // Extrai todas as <table>...</table>
    const tables = extractTables(html);

    const navios   = parseNavios(tables[0]   ?? '');
    const barcacas = parseBarcacas(tables[1] ?? '');

    const backlog = barcacas.filter(b =>
      ['em_transito', 'fundeio'].includes(b.status_op)
    ).length;

    return NextResponse.json(
      { navios, barcacas, backlog, total_navios: navios.length,
        total_barcacas: barcacas.length, fonte: SOURCE_URL,
        atualizado: new Date().toISOString() },
      { headers: { 'Access-Control-Allow-Origin': '*',
                   'Cache-Control': 's-maxage=120, stale-while-revalidate=60' } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[lineup-proxy]', msg);
    return NextResponse.json(
      { error: 'Falha ao buscar lineup', detalhe: msg },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*',
               'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}

// ── EXTRAÇÃO DE TABELAS ───────────────────────────────────────

function extractTables(html: string): string[] {
  const tables: string[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(html)) !== null) tables.push(m[0]);
  return tables;
}

function extractRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    const cellRe = /<t[dh][\s\S]*?<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[0])) !== null) {
      cells.push(stripTags(cellMatch[0]).trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>').trim();
}

// ── PARSERS ───────────────────────────────────────────────────

function parseNavios(tableHtml: string) {
  const rows = extractRows(tableHtml).slice(1); // pula header
  return rows
    .filter(cols => cols[3] && cols[3] !== '')
    .map(cols => ({
      status:          normalizaStatusNavio(cols[0]),
      status_label:    cols[0]  || null,
      quinzena:        cols[1]  || null,
      numero_carga:    cols[2]  || null,
      nome:            cols[3]  || null,
      ets_fazendinha:  parseDT(cols[4]),
      nor:             parseDT(cols[5]),
      queue_day:       cols[6] && cols[6] !== '-' ? cols[6] : null,
      eta:             parseDT(cols[7]),
      etb:             parseDT(cols[8]),
      ets:             parseDT(cols[9]),
      cliente:         cols[10] || null,
      volume_previsto: parseNum(cols[11]),
      produto:         cols[12] || null,
      agentes:         cols[13] || null,
      destino:         cols[14] || null,
    }));
}

function parseBarcacas(tableHtml: string) {
  const rows = extractRows(tableHtml).slice(1);
  return rows
    .filter(cols => cols[4] && cols[4] !== '')
    .map(cols => ({
      status_op:    normalizaStatusBG(cols[0]),
      status_label: cols[0] || null,
      eta:          parseDT(cols[1]),
      etb:          parseDT(cols[2]),
      ets:          parseDT(cols[3]),
      nome:         cols[4] || null,
      cliente_nome: cols[5] || null,
      produto:      cols[6] || null,
      volume_ton:   parseNum(cols[7]),
      qtd_bgs:      parseInt(cols[8]) || 0,
    }));
}

// ── HELPERS ───────────────────────────────────────────────────

function parseDT(str: string | undefined): string | null {
  if (!str || str === '-' || str.trim() === '') return null;
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  const ano = y.length === 2 ? '20' + y : y;
  return `${ano}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h}:${mi}:00`;
}

function parseNum(str: string | undefined): number {
  if (!str || str === '-' || str.trim() === '') return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function normalizaStatusNavio(str: string | undefined): string {
  const s = semAcento(str?.toLowerCase() ?? '');
  if (s.includes('berthed') || s.includes('atracado'))   return 'atracado';
  if (s.includes('loading') || s.includes('carregando')) return 'carregando';
  if (s.includes('waiting') || s.includes('fundeio'))    return 'fundeio';
  return 'previsto';
}

function normalizaStatusBG(str: string | undefined): string {
  const s = semAcento(str?.toLowerCase() ?? '');
  if (s.includes('transito') || s.includes('andamento'))     return 'em_transito';
  if (s.includes('fundeio'))                                  return 'fundeio';
  if (s.includes('concluido') || s.includes('descarregado')) return 'concluido';
  return 'previsto';
}

function semAcento(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
