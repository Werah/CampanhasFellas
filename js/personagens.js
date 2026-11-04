exigirLogin();
montarTopo('Personagens');

// No modo livre, o palco tem 1000 "unidades" de largura e é escalado para caber na tela,
// assim a página de cada fella fica com a mesma cara em qualquer monitor
const LARGURA_PALCO = 1000;
const CARTAO_PADRAO = { w: 320, h: 180 };
const ESPACO = 15;
const GRADE = 5; // arrastar e redimensionar andam de 5 em 5 unidades
const FUNDO_PADRAO = '#1e1a28';
const celular = window.matchMedia('(max-width: 700px)'); // no celular a página sempre aparece em lista

let fellas = [];
let campanhas = [];
let personagens = [];
// Fella escolhido; fica na URL (?fella=...) para continuar nele ao recarregar
let fellaAtual = new URLSearchParams(window.location.search).get('fella');

/**
 * Visual da página do fella atual:
 *   { modo: 'livre' | 'lista', fundo, cards: { [personagemId]: { x, y, w, h, z, cor } },
 *     enfeites: [{ id, imagem (ou dataUrl, se ainda não foi enviada), x, y, w, h, z }] }
 * Enquanto personaliza, é uma cópia que só vai para o banco ao clicar em Salvar.
 */
let pagina = null;
let personalizando = false;
let paginaOriginal = '';  // JSON de quando começou a personalizar, para saber se mudou algo
let selecionado = null;   // { tipo: 'card' | 'enfeite', id }
let escala = 1;

const formulario = criarFormularioPersonagem({
  depoisDeSalvar: async (p) => {
    await carregar();
    // Se trocou o jogador, vai junto para a página dele
    if (p.fellaId && p.fellaId !== fellaAtual) escolherFella(p.fellaId);
  },
  depoisDeExcluir: () => carregar(),
});

async function carregar() {
  [fellas, campanhas, personagens] = await Promise.all([
    api('GET', '/fellas'), api('GET', '/campanhas'), api('GET', '/personagens'),
  ]);
  fellas.sort((a, b) => a.nick.localeCompare(b.nick));
  // Ativas primeiro, depois por nome
  campanhas.sort((a, b) => (a.status === b.status ? a.nome.localeCompare(b.nome) : a.status === 'ativa' ? -1 : 1));
  personagens.sort((a, b) => a.nome.localeCompare(b.nome));
  if (!fellas.some(f => f.id === fellaAtual)) fellaAtual = fellas.length ? fellas[0].id : null;
  desenhar();
}

// ---------- Ajudantes ----------

function campanhaDe(id) {
  return campanhas.find(c => c.id === id);
}

function corCampanha(id) {
  const c = campanhaDe(id);
  return c ? c.cor : '#d9a441'; // sem campanha: dourado
}

function iniciais(nome) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function doFella() {
  return personagens.filter(p => p.fellaId === fellaAtual);
}

function paginaDoFella(fella) {
  const p = JSON.parse(JSON.stringify((fella && fella.pagina) || {}));
  return {
    modo: p.modo === 'lista' ? 'lista' : 'livre',
    fundo: p.fundo || FUNDO_PADRAO,
    cards: p.cards || {},
    enfeites: p.enfeites || [],
  };
}

// Cor escolhida para o cartão, ou a da campanha
function corDoCartao(p) {
  const c = pagina.cards[p.id];
  return (c && c.cor) || corCampanha(p.campanhaId);
}

function itemDe(tipo, id) {
  return tipo === 'card' ? pagina.cards[id] : pagina.enfeites.find(e => e.id === id);
}

// Tudo o que está no palco (cartões deste fella e imagens do fundo)
function itensDoPalco() {
  return [...doFella().map(p => pagina.cards[p.id]).filter(Boolean), ...pagina.enfeites];
}

function maiorZ() {
  return Math.max(0, ...itensDoPalco().map(i => i.z || 0));
}

function posicao(i) {
  return `left: ${i.x}px; top: ${i.y}px; width: ${i.w}px; height: ${i.h}px; z-index: ${i.z || 0};`;
}

function tamanhoImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Não deu pra ler essa imagem'));
    img.src = src;
  });
}

// Personagens que ainda não têm lugar no palco entram em grade, embaixo dos que já têm
function posicionarCartoes(lista) {
  const novos = lista
    .filter(p => !pagina.cards[p.id] || pagina.cards[p.id].w == null)
    .sort((a, b) => (!a.campanhaId) - (!b.campanhaId)); // os de campanha primeiro
  if (!novos.length) return;
  let topo = ESPACO;
  for (const p of lista) {
    const c = pagina.cards[p.id];
    if (c && c.w != null) topo = Math.max(topo, c.y + c.h + ESPACO);
  }
  const { w, h } = CARTAO_PADRAO;
  const colunas = Math.floor((LARGURA_PALCO + ESPACO) / (w + ESPACO));
  const margem = Math.round((LARGURA_PALCO - colunas * w - (colunas - 1) * ESPACO) / 2);
  const z = maiorZ();
  novos.forEach((p, i) => {
    pagina.cards[p.id] = {
      ...(pagina.cards[p.id] || {}),
      x: margem + (i % colunas) * (w + ESPACO),
      y: topo + Math.floor(i / colunas) * (h + ESPACO),
      w, h, z: z + 1 + i,
    };
  });
}

// ---------- Desenho ----------

function desenhar() {
  desenharFellas();
  desenharArea();
}

function desenharFellas() {
  document.getElementById('lista-fellas').innerHTML = fellas.map(f => `
    <button data-id="${f.id}" class="${f.id === fellaAtual ? 'ativo' : ''}">
      ${esc(f.nick)} <span class="qtd">${personagens.filter(p => p.fellaId === f.id).length}</span>
    </button>
  `).join('');
}

function desenharArea() {
  const area = document.getElementById('area');
  const acoes = document.getElementById('acoes-fella');
  observador.disconnect();
  if (!fellaAtual) {
    acoes.innerHTML = '';
    area.innerHTML = '<p class="vazio">Nenhum fella cadastrado ainda. Cadastre na página <a href="fellas.html">Fellas</a>.</p>';
    return;
  }
  const fella = fellas.find(f => f.id === fellaAtual);
  if (!personalizando) pagina = paginaDoFella(fella);
  const lista = doFella();
  posicionarCartoes(lista);
  const modo = celular.matches ? 'lista' : pagina.modo;

  acoes.innerHTML = personalizando ? '' : `
    ${celular.matches ? '' : '<button class="pequeno" id="btn-personalizar">🎨 Personalizar</button>'}
    <button class="pequeno primario" id="btn-novo">+ Novo personagem</button>
  `;
  area.innerHTML = `
    ${personalizando ? htmlBarraEdicao() : ''}
    <div class="palco ${modo} ${personalizando ? 'personalizando' : ''}" id="palco"
         style="--fundo: ${esc(pagina.fundo)}"></div>
  `;

  const palco = document.getElementById('palco');
  if (lista.length === 0 && pagina.enfeites.length === 0 && !personalizando) {
    palco.innerHTML = '<p class="vazio">Nenhum personagem ainda.</p>';
  } else if (modo === 'lista') {
    palco.innerHTML = htmlLista(lista);
  } else {
    palco.innerHTML = `<div class="palco-interno">${pagina.enfeites.map(htmlEnfeite).join('')}${lista.map(htmlCartao).join('')}</div>`;
    ajustarPalco();
    observador.observe(palco);
    if (personalizando) ligarArrasto(palco.querySelector('.palco-interno'));
  }

  // Cartões com imagem e sem cor escolhida: o degradê usa a cor da borda da imagem
  for (const el of palco.querySelectorAll('.cartao.com-imagem')) {
    const p = personagens.find(x => x.id === el.dataset.id);
    corDaBordaEsquerda(urlImagem(p.imagem)).then(cor => {
      const c = pagina.cards[p.id];
      if (cor && !(c && c.cor)) el.style.setProperty('--cor-img', cor);
    });
  }

  ligarBotoes();
  desenharFerramentas();
}

function htmlCartao(p) {
  const c = pagina.cards[p.id];
  const camp = campanhaDe(p.campanhaId);
  const sel = selecionado && selecionado.tipo === 'card' && selecionado.id === p.id ? 'selecionado' : '';
  return `
    <div class="personagem cartao ${p.imagem ? 'com-imagem' : ''} ${sel}" data-tipo="card" data-id="${p.id}"
         style="${posicao(c)} --cor: ${esc(corDoCartao(p))}; ${c.cor ? `--cor-img: ${esc(c.cor)};` : ''}
                ${p.imagem ? `--img: url('${urlImagem(p.imagem)}');` : ''}">
      ${p.imagem ? '' : `<span class="marca-dagua">${esc(iniciais(p.nome))}</span>`}
      <span class="etiqueta-campanha">${camp ? esc(camp.nome) : 'Sem campanha'}</span>
      <strong>${esc(p.nome)}</strong>
      <small>${esc(p.classe) || '&nbsp;'}</small>
      ${p.descricao ? `<p class="desc">${esc(p.descricao)}</p>` : ''}
      ${personalizando ? '<span class="alca" title="Puxe para redimensionar"></span>' : ''}
    </div>
  `;
}

function htmlEnfeite(e) {
  const sel = selecionado && selecionado.tipo === 'enfeite' && selecionado.id === e.id ? 'selecionado' : '';
  return `
    <div class="enfeite ${sel}" data-tipo="enfeite" data-id="${esc(e.id)}" style="${posicao(e)}">
      <img src="${e.dataUrl || urlImagem(e.imagem)}" alt="" draggable="false">
      ${personalizando ? '<span class="alca" title="Puxe para redimensionar (Shift: sem manter o formato)"></span>' : ''}
    </div>
  `;
}

function htmlLista(lista) {
  const em = lista.filter(p => p.campanhaId);
  const sem = lista.filter(p => !p.campanhaId);
  const linhas = l => `<div class="linhas-personagens">${l.map(htmlLinha).join('')}</div>`;
  return `
    <h3 class="titulo-grupo">Em campanhas <span class="qtd">${em.length}</span></h3>
    ${em.length ? linhas(em) : '<p class="info">Nenhum personagem em campanha.</p>'}
    <h3 class="titulo-grupo">Sem campanha <span class="qtd">${sem.length}</span></h3>
    ${sem.length ? linhas(sem) : '<p class="info">Nenhum personagem fora de campanha.</p>'}
  `;
}

function htmlLinha(p) {
  const camp = campanhaDe(p.campanhaId);
  const corPropria = pagina.cards[p.id] && pagina.cards[p.id].cor;
  const conteudo = `
    <span class="miniatura" ${p.imagem ? `style="--img: url('${urlImagem(p.imagem)}')"` : ''}>${p.imagem ? '' : esc(iniciais(p.nome))}</span>
    <span class="texto-linha">
      <strong>${esc(p.nome)}</strong>
      <small>${[esc(p.classe), camp ? esc(camp.nome) : 'Sem campanha'].filter(Boolean).join(' · ')}</small>
      ${p.descricao ? `<span class="desc">${esc(p.descricao)}</span>` : ''}
    </span>
  `;
  if (!personalizando) {
    return `<a class="linha-personagem" href="personagem.html?id=${p.id}" style="--cor: ${esc(corDoCartao(p))}">${conteudo}</a>`;
  }
  return `
    <div class="linha-personagem" data-id="${p.id}" style="--cor: ${esc(corDoCartao(p))}">
      ${conteudo}
      <span class="cor-linha">
        <input type="color" data-cor-de="${p.id}" value="${esc(corDoCartao(p))}" title="Cor do cartão">
        ${corPropria ? `<button type="button" class="pequeno" data-cor-original="${p.id}" title="Voltar para a cor da campanha">↺</button>` : ''}
      </span>
    </div>
  `;
}

function htmlBarraEdicao() {
  const livre = pagina.modo === 'livre';
  return `
    <div class="barra-edicao" id="barra-edicao">
      <label class="ferramenta">Fundo <input type="color" id="cor-fundo" value="${esc(pagina.fundo)}"></label>
      <div class="alternar" id="alternar-modo">
        <button type="button" data-modo="livre" class="${livre ? 'ativo' : ''}">Livre</button>
        <button type="button" data-modo="lista" class="${livre ? '' : 'ativo'}">Lista</button>
      </div>
      ${livre ? `<label class="botao pequeno">🖼 Imagem no fundo <input type="file" accept="image/*" id="input-enfeite" hidden></label>` : ''}
      <span class="dica">${livre
        ? 'Arraste para mover e puxe o canto dourado para redimensionar. Clique em algo para mudar a cor ou a ordem.'
        : 'Escolha a cor de cada personagem.'}</span>
      <div class="botoes-edicao">
        <button type="button" id="btn-cancelar-edicao">Cancelar</button>
        <button type="button" class="primario" id="btn-salvar-edicao">Salvar</button>
      </div>
      <div class="ferramentas-item" id="ferramentas-item" hidden></div>
    </div>
  `;
}

// Ferramentas do item clicado (cor, ordem, remover)
function desenharFerramentas() {
  const alvo = document.getElementById('ferramentas-item');
  if (!alvo) return;
  const item = selecionado && itemDe(selecionado.tipo, selecionado.id);
  if (!item || pagina.modo !== 'livre') {
    alvo.hidden = true;
    return;
  }
  alvo.hidden = false;
  const ordem = `
    <button type="button" class="pequeno" data-ordem="frente">Trazer pra frente</button>
    <button type="button" class="pequeno" data-ordem="tras">Mandar pra trás</button>
  `;
  if (selecionado.tipo === 'card') {
    const p = personagens.find(x => x.id === selecionado.id);
    alvo.innerHTML = `
      <strong>${esc(p.nome)}</strong>
      <label class="ferramenta">Cor <input type="color" id="cor-item" value="${esc(corDoCartao(p))}"></label>
      ${item.cor ? '<button type="button" class="pequeno" id="btn-cor-original">Cor da campanha</button>' : ''}
      ${ordem}
    `;
  } else {
    alvo.innerHTML = `
      <strong>Imagem do fundo</strong>
      ${ordem}
      <button type="button" class="pequeno perigo" id="btn-remover-enfeite">Remover imagem</button>
    `;
  }
}

// Escala o palco livre para a largura disponível e ajusta a altura ao conteúdo
function ajustarPalco() {
  const palco = document.getElementById('palco');
  const interno = palco && palco.querySelector('.palco-interno');
  if (!interno) return;
  escala = palco.clientWidth / LARGURA_PALCO;
  let altura = 0;
  for (const i of itensDoPalco()) altura = Math.max(altura, i.y + i.h);
  altura += ESPACO;
  if (personalizando) altura += 250; // sobra espaço embaixo para arrastar coisas
  altura = Math.max(altura, 300);
  interno.style.height = `${altura}px`;
  interno.style.transform = `scale(${escala})`;
  palco.style.height = `${altura * escala}px`;
}

const observador = new ResizeObserver(() => ajustarPalco());

// ---------- Personalizar ----------

function selecionar(tipo, id) {
  selecionado = tipo ? { tipo, id } : null;
  document.querySelectorAll('#palco [data-tipo]').forEach(el => {
    el.classList.toggle('selecionado', !!selecionado && el.dataset.tipo === tipo && el.dataset.id === id);
  });
  desenharFerramentas();
}

// Arrastar para mover; puxar a alça do canto para redimensionar
function ligarArrasto(interno) {
  let arrasto = null;
  const grudar = v => Math.round(v / GRADE) * GRADE;

  interno.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-tipo]');
    if (!el) {
      selecionar(null);
      return;
    }
    e.preventDefault();
    selecionar(el.dataset.tipo, el.dataset.id);
    const item = itemDe(el.dataset.tipo, el.dataset.id);
    arrasto = {
      el, item, inicio: { ...item }, x0: e.clientX, y0: e.clientY,
      cartao: el.dataset.tipo === 'card',
      redimensionar: e.target.classList.contains('alca'),
    };
    el.setPointerCapture(e.pointerId);
  });

  interno.addEventListener('pointermove', (e) => {
    if (!arrasto) return;
    const { el, item, inicio, cartao } = arrasto;
    const dx = (e.clientX - arrasto.x0) / escala;
    const dy = (e.clientY - arrasto.y0) / escala;
    if (arrasto.redimensionar) {
      const minimo = cartao ? { w: 160, h: 90 } : { w: 20, h: 20 };
      const maximoW = cartao ? LARGURA_PALCO - item.x : 3000;
      item.w = Math.min(maximoW, Math.max(minimo.w, grudar(inicio.w + dx)));
      // Imagem do fundo mantém o formato, a não ser segurando Shift
      item.h = !cartao && !e.shiftKey
        ? Math.max(minimo.h, Math.round(item.w * inicio.h / inicio.w))
        : Math.max(minimo.h, grudar(inicio.h + dy));
    } else {
      const x = grudar(inicio.x + dx);
      // Cartão não sai do palco; imagem do fundo pode passar da borda, mas não sumir
      item.x = cartao ? Math.min(LARGURA_PALCO - item.w, Math.max(0, x)) : Math.min(LARGURA_PALCO - 20, Math.max(20 - item.w, x));
      item.y = Math.max(cartao ? 0 : 20 - item.h, grudar(inicio.y + dy));
    }
    Object.assign(el.style, { left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` });
  });

  const soltar = () => {
    if (!arrasto) return;
    arrasto = null;
    ajustarPalco();
  };
  interno.addEventListener('pointerup', soltar);
  interno.addEventListener('pointercancel', soltar);
}

function mudarOrdem(paraFrente) {
  const item = itemDe(selecionado.tipo, selecionado.id);
  const todos = itensDoPalco().filter(i => i !== item).sort((a, b) => (a.z || 0) - (b.z || 0));
  if (paraFrente) todos.push(item);
  else todos.unshift(item);
  todos.forEach((i, n) => { i.z = n + 1; });
  desenharArea();
}

async function adicionarEnfeite(arquivo) {
  try {
    const dataUrl = await redimensionarImagem(arquivo, 1200, true);
    const tamanho = await tamanhoImagem(dataUrl);
    const w = Math.min(300, tamanho.w);
    const h = Math.round(w * tamanho.h / tamanho.w);
    // Aparece no meio da parte do palco que está na tela
    const r = document.getElementById('palco').getBoundingClientRect();
    const meio = (Math.min(window.innerHeight, r.bottom) + Math.max(0, r.top)) / 2 - r.top;
    const enfeite = {
      id: crypto.randomUUID(), dataUrl,
      x: Math.round((LARGURA_PALCO - w) / 2), y: Math.max(0, Math.round(meio / escala - h / 2)),
      w, h, z: maiorZ() + 1,
    };
    pagina.enfeites.push(enfeite);
    selecionado = { tipo: 'enfeite', id: enfeite.id };
    desenharArea();
  } catch (e) {
    alert(e.message);
  }
}

function mudouAlgo() {
  return personalizando && JSON.stringify(pagina) !== paginaOriginal;
}

function iniciarPersonalizacao() {
  personalizando = true;
  selecionado = null;
  pagina = paginaDoFella(fellas.find(f => f.id === fellaAtual));
  posicionarCartoes(doFella());
  paginaOriginal = JSON.stringify(pagina);
  desenharArea();
}

function pararPersonalizacao() {
  personalizando = false;
  selecionado = null;
  desenharArea();
}

function salvarPersonalizacao() {
  semCliqueDuplo(document.getElementById('barra-edicao'), async () => {
    try {
      // Guarda só os cartões dos personagens que são deste fella
      const ids = new Set(doFella().map(p => p.id));
      const cards = Object.fromEntries(Object.entries(pagina.cards).filter(([id]) => ids.has(id)));
      const salva = await api('PUT', `/fellas/${fellaAtual}/pagina`, { pagina: { ...pagina, cards } });
      fellas.find(f => f.id === fellaAtual).pagina = salva;
      pararPersonalizacao();
    } catch (e) {
      alert(e.message);
    }
  });
}

// ---------- Botões ----------

function ligarBotoes() {
  const ligar = (id, evento, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evento, fn);
  };
  // Os botões da barra dos fellas são recriados a cada desenho, então ligar aqui não duplica
  ligar('btn-personalizar', 'click', iniciarPersonalizacao);
  ligar('btn-novo', 'click', () => formulario.abrir(null, { fellas, campanhas, fellaId: fellaAtual }));
  ligar('btn-cancelar-edicao', 'click', () => {
    if (mudouAlgo() && !confirm('Descartar as mudanças na página?')) return;
    pararPersonalizacao();
  });
  ligar('btn-salvar-edicao', 'click', salvarPersonalizacao);
  ligar('cor-fundo', 'input', (e) => {
    pagina.fundo = e.target.value;
    document.getElementById('palco').style.setProperty('--fundo', pagina.fundo);
  });
  ligar('alternar-modo', 'click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    pagina.modo = botao.dataset.modo;
    selecionado = null;
    desenharArea();
  });
  ligar('input-enfeite', 'change', (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (arquivo) adicionarEnfeite(arquivo);
  });

  ligar('ferramentas-item', 'click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    if (botao.dataset.ordem) mudarOrdem(botao.dataset.ordem === 'frente');
    if (botao.id === 'btn-cor-original') {
      delete pagina.cards[selecionado.id].cor;
      desenharArea();
    }
    if (botao.id === 'btn-remover-enfeite') {
      pagina.enfeites = pagina.enfeites.filter(x => x.id !== selecionado.id);
      selecionado = null;
      desenharArea();
    }
  });
  // Muda a cor na hora, sem redesenhar (senão o seletor de cor fecha)
  ligar('ferramentas-item', 'input', (e) => {
    if (e.target.id !== 'cor-item') return;
    pagina.cards[selecionado.id].cor = e.target.value;
    const el = document.querySelector(`#palco [data-tipo="card"][data-id="${selecionado.id}"]`);
    el.style.setProperty('--cor', e.target.value);
    el.style.setProperty('--cor-img', e.target.value);
  });
  ligar('ferramentas-item', 'change', (e) => {
    if (e.target.id === 'cor-item') desenharFerramentas(); // mostra o "Cor da campanha"
  });

  const palco = document.getElementById('palco');
  if (!palco) return;
  // Modo lista personalizando: cor de cada linha
  palco.addEventListener('input', (e) => {
    const id = e.target.dataset.corDe;
    if (!id) return;
    pagina.cards[id].cor = e.target.value;
    e.target.closest('.linha-personagem').style.setProperty('--cor', e.target.value);
  });
  palco.addEventListener('change', (e) => {
    if (e.target.dataset.corDe) desenharArea();
  });
  palco.addEventListener('click', (e) => {
    const original = e.target.closest('[data-cor-original]');
    if (original) {
      delete pagina.cards[original.dataset.corOriginal].cor;
      desenharArea();
      return;
    }
    // Fora da personalização, clicar no cartão abre a página do personagem
    const cartao = e.target.closest('.cartao');
    if (cartao && !personalizando) window.location.href = `personagem.html?id=${cartao.dataset.id}`;
  });
}

function escolherFella(id) {
  if (id === fellaAtual) return;
  if (mudouAlgo() && !confirm('Descartar as mudanças na página?')) return;
  personalizando = false;
  selecionado = null;
  fellaAtual = id;
  const url = new URL(window.location.href);
  url.searchParams.set('fella', id);
  history.replaceState(null, '', url);
  desenhar();
}

document.getElementById('lista-fellas').addEventListener('click', (e) => {
  const botao = e.target.closest('button');
  if (botao) escolherFella(botao.dataset.id);
});

// Avisa antes de sair da página com mudanças não salvas
window.addEventListener('beforeunload', (e) => {
  if (mudouAlgo()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

celular.addEventListener('change', () => desenharArea());

carregar();
