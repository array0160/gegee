"use strict";

const video = document.querySelector("#camera");
const outputCanvas = document.querySelector("#output");
const outputContext = outputCanvas.getContext("2d", {
  alpha: false
});

const startButton = document.querySelector("#startButton");
const statusBox = document.querySelector("#status");

/*
 * 暫存畫布：
 * personCanvas 只保留人物。
 * silhouetteCanvas 用來製作人物外圈。
 */
const personCanvas = document.createElement("canvas");
const personContext = personCanvas.getContext("2d");

const silhouetteCanvas = document.createElement("canvas");
const silhouetteContext = silhouetteCanvas.getContext("2d");

let segmentation = null;
let camera = null;
let started = false;

function setStatus(message) {
  statusBox.textContent = message;
}

function resizeCanvases(width, height) {
  if (
    outputCanvas.width === width &&
    outputCanvas.height === height
  ) {
    return;
  }

  outputCanvas.width = width;
  outputCanvas.height = height;

  personCanvas.width = width;
  personCanvas.height = height;

  silhouetteCanvas.width = width;
  silhouetteCanvas.height = height;
}

function createPersonLayer(results, width, height) {
  personContext.clearRect(0, 0, width, height);

  // 先畫人體遮罩。
  personContext.globalCompositeOperation = "source-over";
  personContext.drawImage(
    results.segmentationMask,
    0,
    0,
    width,
    height
  );

  // 只在遮罩範圍內保留相機人物。
  personContext.globalCompositeOperation = "source-in";
  personContext.drawImage(
    results.image,
    0,
    0,
    width,
    height
  );

  personContext.globalCompositeOperation = "source-over";
}

function createSilhouetteLayer(results, width, height) {
  silhouetteContext.clearRect(0, 0, width, height);

  // 取得人物形狀。
  silhouetteContext.globalCompositeOperation = "source-over";
  silhouetteContext.drawImage(
    results.segmentationMask,
    0,
    0,
    width,
    height
  );

  // 把人物形狀染成提示線的顏色。
  silhouetteContext.globalCompositeOperation = "source-in";
  silhouetteContext.fillStyle = "#54f6ff";
  silhouetteContext.fillRect(0, 0, width, height);

  silhouetteContext.globalCompositeOperation = "source-over";
}

function drawOutline(width, height) {
  /*
   * 把同一個人物剪影往周圍稍微位移。
   * 中間稍後會被真人畫面蓋住，只留下外圈。
   */
  const distance = Math.max(3, Math.round(width / 180));

  const offsets = [
    [-distance, 0],
    [distance, 0],
    [0, -distance],
    [0, distance],
    [-distance, -distance],
    [distance, -distance],
    [-distance, distance],
    [distance, distance]
  ];

  outputContext.save();
  outputContext.globalAlpha = 0.95;
  outputContext.shadowColor = "#54f6ff";
  outputContext.shadowBlur = 16;

  for (const [x, y] of offsets) {
    outputContext.drawImage(
      silhouetteCanvas,
      x,
      y,
      width,
      height
    );
  }

  outputContext.restore();
}

function onResults(results) {
  const width =
    results.image.videoWidth ||
    results.image.width ||
    720;

  const height =
    results.image.videoHeight ||
    results.image.height ||
    1280;

  resizeCanvases(width, height);

  /*
   * 先畫原始相機畫面，但稍微壓暗。
   * 這樣手機使用者仍看得到拍攝環境，
   * 同時人物輪廓會比較明顯。
   */
  outputContext.save();
  outputContext.clearRect(0, 0, width, height);
  outputContext.filter = "brightness(0.48) saturate(0.65)";
  outputContext.drawImage(
    results.image,
    0,
    0,
    width,
    height
  );
  outputContext.restore();

  createPersonLayer(results, width, height);
  createSilhouetteLayer(results, width, height);

  drawOutline(width, height);

  // 最後把清楚的人物畫在外圈上方。
  outputContext.drawImage(
    personCanvas,
    0,
    0,
    width,
    height
  );

  setStatus("已偵測人物・請完整保持在畫面內");
}

async function startCamera() {
  if (started) {
    return;
  }

  started = true;
  startButton.disabled = true;
  setStatus("正在載入人物辨識模型…");

  try {
    segmentation = new SelfieSegmentation({
      locateFile: (file) => {
        return (
          "https://cdn.jsdelivr.net/npm/" +
          "@mediapipe/selfie_segmentation/" +
          file
        );
      }
    });

    segmentation.setOptions({
      // 1 比較適合全身與較遠距離的人物。
      modelSelection: 1,
      selfieMode: true
    });

    segmentation.onResults(onResults);

    camera = new Camera(video, {
      onFrame: async () => {
        await segmentation.send({
          image: video
        });
      },

      // 第一版先用較低解析度，降低手機負擔。
      width: 480,
      height: 640,
      facingMode: "user"
    });

    await camera.start();

    document.body.classList.add("running");
    setStatus("相機已啟動・正在尋找人物");
  } catch (error) {
    console.error(error);

    started = false;
    startButton.disabled = false;

    setStatus("啟動失敗");

    alert(
      "無法開啟相機。\n\n" +
      "請確認：\n" +
      "1. 網頁使用 HTTPS\n" +
      "2. 已允許相機權限\n" +
      "3. 使用 Safari 或 Chrome"
    );
  }
}

startButton.addEventListener("click", startCamera);