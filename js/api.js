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

// Lê um arquivo de imagem e reduz o tamanho antes de enviar (devolve data URL em JPEG)
function redimensionarImagem(arquivo, maximo = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Não deu pra ler essa imagem'));
    img.src = URL.createObjectURL(arquivo);
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
 */
function ligarCampoImagem(raiz, semImagem) {
  const preview = raiz.querySelector('.preview-imagem');
  const input = raiz.querySelector('input[type="file"]');
  const btnRemover = raiz.querySelector('.btn-remover-imagem');
  let atual = ''; // arquivo que o item já tinha
  let nova;       // undefined = não mexeu, string = nova imagem, null = remover

  function desenhar() {
    let src = '';
    if (typeof nova === 'string') src = nova;
    else if (nova === undefined && atual) src = urlImagem(atual);
    preview.innerHTML = src ? `<img src="${src}" alt="">` : semImagem();
    btnRemover.style.display = src ? '' : 'none';
  }

  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    try {
      nova = await redimensionarImagem(input.files[0]);
      desenhar();
    } catch (e) {
      alert(e.message);
    }
    input.value = '';
  });

  btnRemover.addEventListener('click', () => {
    nova = null;
    desenhar();
  });

  return {
    iniciar(arquivoAtual) {
      atual = arquivoAtual || '';
      nova = undefined;
      desenhar();
    },
    desenhar,
    // Envia a troca (ou remoção) da imagem depois que o item foi salvo
    async salvar(colecao, id) {
      if (typeof nova === 'string') await api('PUT', `/${colecao}/${id}/imagem`, { dataUrl: nova });
      else if (nova === null && atual) await api('DELETE', `/${colecao}/${id}/imagem`);
    },
  };
}

// Monta a barra do topo; "atual" é o nome da página ativa
function montarTopo(atual) {
  const links = [
    ['cronograma.html', 'Cronograma'],
    ['campanhas.html', 'Campanhas'],
    ['fellas.html', 'Fellas'],
  ];
  const nav = links
    .map(([href, nome]) => `<a href="${href}" class="${nome === atual ? 'ativo' : ''}">${nome}</a>`)
    .join('');
  document.getElementById('topo').innerHTML = `
    <a class="marca" href="home.html">⚔ CampanhasFellas</a>
    <nav>${nav}<a href="#" onclick="sair(); return false;">Sair</a></nav>
  `;
}
