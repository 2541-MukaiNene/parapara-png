const $ = (selector) => document.querySelector(selector);

const els = {
  dropZone: $('#dropZone'), fileInput: $('#fileInput'), selectButton: $('#selectButton'),
  addButton: $('#addButton'), clearButton: $('#clearButton'), workspace: $('#workspace'), frameList: $('#frameList'),
  canvas: $('#previewCanvas'), emptyPreview: $('#emptyPreview'), previewStatus: $('#previewStatus'),
  delay: $('#delayInput'), loop: $('#loopInput'), summary: $('#summary'), frameCount: $('#frameCount'),
  dimensions: $('#dimensions'), duration: $('#duration'), convert: $('#convertButton'),
  convertLabel: $('#convertLabel'), message: $('#message'),
  gifDropZone: $('#gifDropZone'), gifFileInput: $('#gifFileInput'), gifSelectButton: $('#gifSelectButton'),
  gifEmpty: $('#gifEmpty'), gifLoaded: $('#gifLoaded'), gifPreview: $('#gifPreview'),
  gifFileName: $('#gifFileName'), gifFileMeta: $('#gifFileMeta'), gifResetButton: $('#gifResetButton'),
  gifFrameCount: $('#gifFrameCount'), gifDimensions: $('#gifDimensions'), gifDuration: $('#gifDuration'),
  gifConvert: $('#gifConvertButton'), gifConvertLabel: $('#gifConvertLabel'), gifMessage: $('#gifMessage'),
  downloadModal: $('#downloadModal'), downloadFileName: $('#downloadFileName'),
  downloadClose: $('#downloadCloseButton'), downloadDone: $('#downloadDoneButton')
};

let frames = [];
let previewTimer = null;
let previewIndex = 0;
let draggedId = null;
let gifSource = null;

els.selectButton.addEventListener('click', (event) => { event.stopPropagation(); els.fileInput.click(); });
els.addButton.addEventListener('click', () => els.fileInput.click());
els.clearButton.addEventListener('click', clearFrames);
els.dropZone.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', async () => { await addFiles(els.fileInput.files); els.fileInput.value = ''; });
['dragenter', 'dragover'].forEach(type => els.dropZone.addEventListener(type, event => { event.preventDefault(); els.dropZone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(type => els.dropZone.addEventListener(type, event => { event.preventDefault(); els.dropZone.classList.remove('dragover'); }));
els.dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
els.delay.addEventListener('input', updateUI);
els.loop.addEventListener('input', updateUI);
els.convert.addEventListener('click', convertToApng);
els.gifSelectButton.addEventListener('click', (event) => { event.stopPropagation(); els.gifFileInput.click(); });
els.gifDropZone.addEventListener('click', (event) => { if (!gifSource && !event.target.closest('button')) els.gifFileInput.click(); });
els.gifFileInput.addEventListener('change', async () => { await loadGifSource(els.gifFileInput.files[0]); els.gifFileInput.value = ''; });
['dragenter', 'dragover'].forEach(type => els.gifDropZone.addEventListener(type, event => { event.preventDefault(); els.gifDropZone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(type => els.gifDropZone.addEventListener(type, event => { event.preventDefault(); els.gifDropZone.classList.remove('dragover'); }));
els.gifDropZone.addEventListener('drop', event => loadGifSource(event.dataTransfer.files[0]));
els.gifResetButton.addEventListener('click', resetGifSource);
els.gifConvert.addEventListener('click', convertApngToGif);
els.downloadClose.addEventListener('click', hideDownloadPopup);
els.downloadDone.addEventListener('click', hideDownloadPopup);
els.downloadModal.querySelector('.download-backdrop').addEventListener('click', hideDownloadPopup);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !els.downloadModal.hidden) hideDownloadPopup(); });

async function addFiles(fileList) {
  const files = [...fileList].filter(file => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'));
  if (!files.length) return setMessage('PNGファイルを選んでください', 'error');
  const loaded = await Promise.all(files.map(loadFrame));
  frames.push(...loaded.filter(Boolean));
  renderFrames();
  updateUI();
}

function loadFrame(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ id: crypto.randomUUID(), file, url, image, width:image.naturalWidth, height:image.naturalHeight });
    image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    image.src = url;
  });
}

function renderFrames() {
  els.frameList.innerHTML = '';
  frames.forEach((frame, index) => {
    const item = document.createElement('div');
    item.className = 'frame';
    item.draggable = true;
    item.dataset.id = frame.id;
    item.innerHTML = `<span class="frame-index">${String(index + 1).padStart(2, '0')}</span><button class="frame-remove" type="button" aria-label="${index + 1}枚目を削除">×</button><div class="frame-thumb checkerboard"><img src="${frame.url}" alt="${escapeHtml(frame.file.name)}"></div><div class="frame-meta"><span>${frame.width}×${frame.height}</span><span>${formatBytes(frame.file.size)}</span></div>`;
    item.querySelector('.frame-remove').addEventListener('click', () => removeFrame(frame.id));
    item.addEventListener('dragstart', () => { draggedId = frame.id; item.classList.add('dragging'); });
    item.addEventListener('dragend', () => { draggedId = null; item.classList.remove('dragging'); document.querySelectorAll('.frame').forEach(el => el.classList.remove('over')); });
    item.addEventListener('dragover', event => { event.preventDefault(); item.classList.add('over'); });
    item.addEventListener('dragleave', () => item.classList.remove('over'));
    item.addEventListener('drop', event => { event.preventDefault(); reorderFrames(draggedId, frame.id); });
    els.frameList.appendChild(item);
  });
}

function reorderFrames(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const from = frames.findIndex(frame => frame.id === fromId);
  const to = frames.findIndex(frame => frame.id === toId);
  frames.splice(to, 0, frames.splice(from, 1)[0]);
  renderFrames(); updateUI();
}

function removeFrame(id) {
  const index = frames.findIndex(frame => frame.id === id);
  if (index >= 0) { URL.revokeObjectURL(frames[index].url); frames.splice(index, 1); }
  renderFrames(); updateUI();
}

function clearFrames() {
  frames.forEach(frame => URL.revokeObjectURL(frame.url));
  frames = [];
  previewIndex = 0;
  els.fileInput.value = '';
  renderFrames();
  updateUI();
}

function updateUI() {
  const hasFrames = frames.length > 0;
  els.dropZone.hidden = hasFrames;
  els.workspace.hidden = !hasFrames;
  els.summary.hidden = !hasFrames;
  els.canvas.style.display = hasFrames ? 'block' : 'none';
  els.emptyPreview.style.display = hasFrames ? 'none' : 'flex';
  els.convert.disabled = frames.length < 2;
  if (hasFrames) {
    els.frameCount.textContent = frames.length;
    els.dimensions.textContent = `${frames[0].width} × ${frames[0].height} px`;
    els.duration.textContent = `${((frames.length * getDelay()) / 1000).toFixed(1)} 秒`;
    els.previewStatus.textContent = `${Math.min(previewIndex + 1, frames.length)} / ${frames.length}`;
    setMessage(frames.length < 2 ? 'APNGにはPNGが2枚以上必要です' : '準備できました');
  } else {
    els.previewStatus.textContent = '待機中';
    setMessage('PNGを2枚以上追加してください');
  }
  startPreview();
}

function startPreview() {
  clearTimeout(previewTimer);
  if (!frames.length) return;
  previewIndex %= frames.length;
  drawPreview(frames[previewIndex]);
  els.previewStatus.textContent = `${previewIndex + 1} / ${frames.length}`;
  previewTimer = setTimeout(() => { previewIndex = (previewIndex + 1) % frames.length; startPreview(); }, getDelay());
}

function drawPreview(frame) {
  const canvas = els.canvas;
  const width = frame.width, height = frame.height;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(frame.image, 0, 0);
}

async function convertToApng() {
  if (frames.length < 2) return;
  els.convert.disabled = true;
  els.convertLabel.textContent = '変換しています…';
  setMessage('フレームを組み立てています');
  try {
    const blob = await encodeApng(frames, getDelay(), Math.max(0, Number(els.loop.value) || 0));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `parapara-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;
    const fileName = link.download;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMessage(`完成しました（${formatBytes(blob.size)}）`, 'success');
    showDownloadPopup(fileName);
  } catch (error) {
    console.error(error);
    setMessage('変換できませんでした。別のPNGでお試しください', 'error');
  } finally {
    els.convert.disabled = false;
    els.convertLabel.textContent = 'APNGに変換する';
  }
}

async function encodeApng(sourceFrames, delayMs, loops) {
  const width = sourceFrames[0].width;
  const height = sourceFrames[0].height;
  const chunks = [pngChunk('IHDR', concatBytes(u32(width), u32(height), new Uint8Array([8,6,0,0,0]))), pngChunk('acTL', concatBytes(u32(sourceFrames.length), u32(loops)))];
  let sequence = 0;
  for (let index = 0; index < sourceFrames.length; index++) {
    const raw = framePixels(sourceFrames[index].image, width, height);
    const compressed = await deflate(raw);
    const delayNumerator = Math.min(65535, Math.max(1, Math.round(delayMs)));
    const control = concatBytes(u32(sequence++), u32(width), u32(height), u32(0), u32(0), u16(delayNumerator), u16(1000), new Uint8Array([0,0]));
    chunks.push(pngChunk('fcTL', control));
    chunks.push(index === 0 ? pngChunk('IDAT', compressed) : pngChunk('fdAT', concatBytes(u32(sequence++), compressed)));
  }
  chunks.push(pngChunk('IEND', new Uint8Array()));
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]), ...chunks], { type:'image/png' });
}

function framePixels(image, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  ctx.clearRect(0,0,width,height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, (width-w)/2, (height-h)/2, w, h);
  const rgba = ctx.getImageData(0,0,width,height).data;
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y=0; y<height; y++) raw.set(rgba.subarray(y*width*4,(y+1)*width*4), y*(width*4+1)+1);
  return raw;
}

async function deflate(bytes) {
  if (!('CompressionStream' in window)) throw new Error('CompressionStream unavailable');
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function loadGifSource(file) {
  if (!file) return;
  resetGifSource(true);
  if (!(file.type === 'image/png' || /\.(apng|png)$/i.test(file.name))) return setGifMessage('APNGファイルを選んでください', 'error');
  if (file.size > 50 * 1024 * 1024) return setGifMessage('50MB以下のAPNGを選んでください', 'error');
  els.gifConvert.disabled = true;
  setGifMessage('APNGを読み込んでいます…');
  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseApng(buffer);
    const frameCount = parsed.frames.length;
    if (frameCount < 2) throw new Error('not animated');
    if (frameCount > 500) throw new Error('too many frames');
    const { width, height } = parsed;
    const delays = parsed.frames.map(frame => frame.delay);
    const totalMs = delays.reduce((sum, delay) => sum + delay, 0);
    if (width * height > 16_000_000 || width > 65535 || height > 65535) throw new Error('too large');

    const url = URL.createObjectURL(file);
    gifSource = { file, buffer, parsed, url, width, height, frameCount, delays, totalMs };
    els.gifPreview.src = url;
    els.gifFileName.textContent = file.name;
    els.gifFileMeta.textContent = `${formatBytes(file.size)} · ${width} × ${height} px`;
    els.gifFrameCount.textContent = `${frameCount}`;
    els.gifDimensions.textContent = `${width} × ${height}`;
    els.gifDuration.textContent = `${(totalMs / 1000).toFixed(1)} 秒`;
    els.gifEmpty.hidden = true;
    els.gifLoaded.hidden = false;
    els.gifConvert.disabled = false;
    setGifMessage('変換の準備ができました');
  } catch (error) {
    console.error(error);
    const text = error.message === 'not animated' ? 'アニメーションを含むPNGを選んでください' :
      error.message === 'too many frames' ? '500フレーム以下のAPNGを選んでください' :
      error.message === 'too large' ? '画像サイズが大きすぎます' : 'このブラウザではAPNGを読み込めませんでした';
    setGifMessage(text, 'error');
  }
}

function resetGifSource(silent = false) {
  if (gifSource?.url) URL.revokeObjectURL(gifSource.url);
  gifSource = null;
  els.gifPreview.removeAttribute('src');
  els.gifEmpty.hidden = false;
  els.gifLoaded.hidden = true;
  els.gifFrameCount.textContent = '—';
  els.gifDimensions.textContent = '—';
  els.gifDuration.textContent = '—';
  els.gifConvert.disabled = true;
  if (!silent) setGifMessage('APNGを追加してください');
}

async function convertApngToGif() {
  if (!gifSource) return;
  els.gifConvert.disabled = true;
  els.gifConvertLabel.textContent = '変換しています…';
  setGifMessage('GIFのフレームを組み立てています');
  try {
    const blob = await encodeGifFromApng(gifSource);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${gifSource.file.name.replace(/\.(apng|png)$/i, '') || 'animation'}.gif`;
    const fileName = link.download;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setGifMessage(`完成しました（${formatBytes(blob.size)}）`, 'success');
    showDownloadPopup(fileName);
  } catch (error) {
    console.error(error);
    setGifMessage('GIFへの変換に失敗しました', 'error');
  } finally {
    els.gifConvert.disabled = false;
    els.gifConvertLabel.textContent = 'GIFに変換する';
  }
}

async function encodeGifFromApng(source) {
  const parts = [
    new TextEncoder().encode('GIF89a'),
    le16(source.width), le16(source.height),
    new Uint8Array([0xf7, 0x00, 0x00]),
    new Uint8Array(256 * 3),
    new Uint8Array([0x21,0xff,0x0b,0x4e,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2e,0x30,0x03,0x01,0x00,0x00,0x00])
  ];
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  for (let index = 0; index < source.frameCount; index++) {
      const frame = source.parsed.frames[index];
      const previous = frame.dispose === 2 ? ctx.getImageData(0, 0, source.width, source.height) : null;
      if (frame.blend === 0) ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      const image = await decodePngFrame(makeFramePng(source.parsed, frame));
      ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);
      const rgba = ctx.getImageData(0, 0, source.width, source.height).data;
      const quantized = quantizeGifFrame(rgba);
      const delayCs = Math.min(65535, Math.max(2, Math.round(source.delays[index] / 10)));
      parts.push(
        new Uint8Array([0x21,0xf9,0x04,quantized.hasTransparency ? 0x09 : 0x08]), le16(delayCs), new Uint8Array([0x00,0x00]),
        new Uint8Array([0x2c]), le16(0), le16(0), le16(source.width), le16(source.height), new Uint8Array([0x87]),
        quantized.palette, new Uint8Array([0x08]), gifSubBlocks(gifLzw(quantized.indices, 8))
      );
      if (typeof image.close === 'function') image.close();
      if (frame.dispose === 1) ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      if (frame.dispose === 2 && previous) ctx.putImageData(previous, 0, 0);
      setGifMessage(`GIFを作成中… ${index + 1} / ${source.frameCount}`);
      await new Promise(resolve => setTimeout(resolve, 0));
  }
  parts.push(new Uint8Array([0x3b]));
  return new Blob(parts, { type: 'image/gif' });
}

function parseApng(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = [137,80,78,71,13,10,26,10];
  if (signature.some((byte, index) => bytes[index] !== byte)) throw new Error('invalid png');
  let offset = 8, ihdr = null, width = 0, height = 0, current = null, sawImageData = false;
  const sharedChunks = [], frames = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      ihdr = data; width = new DataView(data.buffer).getUint32(0); height = new DataView(data.buffer).getUint32(4);
    } else if (type === 'fcTL') {
      const control = new DataView(data.buffer);
      const denominator = control.getUint16(22) || 100;
      current = {
        width: control.getUint32(4), height: control.getUint32(8),
        x: control.getUint32(12), y: control.getUint32(16),
        delay: Math.max(20, Math.round(control.getUint16(20) * 1000 / denominator)),
        dispose: control.getUint8(24), blend: control.getUint8(25), data: []
      };
      if (!current.width || !current.height || current.x + current.width > width || current.y + current.height > height) throw new Error('invalid frame');
      frames.push(current);
    } else if (type === 'IDAT') {
      sawImageData = true;
      if (current) current.data.push(data);
    } else if (type === 'fdAT') {
      sawImageData = true;
      if (current) current.data.push(data.slice(4));
    } else if (!sawImageData && !['acTL', 'IEND'].includes(type)) {
      sharedChunks.push({ type, data });
    }
    offset += length + 12;
    if (type === 'IEND') break;
  }
  if (!ihdr || !width || !height || frames.some(frame => !frame.data.length)) throw new Error('invalid apng');
  return { width, height, ihdr, sharedChunks, frames };
}

function makeFramePng(parsed, frame) {
  const header = parsed.ihdr.slice();
  header.set(u32(frame.width), 0);
  header.set(u32(frame.height), 4);
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header)];
  parsed.sharedChunks.forEach(chunk => parts.push(pngChunk(chunk.type, chunk.data)));
  frame.data.forEach(data => parts.push(pngChunk('IDAT', data)));
  parts.push(pngChunk('IEND', new Uint8Array()));
  return new Blob(parts, { type: 'image/png' });
}

async function decodePngFrame(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('frame decode failed')); };
    image.src = url;
  });
}

function quantizeGifFrame(rgba) {
  let hasTransparency = false;
  for (let source = 3; source < rgba.length; source += 4) {
    if (rgba[source] < 128) { hasTransparency = true; break; }
  }
  const colorLimit = hasTransparency ? 255 : 256;
  const paletteOffset = hasTransparency ? 1 : 0;
  const exactColors = new Map();
  let needsQuantization = false;
  for (let source = 0; source < rgba.length; source += 4) {
    if (rgba[source + 3] < 128) continue;
    const key = (rgba[source] << 16) | (rgba[source + 1] << 8) | rgba[source + 2];
    if (exactColors.has(key)) exactColors.set(key, exactColors.get(key) + 1);
    else if (exactColors.size < colorLimit) exactColors.set(key, 1);
    else { needsQuantization = true; break; }
  }

  if (!needsQuantization) {
    const colors = [...exactColors.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => ({
      r: (key >>> 16) & 255, g: (key >>> 8) & 255, b: key & 255
    }));
    const palette = colorsToGifPalette(colors, paletteOffset);
    const colorIndexes = new Map(colors.map((color, index) => [
      (color.r << 16) | (color.g << 8) | color.b, index + paletteOffset
    ]));
    const indices = new Uint8Array(rgba.length / 4);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target++) {
      if (rgba[source + 3] < 128) continue;
      const key = (rgba[source] << 16) | (rgba[source + 1] << 8) | rgba[source + 2];
      indices[target] = colorIndexes.get(key);
    }
    return { palette, indices, hasTransparency };
  }

  const bins = new Map();
  for (let source = 0; source < rgba.length; source += 4) {
    if (rgba[source + 3] < 128) continue;
    const r = rgba[source], g = rgba[source + 1], b = rgba[source + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key);
    if (bin) { bin.r += r; bin.g += g; bin.b += b; bin.count++; }
    else bins.set(key, { r, g, b, count: 1 });
  }
  const points = [...bins.values()].map(bin => ({
    r: bin.r / bin.count, g: bin.g / bin.count, b: bin.b / bin.count, count: bin.count
  }));
  const colors = medianCutColors(points, colorLimit);
  const palette = colorsToGifPalette(colors, paletteOffset);
  const binIndexes = new Map();
  for (const [key, bin] of bins) {
    binIndexes.set(key, nearestPaletteIndex(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count, colors) + paletteOffset);
  }
  const indexed = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target++) {
    if (rgba[source + 3] < 128) { indexed[target] = 0; continue; }
    const key = ((rgba[source] >> 3) << 10) | ((rgba[source + 1] >> 3) << 5) | (rgba[source + 2] >> 3);
    indexed[target] = binIndexes.get(key);
  }
  return { palette, indices: indexed, hasTransparency };
}

function colorsToGifPalette(colors, offset) {
  const palette = new Uint8Array(256 * 3);
  colors.forEach((color, index) => {
    const position = (index + offset) * 3;
    palette[position] = Math.round(color.r);
    palette[position + 1] = Math.round(color.g);
    palette[position + 2] = Math.round(color.b);
  });
  return palette;
}

function medianCutColors(points, limit) {
  const boxes = [points];
  while (boxes.length < limit) {
    let bestIndex = -1, bestScore = -1, bestChannel = 'r';
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      const ranges = ['r','g','b'].map(channel => {
        let min = Infinity, max = -Infinity;
        box.forEach(point => { min = Math.min(min, point[channel]); max = Math.max(max, point[channel]); });
        return { channel, range: max - min };
      }).sort((a, b) => b.range - a.range);
      const population = box.reduce((sum, point) => sum + point.count, 0);
      const score = ranges[0].range * population;
      if (score > bestScore) { bestIndex = index; bestScore = score; bestChannel = ranges[0].channel; }
    });
    if (bestIndex < 0) break;
    const box = boxes[bestIndex].slice().sort((a, b) => a[bestChannel] - b[bestChannel]);
    const total = box.reduce((sum, point) => sum + point.count, 0);
    let running = 0, split = 1;
    for (; split < box.length; split++) {
      running += box[split - 1].count;
      if (running >= total / 2) break;
    }
    boxes.splice(bestIndex, 1, box.slice(0, split), box.slice(split));
  }
  return boxes.map(box => {
    const total = box.reduce((sum, point) => sum + point.count, 0);
    return {
      r: box.reduce((sum, point) => sum + point.r * point.count, 0) / total,
      g: box.reduce((sum, point) => sum + point.g * point.count, 0) / total,
      b: box.reduce((sum, point) => sum + point.b * point.count, 0) / total
    };
  });
}

function nearestPaletteIndex(r, g, b, colors) {
  let best = 0, bestDistance = Infinity;
  colors.forEach((color, index) => {
    const dr = r - color.r, dg = g - color.g, db = b - color.b;
    const distance = dr * dr * 3 + dg * dg * 4 + db * db * 2;
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}

function gifLzw(indices, minimumCodeSize) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;
  let codeSize = minimumCodeSize + 1;
  let dictionary = new Map();
  const output = [];
  let bitBuffer = 0, bitCount = 0;
  const writeCode = code => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) { output.push(bitBuffer & 255); bitBuffer >>>= 8; bitCount -= 8; }
  };
  const reset = () => { dictionary = new Map(); nextCode = endCode + 1; codeSize = minimumCodeSize + 1; };

  writeCode(clearCode);
  let prefix = indices[0] ?? 0;
  for (let index = 1; index < indices.length; index++) {
    const value = indices[index];
    const key = prefix * 256 + value;
    if (dictionary.has(key)) {
      prefix = dictionary.get(key);
      continue;
    }
    writeCode(prefix);
    if (nextCode < 4096) {
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
      dictionary.set(key, nextCode++);
    } else {
      writeCode(clearCode);
      reset();
    }
    prefix = value;
  }
  writeCode(prefix);
  writeCode(endCode);
  if (bitCount > 0) output.push(bitBuffer & 255);
  return new Uint8Array(output);
}

function gifSubBlocks(bytes) {
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const block = bytes.subarray(offset, offset + 255);
    parts.push(new Uint8Array([block.length]), block);
  }
  parts.push(new Uint8Array([0]));
  return concatBytes(...parts);
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  return concatBytes(u32(data.length), typeBytes, data, u32(crc32(concatBytes(typeBytes, data))));
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) crcTable = Array.from({length:256},(_,n) => { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u32(n){ return new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]); }
function u16(n){ return new Uint8Array([(n>>>8)&255,n&255]); }
function le16(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
function concatBytes(...arrays){ const out=new Uint8Array(arrays.reduce((sum,a)=>sum+a.length,0)); let offset=0; arrays.forEach(a=>{out.set(a,offset);offset+=a.length;}); return out; }
function getDelay(){ return Math.min(5000, Math.max(20, Number(els.delay.value) || 200)); }
function formatBytes(bytes){ return bytes < 1024*1024 ? `${Math.max(1,Math.round(bytes/1024))} KB` : `${(bytes/1024/1024).toFixed(1)} MB`; }
function escapeHtml(text){ const div=document.createElement('div'); div.textContent=text; return div.innerHTML; }
function setMessage(text,type=''){ els.message.textContent=text; els.message.className=`message ${type}`; }
function setGifMessage(text,type=''){ els.gifMessage.textContent=text; els.gifMessage.className=`message ${type}`; }
function showDownloadPopup(fileName) {
  els.downloadFileName.textContent = fileName;
  els.downloadModal.hidden = false;
  els.downloadDone.focus();
}
function hideDownloadPopup() {
  els.downloadModal.hidden = true;
}

updateUI();
