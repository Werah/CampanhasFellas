# CampanhasFellas

Site do grupo para organizar as campanhas de RPG: cronograma, campanhas e fellas.

- **Páginas:** HTML, CSS e JavaScript puro, hospedadas de graça no **GitHub Pages**.
- **Dados, login e imagens:** no **Supabase** (Postgres na nuvem, plano grátis).

Não tem servidor próprio: o navegador conversa direto com o Supabase, e quem protege os dados
são as regras de segurança do banco (`supabase/schema.sql`).

## Estrutura

```
index.html, home.html, ...   páginas
css/style.css                visual
js/config.js                 URL e chave pública do Supabase + login do grupo
js/banco.js                  login, leitura/gravação no Supabase, imagens (função api())
js/api.js                    ajudantes de tela (d20, campo de imagem, topo)
js/<pagina>.js               lógica de cada página
supabase/schema.sql          tabelas, regras e segurança (rodar no Supabase)
.github/workflows/           tarefa que mantém o Supabase acordado
```

## Como colocar no ar (uma vez só)

### 1. Supabase

1. Crie uma conta em https://supabase.com e um **New project**
   (região *South America (São Paulo)*; guarde a senha do banco que ele pedir).
2. Vá em **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Vá em **Authentication → Users → Add user → Create new user**:
   - E-mail: `fellas@fellas.com`
   - Senha: a senha do grupo (ex.: `RougarThar`)
   - Marque **Auto Confirm User**
4. Vá em **Authentication → Sign In / Providers** e **desligue "Allow new users to sign up"**
   (o banco já bloqueia qualquer outro usuário, isso é só uma trava a mais).
5. Vá em **Project Settings → API** (ou *API Keys*) e copie:
   - **Project URL**
   - a chave **anon public** (ou **publishable**). *Nunca* a `service_role` / `secret`.
6. Cole os dois em `js/config.js`.

### 2. GitHub Pages

1. Crie um repositório **público** no GitHub (ex.: `campanhasfellas`) e envie estes arquivos.
2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   escolha `main` e `/ (root)` e clique em **Save**.
3. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/campanhasfellas/`.

Para atualizar o site depois, é só enviar as mudanças (`git push`).

## Login

A tela pede **Fellas** + a senha do grupo. Por baixo, entra no Supabase com o e-mail
configurado em `js/config.js` (`loginEmail`). Para trocar a senha: Supabase →
Authentication → Users → o usuário → *Reset password* / editar.

Se quiser usar outro e-mail, troque em **dois lugares**: `js/config.js` e a função
`eh_do_grupo()` em `supabase/schema.sql` (e rode o SQL de novo).

## Regras

- Uma sessão conta como "jogada" quando a data dela já chegou (horário de Brasília).
- Campanha com pelo menos uma sessão jogada não pode ser excluída (marque como inativa).
- Excluir uma campanha apaga junto as sessões, personagens e itens do baú dela.
- Excluir um fella tira ele das campanhas e dos personagens.

## Supabase grátis: pausa por falta de uso

O plano grátis pausa o projeto depois de **1 semana sem nenhum acesso**. O workflow
`.github/workflows/manter-supabase-ativo.yml` chama o banco a cada 3 dias para evitar isso.

- Para testar: aba **Actions → Manter Supabase ativo → Run workflow**.
- O GitHub desliga tarefas agendadas em repositórios sem nenhuma mudança por 60 dias;
  se chegar um e-mail avisando, é só reativar na aba Actions.
- Se mesmo assim pausar, entre no painel do Supabase e clique em **Restore project**.

## Testar no próprio PC

As páginas precisam ser abertas por um servidor (não direto pelo arquivo):

```bash
python -m http.server 5500
```

E abra http://localhost:5500. Os dados são os mesmos do Supabase de verdade.
