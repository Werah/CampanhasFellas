exigirLogin();
montarTopo('Campanhas');

const campanhaId = new URLSearchParams(window.location.search).get('id');
if (!campanhaId) window.location.href = 'campanhas.html';

const agora = new Date();
const HOJE = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

let campanha = null;
let fellas = [];
let personagens = [];
let sessoes = [];
let itens = [];
let abaAtual = 'descricao';

async function carregar() {
  const q = `?campanhaId=${campanhaId}`;
  try {
    [campanha, fellas, personagens, sessoes, itens] = await Promise.all([
      api('GET', `/campanhas/${campanhaId}`),
      api('GET', '/fellas'),
      api('GET', `/personagens${q}`),
      api('GET', `/sessoes${q}`),
      api('GET', `/itens${q}`),
    ]);
  } catch (e) {
    document.querySelector('.campanha-tela').innerHTML = `<p class="vazio" style="margin: 24px;">${esc(e.message)} — <a href="campanhas.html">voltar</a></p>`;
    return;
  }
  document.title = `${campanha.nome} - CampanhasFellas`;
  fellas.sort((a, b) => a.nick.localeCompare(b.nick));
  personagens.sort((a, b) => a.nome.localeCompare(b.nome));
  sessoes.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  itens.sort((a, b) => a.nome.localeCompare(b.nome));
  desenhar();
}

function nickFella(id) {
  const f = fellas.find(x => x.id === id);
  return f ? f.nick : '';
}

function desenhar() {
  desenharBanner();
  desenharPersonagens();
  desenharAba();
}

function desenharBanner() {
  const c = campanha;
  const jogadores = c.jogadores.map(nickFella).filter(Boolean).join(', ');
  document.getElementById('banner').innerHTML = `
    ${capaCampanha(c)}
    <a class="voltar" href="campanhas.html">← Campanhas</a>
    <div class="sobre-banner">
      <div class="linha-titulo" style="justify-content: flex-start; gap: 12px;">
        <h1>${esc(c.nome)}</h1>
        <span class="selo ${c.status}">${c.status === 'ativa' ? 'Ativa' : 'Inativa'}</span>
      </div>
      <p class="info">
        ${c.sistema ? `🎲 ${esc(c.sistema)} · ` : ''}👑 ${esc(nickFella(c.mestreId)) || '—'}
        · 🛡 ${esc(jogadores) || '—'} · 📅 ${c.sessoesJogadas} sessão(ões) jogada(s)
      </p>
    </div>
  `;
}

function iniciais(nome) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function desenharPersonagens() {
  const lista = document.getElementById('lista-personagens');
  if (personagens.length === 0) {
    lista.innerHTML = '<p class="vazio" style="padding: 20px 10px;">Nenhum personagem ainda.</p>';
    return;
  }
  lista.innerHTML = personagens.map(p => `
    <div class="personagem" data-id="${p.id}"
         style="--cor: ${esc(campanha.cor)}; ${p.imagem ? `--img: url('${urlImagem(p.imagem)}')` : ''}">
      ${p.imagem ? '' : `<span class="marca-dagua">${esc(iniciais(p.nome))}</span>`}
      <strong>${esc(p.nome)}</strong>
      <small>${[esc(p.classe), esc(nickFella(p.fellaId))].filter(Boolean).join(' · ') || '&nbsp;'}</small>
      ${p.descricao ? `<p class="desc">${esc(p.descricao)}</p>` : ''}
    </div>
  `).join('');
}

// ---------- Abas ----------

function desenharAba() {
  const alvo = document.getElementById('conteudo-aba');
  if (abaAtual === 'descricao') {
    alvo.innerHTML = `
      ${campanha.descricao
        ? `<p class="texto-livre">${esc(campanha.descricao)}</p>`
        : '<p class="vazio">Sem descrição ainda.</p>'}
      <button class="pequeno" id="btn-editar-descricao" style="margin-top: 12px;">Editar descrição</button>
    `;
    document.getElementById('btn-editar-descricao').onclick = () => editorDescricao.abrir(campanha);
  }

  if (abaAtual === 'sessoes') {
    // Mais recentes primeiro, numeradas em ordem cronológica
    const numeradas = sessoes.map((s, i) => ({ ...s, numero: i + 1 })).reverse();
    alvo.innerHTML = `
      <div class="painel-titulo">
        <span class="info">${sessoes.length} sessão(ões) registrada(s)</span>
        <button class="pequeno primario" id="btn-nova-sessao">+ Nova sessão</button>
      </div>
      ${numeradas.length === 0 ? '<p class="vazio">Nenhuma sessão ainda.</p>' : `
        <ul class="lista-sessoes" style="--cor: ${esc(campanha.cor)}">
          ${numeradas.map(s => `
            <li data-id="${s.id}" class="${s.data > HOJE ? 'futura' : ''}">
              <div class="cabeca">
                <strong>Sessão ${s.numero}${s.data > HOJE ? ' (agendada)' : ''}</strong>
                <span>${formatarData(s.data)}${s.hora ? ' · ' + s.hora : ''}</span>
              </div>
              ${s.resumo
                ? `<p>${esc(s.resumo)}</p>`
                : `<p class="sem-resumo">${s.data > HOJE ? 'Ainda vai acontecer.' : 'Sem resumo — clique para contar o que aconteceu.'}</p>`}
            </li>
          `).join('')}
        </ul>
      `}
    `;
    document.getElementById('btn-nova-sessao').onclick = () => editorSessao.abrir();
    alvo.querySelectorAll('.lista-sessoes li').forEach(li => {
      li.onclick = () => editorSessao.abrir(sessoes.find(s => s.id === li.dataset.id));
    });
  }

  if (abaAtual === 'bau') {
    alvo.innerHTML = `
      <div class="painel-titulo">
        <span class="info">${itens.length} item(ns) no baú</span>
        <button class="pequeno primario" id="btn-novo-item">+ Novo item</button>
      </div>
      ${itens.length === 0 ? '<p class="vazio">O baú está vazio.</p>' : `
        <table class="tabela-bau">
          <thead><tr><th>Qtd.</th><th>Item</th><th></th></tr></thead>
          <tbody>
            ${itens.map(i => `
              <tr>
                <td class="qtd">${i.quantidade}</td>
                <td>${esc(i.nome)}${i.descricao ? `<div class="desc-item">${esc(i.descricao)}</div>` : ''}</td>
                <td class="acoes-item"><button class="pequeno" data-id="${i.id}">Editar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    `;
    document.getElementById('btn-novo-item').onclick = () => editorItem.abrir();
    alvo.querySelectorAll('.tabela-bau button').forEach(b => {
      b.onclick = () => editorItem.abrir(itens.find(i => i.id === b.dataset.id));
    });
  }
}

document.getElementById('abas').addEventListener('click', (e) => {
  const botao = e.target.closest('button');
  if (!botao) return;
  abaAtual = botao.dataset.aba;
  document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('ativo', b === botao));
  desenharAba();
});

// ---------- Modais ----------

/**
 * Liga um <dialog> com formulário a uma coleção da API.
 * abrir(item) edita o item; abrir() cria um novo.
 */
function criarEditor(idModal, { colecao, titulos, preencher, coletar, nomeItem, depoisDeSalvar }) {
  const modal = document.getElementById(idModal);
  const form = modal.querySelector('form');
  const erro = modal.querySelector('.erro');
  const titulo = modal.querySelector('.titulo-modal');
  const btnExcluir = modal.querySelector('.btn-excluir');
  let editando = null;

  async function salvar(acao) {
    try {
      await acao();
      modal.close();
      await carregar();
    } catch (e) {
      erro.textContent = e.message;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = { campanhaId, ...coletar(form) };
    salvar(async () => {
      const salvo = editando
        ? await api('PUT', `/${colecao}/${editando.id}`, dados)
        : await api('POST', `/${colecao}`, dados);
      if (depoisDeSalvar) await depoisDeSalvar(salvo);
    });
  });

  modal.querySelector('.btn-cancelar').addEventListener('click', () => modal.close());

  if (btnExcluir) {
    btnExcluir.addEventListener('click', () => {
      if (!confirm(`Excluir ${nomeItem(editando)}?`)) return;
      salvar(() => api('DELETE', `/${colecao}/${editando.id}`));
    });
  }

  return {
    abrir(item) {
      editando = item || null;
      form.reset();
      erro.textContent = '';
      if (titulo) titulo.textContent = editando ? titulos[1] : titulos[0];
      if (btnExcluir) btnExcluir.style.display = editando ? '' : 'none';
      preencher(form, editando);
      modal.showModal();
    },
  };
}

// Altura das barras de personagem, em fração da altura da tela (igual ao CSS)
const BARRA_FECHADA = 0.10;
const BARRA_ABERTA = 0.15;

// O recorte tem o formato da barra aberta: largura da coluna de personagens x 15% da tela.
// A faixa tracejada no meio mostra o que aparece com a barra fechada (10% da tela).
const campoImagemPersonagem = ligarCampoImagem(
  document.getElementById('campo-imagem-personagem'),
  () => `<div class="sem-imagem" style="--cor: ${esc(campanha.cor)}">${D20_SVG}</div>`,
  {
    proporcao: () => document.querySelector('.coluna-personagens').getBoundingClientRect().width
      / (window.innerHeight * BARRA_ABERTA),
    faixaVisivel: BARRA_FECHADA / BARRA_ABERTA,
  },
);

const editorPersonagem = criarEditor('modal-personagem', {
  colecao: 'personagens',
  titulos: ['Novo personagem', 'Editar personagem'],
  nomeItem: p => `o personagem ${p.nome}`,
  depoisDeSalvar: p => campoImagemPersonagem.salvar('personagens', p.id),
  preencher(form, p) {
    campoImagemPersonagem.iniciar(p ? p.imagem : '');
    // Jogadores da campanha primeiro, depois o resto
    const daCampanha = fellas.filter(f => campanha.jogadores.includes(f.id) || f.id === campanha.mestreId);
    const outros = fellas.filter(f => !daCampanha.includes(f));
    const opcoes = lista => lista.map(f => `<option value="${f.id}">${esc(f.nick)}</option>`).join('');
    form.fellaId.innerHTML = '<option value="">— Ninguém (NPC) —</option>' +
      (daCampanha.length ? `<optgroup label="Da campanha">${opcoes(daCampanha)}</optgroup>` : '') +
      (outros.length ? `<optgroup label="Outros fellas">${opcoes(outros)}</optgroup>` : '');
    if (p) {
      form.nome.value = p.nome;
      form.classe.value = p.classe;
      form.fellaId.value = p.fellaId;
      form.descricao.value = p.descricao;
    }
  },
  coletar: form => ({
    nome: form.nome.value,
    classe: form.classe.value,
    fellaId: form.fellaId.value,
    descricao: form.descricao.value,
  }),
});

const editorSessao = criarEditor('modal-sessao', {
  colecao: 'sessoes',
  titulos: ['Nova sessão', 'Editar sessão'],
  nomeItem: s => `a sessão de ${formatarData(s.data)}`,
  preencher(form, s) {
    form.data.value = s ? s.data : HOJE;
    if (s) {
      form.hora.value = s.hora;
      form.resumo.value = s.resumo || '';
      form.notas.value = s.notas;
    }
  },
  coletar: form => ({
    data: form.data.value,
    hora: form.hora.value,
    resumo: form.resumo.value,
    notas: form.notas.value,
  }),
});

const editorItem = criarEditor('modal-item', {
  colecao: 'itens',
  titulos: ['Novo item', 'Editar item'],
  nomeItem: i => `"${i.nome}" do baú`,
  preencher(form, i) {
    if (i) {
      form.nome.value = i.nome;
      form.quantidade.value = i.quantidade;
      form.descricao.value = i.descricao;
    }
  },
  coletar: form => ({
    nome: form.nome.value,
    quantidade: form.quantidade.value,
    descricao: form.descricao.value,
  }),
});

// A descrição é um campo da própria campanha
const modalDescricao = document.getElementById('modal-descricao');
const editorDescricao = {
  abrir(c) {
    const form = modalDescricao.querySelector('form');
    form.descricao.value = c.descricao;
    modalDescricao.querySelector('.erro').textContent = '';
    modalDescricao.showModal();
  },
};
modalDescricao.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('PUT', `/campanhas/${campanhaId}`, { descricao: e.target.descricao.value });
    modalDescricao.close();
    await carregar();
  } catch (err) {
    modalDescricao.querySelector('.erro').textContent = err.message;
  }
});
modalDescricao.querySelector('.btn-cancelar').addEventListener('click', () => modalDescricao.close());

document.getElementById('btn-novo-personagem').addEventListener('click', () => editorPersonagem.abrir());
document.getElementById('lista-personagens').addEventListener('click', (e) => {
  const el = e.target.closest('.personagem');
  if (el) editorPersonagem.abrir(personagens.find(p => p.id === el.dataset.id));
});

carregar();
