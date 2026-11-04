// Formulário (popup) de personagem usado nas páginas Personagens e Personagem.
// Tem os dados do personagem e as seções de detalhes que aparecem na página dele.
// Precisa do api.js e do Cropper.js carregados.

const SUGESTOES_SECOES = ['História', 'Aparência', 'Personalidade', 'Objetivos', 'Habilidades', 'Equipamento', 'Relações', 'Anotações'];

/**
 * Cria o popup na página.
 *   depoisDeSalvar(personagem) e depoisDeExcluir(personagem) rodam depois de gravar.
 * abrir(personagem, { fellas, campanhas, fellaId }) edita; sem personagem, cria um novo
 * (fellaId é o jogador já escolhido).
 */
function criarFormularioPersonagem({ depoisDeSalvar, depoisDeExcluir }) {
  const modal = document.createElement('dialog');
  modal.className = 'modal-personagem';
  modal.innerHTML = `
    <form method="dialog">
      <h2 class="titulo-modal">Novo personagem</h2>
      <label>Nome*
        <input type="text" name="nome" required>
      </label>
      <div class="duas-colunas">
        <label>Raça / Classe
          <input type="text" name="classe" placeholder="Elfo Mago nv. 3">
        </label>
        <label>Jogador*
          <select name="fellaId" required></select>
        </label>
      </div>
      <label>Campanha
        <select name="campanhaId"></select>
      </label>
      <div class="campo">Imagem (opcional)
        <div class="campo-imagem">
          <div class="preview-imagem"></div>
          <div class="botoes-imagem">
            <label class="botao pequeno">Escolher imagem
              <input type="file" accept="image/*" hidden>
            </label>
            <button type="button" class="pequeno perigo btn-remover-imagem">Remover</button>
          </div>
        </div>
      </div>
      <label>Resumo (aparece no cartão)
        <textarea name="descricao" placeholder="Uma ou duas frases sobre ele"></textarea>
      </label>

      <div class="campo">Detalhes (aparecem na página do personagem)
        <div class="secoes-edicao"></div>
        <div class="sugestoes-secoes"></div>
      </div>

      <p class="erro"></p>
      <div class="botoes-modal">
        <button type="button" class="perigo esquerda btn-excluir">Excluir</button>
        <button type="button" class="btn-cancelar">Cancelar</button>
        <button type="submit" class="primario">Salvar</button>
      </div>
    </form>
  `;
  document.body.appendChild(modal);

  const form = modal.querySelector('form');
  const erro = modal.querySelector('.erro');
  const btnExcluir = modal.querySelector('.btn-excluir');
  const listaSecoes = modal.querySelector('.secoes-edicao');
  const sugestoes = modal.querySelector('.sugestoes-secoes');
  let editando = null;
  let campanhas = [];

  const campoImagem = ligarCampoImagem(
    modal.querySelector('.campo-imagem'),
    () => {
      const c = campanhas.find(x => x.id === form.campanhaId.value);
      return `<div class="sem-imagem" style="--cor: ${esc(c ? c.cor : '#d9a441')}">${D20_SVG}</div>`;
    },
    RECORTE_PERSONAGEM,
  );
  form.campanhaId.addEventListener('change', () => campoImagem.desenhar());

  // ----- Seções de detalhes -----

  function adicionarSecao(titulo = '', texto = '', focar = true) {
    const div = document.createElement('div');
    div.className = 'secao-edicao';
    div.innerHTML = `
      <div class="cabeca-secao">
        <input type="text" class="titulo-secao" placeholder="Título da seção">
        <button type="button" class="pequeno" data-acao="subir" title="Subir">↑</button>
        <button type="button" class="pequeno" data-acao="descer" title="Descer">↓</button>
        <button type="button" class="pequeno perigo" data-acao="remover" title="Remover seção">✕</button>
      </div>
      <textarea class="texto-secao" rows="4"></textarea>
    `;
    div.querySelector('.titulo-secao').value = titulo;
    div.querySelector('.texto-secao').value = texto;
    listaSecoes.appendChild(div);
    desenharSugestoes();
    if (focar) div.querySelector(titulo ? '.texto-secao' : '.titulo-secao').focus();
  }

  // Botões para criar seções comuns (as que já existem somem da lista)
  function desenharSugestoes() {
    const usadas = [...listaSecoes.querySelectorAll('.titulo-secao')].map(i => i.value.trim().toLowerCase());
    sugestoes.innerHTML = SUGESTOES_SECOES
      .filter(s => !usadas.includes(s.toLowerCase()))
      .map(s => `<button type="button" class="pequeno" data-sugestao="${esc(s)}">+ ${esc(s)}</button>`)
      .join('') + '<button type="button" class="pequeno" data-sugestao="">+ Outra seção</button>';
  }

  sugestoes.addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (botao) adicionarSecao(botao.dataset.sugestao);
  });

  listaSecoes.addEventListener('click', (e) => {
    const botao = e.target.closest('button[data-acao]');
    if (!botao) return;
    const secao = botao.closest('.secao-edicao');
    if (botao.dataset.acao === 'remover') {
      const temTexto = secao.querySelector('.texto-secao').value.trim();
      if (temTexto && !confirm('Remover esta seção?')) return;
      secao.remove();
      desenharSugestoes();
    }
    if (botao.dataset.acao === 'subir' && secao.previousElementSibling) secao.after(secao.previousElementSibling);
    if (botao.dataset.acao === 'descer' && secao.nextElementSibling) secao.before(secao.nextElementSibling);
  });

  listaSecoes.addEventListener('input', (e) => {
    if (e.target.classList.contains('titulo-secao')) desenharSugestoes();
  });

  function coletarSecoes() {
    return [...listaSecoes.querySelectorAll('.secao-edicao')].map(div => ({
      titulo: div.querySelector('.titulo-secao').value,
      texto: div.querySelector('.texto-secao').value,
    }));
  }

  // ----- Salvar / excluir -----

  // Salvar e excluir passam pela trava contra cliques duplos
  function executar(acao) {
    return semCliqueDuplo(form, async () => {
      try {
        await acao();
      } catch (e) {
        erro.textContent = e.message;
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = {
      nome: form.nome.value,
      classe: form.classe.value,
      fellaId: form.fellaId.value,
      campanhaId: form.campanhaId.value,
      descricao: form.descricao.value,
      detalhes: coletarSecoes(),
    };
    executar(async () => {
      const salvo = editando
        ? await api('PUT', `/personagens/${editando.id}`, dados)
        : await api('POST', '/personagens', dados);
      // Se a imagem falhar e a pessoa salvar de novo, edita este em vez de criar outro
      editando = salvo;
      await campoImagem.salvar('personagens', salvo.id);
      modal.close();
      if (depoisDeSalvar) await depoisDeSalvar(salvo);
    });
  });

  btnExcluir.addEventListener('click', () => {
    if (!confirm(`Excluir o personagem ${editando.nome}?`)) return;
    executar(async () => {
      await api('DELETE', `/personagens/${editando.id}`);
      modal.close();
      if (depoisDeExcluir) await depoisDeExcluir(editando);
    });
  });

  modal.querySelector('.btn-cancelar').addEventListener('click', () => modal.close());

  return {
    abrir(p, { fellas, campanhas: listaCampanhas, fellaId } = {}) {
      editando = p || null;
      campanhas = listaCampanhas || [];
      form.reset();
      erro.textContent = '';
      modal.querySelector('.titulo-modal').textContent = p ? 'Editar personagem' : 'Novo personagem';
      btnExcluir.style.display = p ? '' : 'none';

      form.fellaId.innerHTML = fellas.map(f => `<option value="${f.id}">${esc(f.nick)}</option>`).join('');
      const opcoes = lista => lista.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
      const ativas = campanhas.filter(c => c.status === 'ativa');
      const inativas = campanhas.filter(c => c.status !== 'ativa');
      form.campanhaId.innerHTML = '<option value="">— Nenhuma —</option>' +
        (ativas.length ? `<optgroup label="Ativas">${opcoes(ativas)}</optgroup>` : '') +
        (inativas.length ? `<optgroup label="Inativas">${opcoes(inativas)}</optgroup>` : '');

      // Um NPC (sem jogador) aberto aqui ganha a opção de continuar sem jogador
      const npc = p && !p.fellaId;
      if (npc) form.fellaId.insertAdjacentHTML('afterbegin', '<option value="">— Ninguém (NPC) —</option>');
      form.fellaId.required = !npc;
      form.fellaId.value = p ? p.fellaId : (fellaId || '');
      form.campanhaId.value = p ? p.campanhaId || '' : '';
      if (p) {
        form.nome.value = p.nome;
        form.classe.value = p.classe;
        form.descricao.value = p.descricao;
      }

      listaSecoes.innerHTML = '';
      for (const s of (p && p.detalhes) || []) adicionarSecao(s.titulo, s.texto, false);
      desenharSugestoes();

      campoImagem.iniciar(p ? p.imagem : '');
      modal.showModal();
    },
  };
}
