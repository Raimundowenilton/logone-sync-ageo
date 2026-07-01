# Assistente IA — Terminal Novo Remanso (AGEO)

App Next.js com IA (Claude) para registro conversacional de operações portuárias.
O usuário fala naturalmente com a IA e ela grava no Supabase automaticamente.

## Como funciona

1. Você fala com a IA: _"Descarregou 3.200t da ADM hoje no 1º turno, barcaça BG-42, comboio VG 078"_
2. A IA extrai os dados da mensagem e chama a ferramenta `registrar_descarga_barcaca`
3. Os dados são gravados direto no Supabase (mesma base do sistema principal)
4. A IA confirma o que foi registrado

**Agendamento automático** (Vercel Cron Jobs):
- 9h BRT (início 1º turno) → Resumo automático
- 14h BRT (início 2º turno) → Resumo automático
- 22h BRT (início 3º turno) → Resumo automático

**Botão manual** → gera um resumo imediato do turno atual.

## Passo a passo para publicar

### 1. Pegar a ANTHROPIC_API_KEY
1. Acesse https://console.anthropic.com
2. Vá em **API Keys** → **Create Key**
3. Copie a chave (começa com `sk-ant-...`)

### 2. Criar o projeto no GitHub
Igual ao que fizemos com o sistema principal — suba esta pasta (terminal-ia) para um novo repositório.

### 3. Publicar no Vercel
1. Vá em https://vercel.com → **Add New → Project**
2. Selecione o repositório `terminal-ia`
3. Em **Environment Variables**, adicione:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ugvabfjueepuhnfdxgec.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_ImSpkQCxNvDHg7nZt4ilOw__3uDGQ1o` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` (sua Service Role Key do Supabase) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (chave que você criou no passo 1) |
| `CRON_SECRET` | qualquer senha forte, ex: `terminal-nr-2026` |

4. Clique em **Deploy**

### 4. Pegar a Service Role Key do Supabase
1. No Supabase → **Settings → API Keys**
2. Em **Secret keys**, clique no olho 👁 para revelar a `sb_secret_...`
3. Copie e cole na variável `SUPABASE_SERVICE_ROLE_KEY` no Vercel

> ⚠️ A Service Role Key dá acesso total ao banco (ignora o RLS).
> NUNCA coloque ela no código ou no repositório público — use somente como variável de ambiente.

### 5. Copiar o logo AGEO
Copie o arquivo `assets/ageo-logo-white.png` do projeto principal
para dentro da pasta `public/` deste projeto (crie a pasta se não existir).

### 6. Ajustar os horários do Cron (opcional)
O arquivo `vercel.json` já está configurado para 9h, 14h e 22h (horário de Brasília).
Para alterar, edite os valores de `schedule` usando formato cron UTC:
- Horário BRT = UTC-3, então subtraia 3h (ou some quando passa da meia-noite)

## Comandos que a IA entende

| O que você fala | O que a IA faz |
|---|---|
| "Descarregou 4.500t da BUNGE hoje" | Registra descarga de 4.500t para BUNGE |
| "O MV ARNICA carregou 12.000t da ADM" | Registra carregamento de 12.000t |
| "Qual o estoque atual?" | Consulta e mostra o saldo por cliente |
| "Quais navios estão programados?" | Lista navios com ETB e volume |
| "Chegou o comboio VG 079 com 18.000t da COFCO" | Registra descarga e comboio |
| "Programa o navio MV NAVIGATOR para ADM, 50.000t, ETB 15/07" | Cadastra o navio |

## Estrutura dos arquivos

```
terminal-ia/
  app/
    page.tsx              → Interface do chat
    layout.tsx            → Layout
    api/
      chat/route.ts       → Endpoint que chama o Claude com ferramentas
      cron/route.ts       → Endpoint do agendamento + botão de refresh
  lib/
    tools.ts              → Definição e execução das ferramentas (gravam no Supabase)
    system-prompt.ts      → Prompt do assistente com contexto atual do terminal
  vercel.json             → Configuração dos Cron Jobs
  public/                 → (criar) colocar ageo-logo-white.png aqui
```
