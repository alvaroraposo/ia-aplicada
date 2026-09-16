import { UserController } from "./controller/UserController.js";
import { ProductController } from "./controller/ProductController.js";
import { ModelController } from "./controller/ModelTrainingController.js";
import { TFVisorController } from "./controller/TFVisorController.js";
import { TFVisorView } from "./view/TFVisorView.js";
import { UserService } from "./service/UserService.js";
import { ProductService } from "./service/ProductService.js";
import { UserView } from "./view/UserView.js";
import { ProductView } from "./view/ProductView.js";
import { ModelView } from "./view/ModelTrainingView.js";
import Events from "./events/events.js";
import { WorkerController } from "./controller/WorkerController.js";

/*

Projeto rodará no navegador, com processamento massivo de CPU, 
usaremos Multithreading em JavaScript. 
Todo processo da rede neural ocorrerá em segundo plano 
e o processo principal do navegador vai ser responsável apenas por atualizar os dados.

Dada uma base de dados de compras de clientes, 
ordenar a lista de produtos com maior probabilidade de comprarem.

Se for um cliente novo, deve ser levado em consideração os atributos de outros compradores 
com perfil similar. 

Para que os dados sejam precisos é necessário bastante treinamento. 
Quanto mais compras e clientes, mais preciso o modelo será. 

npm ci -- restaura pacotes

usa biblioteca do tensorflow tfvis que exibe gráficos conforme formos treinando o modelo

na pasta data todos os usuários e compras simuladas
o objetivo é relacionar os atributos como idade, 
preço e categoria da venda para prever comportamentos e indicar novos produtos

Jozézin da Silva é um usuário vazio - não participa do treinamento
outros usuários já possuem vendas - usuários - é possível remover e acrescentar novas compras

Vamos treinar o modelo, ele vai atualizar o layout lateral, ao trocar o usuário, em Products 
a lista deve estar ordenada com as melhores recomendações.

Se for cliente vazio, deve tentar relacionar com cliente com perfil parecido.

Vamos trabalhar na pasta workers. Comentários seguirão em modelTrainingWorker.js

Videoaula 03
  - Já criamos contexto para usar no treinamento e na predição
  - Vamos transformar em Tensores

  Vamos trabalhar na pasta workers. Comentários seguirão em modelTrainingWorker.js

Videoaula 04
  - Na aula anterior transformamos os dados de produtos em tensores, normalizando valores
  - agora vamos normalizar usuários e produtos.

Videoaula 05
  - Agora vamos treinar nosso modelo usando todos os dados

Videoaula 06
  - Vamos treinar usuário ou reconhecer usuários que não tem compra
  - Por fim, fazer recomendações
*/

// Create shared services
const userService = new UserService();
const productService = new ProductService();

// Create views
const userView = new UserView();
const productView = new ProductView();
const modelView = new ModelView();
const tfVisorView = new TFVisorView();
const mlWorker = new Worker("/src/workers/modelTrainingWorker.js", {
  type: "module",
});

// Set up worker message handler
const w = WorkerController.init({
  worker: mlWorker,
  events: Events,
});

const users = await userService.getDefaultUsers();
w.triggerTrain(users);

ModelController.init({
  modelView,
  userService,
  events: Events,
});

TFVisorController.init({
  tfVisorView,
  events: Events,
});

ProductController.init({
  productView,
  userService,
  productService,
  events: Events,
});

const userController = UserController.init({
  userView,
  userService,
  productService,
  events: Events,
});

userController.renderUsers({
  id: 99,
  name: "Josézin da Silva",
  age: 30,
  purchases: [],
});
