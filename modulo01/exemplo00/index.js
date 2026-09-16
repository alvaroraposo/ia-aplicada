import tf from "@tensorflow/tfjs-node";

async function trainModel(inputXs, outputYs) {
  //No tensorflowjs adicionamos uma camada de fluxo sequencial
  const model = tf.sequential();

  // Primeira camada da rede:
  // entrada de 7 posições (idade normalizada + 3 cores + 3 localizadores)

  //setar neuronios -- camadas de calculo para entender o padrão de como vai funcionar

  // 80 neuronios = aqui coloquei tudo isso, pq tem pouca base de treino
  // quanto mais neuronios, mais complexidade a rede pode aprender
  // e consequentemente, mais processamento ela vai usar

  // Ativação - Fará calculos que resultam entre zero e 1. Se for negativo descarta.
  // A ReLU age como um filtro:
  // É como se ela deixasse somente os dados interessantes seguirem viagem na rede
  // se for zero ou negativa, pode jogar fora, nao vai servir.
  model.add(
    tf.layers.dense({ inputShape: [7], units: 80, activation: "relu" }),
  );

  // Saída: 3 neuronios
  // um para cada categoria (premium, medium e basic)

  // activation: softmax normaliza a saida em probabilidades
  model.add(tf.layers.dense({ units: 3, activation: "softmax" }));

  //Compilando o modelo
  //    preparar o modelo e falar para ele como ele vai otimizar e o qual processo vai utilizar para aprender com os padrões
  //optimizer Adam (Adaptive Moment Estimation)
  // é um treinador pessoal moderno para redes neurais
  //ajusta os pesos de forma eficiente e inteligente
  //vai aprender com histórico de erros e acertos

  // loss vai executar os calculos, quanto mais acertar, melhor ficará o modelo
  // categoricalCrossentropy - Compara o que o modelo acha (os scores de cada categoria)
  // com a resposta certa.
  // a categoria premium será sempre [1, 0, 0]
  // metrics: quanto
  model.compile({
    optimizer: "adam",
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  //Treinamento do modelo
  //epochs qt vezes roda o dataset - passar 100 vezes pela base de dados para aprender
  //shuffle - cada treinamento vai invertendo a ordem (nao viciar algoritmo). Evitar viés

  //callbacks - onEpochEnd, após cada passagem pela base, gera um log
  // verbose - desabilita log interno

  await model.fit(inputXs, outputYs, {
    verbose: 0,
    epochs: 100,
    shuffle: true,
    //callbacks: {
    //onEpochEnd: (epoch, log) =>
    //console.log(`Epoch: ${epoch}: loss = ${log.loss}`),
    //},
  });

  return model;
}

async function predict(model, pessoa) {
  // transformar o array js para tensor (tfjs)
  const tfInput = tf.tensor2d(pessoa);

  //faz a predição (output será um vetor de 3 probabilidades)
  const pred = model.predict(tfInput);
  const predArray = await pred.array();

  //console.log(predArray);

  return predArray[0].map((prob, index) => ({ prob, index }));
}
// Exemplo de pessoas para treino (cada pessoa com idade, cor e localização)
// const pessoas = [
//     { nome: "Erick", idade: 30, cor: "azul", localizacao: "São Paulo" },
//     { nome: "Ana", idade: 25, cor: "vermelho", localizacao: "Rio" },
//     { nome: "Carlos", idade: 40, cor: "verde", localizacao: "Curitiba" }
// ];

// Vetores de entrada com valores já normalizados e one-hot encoded
// Ordem: [idade_normalizada, azul, vermelho, verde, São Paulo, Rio, Curitiba]
// const tensorPessoas = [
//     [0.33, 1, 0, 0, 1, 0, 0], // Erick
//     [0, 0, 1, 0, 0, 1, 0],    // Ana
//     [1, 0, 0, 1, 0, 0, 1]     // Carlos
// ]

// Usamos apenas os dados numéricos, como a rede neural só entende números.
// tensorPessoasNormalizado corresponde ao dataset de entrada do modelo.
const tensorPessoasNormalizado = [
  [0.33, 1, 0, 0, 1, 0, 0], // Erick
  [0, 0, 1, 0, 0, 1, 0], // Ana
  [1, 0, 0, 1, 0, 0, 1], // Carlos
];

// Labels das categorias a serem previstas (one-hot encoded)
// [premium, medium, basic]
const labelsNomes = ["premium", "medium", "basic"]; // Ordem dos labels
const tensorLabels = [
  [1, 0, 0], // premium - Erick
  [0, 1, 0], // medium - Ana
  [0, 0, 1], // basic - Carlos
];

// Criamos tensores de entrada (xs) e saída (ys) para treinar o modelo
const inputXs = tf.tensor2d(tensorPessoasNormalizado);
const outputYs = tf.tensor2d(tensorLabels);

const model = await trainModel(inputXs, outputYs);

// vamos criar uma pessoa que não participou do treinamento

const pessoa = {
  nome: "José",
  idade: 28,
  cor: "verde",
  localizacao: "Curitiba",
};

// normalizando a idade da nova pessoa com o mesmo padrao do treino
// exemplo: idade_min = 25, idade_max = 40, entao (28 - 25) / (40 - 25) = 0.2

const pessoaTensorNormalizado = [
  [
    0.2, // idade normalizada
    0, //azul
    0,
    1, // verde
    0, // São Paulo
    0,
    1, // Curitiba
  ],
];

// Com esses dados podemos prever

const predictions = await predict(model, pessoaTensorNormalizado);
const results = predictions
  .sort((a, b) => b.prob - a.prob)
  .map((p) => `${labelsNomes[p.index]} (${(p.prob * 100).toFixed(2)}%)`)
  .join("\n");

console.log(results);
