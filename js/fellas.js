exigirLogin();
montarTopo('Fellas');

const modal = document.getElementById('modal');
const form = document.getElementById('form');
const erro = document.getElementById('erro');

let fellas = [];
let campanhas = [];
let personagens = [];
let editandoId = null;

async function carregar() {
  [fellas, campanhas, personagens] = await Promise.all([
    api('GET', '/fellas'), api('GET', '/campanhas'), api('GET', '/personagens'),
  ]);
  fellas.sort((a, b) => a.nick.localeCompare(b.nick));
  desenhar();
}

function campanhasDoFella(id) {
  return campanhas.filter(c => c.mestreId === id || c.jogadores.includes(id));
}

function nomeCampanha(id) {
  const c = campanhas.find(x => x.id === id);
  return c ? c.nome : '';
}

function desenhar() {
  const lista = document.getElementById('lista');
  if (fellas.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhum fella cadastrado ainda.</p>';
    return;
  }
  lista.innerHTML = fellas.map(f => {
    const camps = campanhasDoFella(f.id)
      .map(c => esc(c.nome) + (c.mestreId === f.id ? ' (mestre)' : ''))
      .join(', ');
    const pers = personagens
      .filter(p => p.fellaId === f.id)
      .map(p => `${esc(p.nome)} <span class="info">(${esc(nomeCampanha(p.campanhaId))})</span>`)
      .join(', ');
    return `
      <div class="card">
        <h3>${esc(f.nick)}</h3>
        <p class="info">📜 ${camps || 'Nenhuma campanha'}</p>
        ${pers ? `<p class="info">🧙 ${pers}</p>` : ''}
        ${f.observacoes ? `<p class="descricao">${esc(f.observacoes)}</p>` : ''}
        <div class="acoes">
          <button class="pequeno" onclick="abrir('${f.id}')">Editar</button>
          <button class="pequeno perigo" onclick="excluir('${f.id}')">Excluir</button>
        </div>
      </div>
    `;
  }).join('');
}

function abrir(id) {
  editandoId = id || null;
  form.reset();
  erro.textContent = '';
  document.getElementById('titulo-modal').textContent = id ? 'Editar fella' : 'Novo fella';
  if (id) {
    const f = fellas.find(x => x.id === id);
    form.nick.value = f.nick;
    form.observacoes.value = f.observacoes;
  }
  modal.showModal();
}

async function excluir(id) {
  const f = fellas.find(x => x.id === id);
  const camps = campanhasDoFella(id);
  let msg = `Excluir ${f.nick}?`;
  if (camps.length) msg += `\n\nEle(a) será removido(a) de: ${camps.map(c => c.nome).join(', ')}`;
  if (!confirm(msg)) return;
  try {
    await api('DELETE', `/fellas/${id}`);
    await carregar();
  } catch (e) {
    alert(e.message);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = {
    nick: form.nick.value,
    observacoes: form.observacoes.value,
  };
  try {
    if (editandoId) await api('PUT', `/fellas/${editandoId}`, dados);
    else await api('POST', '/fellas', dados);
    modal.close();
    await carregar();
  } catch (e) {
    erro.textContent = e.message;
  }
});

document.getElementById('btn-novo').addEventListener('click', () => abrir());
document.getElementById('btn-cancelar').addEventListener('click', () => modal.close());

carregar();
