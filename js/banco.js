// Conexão com o Supabase (banco + login + imagens).
// As páginas chamam api('GET', '/fellas'), api('POST', '/campanhas', {...}) etc.,
// e aqui isso vira consultas no Supabase.

const configOk = !!CONFIG.supabaseUrl && !CONFIG.supabaseUrl.includes('SEU-PROJETO')
  && !!CONFIG.supabaseAnonKey && !CONFIG.supabaseAnonKey.includes('COLE-AQUI');

const sb = configOk ? supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;

// Sessão salva no navegador (o Supabase guarda e renova sozinho)
const sessaoPronta = sb ? sb.auth.getSession().then(r => r.data.session) : Promise.resolve(null);

if (!configOk) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="aviso-config">Falta configurar o Supabase em <code>js/config.js</code> (veja o README).</div>');
  });
}

// ---------- Login ----------

async function entrar(usuario, senha) {
  if (!sb) throw new Error('Supabase não configurado');
  if (usuario.trim().toLowerCase() !== CONFIG.loginUsuario.toLowerCase()) {
    throw new Error('Login ou senha incorretos');
  }
  const { error } = await sb.auth.signInWithPassword({ email: CONFIG.loginEmail, password: senha });
  if (error) throw new Error('Login ou senha incorretos');
}

// Chamar no topo de toda página que precisa de login
function exigirLogin() {
  sessaoPronta.then(sessao => {
    if (!sessao) window.location.href = 'index.html';
  });
}

async function sair() {
  if (sb) await sb.auth.signOut();
  window.location.href = 'index.html';
}

// ---------- Conversões ----------

// campanhaId <-> campanha_id
const paraColuna = chave => chave.replace(/[A-Z]/g, l => '_' + l.toLowerCase());
const paraCampo = coluna => coluna.replace(/_([a-z])/g, (_, l) => l.toUpperCase());

function paraBanco(obj) {
  const linha = {};
  for (const [chave, valor] of Object.entries(obj)) linha[paraColuna(chave)] = valor;
  return linha;
}

function doBanco(linha) {
  const obj = {};
  for (const [coluna, valor] of Object.entries(linha)) obj[paraCampo(coluna)] = valor;
  return obj;
}

// Transforma o erro do Supabase numa mensagem que dá pra mostrar
function erroAmigavel(error) {
  if (error.code === '23503') return 'Registro relacionado não existe (foi excluído?)';
  if (error.code === '23514') return 'Preencha os campos obrigatórios';
  if (error.code === '42501') return 'Sem permissão. Saia e entre de novo.';
  if (/jwt/i.test(error.message || '')) {
    sair();
    return 'Sessão expirada';
  }
  return error.message || 'Erro inesperado';
}

// Executa uma consulta do Supabase e já trata o erro
async function rodar(consulta) {
  const { data, error } = await consulta;
  if (error) throw new Error(erroAmigavel(error));
  return data;
}

// ---------- Tabelas ----------

const texto = v => String(v ?? '').trim();

function limparSessao(b) {
  return {
    campanhaId: String(b.campanhaId || ''),
    data: /^\d{4}-\d{2}-\d{2}$/.test(b.data) ? b.data : '',
    hora: /^\d{2}:\d{2}$/.test(b.hora) ? b.hora : '',
    notas: texto(b.notas),
    resumo: texto(b.resumo), // o que aconteceu na sessão
  };
}

/**
 * Como cada tabela é lida e gravada.
 * - limpar(obj): pega só os campos válidos (os nomes viram colunas: campanhaId -> campanha_id)
 * - validar(obj): mensagem de erro amigável ou null (o banco também confere)
 * - leitura: de onde ler (a de campanhas é uma view com a contagem de sessões)
 * - ordem: coluna para ordenar
 */
const TABELAS = {
  fellas: {
    limpar: b => ({ nick: texto(b.nick), observacoes: texto(b.observacoes) }),
    validar: d => (d.nick ? null : 'Nick é obrigatório'),
    ordem: 'nick',
  },
  campanhas: {
    leitura: 'campanhas_com_contagem',
    limpar: b => ({
      nome: texto(b.nome),
      sistema: texto(b.sistema),
      mestreId: String(b.mestreId || ''),
      jogadores: Array.isArray(b.jogadores) ? b.jogadores.map(String) : [],
      status: b.status === 'inativa' ? 'inativa' : 'ativa',
      cor: /^#[0-9a-fA-F]{6}$/.test(b.cor) ? b.cor : '#8b5cf6',
      descricao: texto(b.descricao),
      // "imagem" fica de fora: só é trocada pelas funções de imagem
    }),
    validar: d => (d.nome ? null : 'Nome é obrigatório'),
    ordem: 'nome',
  },
  sessoes: {
    limpar: limparSessao,
    validar: d => (!d.data ? 'Data inválida' : !d.campanhaId ? 'Escolha uma campanha' : null),
    ordem: 'data',
  },
  personagens: {
    limpar: b => ({
      campanhaId: String(b.campanhaId || ''),
      nome: texto(b.nome),
      fellaId: String(b.fellaId || ''),
      classe: texto(b.classe),
      descricao: texto(b.descricao),
    }),
    validar: d => (d.nome ? null : 'Nome é obrigatório'),
    ordem: 'nome',
  },
  itens: {
    limpar: b => ({
      campanhaId: String(b.campanhaId || ''),
      nome: texto(b.nome),
      quantidade: Math.max(0, parseInt(b.quantidade, 10) || 1),
      descricao: texto(b.descricao),
    }),
    validar: d => (d.nome ? null : 'Nome do item é obrigatório'),
    ordem: 'nome',
  },
};

async function listar(tabela, campanhaId) {
  const t = TABELAS[tabela];
  let consulta = sb.from(t.leitura || tabela).select('*').order(t.ordem);
  if (campanhaId) consulta = consulta.eq('campanha_id', campanhaId);
  return (await rodar(consulta)).map(doBanco);
}

async function buscar(tabela, id) {
  const t = TABELAS[tabela];
  const linha = await rodar(sb.from(t.leitura || tabela).select('*').eq('id', id).maybeSingle());
  if (!linha) throw new Error('Não encontrado');
  return doBanco(linha);
}

async function criar(tabela, corpo) {
  const t = TABELAS[tabela];
  const dados = t.limpar(corpo || {});
  const erro = t.validar(dados);
  if (erro) throw new Error(erro);
  const linha = await rodar(sb.from(tabela).insert(paraBanco(dados)).select('id').single());
  return buscar(tabela, linha.id);
}

// Os campos não enviados mantêm o valor que já tinham
async function atualizar(tabela, id, corpo) {
  const t = TABELAS[tabela];
  const atual = await buscar(tabela, id);
  const dados = t.limpar({ ...atual, ...(corpo || {}) });
  const erro = t.validar(dados);
  if (erro) throw new Error(erro);
  await rodar(sb.from(tabela).update(paraBanco(dados)).eq('id', id));
  return buscar(tabela, id);
}

async function excluir(tabela, id) {
  // Junta as imagens que vão ficar órfãs para apagar depois
  let imagens = [];
  if (tabela === 'campanhas') {
    const c = await buscar('campanhas', id);
    const pers = await listar('personagens', id);
    imagens = [c.imagem, ...pers.map(p => p.imagem)];
  } else if (tabela === 'personagens') {
    imagens = [(await buscar('personagens', id)).imagem];
  }
  // O banco bloqueia campanha com sessão jogada e apaga sessões/personagens/itens junto
  await rodar(sb.from(tabela).delete().eq('id', id));
  await apagarArquivos(imagens);
  return null;
}

// ---------- Sessões que se repetem ----------

// Cria uma sessão por semana (ou a cada N semanas) do dia escolhido até a data "ate".
// Todas ganham o mesmo serieId, para dar pra excluir a série depois.
async function criarSerie(corpo) {
  const dados = limparSessao(corpo || {});
  const erro = TABELAS.sessoes.validar(dados);
  if (erro) throw new Error(erro);
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(corpo.ate) ? corpo.ate : '';
  if (!ate || ate < dados.data) throw new Error('A data final precisa ser depois da primeira sessão');
  const semanas = [1, 2, 3, 4].includes(Number(corpo.intervalo)) ? Number(corpo.intervalo) : 1;

  const serieId = crypto.randomUUID();
  const linhas = [];
  const dia = new Date(`${dados.data}T12:00:00Z`);
  while (dia.toISOString().slice(0, 10) <= ate && linhas.length < 104) {
    linhas.push(paraBanco({ ...dados, data: dia.toISOString().slice(0, 10), serieId }));
    dia.setUTCDate(dia.getUTCDate() + 7 * semanas);
  }
  const criadas = await rodar(sb.from('sessoes').insert(linhas).select('*'));
  return criadas.map(doBanco).sort((a, b) => a.data.localeCompare(b.data));
}

// Exclui as sessões de uma série a partir de uma data (inclusive)
async function excluirSerie(serieId, aPartirDe) {
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(aPartirDe) ? aPartirDe : '0001-01-01';
  const apagadas = await rodar(sb.from('sessoes').delete().eq('serie_id', serieId).gte('data', desde).select('id'));
  return { excluidas: apagadas.length };
}

// ---------- Imagens (Supabase Storage, bucket "imagens") ----------

function urlImagem(arquivo) {
  return `${CONFIG.supabaseUrl}/storage/v1/object/public/imagens/${encodeURIComponent(arquivo)}`;
}

async function apagarArquivos(arquivos) {
  const lista = arquivos.filter(Boolean);
  if (lista.length) await sb.storage.from('imagens').remove(lista); // se falhar, só sobra um arquivo solto
}

// Recebe a imagem já redimensionada no navegador (data URL)
async function trocarImagem(tabela, id, dataUrl) {
  const item = await buscar(tabela, id);
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  // Nome muda a cada envio, então o navegador nunca mostra a imagem antiga do cache
  const arquivo = `${id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await rodar(sb.storage.from('imagens').upload(arquivo, blob, { contentType: blob.type, cacheControl: '31536000' }));
  await rodar(sb.from(tabela).update({ imagem: arquivo }).eq('id', id));
  await apagarArquivos([item.imagem]);
  return { imagem: arquivo };
}

async function removerImagem(tabela, id) {
  const item = await buscar(tabela, id);
  await rodar(sb.from(tabela).update({ imagem: '' }).eq('id', id));
  await apagarArquivos([item.imagem]);
  return null;
}

// ---------- api(): o ponto de entrada usado pelas páginas ----------

/**
 * Exemplos:
 *   api('GET', '/campanhas')                     lista
 *   api('GET', '/sessoes?campanhaId=123')        lista filtrada
 *   api('GET', '/campanhas/123')                 um item
 *   api('POST', '/fellas', { nick: 'Ana' })      cria
 *   api('PUT', '/fellas/123', { nick: 'Bia' })   altera
 *   api('DELETE', '/fellas/123')                 exclui
 *   api('PUT', '/campanhas/123/imagem', { dataUrl })   troca a imagem
 *   api('POST', '/sessoes/recorrentes', {...})          cria uma série
 *   api('DELETE', '/sessoes/serie/abc?aPartirDe=AAAA-MM-DD')
 */
async function api(metodo, caminho, corpo) {
  if (!sb) throw new Error('Supabase não configurado (js/config.js)');
  if (!(await sessaoPronta)) {
    window.location.href = 'index.html';
    throw new Error('Faça login');
  }

  const url = new URL(caminho, 'http://local');
  const [tabela, id, extra] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (tabela === 'sessoes' && id === 'recorrentes' && metodo === 'POST') return criarSerie(corpo);
  if (tabela === 'sessoes' && id === 'serie' && metodo === 'DELETE') return excluirSerie(extra, url.searchParams.get('aPartirDe'));
  if (extra === 'imagem') return metodo === 'PUT' ? trocarImagem(tabela, id, corpo.dataUrl) : removerImagem(tabela, id);

  if (!TABELAS[tabela]) throw new Error(`Caminho desconhecido: ${caminho}`);
  if (metodo === 'GET') return id ? buscar(tabela, id) : listar(tabela, url.searchParams.get('campanhaId'));
  if (metodo === 'POST') return criar(tabela, corpo);
  if (metodo === 'PUT') return atualizar(tabela, id, corpo);
  if (metodo === 'DELETE') return excluir(tabela, id);
  throw new Error(`Método desconhecido: ${metodo}`);
}
