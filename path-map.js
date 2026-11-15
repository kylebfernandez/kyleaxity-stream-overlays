/* Local, downsampled screen-position visualization. No game world or aim data. */
window.drawPointerMap = function (canvas, map, mode = 'path') {
  const valorant = !!canvas.closest('[data-game="valorant"]');
  const ctx = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = valorant ? '#0f1923' : '#08171d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = valorant ? '#ece8e11a' : '#7d6c412c';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo((w * i) / 8, 0);
    ctx.lineTo((w * i) / 8, h);
    ctx.stroke();
  }
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h * i) / 5);
    ctx.lineTo(w, (h * i) / 5);
    ctx.stroke();
  }
  if (!map || !map.path?.length) {
    ctx.fillStyle = '#a99c7d';
    ctx.font = '14px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('Available after a newly captured match', w / 2, h / 2);
    return;
  }
  if (mode === 'heatmap') {
    const max = Math.max(1, ...map.heat);
    const cellW = w / map.cols,
      cellH = h / map.rows;
    for (let i = 0; i < map.heat.length; i++) {
      if (!map.heat[i]) continue;
      const a = Math.log1p(map.heat[i]) / Math.log1p(max);
      ctx.fillStyle = `hsla(${valorant ? 350 + a * 20 : 160 - a * 125},85%,${25 + a * 35}%,${0.18 + a * 0.72})`;
      ctx.fillRect(
        (i % map.cols) * cellW,
        Math.floor(i / map.cols) * cellH,
        cellW + 0.4,
        cellH + 0.4,
      );
    }
  } else {
    ctx.strokeStyle = valorant ? '#ece8e170' : '#d4bd7970';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    let previous = null;
    for (const p of map.path) {
      const x = (p[0] / map.width) * w,
        y = (p[1] / map.height) * h;
      if (previous && p[2]) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      previous = p;
    }
    ctx.stroke();
    for (const [values, color] of [
      [map.left, '#D4DB70'],
      [map.right, '#6CB8FF'],
    ]) {
      ctx.fillStyle = color;
      for (let i = 0; i < (values?.length || 0); i++) {
        if (!values[i]) continue;
        const x = (((i % map.cols) + 0.5) / map.cols) * w,
          y = ((Math.floor(i / map.cols) + 0.5) / map.rows) * h;
        ctx.globalAlpha = Math.min(0.9, 0.35 + Math.log1p(values[i]) * 0.12);
        ctx.beginPath();
        ctx.arc(x, y, Math.min(4, 1 + Math.log1p(values[i]) * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.strokeStyle = valorant ? '#a8b9bb66' : '#7d6c41';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
};
window.samplePointerMap = function () {
  const map = {
    width: 1920,
    height: 1080,
    cols: 48,
    rows: 27,
    path: [],
    heat: new Array(1296).fill(0),
    left: new Array(1296).fill(0),
    right: new Array(1296).fill(0),
  };
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 900; i++) {
    const x = Math.max(0, Math.min(1919, 960 + (random() + random() + random() - 1.5) * 850)),
      y = Math.max(0, Math.min(1079, 540 + (random() + random() - 1.5) * 520));
    map.path.push([x, y, i ? 1 : 0]);
    const cell = Math.floor(y / 40) * 48 + Math.floor(x / 40);
    map.heat[cell]++;
    map[i % 3 ? 'right' : 'left'][cell]++;
  }
  return map;
};
