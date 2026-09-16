import { AIService } from "./services/aiService.js";
import { TranslationService } from "./services/translationService.js";
import { View } from "./views/view.js";
import { FormController } from "./controllers/formController.js";

/**
 * IA rodando no navegador dos usuários é a ideia para a nova web.
 * A Web de agentes de IA em que a google é a pioneira, lançando novidades.
 * Nesse vídeo vemos o que há de novo nesse mundo em que podemos enviamos audios,
 * imagens além de textos.
 * Não tem muita gente falando ainda dessa iniciativa de rodar modelos embarcados no navegador,
 * talvez por ser algo bastante experimental, com muita mudança acontecendo agora.
 * Em um futuro próximo pessoas irão interagir com seu site sem precisar ficar navegando por páginas
 * para achar um resultado.
 * IA nos navegadores, o que isso quer dizer?
 * O Google Chrome entrou com a iniciativa de embarcar um modelo pequeno
 * no navegador que poderemos usar para traduzir textos,
 * gerar resumos, identificar idiomas e trabalhar com prompts.
 * Inclusive, em breve esse modelo vai suportar MCPs para fazer chamadas a websites,
 * consumir APIs externas automaticamente a partir de um prompt.
 * Isso é uma iniciativa em parceria da Microsoft e Google para criar um novo padrão chamado Web MCP.
 * Hoje essa série de APIs de IA embarcada funcionam somente no Chrome,
 * mas existem discussões para que outros navegadores adotem.
 * Testes feitos: Agente para agendamento de barbeiro, verificando disponibilidade.
 * Traduzir voz para textos, para inglês e depois traduzir em prompt. Fazendo o processo inverso a partir da resposta. Hoje é possível fazer tudo em português.
 * A API é Multimodal a AI pode receber dados em diferentes formatos além de texto, como áudio e imagens. Transcrever audio e imagens.
 */

(async function main() {
  // Initialize services and view
  console.log("main");
  const aiService = new AIService();
  console.log("TranslationService");
  const translationService = new TranslationService();
  console.log("view");
  const view = new View();

  // Set current year
  view.setYear();

  // Check requirements
  const errors = await aiService.checkRequirements();
  if (errors) {
    view.showError(errors);
    return;
  }

  // Initialize translation services
  try {
    console.log("translationService", translationService);
    await translationService.initialize();
  } catch (error) {
    console.error("Error initializing translation:", error);
    view.showError([error.message]);
    return;
  }

  // Get and initialize AI parameters
  const params = await aiService.getParams();
  view.initializeParameters(params);

  // Initialize controller and setup event listeners
  const controller = new FormController(aiService, translationService, view);
  controller.setupEventListeners();

  console.log("Application initialized successfully");
})();
