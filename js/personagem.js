exigirLogin();
montarTopo('Personagens');

const personagemId = new URLSearchParams(window.location.search).get('id');
if (!personagemId) window.location.href = 'personagens.html';

let personagem = null;
let fellas = [];
let campanhas = [];

const formulario = criarFormularioPersonagem({
  depoisDeSalvar: () => carregar(),
  depoisDeExcluir: () => { window.location.href = voltarPara(); },
});

async function carregar() {
  const ficha = document.getElementById('ficha');
  try {
    [personagem, fellas, campanhas] = await Promise.all([
      api('GET', `/personagens/${personagemId}`), api('GET', '/fellas'), api('GET', '/campanhas'),
    ]);
  } catch (e) {
    ficha.innerHTML = `<p class="vazio">${esc(e.message)} — <a href="personagens.html">voltar</a></p>`;
    return;
  }
  fellas.sort((a, b) => a.nick.localeCompare(b.nick));
  campanhas.sort((a, b) => (a.status === b.status ? a.nome.localeCompare(b.nome) : a.status === 'ativa' ? -1 : 1));
  document.title = `${personagem.nome} - CampanhasFellas`;
  desenhar();
}

// Volta para a página do jogador; NPC volta para a campanha
function voltarPara() {
  if (personagem.fellaId) return `personagens.html?fella=${personagem.fellaId}`;
  if (personagem.campanhaId) return `campanha.html?id=${personagem.campanhaId}`;
  return 'personagens.html';
}

function desenhar() {
  const p = personagem;
  const fella = fellas.find(f => f.id === p.fellaId);
  const camp = campanhas.find(c => c.id === p.campanhaId);
  // Destaque na cor que o jogador escolheu para o cartão, ou na da campanha
  const cartao = fella && fella.pagina && fella.pagina.cards && fella.pagina.cards[p.id];
  const cor = (cartao && cartao.cor) || (camp ? camp.cor : '#d9a441');
  const imagem = p.retrato || p.imagem;

  document.getElementById('ficha').innerHTML = `
    <a class="voltar-ficha" href="${voltarPara()}">← ${fella ? `Personagens de ${esc(fella.nick)}` : camp ? esc(camp.nome) : 'Personagens'}</a>

    <section class="ficha-topo" style="--cor: ${esc(cor)}">
      <div class="retrato-grande ${imagem ? '' : 'sem-retrato'}" ${imagem ? `style="--img: url('${urlImagem(imagem)}')"` : ''}>
        ${imagem
          ? `<img src="${urlImagem(imagem)}" alt="${esc(p.nome)}">`
          : `<span class="marca-dagua">${esc(p.nome.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase())}</span>`}
      </div>
      <div class="ficha-info">
        <h1>${esc(p.nome)}</h1>
        ${p.classe ? `<p class="ficha-classe">${esc(p.classe)}</p>` : ''}
        <div class="ficha-selos">
          <span class="selo-ficha">🛡 ${fella ? esc(fella.nick) : 'NPC'}</span>
          ${camp
            ? `<a class="selo-ficha campanha" href="campanha.html?id=${camp.id}" style="--cor-camp: ${esc(camp.cor)}">📜 ${esc(camp.nome)}</a>`
            : '<span class="selo-ficha">📜 Sem campanha</span>'}
        </div>
        ${p.descricao ? `<p class="ficha-resumo">${esc(p.descricao)}</p>` : ''}
        <div class="ficha-botoes">
          <button class="primario" id="btn-editar">Editar personagem</button>
          <button id="btn-retrato">${p.retrato ? 'Trocar imagem grande' : 'Escolher imagem grande'}</button>
          ${p.retrato ? '<button class="perigo" id="btn-remover-retrato">Remover imagem grande</button>' : ''}
        </div>
        <p class="info dica-retrato">A imagem grande aparece inteira aqui, sem o recorte do cartão.</p>
      </div>
    </section>

    <section class="ficha-secoes" style="--cor: ${esc(cor)}">
      ${p.detalhes && p.detalhes.length
        ? p.detalhes.map(s => `
            <article class="secao-ficha">
              ${s.titulo ? `<h2>${esc(s.titulo)}</h2>` : ''}
              ${s.texto ? `<p>${esc(s.texto)}</p>` : ''}
            </article>
          `).join('')
        : `<p class="vazio">Nenhum detalhe ainda. Clique em <strong>Editar personagem</strong> para contar a história,
             a aparência, a personalidade...</p>`}
    </section>
  `;

  document.getElementById('btn-editar').onclick = () => formulario.abrir(personagem, { fellas, campanhas });
  document.getElementById('btn-retrato').onclick = () => document.getElementById('input-retrato').click();
  const btnRemover = document.getElementById('btn-remover-retrato');
  if (btnRemover) {
    btnRemover.onclick = async () => {
      if (!confirm('Remover a imagem grande? (A imagem do cartão continua.)')) return;
      btnRemover.disabled = true;
      try {
        await api('DELETE', `/personagens/${personagemId}/retrato`);
        await carregar();
      } catch (e) {
        alert(e.message);
        btnRemover.disabled = false;
      }
    };
  }
}

document.getElementById('input-retrato').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  const botao = document.getElementById('btn-retrato');
  botao.disabled = true;
  botao.textContent = 'Enviando...';
  try {
    const dataUrl = await redimensionarImagem(arquivo, 1600, true);
    await api('PUT', `/personagens/${personagemId}/retrato`, { dataUrl });
    await carregar();
  } catch (err) {
    alert(err.message);
    desenhar();
  }
});

carregar();
