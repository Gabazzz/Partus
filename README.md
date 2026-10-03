# Partus

Webapp de controle de despesas compartilhadas da casa.

- React + Vite + Supabase + Framer Motion
- Seleção de perfil (estilo Netflix) com foto, perfil admin protegido por senha
- Divisão automática: 1/3 / 2/3
- Admin gerencia moradores: criar, editar nome, foto e emoji, excluir
- "Esqueci minha senha" do admin: código de 6 dígitos enviado por e-mail
- Visual premium: tema escuro com dourado, números animados, transições suaves
- Instalável (PWA): ícone na tela inicial, abre em tela cheia, visual disponível offline

## Instalando no celular ou computador

O app precisa estar publicado em **HTTPS** (Vercel, Netlify, Cloudflare Pages...). Em `localhost` o navegador também permite testar.

1. Publique a pasta gerada por `npm run build` (`dist`), configurando as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel da hospedagem.
2. Abra o endereço no celular:
   - **Android (Chrome) e computador (Chrome/Edge):** toque em **Instalar app** na tela de perfis (ou no rodapé da tela inicial), ou use o menu do navegador.
   - **iPhone (Safari):** toque em **Compartilhar → Adicionar à Tela de Início**. O botão **Instalar app** mostra o passo a passo.
3. O app atualiza sozinho quando você publica uma nova versão.

Só o visual fica salvo para uso offline; os lançamentos sempre vêm do Supabase, então precisam de internet.

## Rodando

```bash
npm install
npm run dev
```

Variáveis em `.env` (ou `.env.local`): `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Configuração do backend (uma vez)

### 1. Migração SQL

Rode `supabase/migrations/002_gestao_moradores_e_recuperacao.sql` no SQL Editor do Supabase.

Antes, ajuste os dois **adaptadores** no começo do arquivo para o seu esquema atual:

- `partus_exigir_admin(p_token)`: mesma checagem de token usada em `listar_despesas` / `editar_despesa` (deve lançar `Sem permissão` se inválido).
- `partus_gravar_senha(p_morador, p_senha)`: grava a senha do mesmo jeito que `entrar_admin` confere.

O arquivo também assume a tabela `public.moradores` com `id`, `nome`, `avatar`, `is_admin`.

### 2. E-mail de recuperação

O código é sempre enviado para `gabrielbtten@gmail.com` (fixo em `supabase/functions/recuperar-senha/index.ts`; o app não escolhe o destinatário).

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase functions deploy recuperar-senha
```

Usa o [Resend](https://resend.com). Sem domínio verificado, o remetente `onboarding@resend.dev` só entrega para o e-mail dono da conta Resend, então crie a conta com `gabrielbtten@gmail.com` (ou verifique um domínio e troque o `from`).

Segurança do código: só o hash fica no banco, vale 15 minutos, 5 tentativas, 1 pedido por minuto e no máximo 5 por hora.

## Fotos

As fotos são recortadas em quadrado e reduzidas a 320 px no navegador antes de salvar (ficam na coluna `moradores.foto`, sem precisar configurar Storage).
