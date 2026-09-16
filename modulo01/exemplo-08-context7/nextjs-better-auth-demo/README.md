# Demo Next.js + Better Auth + GitHub OAuth + SQLite

Demo extremamente simples de autenticação com GitHub usando Better Auth, Next.js (App Router) e SQLite.

## 🚀 Funcionalidades

- ✅ Login/Signup via GitHub OAuth
- ✅ Página Home mostrando estado da sessão
- ✅ Persistência local com SQLite
# Demo Next.js + Better Auth + GitHub OAuth + SQLite

Demo minimo de autenticacao GitHub com Next.js App Router, Better Auth,
`better-sqlite3` e Tailwind CSS.

## Pre-requisitos

- Node.js 20+ e npm
- Uma GitHub OAuth App

Na GitHub OAuth App, use `http://127.0.0.1:3000` como homepage e
`http://127.0.0.1:3000/api/auth/callback/github` como callback URL.

## Configuracao

1. Copie `.env.example` para `.env.local`.
2. Preencha `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`.
3. Defina `BETTER_AUTH_SECRET` com um segredo local de pelo menos 32 caracteres.

## Comandos

```bash
npm install
npx @better-auth/cli migrate
npm run dev
```

Abra http://localhost:3000. O banco `better-auth.sqlite` e local e persistido.

O CLI atual do Better Auth tambem aceita `npx auth@latest migrate`; este projeto
mantem `@better-auth/cli` instalado para seguir o comando solicitado no demo.

## Estrutura

```text
app/api/auth/[...all]/route.ts  # endpoints Better Auth
app/login/page.tsx              # login GitHub
app/page.tsx                    # estado da sessao e logout
lib/auth.ts                     # Better Auth + SQLite
lib/auth-client.ts              # cliente React
```

