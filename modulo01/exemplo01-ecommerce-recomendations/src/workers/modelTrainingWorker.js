import "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
//variável utilizada para atualziar progresso, mandar logs do treinamento e informar que o treinamento acabou
import { workerEvents } from "../events/constants.js";
/* 
    em package.json - BrowserSync - atualização automática de navegador
    há separação entre a parte visual e a lógica de treinamento/teste

    O processo de ML depende de normalizarmos os dados e transformarmos o .json em tensores
    sistemas de recomendação utilizam pesos para definir importância de categorias

    worker é inicializado na src/index.js
    - permite envio e recebimento de mensagens. Não travar a tela do cliente enquanto estiver trabalhando
    - um processo trata do layout e outro de processar dados

    src/controller/WorkerController.js
    - quando o modelo for treinado (onTrainModel),
    - quando o treinamento terminar (onTrainingComplete)
    - quando alguém chamar a recomendação (onRecommend)
    - o mais utilizado será o evento de mensagem (onmessage)

    - Tensor - passo a passo
    Dados estão em JSON, os transforma em números de 0 a 1
    Faixas de idade devem ser normalizadas
    Transformar para os tensores e treinar a rede neural

    Videoaula 03
    - Imaginando um ecommerce que tem milhões de produtos. Não deixar vetores em memória
    - Salva-los em banco de dados
    - Guardar dados em banco de dados de vetor. Havendo um cliente novo, 
      perguntar para o banco pela quantidade X de usuários com perfil mais parecido.
      Somente essa quantidade X ficaria em memória    
      Normalizamos produtos e fizemos relacionamento entre usuários existentes
        - Colocando média de usuários que compraram esse mesmo produto
        - Colocando categoria, transformando e normalizando os dados para enviar para o modelo

  Videoaula 04
  - Aqui processamos todos os produtos relacionando clientes
  - também relacionamos todos os clientes relacionando produtos
  - dizendo pra rede neural quem comprou o quê
  - O pré-processamento é o que dá mais trabalho. 
  - Na próxima aula: treinamento e predição de usuários

  Videoaula 05
  - Agora o treinament já é realizado, já conseguimos ver o modelo executado
  - Próxima aula: Vamos mandar usuários para fazermos as recomendações

  Indicação
  - Revisar o código
  - Perguntar ao chatgpt ou google
  - E se houvesse uma categoria de estado?
  - Se fosse de filmes? O que mudaria?
  - Usar banco de dados de vetor - ChromaDB, Extensão do Postgres
    - Treinar o modelo e salvar vetores de produtos e clientes direto no banco
    - Quando for usar o método para fazer a predição, trazer do banco os 100 clientes mais próximos 
      do vetor do cliente no contexto e rodar o metodo predict do TFJS. 
      - Buscar bases de dados no kaggle
*/

let _globalCtx = {};
let _model = null;

const WEIGHTS = {
  category: 0.4,
  color: 0.3,
  price: 0.2,
  age: 0.1,
};
console.log("Model training worker initialized");

// Normalize continuous values (price, age) to 0-1 range
// Why? keeps all features balanced so no one dominates training
// Formula: (val - min) / (max - min)
// Example: price=129.99, minPrice=39.99, maxPrice=199.99 -> 0.56

const normalize = (value, min, max) => (value - min) / (max - min || 1);
function makeContext(products, users) {
  // normalização similar a feita no exemplo 00 porém com código... colocar números entre 0 e 1
  const ages = users.map((u) => u.age);
  const prices = products.map((p) => p.price);

  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // teremos que dar peso para as cores
  // garantir que não venham idades repetidas
  const colors = [...new Set(products.map((p) => p.color))];
  const categories = [...new Set(products.map((p) => p.category))];

  //vamos mapear índices para montar a tabela manualmente
  const colorsIndex = Object.fromEntries(
    colors.map((color, index) => {
      return [color, index];
    }),
  );
  const categoriesIndex = Object.fromEntries(
    categories.map((category, index) => {
      return [category, index];
    }),
  );

  //Computar a média de idade dos compradores por produto (ajuda a personalizar)
  const midAge = (minAge + maxAge) / 2;
  const ageSums = {};
  const ageCounts = {};

  users.forEach((user) => {
    user.purchases.forEach((p) => {
      ageSums[p.name] = (ageSums[p.name] || 0) + user.age;
      ageCounts[p.name] = (ageCounts[p.name] || 0) + 1;
    });
  });
  // se existe categoria com nome (product.name), pegar média de idades e dividir por quantas vezes ele aparece
  //média de idade de pessoas que compraram produto
  const productAvgAgeNorm = Object.fromEntries(
    products.map((product) => {
      const avg = ageCounts[product.name]
        ? ageSums[product.name] / ageCounts[product.name]
        : midAge;

      // retornar nome do produto com sua média de idade normalizada

      return [product.name, normalize(avg, minAge, maxAge)];
    }),
  );

  return {
    products,
    users,
    colorsIndex,
    categoriesIndex,
    productAvgAgeNorm,
    minAge,
    maxAge,
    minPrice,
    maxPrice,
    numCategories: categories.length,
    numColors: colors.length,
    dimensions: 2 + categories.length + colors.length, // price + age + colors + categories
  };
}

const oneHotWeighed = (index, length, weight) =>
  tf.oneHot(index, length).cast("float32").mul(weight);

function encodeProduct(product, context) {
  //vamos fazer normalização em cima dos tensores
  //categoria item mais importante, depois preço, depois idade

  const price = tf.tensor1d([
    normalize(product.price, context.minPrice, context.maxPrice) *
      WEIGHTS.price,
  ]);

  const cProductAvgAgeNorm = context.productAvgAgeNorm[product.name];
  const age = tf.tensor1d([(cProductAvgAgeNorm ?? 0.5) * WEIGHTS.age]);

  const category = oneHotWeighed(
    context.categoriesIndex[product.category],
    context.numCategories,
    WEIGHTS.category,
  );

  const color = oneHotWeighed(
    context.colorsIndex[product.color],
    context.numColors,
    WEIGHTS.color,
  );

  return tf.concat1d([price, age, category, color]);
}

function encodeUser(user, context) {
  if (user.purchases.length) {
    //vamos empilhar todas as vendas em um único vetor
    //cada linha será uma compra do usuário
    //tratamento somente para usuários que tenham compras
    return tf
      .stack(user.purchases.map((product) => encodeProduct(product, context)))
      .mean(0) // calcular a media dos vetorews para retornar um unico valor
      .reshape([1, context.dimensions]);
  }

  return tf
    .concat1d([
      tf.zeros([1]), // preço é ignorado,
      tf.tensor1d([
        normalize(user.age, context.minAge, context.maxAge) * WEIGHTS.age,
      ]), //idade é unica informação de quem nunca comprou
      tf.zeros([context.numCategories]), // categoria ignorada,
      tf.zeros([context.numColors]), // color ignorada,
    ])
    .reshape([1, context.dimensions]);
}
//Vamos usar para gerar os dados de treinamento de usuários ativos
function createTrainingData(context) {
  const inputs = [];
  const labels = [];

  //filter: somente usuários que possuem compras
  //necessário para o botão train model funcionar. O primeiro usuário não tem compras
  context.users
    .filter((u) => u.purchases.length)
    .forEach((user) => {
      const userVector = encodeUser(user, context).dataSync();
      //validar se a pessoa comprou ou não um produto
      context.products.forEach((product) => {
        const productVector = encodeProduct(product, context).dataSync();

        const label = user.purchases.some((purchase) =>
          purchase.name === product.name ? 1 : 0,
        );

        //combinar user + product
        //Usuário X comprou produto Y
        //facilitar trabalho da rede neural
        inputs.push([...userVector, ...productVector]);
        labels.push(label);
      });
    });

  return {
    xs: tf.tensor2d(inputs),
    ys: tf.tensor2d(labels, [labels.length, 1]),
    inputDimension: context.dimensions * 2, // tamanho = userVector + productVector
  };
}

// ====================================================================
// 📌 Exemplo de como um usuário é ANTES da codificação
// ====================================================================
/*
const exampleUser = {
    id: 201,
    name: 'Rafael Souza',
    age: 27,
    purchases: [
        { id: 8, name: 'Boné Estiloso', category: 'acessórios', price: 39.99, color: 'preto' },
        { id: 9, name: 'Mochila Executiva', category: 'acessórios', price: 159.99, color: 'cinza' }
    ]
};
*/

// ====================================================================
// 📌 Após a codificação, o modelo NÃO vê nomes ou palavras.
// Ele vê um VETOR NUMÉRICO (todos normalizados entre 0–1).
// Exemplo: [preço_normalizado, idade_normalizada, cat_one_hot..., cor_one_hot...]
//
// Suponha categorias = ['acessórios', 'eletrônicos', 'vestuário']
// Suponha cores      = ['preto', 'cinza', 'azul']
//
// Para Rafael (idade 27, categoria: acessórios, cores: preto/cinza),
// o vetor poderia ficar assim:
//
// [
//   0.45,            // peso do preço normalizado
//   0.60,            // idade normalizada
//   1, 0, 0,         // one-hot de categoria (acessórios = ativo)
//   1, 0, 0          // one-hot de cores (preto e cinza ativos, azul inativo)
// ]
//
// São esses números que vão para a rede neural.
// ====================================================================

// ====================================================================
// 🧠 Configuração e treinamento da rede neural
// ====================================================================
async function configureNeuralNetAndTrain(trainData) {
  const model = tf.sequential();
  // Camada de entrada
  // - inputShape: Número de features por exemplo de treino (trainData.inputDim)
  //   Exemplo: Se o vetor produto + usuário = 20 números, então inputDim = 20
  // - units: 128 neurônios (muitos "olhos" para detectar padrões)
  // - activation: 'relu' (mantém apenas sinais positivos, ajuda a aprender padrões não-lineares)
  model.add(
    tf.layers.dense({
      inputShape: [trainData.inputDimension],
      units: 128,
      activation: "relu",
    }),
  );

  //Especialistas em ML podem não aprovar
  //Foram adicionadas camadas para o modelo se adaptar mais
  //não é necessário o INPUTSHAPE novamente
  //Camada maior entende toda a base de dados
  //A proxima camada vai continuar aprendendo
  //A ultima reprende com menos dados ainda

  // Camada oculta 1
  // - 64 neurônios (menos que a primeira camada: começa a comprimir informação)
  // - activation: 'relu' (ainda extraindo combinações relevantes de features)
  model.add(
    tf.layers.dense({
      units: 64,
      activation: "relu",
    }),
  );

  // Camada oculta 2
  // - 32 neurônios (mais estreita de novo, destilando as informações mais importantes)
  //   Exemplo: De muitos sinais, mantém apenas os padrões mais fortes
  // - activation: 'relu'
  model.add(
    tf.layers.dense({
      units: 32,
      activation: "relu",
    }),
  );

  // Camada de saída
  // - 1 neurônio porque vamos retornar apenas uma pontuação de recomendação
  // - activation: 'sigmoid' comprime o resultado para o intervalo 0–1
  //   Exemplo: 0.9 = recomendação forte, 0.1 = recomendação fraca
  model.add(
    tf.layers.dense({
      units: 1,
      activation: "sigmoid",
    }),
  );

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });

  //input (xs) e resultados (ys)
  await model.fit(trainData.xs, trainData.ys, {
    epochs: 100,
    batchSize: 32,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        //atualiza gráfico. Precisão aumenta cada ciclo e erro diminui
        postMessage({
          type: workerEvents.trainingLog,
          epoch: epoch,
          loss: logs.loss,
          accuracy: logs.acc,
        });
      },
    },
  });

  return model;
}

async function trainModel({ users }) {
  console.log("Training model with users:", users);

  postMessage({
    type: workerEvents.progressUpdate,
    progress: { progress: 1 },
  });

  //carrega base de produtos
  const products = await (await fetch("/data/products.json")).json();
  //
  const context = makeContext(products, users);

  context.productVectors = products.map((product) => {
    return {
      name: product.name,
      meta: { ...product },
      vector: encodeProduct(product, context).dataSync(),
    };
  });

  //criamos uma variável global para podermos usar depois. O ideal é que esteja em um BD de Vetores
  _globalCtx = context;

  const trainData = createTrainingData(context);

  _model = await configureNeuralNetAndTrain(trainData);

  setTimeout(() => {
    postMessage({
      type: workerEvents.progressUpdate,
      progress: { progress: 100 },
    });
    postMessage({ type: workerEvents.trainingComplete });
  }, 1000);
}
function recommend(user, ctx) {
  if (!_model) return;
  const context = _globalCtx;
  // 1️⃣ Converta o usuário fornecido no vetor de features codificadas
  //    (preço ignorado, idade normalizada, categorias ignoradas)
  //    Isso transforma as informações do usuário no mesmo formato numérico
  //    que foi usado para treinar o modelo.

  const userVector = encodeUser(user, context).dataSync();

  // Em aplicações reais:
  //  Armazene todos os vetores de produtos em um banco de dados vetorial (como Postgres, Neo4j ou Pinecone, CromaDB)
  //  Consulta: Encontre os 200 produtos mais próximos do vetor do usuário
  //  Com ele usariamos Execute _model.predict() apenas nesses produtos

  // 2️⃣ Crie pares de entrada: para cada produto, concatene o vetor do usuário
  //    com o vetor codificado do produto.
  //    Por quê? O modelo prevê o "score de compatibilidade" para cada par (usuário, produto).

  const inputs = context.productVectors.map(({ vector }) => {
    return [...userVector, ...vector];
  });

  // 3️⃣ Converta todos esses pares (usuário, produto) em um único Tensor.
  //    Formato: [numProdutos, inputDim]
  const inputTensor = tf.tensor2d(inputs);

  // 4️⃣ Rode a rede neural treinada em todos os pares (usuário, produto) de uma vez.
  //    O resultado é uma pontuação para cada produto entre 0 e 1.
  //    Quanto maior, maior a probabilidade do usuário querer aquele produto.
  const predictions = _model.predict(inputTensor);

  // 5️⃣ Extraia as pontuações para um array JS normal.
  const scores = predictions.dataSync();

  const recommendations = context.productVectors.map((item, index) => {
    return {
      ...item.meta,
      name: item.name,
      score: scores[index], // previsão do modelo para este produto
    };
  });

  const sortedItems = recommendations.sort((a, b) => b.score - a.score);

  // 8️⃣ Envie a lista ordenada de produtos recomendados
  //    para a thread principal (a UI pode exibi-los agora).
  postMessage({
    type: workerEvents.recommend,
    user,
    recommendations: sortedItems,
  });
}

const handlers = {
  [workerEvents.trainModel]: trainModel,
  [workerEvents.recommend]: (d) => recommend(d.user, _globalCtx),
};

self.onmessage = (e) => {
  const { action, ...data } = e.data;
  if (handlers[action]) handlers[action](data);
};
