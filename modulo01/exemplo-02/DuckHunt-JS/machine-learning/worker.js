importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest");

/**
 * Funcionou
 * Podemos tentar aumentar o CLASS_THRESHOLD
 * Controlar quantas imagens mandamos para análise
 *
 *
 */
const MODEL_PATH = `yolov5n_web_model/model.json`;
const LABELS_PATH = `yolov5n_web_model/labels.json`;
const INPUT_MODEL_DIMENTIONS = 640;
const CLASS_THRESHOLD = 0.4;

let _labels = [];
let _model = null;

//carregar modelo para verificar que funciona
async function loadModelAndLabels() {
  await tf.ready();

  _labels = await (await fetch(LABELS_PATH)).json();
  _model = await tf.loadGraphModel(MODEL_PATH);

  // warmup
  const dummyInput = tf.ones(_model.inputs[0].shape);
  await _model.executeAsync(dummyInput);
  tf.dispose(dummyInput);

  postMessage({ type: "model-loaded" });
}

/**
 * Pré-processa a imagem para o formato aceito pelo YOLO:
 * - tf.browser.fromPixels(): converte ImageBitmap/ImageData para tensor [H, W, 3]
 * - tf.image.resizeBilinear(): redimensiona para [INPUT_DIM, INPUT_DIM]
 * - .div(255): normaliza os valores para [0, 1]
 * - .expandDims(0): adiciona dimensão batch [1, H, W, 3]
 *
 * Uso de tf.tidy():
 * - Garante que tensores temporários serão descartados automaticamente,
 *   evitando vazamento de memória.
 */
function preprocessImage(input) {
  return tf.tidy(() => {
    const image = tf.browser.fromPixels(input);

    return tf.image
      .resizeBilinear(image, [INPUT_MODEL_DIMENTIONS, INPUT_MODEL_DIMENTIONS])
      .div(255)
      .expandDims(0);
  });
}

async function runInference(tensor) {
  const output = await _model.executeAsync(tensor);
  tf.dispose(tensor);
  // Assume que as 3 primeiras saídas são:
  // caixas (boxes), pontuações (scores) e classes

  const [boxes, scores, classes] = output.slice(0, 3);
  const [boxesData, scoresData, classesData] = await Promise.all([
    boxes.data(),
    scores.data(),
    classes.data(),
  ]);

  output.forEach((t) => t.dispose());

  return {
    boxes: boxesData,
    scores: scoresData,
    classes: classesData,
  };
}

/**
 * Filtra e processa as predições:
 * - Aplica o limiar de confiança (CLASS_THRESHOLD)
 * - Filtra apenas a classe desejada (exemplo: 'kite')
 * - Converte coordenadas normalizadas para pixels reais
 * - Calcula o centro do bounding box
 *
 * Uso de generator (function*):
 * - Permite enviar cada predição assim que processada, sem criar lista intermediária
 */

//função geradora!
//modelo pode retornar mais de um item identificado por vez
//para cada identificação a função retornará uma vez
//importante para não acumular dados em memória e não perder o timing do disparo
function* processPrediction({ boxes, scores, classes }, width, height) {
  //índice 0 de boxes tem relação com o índice 0 de scores e o índice 0 de classes

  for (let index = 0; index < scores.length; index++) {
    //se probabilidade for baixa, não dispara
    if (scores[index] < CLASS_THRESHOLD) continue;
    const label = _labels[classes[index]];
    if (label !== "kite") continue;

    //cordenadas iniciais e finais do quadrado que representa o item encontrado
    let [x1, y1, x2, y2] = boxes.slice(index * 4, (index + 1) * 4);

    //coordenadas vem do tamanho da tela do computador, o jogo é 640 x 640
    x1 *= width;
    x2 *= width;
    y1 *= height;
    y2 *= height;

    //é necessário que o disparo seja no centro do quadrado do item

    const boxWidth = x2 - x1; // distancia total horizontal
    const boxHeight = y2 - y1; // distancia total vertical

    const centerX = x1 + boxWidth / 2;
    const centerY = y1 + boxHeight / 2;

    yield {
      x: centerX,
      y: centerY,
      score: (scores[index] * 100).toFixed(2),
    };
  }
}

loadModelAndLabels();

self.onmessage = async ({ data }) => {
  if (data.type !== "predict") return;
  if (!_model) return;

  //transformamos dados da imagem em tensores
  const input = preprocessImage(data.image);
  const { width, height } = data.image;

  //usa dados para detectar objetos
  const inferenceResults = await runInference(input);

  for (const prediction of processPrediction(inferenceResults, width, height)) {
    postMessage({
      type: "prediction",
      ...prediction,
    });
  }
};

console.log("🧠 YOLOv5n Web Worker initialized");
