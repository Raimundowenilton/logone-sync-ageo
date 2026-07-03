// =============================================================
// app/api/lineup-proxy/route.ts  —  logone-sync-ageo
// Next.js App Router — Route Handler (TypeScript)
//
// Busca o lineup público da TGSA e retorna JSON estruturado
// para o frontend AGEO em tempo real.
//
// URL de acesso após deploy:
// https://logone-sync-ageo.vercel.app/api/lineup-proxy
// =============================================================

import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const SOURCE_URL = 'https://tgsa.bluemarble.com.br/lineup/lineup-dashboard';

export const revalidate = 120; // cache ISR de 2 minutos na Vercel

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'AGEO-Lineup-Proxy/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      next: { revalidate: 120 }, // cache Next.js fetch
    });

    if (!response.ok) {
      throw new Error(`Fonte respondeu HTTP ${response.status}`);
    }

    const html = await response.text();
    const $    = cheerio.load(html);
    const tabelas = $('table');

    // ── NAVIOS ────────────────────────────────────────────────
    const navios: NavioItem[] = [];
    tabelas.eq(0).find('tr').slice(1).each((_, tr) => {
      const cols = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
      if (!cols[3] || cols[3] === '') return; // linha vazia / sub-cliente

      navios.push({
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
      });
    });

    // ── BARCAÇAS ──────────────────────────────────────────────
    const barcacas: BarcacaItem[] = [];
    tabelas.eq(1).find('tr').slice(1).each((_, tr) => {
      const cols = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
      if (!cols[4] || cols[4] === '') return;

      barcacas.push({
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
      });
    });

    // Backlog = barcaças em trânsito + fundeio
    const backlog = barcacas.filter(b =>
      ['em_transito', 'fundeio'].includes(b.status_op)
    ).length;

    return NextResponse.json(
      {
        navios,
        barcacas,
        backlog,
        total_navios:   navios.length,
        total_barcacas: barcacas.length,
        fonte:          SOURCE_URL,
        atualizado:     new Date().toISOString(),
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 's-maxage=120, stale-while-revalidate=60',
        },
      }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[lineup-proxy] Erro:', msg);

    return NextResponse.json(
      { error: 'Falha ao buscar lineup', detalhe: msg },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }
    );
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

// ── TIPOS ─────────────────────────────────────────────────────
interface NavioItem {
  status:          string;
  status_label:    string | null;
  quinzena:        string | null;
  numero_carga:    string | null;
  nome:            string | null;
  ets_fazendinha:  string | null;
  nor:             string | null;
  queue_day:       string | null;
  eta:             string | null;
  etb:             string | null;
  ets:             string | null;
  cliente:         string | null;
  volume_previsto: number;
  produto:         string | null;
  agentes:         string | null;
  destino:         string | null;
}

interface BarcacaItem {
  status_op:    string;
  status_label: string | null;
  eta:          string | null;
  etb:          string | null;
  ets:          string | null;
  nome:         string | null;
  cliente_nome: string | null;
  produto:      string | null;
  volume_ton:   number;
  qtd_bgs:      number;
}

// ── HELPERS ───────────────────────────────────────────────────

/** "DD/MM/YY HH:MM" → "YYYY-MM-DDTHH:MM:00" | null */
function parseDT(str: string | undefined): string | null {
  if (!str || str === '-' || str.trim() === '') return null;
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  const ano = y.length === 2 ? '20' + y : y;
  return `${ano}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h}:${mi}:00`;
}

/** "1.234,56" → 1234.56 */
function parseNum(str: string | undefined): number {
  if (!str || str === '-' || str.trim() === '') return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function normalizaStatusNavio(str: string | undefined): string {
  const s = semAcento(str?.toLowerCase() ?? '');
  if (s.includes('berthed') || s.includes('atracado'))  return 'atracado';
  if (s.includes('loading') || s.includes('carregando')) return 'carregando';
  if (s.includes('waiting') || s.includes('fundeio'))   return 'fundeio';
  return 'previsto';
}

function normalizaStatusBG(str: string | undefined): string {
  const s = semAcento(str?.toLowerCase() ?? '');
  if (s.includes('transito') || s.includes('andamento')) return 'em_transito';
  if (s.includes('fundeio'))                              return 'fundeio';
  if (s.includes('concluido') || s.includes('descarregado')) return 'concluido';
  return 'previsto';
}

function semAcento(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
