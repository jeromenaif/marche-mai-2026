// GPX parsing + geometry utilities
(function () {
  const R = 6371000; // earth radius in m
  const toRad = (d) => (d * Math.PI) / 180;

  async function loadGPX(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Échec de chargement ' + url + ' (' + r.status + ')');
    const txt = await r.text();
    const doc = new DOMParser().parseFromString(txt, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('GPX illisible');
    const trkpts = [...doc.querySelectorAll('trkpt, rtept')];
    const points = trkpts.map((p) => {
      const t = p.querySelector('time')?.textContent;
      return {
        lat: parseFloat(p.getAttribute('lat')),
        lon: parseFloat(p.getAttribute('lon')),
        ele: parseFloat(p.querySelector('ele')?.textContent ?? 'NaN'),
        time: t ? new Date(t) : null,
      };
    });
    const name =
      doc.querySelector('trk > name')?.textContent ??
      doc.querySelector('rte > name')?.textContent ??
      doc.querySelector('metadata > name')?.textContent ??
      '';
    return { name, points };
  }

  function haversine(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const la1 = toRad(a.lat);
    const la2 = toRad(b.lat);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function smoothMovingAvg(values, win) {
    const n = values.length;
    const out = new Array(n);
    let sum = 0;
    const buf = [];
    for (let i = 0; i < n; i++) {
      buf.push(values[i]);
      sum += values[i];
      if (buf.length > win * 2 + 1) sum -= buf.shift();
      out[i] = sum / buf.length;
    }
    // second pass centered
    const centered = new Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
        if (isFinite(values[j])) { s += values[j]; c++; }
      }
      centered[i] = c ? s / c : values[i];
    }
    return centered;
  }

  function computeStats(points) {
    const n = points.length;
    const cum = new Array(n);
    cum[0] = 0;
    for (let i = 1; i < n; i++) {
      cum[i] = cum[i - 1] + haversine(points[i - 1], points[i]);
    }
    // smooth elevation — strong window because GPS noise is real
    const raw = points.map((p) => p.ele);
    const smoothed = smoothMovingAvg(raw, 12);
    let gain = 0, loss = 0;
    // threshold to ignore micro-noise
    const THRESH = 1.0;
    let last = smoothed[0];
    for (let i = 1; i < n; i++) {
      const d = smoothed[i] - last;
      if (Math.abs(d) >= THRESH) {
        if (d > 0) gain += d;
        else loss += -d;
        last = smoothed[i];
      }
    }
    let totalMs = 0, movingMs = 0;
    if (points[0].time && points[n - 1].time) {
      totalMs = points[n - 1].time - points[0].time;
      for (let i = 1; i < n; i++) {
        const a = points[i - 1].time, b = points[i].time;
        if (!a || !b) continue;
        const dt = b - a;
        if (dt <= 0 || dt > 60_000) continue; // pause if >60s
        const dd = cum[i] - cum[i - 1];
        const speed = dd / (dt / 1000); // m/s
        if (speed > 0.4) movingMs += dt; // > 1.5 km/h counts as moving
      }
    }
    return {
      dist: cum[n - 1],
      gain,
      loss,
      cum,
      smoothedEle: smoothed,
      minEle: Math.min(...smoothed),
      maxEle: Math.max(...smoothed),
      totalMs,
      movingMs,
      startTime: points[0].time,
      endTime: points[n - 1].time,
    };
  }

  // Uniform downsample to ~target points
  function downsample(points, target) {
    if (points.length <= target) return points.slice();
    const step = (points.length - 1) / (target - 1);
    const out = [];
    for (let i = 0; i < target; i++) {
      out.push(points[Math.round(i * step)]);
    }
    return out;
  }

  // Find closest point on a polyline to lat/lon
  function nearestIndex(points, lat, lon) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].lat - lat;
      const dy = points[i].lon - lon;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // For each point of A, distance to nearest point of B (in meters)
  // sampled to keep it fast
  function deviationStats(a, b, sampleA = 400) {
    const sa = downsample(a, Math.min(sampleA, a.length));
    const sb = downsample(b, Math.min(2000, b.length));
    let total = 0, max = 0, count = 0;
    for (const pa of sa) {
      let bd = Infinity;
      for (const pb of sb) {
        const d = haversine(pa, pb);
        if (d < bd) bd = d;
      }
      total += bd;
      if (bd > max) max = bd;
      count++;
    }
    return { mean: total / count, max };
  }

  function fmtDist(m) {
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }
  function fmtElev(m) {
    return Math.round(m) + ' m';
  }
  function fmtDuration(ms) {
    if (!ms || !isFinite(ms)) return '—';
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h + ' h ' + String(m).padStart(2, '0');
  }
  function fmtPace(distM, ms) {
    if (!ms || !distM) return '—';
    const minPerKm = ms / 60000 / (distM / 1000);
    const m = Math.floor(minPerKm);
    const s = Math.round((minPerKm - m) * 60);
    return m + "'" + String(s).padStart(2, '0') + "'' / km";
  }
  function fmtSpeed(distM, ms) {
    if (!ms || !distM) return '—';
    const kmh = (distM / 1000) / (ms / 3600000);
    return kmh.toFixed(1).replace('.', ',') + ' km/h';
  }
  function fmtDateFR(d) {
    if (!d) return '';
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtTime(d) {
    if (!d) return '';
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  window.GPX = {
    loadGPX, haversine, computeStats, downsample, nearestIndex, deviationStats,
    fmtDist, fmtElev, fmtDuration, fmtPace, fmtSpeed, fmtDateFR, fmtTime,
  };
})();
