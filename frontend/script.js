const API_BASE = "http://127.0.0.1:8000";

let items = [];
let latestResult = null;
let needChart = null;
let volumeChart = null;

let scene = null;
let camera = null;
let renderer = null;
let suitcaseGroup = null;
let animationFrameId = null;

const itemsTableBody = document.querySelector("#itemsTable tbody");
const resultArea = document.getElementById("resultArea");
const historyArea = document.getElementById("historyArea");
const layerSelect = document.getElementById("layerSelect");
const canvas = document.getElementById("packingCanvas");
const ctx = canvas.getContext("2d");

const statTotalNeed = document.getElementById("statTotalNeed");
const statPackedCount = document.getElementById("statPackedCount");
const statUnpackedCount = document.getElementById("statUnpackedCount");
const statUsedVolume = document.getElementById("statUsedVolume");
const statUsagePercent = document.getElementById("statUsagePercent");

document.getElementById("addItemBtn").addEventListener("click", addItem);
document.getElementById("clearItemsBtn").addEventListener("click", clearItems);
document.getElementById("loadSampleBtn").addEventListener("click", loadSampleItems);
document.getElementById("optimizeBtn").addEventListener("click", optimizePacking);
document.getElementById("refreshHistoryBtn").addEventListener("click", loadHistory);
layerSelect.addEventListener("change", drawSelectedLayer);

function addItem() {
  const name = document.getElementById("itemName").value.trim();
  const width = parseInt(document.getElementById("itemWidth").value);
  const breadth = parseInt(document.getElementById("itemBreadth").value);
  const height = parseInt(document.getElementById("itemHeight").value);
  const need = parseInt(document.getElementById("itemNeed").value);

  if (!name || !width || !breadth || !height || !need) {
    alert("Please fill all item fields.");
    return;
  }

  items.push({ name, width, breadth, height, need });
  clearItemInputs();
  renderItems();
}

function clearItemInputs() {
  document.getElementById("itemName").value = "";
  document.getElementById("itemWidth").value = "";
  document.getElementById("itemBreadth").value = "";
  document.getElementById("itemHeight").value = "";
  document.getElementById("itemNeed").value = "";
}

function clearItems() {
  items = [];
  latestResult = null;
  renderItems();
  clearStats();
  resultArea.innerHTML = `<p class="muted">No optimization result yet.</p>`;
  resetCharts();
  resetCanvas();
  reset3D();
  layerSelect.innerHTML = "";
}

function loadSampleItems() {
  items = [
    { name: "Laptop", width: 4, breadth: 3, height: 1, need: 10 },
    { name: "Shoes", width: 3, breadth: 2, height: 2, need: 9 },
    { name: "Jacket", width: 5, breadth: 3, height: 2, need: 7 },
    { name: "Books", width: 2, breadth: 2, height: 2, need: 6 },
    { name: "Toiletry Kit", width: 2, breadth: 2, height: 1, need: 8 },
    { name: "Camera", width: 3, breadth: 2, height: 2, need: 8 },
    { name: "Charger", width: 2, breadth: 1, height: 1, need: 7 }
  ];
  renderItems();
}

function renderItems() {
  itemsTableBody.innerHTML = "";

  if (items.length === 0) {
    itemsTableBody.innerHTML = `<tr><td colspan="7" class="muted">No items added yet.</td></tr>`;
    return;
  }

  items.forEach((item, index) => {
    const volume = item.width * item.breadth * item.height;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.width}</td>
      <td>${item.breadth}</td>
      <td>${item.height}</td>
      <td>${item.need}</td>
      <td>${volume}</td>
      <td><button class="btn-danger" onclick="removeItem(${index})">Delete</button></td>
    `;
    itemsTableBody.appendChild(row);
  });
}

function removeItem(index) {
  items.splice(index, 1);
  renderItems();
}

function clearStats() {
  statTotalNeed.textContent = "0";
  statPackedCount.textContent = "0";
  statUnpackedCount.textContent = "0";
  statUsedVolume.textContent = "0";
  statUsagePercent.textContent = "0%";
}

async function optimizePacking() {
  const suitcaseWidth = parseInt(document.getElementById("suitcaseWidth").value);
  const suitcaseBreadth = parseInt(document.getElementById("suitcaseBreadth").value);
  const suitcaseHeight = parseInt(document.getElementById("suitcaseHeight").value);

  if (!suitcaseWidth || !suitcaseBreadth || !suitcaseHeight) {
    alert("Please enter suitcase dimensions.");
    return;
  }

  if (items.length === 0) {
    alert("Please add at least one item.");
    return;
  }

  const payload = {
    suitcase: {
      width: suitcaseWidth,
      breadth: suitcaseBreadth,
      height: suitcaseHeight
    },
    items: items
  };

  resultArea.innerHTML = `<p>Optimizing...</p>`;

  try {
    const response = await fetch(`${API_BASE}/api/pack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const data = await response.json();
    latestResult = data;

    updateStats(data, payload.suitcase);
    renderResult(data);
    renderCharts(data, payload.suitcase);
    setupLayers(data, payload.suitcase);
    draw3DPacking(data, payload.suitcase);
    await loadHistory();
  } catch (error) {
    resultArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
}

function updateStats(data, suitcase) {
  const suitcaseVolume = suitcase.width * suitcase.breadth * suitcase.height;
  const usedVolume = data.packed_items.reduce((sum, item) => {
    return sum + item.width * item.breadth * item.height;
  }, 0);
  const usagePercent = suitcaseVolume ? ((usedVolume / suitcaseVolume) * 100).toFixed(2) : "0";

  statTotalNeed.textContent = data.total_need;
  statPackedCount.textContent = data.packed_count;
  statUnpackedCount.textContent = data.unpacked_count;
  statUsedVolume.textContent = usedVolume;
  statUsagePercent.textContent = `${usagePercent}%`;
}

function renderResult(data) {
  const packedHtml = data.packed_items.length
    ? `
      <div class="result-box">
        <h4>Packed Items</h4>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Dimensions</th>
                <th>Need</th>
                <th>Start</th>
                <th>End</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              ${data.packed_items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.width} × ${item.breadth} × ${item.height}</td>
                  <td>${item.need}</td>
                  <td>[${item.start.join(", ")}]</td>
                  <td>[${item.end.join(", ")}]</td>
                  <td>${item.width * item.breadth * item.height}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `
    : `
      <div class="result-box">
        <h4>Packed Items</h4>
        <p class="muted">No items could be packed.</p>
      </div>
    `;

  const unpackedHtml = data.unpacked_items.length
    ? `
      <div class="result-box">
        <h4>Unpacked Items</h4>
        <div>
          ${data.unpacked_items.map(name => `<span class="tag">${name}</span>`).join("")}
        </div>
      </div>
    `
    : `
      <div class="result-box">
        <h4>Unpacked Items</h4>
        <p class="good">All items were packed successfully.</p>
      </div>
    `;

  resultArea.innerHTML = packedHtml + unpackedHtml;
}

function resetCharts() {
  if (needChart) {
    needChart.destroy();
    needChart = null;
  }
  if (volumeChart) {
    volumeChart.destroy();
    volumeChart = null;
  }
}

function renderCharts(data, suitcase) {
  resetCharts();

  const packedNames = data.packed_items.map(item => item.name);
  const packedNeeds = data.packed_items.map(item => item.need);

  const needCtx = document.getElementById("needChart").getContext("2d");
  needChart = new Chart(needCtx, {
    type: "bar",
    data: {
      labels: packedNames,
      datasets: [
        {
          label: "Need Value",
          data: packedNeeds,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });

  const suitcaseVolume = suitcase.width * suitcase.breadth * suitcase.height;
  const usedVolume = data.packed_items.reduce((sum, item) => {
    return sum + item.width * item.breadth * item.height;
  }, 0);
  const freeVolume = Math.max(0, suitcaseVolume - usedVolume);

  const volumeCtx = document.getElementById("volumeChart").getContext("2d");
  volumeChart = new Chart(volumeCtx, {
    type: "pie",
    data: {
      labels: ["Used Volume", "Free Volume"],
      datasets: [
        {
          data: [usedVolume, freeVolume]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      }
    }
  });
}

function setupLayers(data, suitcase) {
  layerSelect.innerHTML = "";

  for (let z = 0; z < suitcase.height; z++) {
    const option = document.createElement("option");
    option.value = z;
    option.textContent = `Layer ${z}`;
    layerSelect.appendChild(option);
  }

  if (suitcase.height > 0) {
    layerSelect.value = "0";
    drawSelectedLayer();
  } else {
    resetCanvas();
  }
}

function drawSelectedLayer() {
  if (!latestResult) {
    resetCanvas();
    return;
  }

  const suitcaseWidth = parseInt(document.getElementById("suitcaseWidth").value);
  const suitcaseBreadth = parseInt(document.getElementById("suitcaseBreadth").value);
  const selectedLayer = parseInt(layerSelect.value);

  drawLayer(latestResult.packed_items, suitcaseWidth, suitcaseBreadth, selectedLayer);
}

function resetCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "18px Arial";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("No layer visualization yet.", 20, 40);
}

function getColor(index) {
  const colors = [
    "#93c5fd",
    "#86efac",
    "#fca5a5",
    "#fcd34d",
    "#c4b5fd",
    "#67e8f9",
    "#fdba74",
    "#f9a8d4",
    "#a7f3d0",
    "#ddd6fe"
  ];
  return colors[index % colors.length];
}

function drawLayer(packedItems, suitcaseWidth, suitcaseBreadth, selectedLayer) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padding = 40;
  const usableWidth = canvas.width - 2 * padding;
  const usableHeight = canvas.height - 2 * padding;

  const scaleX = usableWidth / suitcaseWidth;
  const scaleY = usableHeight / suitcaseBreadth;
  const scale = Math.min(scaleX, scaleY);

  const boxWidth = suitcaseWidth * scale;
  const boxHeight = suitcaseBreadth * scale;

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.strokeRect(padding, padding, boxWidth, boxHeight);

  ctx.font = "14px Arial";
  ctx.fillStyle = "#111827";
  ctx.fillText(`Layer z = ${selectedLayer}`, padding, padding - 10);

  let visibleCount = 0;

  packedItems.forEach((item, index) => {
    const z1 = item.start[2];
    const z2 = item.end[2];

    if (selectedLayer >= z1 && selectedLayer < z2) {
      visibleCount++;

      const x = padding + item.start[0] * scale;
      const y = padding + item.start[1] * scale;
      const w = (item.end[0] - item.start[0]) * scale;
      const h = (item.end[1] - item.start[1]) * scale;

      ctx.fillStyle = getColor(index);
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "#111827";
      ctx.font = "12px Arial";
      ctx.fillText(item.name, x + 4, y + 16);
      ctx.fillText(`N:${item.need}`, x + 4, y + 30);
    }
  });

  if (visibleCount === 0) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "16px Arial";
    ctx.fillText("No packed items in this layer.", padding + 10, padding + 30);
  }
}

function reset3D() {
  const container = document.getElementById("threeContainer");
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (renderer) {
    renderer.dispose();
  }
  container.innerHTML = "";
  scene = null;
  camera = null;
  renderer = null;
  suitcaseGroup = null;
}

function init3D() {
  reset3D();

  const container = document.getElementById("threeContainer");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fbff);

  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    2000
  );
  camera.position.set(22, 20, 22);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(20, 25, 15);
  scene.add(directionalLight);

  const grid = new THREE.GridHelper(40, 20);
  scene.add(grid);

  suitcaseGroup = new THREE.Group();
  scene.add(suitcaseGroup);

  animate3D();
}

function animate3D() {
  animationFrameId = requestAnimationFrame(animate3D);

  if (suitcaseGroup) {
    suitcaseGroup.rotation.y += 0.005;
  }

  renderer.render(scene, camera);
}

function draw3DPacking(data, suitcase) {
  init3D();

  const width = suitcase.width;
  const breadth = suitcase.breadth;
  const height = suitcase.height;

  const outlineGeometry = new THREE.BoxGeometry(width, height, breadth);
  const edges = new THREE.EdgesGeometry(outlineGeometry);
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x111827 })
  );
  outline.position.set(width / 2, height / 2, breadth / 2);
  suitcaseGroup.add(outline);

  data.packed_items.forEach((item, index) => {
    const geometry = new THREE.BoxGeometry(item.width, item.height, item.breadth);
    const material = new THREE.MeshLambertMaterial({
      color: getColor(index),
      transparent: true,
      opacity: 0.9
    });

    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(
      item.start[0] + item.width / 2,
      item.start[2] + item.height / 2,
      item.start[1] + item.breadth / 2
    );

    suitcaseGroup.add(cube);
  });
}

async function loadHistory() {
  historyArea.innerHTML = `<p>Loading history...</p>`;

  try {
    const response = await fetch(`${API_BASE}/api/history`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const history = await response.json();

    if (!history.length) {
      historyArea.innerHTML = `<p class="muted">No optimization history yet.</p>`;
      return;
    }

    historyArea.innerHTML = history.map(run => `
      <div class="history-card">
        <h4>Run #${run.id}</h4>
        <div class="history-meta">
          <div><strong>Suitcase</strong><br>${run.suitcase.width} × ${run.suitcase.breadth} × ${run.suitcase.height}</div>
          <div><strong>Total Need</strong><br>${run.total_need}</div>
          <div><strong>Input Items</strong><br>${run.items.length}</div>
          <div><strong>Packed Items</strong><br>${run.packed_items.length}</div>
        </div>
        <p><strong>Created At:</strong> ${run.created_at || "N/A"}</p>
        <div>
          ${run.packed_items.length
            ? run.packed_items.map(item => `
              <span class="tag">${item.name} [${item.start.join(", ")}] → [${item.end.join(", ")}]</span>
            `).join("")
            : `<span class="muted">No packed items</span>`
          }
        </div>
      </div>
    `).join("");
  } catch (error) {
    historyArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
}

renderItems();
loadHistory();
resetCanvas();
clearStats();