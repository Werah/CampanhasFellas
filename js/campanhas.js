exigirLogin();
montarTopo('Campanhas');

const modal = document.getElementById('modal');
const form = document.getElementById('form');
const erro = document.getElementById('erro');
const campoImagem = ligarCampoImagem(
  document.getElementById('campo-imagem'),
  () => `<div class="sem-imagem" style="--cor: ${esc(form.cor.value)}">${D20_SVG}</div>`,
);

let campanhas = [];
let fellas = [];
let filtro = 'todas';
let editandoId = null;

async function carregar() {
  [campanhas, fellas] = await Promise.all([api('GET', '/campanhas'), api('GET', '/fellas')]);
  fellas.sort((a, b) => a.nick.localeCompare(b.nick));
  // Ativas primeiro, depois por nome
  campanhas.sort((a, b) => (a.status === b.status ? a.nome.localeCompare(b.nome) : a.status === 'ativa' ? -1 : 1));
  desenhar();
}

function nickFella(id) {
  const f = fellas.find(x => x.id === id);
  return f ? f.nick : '';
}

function desenhar() {
  const lista = document.getElementById('lista');
  const visiveis = campanhas.filter(c => filtro === 'todas' || c.status === filtro);
  if (visiveis.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhuma campanha por aqui.</p>';
    return;
  }
  lista.innerHTML = visiveis.map(c => {
    const jogadores = c.jogadores.map(nickFella).filter(Boolean).join(', ');
    const agendadas = c.sessoesTotal - c.sessoesJogadas;
    const podeExcluir = c.sessoesJogadas === 0;
    return `
      <a class="card campanha clicavel" href="campanha.html?id=${c.id}" style="--cor: ${esc(c.cor)}">
        ${capaCampanha(c)}
        <div class="corpo-card">
          <div class="linha-titulo">
            <h3>${esc(c.nome)}</h3>
            <span class="selo ${c.status}">${c.status === 'ativa' ? 'Ativa' : 'Inativa'}</span>
          </div>
          ${c.sistema ? `<p class="info">🎲 ${esc(c.sistema)}</p>` : ''}
          <p class="info">👑 Mestre: ${esc(nickFella(c.mestreId)) || '—'}</p>
          <p class="info">🛡 Jogadores: ${esc(jogadores) || '—'}</p>
          <p class="info">📅 <strong>${c.sessoesJogadas}</strong> sessão(ões) jogada(s)${agendadas > 0 ? ` · ${agendadas} agendada(s)` : ''}</p>
          <div class="acoes" onclick="event.preventDefault()">
            <button class="pequeno" onclick="abrir('${c.id}')">Editar</button>
            <span ${podeExcluir ? '' : 'title="Já teve sessões, não pode ser excluída"'}>
              <button class="pequeno perigo" onclick="excluir('${c.id}')" ${podeExcluir ? '' : 'disabled'}>Excluir</button>
            </span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

function preencherFellas(mestreId, jogadores) {
  const selMestre = document.getElementById('sel-mestre');
  selMestre.innerHTML = '<option value="">— Ninguém —</option>' +
    fellas.map(f => `<option value="${f.id}">${esc(f.nick)}</option>`).join('');
  selMestre.value = mestreId || '';

  const lista = document.getElementById('lista-jogadores');
  lista.innerHTML = fellas.length === 0
    ? '<span class="info">Cadastre fellas primeiro na aba Fellas.</span>'
    : fellas.map(f => `
        <label><input type="checkbox" value="${f.id}" ${jogadores.includes(f.id) ? 'checked' : ''}> ${esc(f.nick)}</label>
      `).join('');
}

function abrir(id) {
  editandoId = id || null;
  form.reset();
  erro.textContent = '';
  document.getElementById('titulo-modal').textContent = id ? 'Editar campanha' : 'Nova campanha';
  const c = id ? campanhas.find(x => x.id === id) : null;
  if (c) {
    form.nome.value = c.nome;
    form.sistema.value = c.sistema;
    form.status.value = c.status;
    form.cor.value = c.cor;
    form.descricao.value = c.descricao;
  }
  preencherFellas(c ? c.mestreId : '', c ? c.jogadores : []);
  campoImagem.iniciar(c ? c.imagem : '');
  modal.showModal();
}

async function excluir(id) {
  const c = campanhas.find(x => x.id === id);
  let msg = `Excluir a campanha "${c.nome}"?`;
  if (c.sessoesTotal > 0) msg += `\n\nAs ${c.sessoesTotal} sessão(ões) agendada(s) também serão removidas.`;
  if (!confirm(msg)) return;
  try {
    await api('DELETE', `/campanhas/${id}`);
    await carregar();
  } catch (e) {
    alert(e.message);
  }
}

form.cor.addEventListener('input', () => campoImagem.desenhar());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = {
    nome: form.nome.value,
    sistema: form.sistema.value,
    status: form.status.value,
    mestreId: form.mestreId.value,
    cor: form.cor.value,
    descricao: form.descricao.value,
    jogadores: [...document.querySelectorAll('#lista-jogadores input:checked')].map(i => i.value),
  };
  try {
    const salva = editandoId
      ? await api('PUT', `/campanhas/${editandoId}`, dados)
      : await api('POST', '/campanhas', dados);
    await campoImagem.salvar('campanhas', salva.id);
    modal.close();
    await carregar();
  } catch (e) {
    erro.textContent = e.message;
  }
});

document.getElementById('filtros').addEventListener('click', (e) => {
  const botao = e.target.closest('button');
  if (!botao) return;
  filtro = botao.dataset.filtro;
  document.querySelectorAll('#filtros button').forEach(b => b.classList.toggle('ativo', b === botao));
  desenhar();
});

document.getElementById('btn-novo').addEventListener('click', () => abrir());
document.getElementById('btn-cancelar').addEventListener('click', () => modal.close());

carregar();
