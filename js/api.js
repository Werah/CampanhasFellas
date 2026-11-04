// Funções de tela compartilhadas por todas as páginas
// (login, api() e imagens ficam em banco.js)

// Evita que texto digitado vire HTML
function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Evita salvar duas vezes com cliques rápidos: enquanto a ação roda, os botões do
 * formulário ficam desabilitados e novas chamadas para o mesmo formulário são ignoradas.
 */
async function semCliqueDuplo(form, acao) {
  if (form.dataset.salvando) return;
  form.dataset.salvando = 'sim';
  // Só desabilita (e depois reabilita) os botões que estavam habilitados
  const botoes = [...form.querySelectorAll('button')].filter(b => !b.disabled);
  botoes.forEach(b => { b.disabled = true; });
  try {
    return await acao();
  } finally {
    delete form.dataset.salvando;
    botoes.forEach(b => { b.disabled = false; });
  }
}

function formatarData(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// Ícone de d20 usado quando a campanha não tem imagem
const D20_SVG = `
  <svg class="d20" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
    <polygon points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5" />
    <polygon points="50,27 72,64 28,64" />
    <path d="M50,27 L50,5 M50,27 L11,27.5 M50,27 L89,27.5
             M28,64 L11,27.5 M28,64 L11,72.5 M28,64 L50,95
             M72,64 L89,27.5 M72,64 L89,72.5 M72,64 L50,95" />
    <text x="50" y="57" text-anchor="middle" font-size="16" font-family="Cinzel, serif"
          fill="currentColor" stroke="none" font-weight="700">20</text>
  </svg>`;

// Capa da campanha: a imagem dela ou o d20 na cor da campanha
function capaCampanha(c) {
  if (c.imagem) return `<div class="capa"><img src="${urlImagem(c.imagem)}" alt=""></div>`;
  return `<div class="capa sem-imagem" style="--cor: ${esc(c.cor)}">${D20_SVG}</div>`;
}

// Cor média da borda esquerda de uma imagem (a parte que emenda no degradê da barra do personagem).
// Guarda o resultado para não recalcular. Se não der pra ler a imagem, devolve null.
const coresDeImagem = new Map();
function corDaBordaEsquerda(url) {
  if (!coresDeImagem.has(url)) {
    coresDeImagem.set(url, new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // o Supabase libera, senão o navegador não deixa ler os pixels
      img.onload = () => {
        try {
          // Reduz para 40x20 e tira a média dos 20% da esquerda
          const canvas = document.createElement('canvas');
          canvas.width = 40;
          canvas.height = 20;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 40, 20);
          const { data } = ctx.getImageData(0, 0, 8, 20);
          let r = 0, g = 0, b = 0;
          const n = data.length / 4;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
          }
          resolve(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return coresDeImagem.get(url);
}

// Lê um arquivo de imagem e reduz o tamanho antes de enviar (devolve data URL em JPEG).
// Com "manterTransparencia", PNG/WebP/GIF viram PNG (para imagens recortadas, sem fundo).
function redimensionarImagem(arquivo, maximo = 1000, manterTransparencia = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      const png = manterTransparencia && /image\/(png|webp|gif)/.test(arquivo.type);
      resolve(png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Não deu pra ler essa imagem'));
    img.src = URL.createObjectURL(arquivo);
  });
}

/**
 * Abre um popup para escolher qual parte da imagem usar.
 * O quadro de recorte pode ser arrastado e redimensionado, mantendo a proporção largura/altura.
 * Com "faixaVisivel" (ex.: 2/3), desenha dentro do quadro uma faixa tracejada no meio,
 * com essa fração da altura, mostrando o que aparece quando a barra está fechada.
 * Devolve a data URL (JPEG) da parte escolhida, ou null se a pessoa cancelar.
 * Precisa do Cropper.js carregado na página.
 */
function recortarImagem(arquivo, proporcao, faixaVisivel) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'recortador';
    dialog.innerHTML = `
      <h2>Escolha a parte da imagem</h2>
      <p class="info">
        Arraste o quadro e puxe os cantos para escolher o que vai aparecer.
        ${faixaVisivel ? 'A faixa tracejada é o que aparece com a barra fechada; o quadro inteiro, com o mouse em cima.' : ''}
      </p>
      <div class="area-recorte"><img alt=""></div>
      <div class="botoes-modal">
        <button type="button" class="btn-cancelar">Cancelar</button>
        <button type="button" class="primario btn-usar">Usar esta parte</button>
      </div>
    `;
    document.body.appendChild(dialog);

    const img = dialog.querySelector('img');
    const url = URL.createObjectURL(arquivo);
    let cropper = null;

    function fechar(resultado) {
      if (cropper) cropper.destroy();
      URL.revokeObjectURL(url);
      dialog.close();
      dialog.remove();
      resolve(resultado);
    }

    img.onload = () => {
      cropper = new Cropper(img, {
        aspectRatio: proporcao,
        viewMode: 1,          // o quadro não sai de cima da imagem
        autoCropArea: 0.9,
        dragMode: 'none',     // arrastar fora do quadro não faz nada
        zoomable: false,
        movable: false,
        rotatable: false,
        scalable: false,
        background: false,
        toggleDragModeOnDblclick: false,
        ready() {
          if (!faixaVisivel) return;
          // A faixa acompanha o quadro porque fica dentro dele, em porcentagem
          const faixa = document.createElement('div');
          faixa.className = 'faixa-visivel';
          faixa.style.top = faixa.style.bottom = `${((1 - faixaVisivel) / 2) * 100}%`;
          dialog.querySelector('.cropper-crop-box').appendChild(faixa);
        },
      });
    };
    img.onerror = () => {
      alert('Não deu pra ler essa imagem');
      fechar(null);
    };

    dialog.querySelector('.btn-cancelar').addEventListener('click', () => fechar(null));
    dialog.addEventListener('cancel', e => { e.preventDefault(); fechar(null); }); // tecla Esc
    dialog.querySelector('.btn-usar').addEventListener('click', () => {
      if (!cropper) return;
      const canvas = cropper.getCroppedCanvas({ maxWidth: 1200, maxHeight: 1200, imageSmoothingQuality: 'high' });
      fechar(canvas.toDataURL('image/jpeg', 0.85));
    });

    // Abre antes de carregar a imagem, para o Cropper medir o tamanho certo
    dialog.showModal();
    img.src = url;
  });
}

/**
 * Liga um bloco de escolher imagem dentro de um formulário:
 *   <div class="campo-imagem">
 *     <div class="preview-imagem"></div>
 *     <label class="botao pequeno">Escolher imagem <input type="file" accept="image/*" hidden></label>
 *     <button type="button" class="pequeno perigo btn-remover-imagem">Remover</button>
 *   </div>
 * "semImagem" devolve o HTML mostrado quando não tem imagem.
 * Com { proporcao } (largura/altura, um número ou uma função que calcula na hora),
 * abre o popup de recorte ao escolher a imagem. "faixaVisivel" vai junto para o popup.
 * Com { comRetrato } (personagens), a imagem inteira também é guardada como "retrato",
 * a imagem grande da página do personagem; remover a imagem remove o retrato junto.
 */
function ligarCampoImagem(raiz, semImagem, { proporcao, faixaVisivel, comRetrato } = {}) {
  const preview = raiz.querySelector('.preview-imagem');
  const input = raiz.querySelector('input[type="file"]');
  const btnRemover = raiz.querySelector('.btn-remover-imagem');
  let atual = ''; // arquivo que o item já tinha
  let nova;       // undefined = não mexeu, string = nova imagem, null = remover
  let original;   // imagem inteira escolhida (para o retrato)

  function desenhar() {
    let src = '';
    if (typeof nova === 'string') src = nova;
    else if (nova === undefined && atual) src = urlImagem(atual);
    preview.innerHTML = src ? `<img src="${src}" alt="">` : semImagem();
    btnRemover.style.display = src ? '' : 'none';
  }

  input.addEventListener('change', async () => {
    const arquivo = input.files[0];
    input.value = ''; // deixa escolher o mesmo arquivo de novo depois
    if (!arquivo) return;
    try {
      const resultado = proporcao
        ? await recortarImagem(arquivo, typeof proporcao === 'function' ? proporcao() : proporcao, faixaVisivel)
        : await redimensionarImagem(arquivo);
      if (resultado === null) return; // cancelou o recorte: fica como estava
      nova = resultado;
      original = comRetrato ? await redimensionarImagem(arquivo, 1600) : undefined;
      desenhar();
    } catch (e) {
      alert(e.message);
    }
  });

  btnRemover.addEventListener('click', () => {
    nova = null;
    original = undefined;
    desenhar();
  });

  return {
    iniciar(arquivoAtual) {
      atual = arquivoAtual || '';
      nova = undefined;
      original = undefined;
      desenhar();
    },
    desenhar,
    // Envia a troca (ou remoção) da imagem depois que o item foi salvo
    async salvar(colecao, id) {
      if (typeof nova === 'string') {
        await api('PUT', `/${colecao}/${id}/imagem`, { dataUrl: nova });
        if (original) await api('PUT', `/${colecao}/${id}/retrato`, { dataUrl: original });
      } else if (nova === null && atual) {
        await api('DELETE', `/${colecao}/${id}/imagem`);
        if (comRetrato) await api('DELETE', `/${colecao}/${id}/retrato`);
      }
    },
  };
}

// Tamanho da imagem na barra do personagem da página da campanha (igual ao CSS):
// altura em fração da altura da tela, largura em fração da largura da barra
const BARRA_FECHADA = 0.15;
const BARRA_ABERTA = 0.20;
const LARGURA_IMAGEM = 0.70;

// Largura da coluna de personagens da página da campanha. Fora dela (página Personagens),
// estima pelo CSS: 1/3 da tela com no mínimo 260px, ou a tela toda no celular.
function larguraColunaPersonagens() {
  const coluna = document.querySelector('.coluna-personagens');
  if (coluna) return coluna.getBoundingClientRect().width;
  return window.innerWidth <= 800 ? window.innerWidth : Math.max(260, window.innerWidth / 3);
}

// Opções do recorte da imagem do personagem (para ligarCampoImagem):
// o formato é o da área da imagem com a barra aberta (70% da coluna x 20% da tela),
// e a faixa tracejada no meio mostra o que aparece com a barra fechada (15% da tela).
const RECORTE_PERSONAGEM = {
  proporcao: () => larguraColunaPersonagens() * LARGURA_IMAGEM / (window.innerHeight * BARRA_ABERTA),
  faixaVisivel: BARRA_FECHADA / BARRA_ABERTA,
  comRetrato: true,
};

// Monta a barra do topo; "atual" é o nome da página ativa
function montarTopo(atual) {
  const links = [
    ['cronograma.html', 'Cronograma'],
    ['campanhas.html', 'Campanhas'],
    ['fellas.html', 'Fellas'],
    ['personagens.html', 'Personagens'],
  ];
  const nav = links
    .map(([href, nome]) => `<a href="${href}" class="${nome === atual ? 'ativo' : ''}">${nome}</a>`)
    .join('');
  document.getElementById('topo').innerHTML = `
    <a class="marca" href="home.html">⚔ CampanhasFellas</a>
    <nav>${nav}<a href="#" onclick="sair(); return false;">Sair</a></nav>
  `;
}
