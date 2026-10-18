exigirLogin();
montarTopo('Cronograma');

const modal = document.getElementById('modal');
const form = document.getElementById('form');
const erro = document.getElementById('erro');
const btnExcluir = document.getElementById('btn-excluir');
const btnExcluirSerie = document.getElementById('btn-excluir-serie');

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_EXTENSO = ['todo domingo', 'toda segunda-feira', 'toda terça-feira', 'toda quarta-feira',
  'toda quinta-feira', 'toda sexta-feira', 'todo sábado'];

let sessoes = [];
let campanhas = [];
let editandoId = null;

const agora = new Date();
let ano = agora.getFullYear();
let mes = agora.getMonth(); // 0 a 11

function isoDe(a, m, d) {
  return `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const HOJE = isoDe(agora.getFullYear(), agora.getMonth(), agora.getDate());

async function carregar() {
  [sessoes, campanhas] = await Promise.all([api('GET', '/sessoes'), api('GET', '/campanhas')]);
  sessoes.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  desenhar();
}

function campanha(id) {
  return campanhas.find(c => c.id === id) || { nome: '???', cor: '#666666' };
}

function rotuloSessao(s) {
  return (s.hora ? s.hora + ' ' : '') + campanha(s.campanhaId).nome;
}

function desenhar() {
  desenharCalendario();
  desenharProximas();
}

function desenharCalendario() {
  const nomeMes = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  document.getElementById('nome-mes').textContent = nomeMes;

  // Começa no domingo da semana do dia 1 e vai até completar as semanas
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const totalCelulas = Math.ceil((primeiro.getDay() + diasNoMes) / 7) * 7;

  let html = DIAS_SEMANA.map(d => `<div class="dia-semana">${d}</div>`).join('');
  for (let i = 0; i < totalCelulas; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const iso = isoDe(d.getFullYear(), d.getMonth(), d.getDate());
    const classes = ['dia'];
    if (d.getMonth() !== mes) classes.push('fora');
    if (iso === HOJE) classes.push('hoje');

    const eventos = sessoes
      .filter(s => s.data === iso)
      .map(s => `<div class="evento" style="--cor: ${esc(campanha(s.campanhaId).cor)}"
                    data-sessao="${s.id}" title="${esc(rotuloSessao(s))}">${esc(rotuloSessao(s))}</div>`)
      .join('');

    html += `<div class="${classes.join(' ')}" data-data="${iso}">
               <span class="numero">${d.getDate()}</span>${eventos}
             </div>`;
  }
  document.getElementById('calendario').innerHTML = html;
}

function desenharProximas() {
  const lista = document.getElementById('lista-proximas');
  const proximas = sessoes.filter(s => s.data >= HOJE).slice(0, 10);
  if (proximas.length === 0) {
    lista.innerHTML = '<p class="vazio">Nenhuma sessão marcada. Bora marcar uma!</p>';
    return;
  }
  lista.innerHTML = proximas.map(s => {
    const c = campanha(s.campanhaId);
    const diaSemana = DIAS_SEMANA[new Date(s.data + 'T00:00').getDay()];
    return `
      <li style="--cor: ${esc(c.cor)}">
        <span class="quando">${diaSemana}, ${formatarData(s.data)}${s.hora ? ' · ' + s.hora : ''}</span>
        <strong>${esc(c.nome)}</strong>
        ${s.notas ? `<span class="info" style="color: var(--texto-2)">— ${esc(s.notas)}</span>` : ''}
      </li>
    `;
  }).join('');
}

function preencherCampanhas(selecionada) {
  // Só campanhas ativas aparecem, a não ser que a sessão já seja de uma inativa
  const opcoes = campanhas
    .filter(c => c.status === 'ativa' || c.id === selecionada)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const sel = document.getElementById('sel-campanha');
  sel.innerHTML = opcoes.length === 0
    ? '<option value="">Nenhuma campanha ativa</option>'
    : opcoes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if (selecionada) sel.value = selecionada;
}

// Soma dias a uma data "AAAA-MM-DD"
function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Atualiza o "Repetir toda terça-feira" conforme a data escolhida
function atualizarRepetir() {
  if (!form.data.value) return;
  const diaSemana = new Date(`${form.data.value}T12:00:00Z`).getUTCDay();
  document.getElementById('texto-repetir').textContent = DIAS_SEMANA_EXTENSO[diaSemana];
  document.getElementById('opcoes-repetir').hidden = !form.repetir.checked;
  // Por padrão repete por uns 3 meses
  if (!form.ate.value || form.ate.value < form.data.value) form.ate.value = somarDias(form.data.value, 91);
}

function abrir({ id, data }) {
  editandoId = id || null;
  form.reset();
  erro.textContent = '';
  document.getElementById('titulo-modal').textContent = id ? 'Editar sessão' : 'Nova sessão';

  const s = id ? sessoes.find(x => x.id === id) : null;
  btnExcluir.style.display = s ? '' : 'none';
  btnExcluirSerie.style.display = s && s.serieId ? '' : 'none';
  document.getElementById('aviso-serie').hidden = !(s && s.serieId);
  // Repetição só aparece ao criar uma sessão nova
  document.getElementById('bloco-repetir').hidden = !!s;

  preencherCampanhas(s ? s.campanhaId : '');
  form.data.value = s ? s.data : data;
  form.hora.value = s ? s.hora : '';
  form.notas.value = s ? s.notas : '';
  atualizarRepetir();
  modal.showModal();
}

form.data.addEventListener('change', atualizarRepetir);
form.repetir.addEventListener('change', atualizarRepetir);

document.getElementById('calendario').addEventListener('click', (e) => {
  const evento = e.target.closest('.evento');
  if (evento) return abrir({ id: evento.dataset.sessao });
  const dia = e.target.closest('.dia');
  if (dia) abrir({ data: dia.dataset.data });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = {
    campanhaId: form.campanhaId.value,
    data: form.data.value,
    hora: form.hora.value,
    notas: form.notas.value,
  };
  try {
    if (editandoId) {
      await api('PUT', `/sessoes/${editandoId}`, dados);
    } else if (form.repetir.checked) {
      const criadas = await api('POST', '/sessoes/recorrentes', {
        ...dados, intervalo: form.intervalo.value, ate: form.ate.value,
      });
      alert(`${criadas.length} sessões marcadas, até ${formatarData(criadas[criadas.length - 1].data)}.`);
    } else {
      await api('POST', '/sessoes', dados);
    }
    modal.close();
    await carregar();
  } catch (e) {
    erro.textContent = e.message;
  }
});

btnExcluir.addEventListener('click', async () => {
  if (!confirm('Excluir essa sessão?')) return;
  try {
    await api('DELETE', `/sessoes/${editandoId}`);
    modal.close();
    await carregar();
  } catch (e) {
    erro.textContent = e.message;
  }
});

btnExcluirSerie.addEventListener('click', async () => {
  const s = sessoes.find(x => x.id === editandoId);
  const quantas = sessoes.filter(x => x.serieId === s.serieId && x.data >= s.data).length;
  if (!confirm(`Excluir esta sessão e as próximas da série (${quantas} no total)?`)) return;
  try {
    await api('DELETE', `/sessoes/serie/${s.serieId}?aPartirDe=${s.data}`);
    modal.close();
    await carregar();
  } catch (e) {
    erro.textContent = e.message;
  }
});

function mudarMes(delta) {
  mes += delta;
  if (mes < 0) { mes = 11; ano--; }
  if (mes > 11) { mes = 0; ano++; }
  desenharCalendario();
}

document.getElementById('btn-anterior').addEventListener('click', () => mudarMes(-1));
document.getElementById('btn-proximo').addEventListener('click', () => mudarMes(1));
document.getElementById('btn-hoje').addEventListener('click', () => {
  ano = agora.getFullYear();
  mes = agora.getMonth();
  desenharCalendario();
});
document.getElementById('btn-cancelar').addEventListener('click', () => modal.close());

carregar();
