// GR 223 — Mai 2026 · main app
(async () => {
  const root = document.getElementById('app');
  const statusEl = document.getElementById('status');
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }
  setStatus('Chargement des étapes…');

  // ---- Load every day's GPX in parallel (null GPX = placeholder day) ----
  const days = await Promise.all(TREK.days.map(async (d, i) => {
    const out = { ...d, color: TREK.palette[i % TREK.palette.length], idx: i, date: TREK_UTIL.dateForDay(d.num) };
    if (!d.gpx) return { ...out, points: null, stats: null };
    try {
      const gpx = await GPX.loadGPX(d.gpx);
      const stats = GPX.computeStats(gpx.points);
      return { ...out, points: gpx.points, stats, name: gpx.name };
    } catch (e) {
      console.warn('GPX failed for jour', d.num, e);
      return { ...out, points: null, stats: null };
    }
  }));

  const loaded = days.filter((d) => d.stats);
  const totals = {
    dist: loaded.reduce((s, d) => s + d.stats.dist, 0),
    gain: loaded.reduce((s, d) => s + d.stats.gain, 0),
    loss: loaded.reduce((s, d) => s + d.stats.loss, 0),
    minEle: loaded.length ? Math.min(...loaded.map((d) => d.stats.minEle)) : 0,
    maxEle: loaded.length ? Math.max(...loaded.map((d) => d.stats.maxEle)) : 0,
    nLoaded: loaded.length,
    nTotal: days.length,
  };

  // ---- Render shell ----
  root.innerHTML = `
    <header class="hero">
      <div class="hero-top">
        <div class="hero-eyebrow">Carnet de marche</div>
        <h1 class="hero-title">${TREK.name}</h1>
        <div class="hero-subtitle">${TREK.subtitle} · ${TREK.days.length} étapes</div>
        <p class="hero-lede">
          De Saint-Valéry-sur-Somme à&nbsp;Le&nbsp;Tréport, le long de la côte d'Albâtre.
          Chaque jour ci-dessous est une étape du carnet.
        </p>
      </div>

      <div class="hero-stats">
        <div class="hstat">
          <div class="hstat-num">${GPX.fmtDist(totals.dist)}</div>
          <div class="hstat-lbl">distance parcourue</div>
          <div class="hstat-sub">${totals.nLoaded} / ${totals.nTotal} étape${totals.nLoaded>1?'s':''} reçue${totals.nLoaded>1?'s':''}</div>
        </div>
        <div class="hstat">
          <div class="hstat-num"><span class="glyph up">↗</span> ${GPX.fmtElev(totals.gain)}</div>
          <div class="hstat-lbl">dénivelé positif cumulé</div>
          <div class="hstat-sub"><span class="glyph down">↘</span> ${GPX.fmtElev(totals.loss)} négatif</div>
        </div>
        <div class="hstat">
          <div class="hstat-num">${TREK_UTIL.fmtDateLong(TREK_UTIL.dateForDay(1)).replace(/^./, c => c.toUpperCase())}</div>
          <div class="hstat-lbl">départ</div>
          <div class="hstat-sub">→ ${TREK_UTIL.fmtDateLong(TREK_UTIL.dateForDay(TREK.days.length))}</div>
        </div>
      </div>

      <div class="hero-map-wrap">
        <div id="overview-map"></div>
        <div class="hero-map-legend" id="overview-legend"></div>
      </div>

      <div class="hero-elev">
        <div class="elev-head">
          <div class="elev-title">Profil altimétrique du trek</div>
          <div class="elev-meta">${totals.nLoaded > 0 ? 'Toutes les étapes reçues, bout à bout' : 'Aucune étape encore reçue'}</div>
        </div>
        <div id="global-elev"></div>
      </div>

      <div class="hero-scrollhint">↓ &nbsp; Descendez pour suivre les étapes</div>
    </header>

    <main id="days">
      ${days.map((d) => renderDaySection(d)).join('')}
    </main>

    <footer class="trek-foot">
      <div class="foot-line"></div>
      <div class="foot-text">Fin du carnet · ${TREK.name}</div>
    </footer>
  `;

  // ---- Build overview map ----
  const allPhotos = []; // flat list for global lightbox; populated by buildDayCard
  const overviewMap = buildOverviewMap(loaded);
  // ---- Build global elevation profile ----
  buildGlobalElevation(loaded, days);
  // ---- Build legend ----
  buildOverviewLegend(days);
  // ---- Build per-day maps + photo systems ----
  days.forEach((d) => buildDayCard(d));

  setStatus('');
  document.body.classList.add('ready');

  // ===================================================================
  // Day section template
  // ===================================================================
  function renderDaySection(d) {
    const isLoaded = !!d.stats;
    const wIcon = TREK_UTIL.weatherIcon(d.weather);
    const dateStr = TREK_UTIL.fmtDateLong(d.date);
    const route = (d.from || d.to) ? (
      `${d.from || '—'}${d.to ? ` <span class="route-arrow">→</span> ${d.to}` : ''}`
    ) : '<span class="muted">Étape à venir</span>';

    return `
      <section class="day ${isLoaded ? 'is-loaded' : 'is-pending'}" data-screen-label="${String(d.num).padStart(2,'0')} Jour ${d.num}" style="--day-color: ${d.color}">
        <div class="day-rule"></div>
        <div class="day-grid">
          <div class="day-meta">
            <div class="day-numwrap">
              <div class="day-eyebrow">Jour</div>
              <div class="day-num">${String(d.num).padStart(2, '0')}</div>
            </div>
            <div class="day-titles">
              <div class="day-date">
                ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
                ${wIcon ? `<span class="day-weather" title="${wIcon.label}${d.weatherNote ? ' · ' + d.weatherNote : ''}">${wIcon.glyph}</span>` : ''}
              </div>
              <h2 class="day-route">${route}</h2>
              ${d.weatherNote ? `<div class="day-weather-note">${d.weatherNote}</div>` : ''}
            </div>
          </div>

          <div class="day-content">
            ${isLoaded ? renderDayStats(d) : renderPending(d)}
          </div>
        </div>
      </section>
    `;
  }

  function renderDayStats(d) {
    return `
      <div class="day-stats">
        <div class="dstat">
          <div class="dstat-num">${GPX.fmtDist(d.stats.dist)}</div>
          <div class="dstat-lbl">parcourus</div>
        </div>
        <div class="dstat">
          <div class="dstat-num"><span class="glyph up">↗</span> ${GPX.fmtElev(d.stats.gain)}</div>
          <div class="dstat-lbl">d+ <span class="dstat-sub">· <span class="glyph down">↘</span> ${GPX.fmtElev(d.stats.loss)}</span></div>
        </div>
        <div class="dstat">
          <div class="dstat-num">${GPX.fmtElev(d.stats.maxEle)}</div>
          <div class="dstat-lbl">altitude max</div>
        </div>
        <div class="dstat">
          <div class="dstat-num">${d.points.length.toLocaleString('fr-FR')}</div>
          <div class="dstat-lbl">points GPS</div>
        </div>
      </div>

      <div class="day-mapwrap">
        <div class="day-map" id="day-map-${d.num}"></div>
      </div>

      ${d.photos.length ? `
        <div class="day-photos" id="day-photos-${d.num}">
          ${d.photos.map((p, i) => `
            <button class="dp-thumb" data-day="${d.num}" data-photo="${i}" style="background-image: url('${p.file}');" title="${p.caption}">
              <span class="dp-num">${i+1}</span>
              <span class="dp-caption">${p.caption}</span>
            </button>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  function renderPending(d) {
    return `
      <div class="pending-card">
        <div class="pending-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M3 12 L21 12 M12 3 L12 21" stroke-linecap="round"/></svg>
        </div>
        <div class="pending-title">Étape à venir</div>
        <div class="pending-note">Le fichier GPX et les photos de cette journée seront ajoutés dès leur réception.</div>
      </div>
    `;
  }

  // ===================================================================
  // Overview map (all days color-coded)
  // ===================================================================
  function buildOverviewMap(loaded) {
    if (!loaded.length) {
      document.getElementById('overview-map').innerHTML = '<div class="map-empty">Aucune trace reçue pour le moment</div>';
      return null;
    }
    const map = L.map('overview-map', {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
    });
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
      attribution: '© OpenStreetMap · © CARTO',
    }).addTo(map);

    const allBounds = [];
    loaded.forEach((d) => {
      const ll = d.points.map((p) => [p.lat, p.lon]);
      L.polyline(ll, { color: '#fff', weight: 8, opacity: 0.55, lineCap: 'round' }).addTo(map);
      L.polyline(ll, { color: d.color, weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      // Day number badge at midpoint
      const mid = ll[Math.floor(ll.length / 2)];
      L.marker(mid, {
        icon: L.divIcon({
          className: 'ov-badge-wrap',
          html: `<div class="ov-badge" style="background:${d.color}">${d.num}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
        }),
        interactive: false,
      }).addTo(map);
      allBounds.push(...ll);
    });
    const bounds = L.latLngBounds(allBounds);
    map.fitBounds(bounds, { padding: [40, 40] });
    return map;
  }

  function buildOverviewLegend(days) {
    const el = document.getElementById('overview-legend');
    if (!el) return;
    el.innerHTML = days.map((d) => `
      <a href="#jour-${d.num}" class="leg-item ${d.stats ? 'on' : 'off'}" style="--day-color: ${d.color}">
        <span class="leg-dot"></span>
        <span class="leg-num">J${d.num}</span>
      </a>
    `).join('');
  }

  // ===================================================================
  // Global elevation profile (all days end-to-end)
  // ===================================================================
  function buildGlobalElevation(loaded, allDays) {
    const wrap = document.getElementById('global-elev');
    if (!loaded.length) {
      wrap.innerHTML = '<div class="elev-empty">Le profil apparaîtra dès que les fichiers GPX seront chargés.</div>';
      return;
    }
    const W = 1600, H = 220;
    const PAD = { l: 56, r: 24, t: 18, b: 28 };

    // Concatenate distances + elevations bout-à-bout, keeping day spans
    const segments = [];
    let cursor = 0;
    let yMin = Infinity, yMax = -Infinity;
    for (const d of loaded) {
      const ds = GPX.downsample(d.points, 380);
      const cumLocal = [0];
      for (let i = 1; i < ds.length; i++) cumLocal.push(cumLocal[i-1] + GPX.haversine(ds[i-1], ds[i]));
      // smooth this segment's elevation
      const ele = ds.map((p) => p.ele);
      // simple smoothing
      const sm = ele.slice();
      const win = 6;
      for (let i = 0; i < ele.length; i++) {
        let s = 0, c = 0;
        for (let j = Math.max(0, i-win); j <= Math.min(ele.length-1, i+win); j++) { s += ele[j]; c++; }
        sm[i] = s / c;
      }
      const pts = ds.map((p, i) => ({ d: cursor + cumLocal[i], e: sm[i] }));
      pts.forEach((p) => {
        if (p.e < yMin) yMin = p.e;
        if (p.e > yMax) yMax = p.e;
      });
      segments.push({ day: d, pts, startD: cursor, endD: cursor + cumLocal[cumLocal.length - 1] });
      cursor = cursor + cumLocal[cumLocal.length - 1];
    }
    const totalD = cursor;
    const yPad = (yMax - yMin) * 0.15 || 5;
    const Ymin = Math.max(0, yMin - yPad);
    const Ymax = yMax + yPad;
    const x = (d) => PAD.l + (d / totalD) * (W - PAD.l - PAD.r);
    const y = (e) => PAD.t + (1 - (e - Ymin) / (Ymax - Ymin)) * (H - PAD.t - PAD.b);

    // Y ticks
    let yTicks = '';
    const yStep = niceStep((Ymax - Ymin) / 4);
    for (let v = Math.ceil(Ymin / yStep) * yStep; v <= Ymax; v += yStep) {
      const yy = y(v);
      yTicks += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${yy}" y2="${yy}" class="grid"/>`;
      yTicks += `<text x="${PAD.l - 8}" y="${yy + 3}" class="tick ytick">${Math.round(v)} m</text>`;
    }
    // Day boundaries + labels
    let dayMarks = '';
    let dayPaths = '';
    let dayFills = '';
    segments.forEach((seg, i) => {
      const xStart = x(seg.startD);
      const xEnd = x(seg.endD);
      // boundary line at start (except first)
      if (i > 0) {
        dayMarks += `<line x1="${xStart}" x2="${xStart}" y1="${PAD.t}" y2="${H - PAD.b}" class="day-bound"/>`;
      }
      // day number label at mid-segment, above chart
      const midX = (xStart + xEnd) / 2;
      dayMarks += `<text x="${midX}" y="${PAD.t - 5}" class="day-tag" fill="${seg.day.color}">J${seg.day.num}</text>`;
      // path & fill for this segment
      let pathD = '';
      for (let k = 0; k < seg.pts.length; k++) {
        pathD += (k ? ' L ' : 'M ') + x(seg.pts[k].d).toFixed(1) + ' ' + y(seg.pts[k].e).toFixed(1);
      }
      // area
      let areaD = pathD;
      areaD += ' L ' + x(seg.pts[seg.pts.length-1].d).toFixed(1) + ' ' + (H - PAD.b);
      areaD += ' L ' + x(seg.pts[0].d).toFixed(1) + ' ' + (H - PAD.b) + ' Z';
      dayFills += `<path d="${areaD}" class="elev-fill" style="fill:${seg.day.color}; opacity:0.12"/>`;
      dayPaths += `<path d="${pathD}" class="elev-line" style="stroke:${seg.day.color}"/>`;
    });
    // X axis: distance ticks every 5 km
    let xTicks = '';
    for (let km = 0; km * 1000 <= totalD; km += 5) {
      const xx = x(km * 1000);
      xTicks += `<line x1="${xx}" x2="${xx}" y1="${H - PAD.b - 2}" y2="${H - PAD.b + 3}" class="x-tick-line"/>`;
      xTicks += `<text x="${xx}" y="${H - PAD.b + 16}" class="tick">${km}</text>`;
    }
    xTicks += `<text x="${x(totalD)}" y="${H - PAD.b + 16}" class="tick" text-anchor="end">${(totalD/1000).toFixed(1).replace('.', ',')} km</text>`;

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="global-elev-svg">
        ${yTicks}
        ${dayFills}
        ${dayPaths}
        ${dayMarks}
        ${xTicks}
      </svg>
    `;
  }

  function niceStep(approx) {
    const exp = Math.pow(10, Math.floor(Math.log10(approx)));
    const m = approx / exp;
    let n;
    if (m < 1.5) n = 1; else if (m < 3) n = 2; else if (m < 7) n = 5; else n = 10;
    return n * exp;
  }

  // ===================================================================
  // Per-day card: Leaflet map, draggable photos, lightbox hookups
  // ===================================================================

  function buildDayCard(d) {
    if (!d.stats) return;
    const mapEl = document.getElementById('day-map-' + d.num);
    if (!mapEl) return;

    const map = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19,
      attribution: '© OSM · © CARTO',
    }).addTo(map);

    const ll = d.points.map((p) => [p.lat, p.lon]);
    L.polyline(ll, { color: '#fff', weight: 8, opacity: 0.6, lineCap: 'round' }).addTo(map);
    L.polyline(ll, { color: d.color, weight: 4.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);

    // Start / end pins
    const start = d.points[0], end = d.points[d.points.length - 1];
    L.marker([start.lat, start.lon], {
      icon: L.divIcon({
        className: 'pin-wrap',
        html: `<div class="pin start"><span></span></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
      interactive: false,
    }).addTo(map);
    L.marker([end.lat, end.lon], {
      icon: L.divIcon({
        className: 'pin-wrap',
        html: `<div class="pin end"><span></span></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      }),
      interactive: false,
    }).addTo(map);

    // Distance markers (every 5km)
    const step = 5000;
    let target = step;
    for (let i = 1; i < d.points.length; i++) {
      if (d.stats.cum[i] >= target) {
        L.marker([d.points[i].lat, d.points[i].lon], {
          icon: L.divIcon({
            className: 'km-wrap',
            html: `<div class="km">${Math.round(target / 1000)}</div>`,
            iconSize: [22, 22], iconAnchor: [11, 11],
          }),
          interactive: false,
        }).addTo(map);
        target += step;
      }
    }

    // Photo markers (draggable, positions saved in localStorage per day)
    const STORE_KEY = 'gr223-photos-j' + d.num;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) {}

    d.photos.forEach((p, idx) => {
      let lat, lon;
      const s = saved[p.file];
      if (s && typeof s.lat === 'number') { lat = s.lat; lon = s.lon; }
      else {
        const i = kmToIndex(d.stats.cum, p.km * 1000);
        lat = d.points[i].lat; lon = d.points[i].lon;
      }
      const html = `
        <div class="photo-pin" style="--day-color:${d.color}">
          <div class="photo-pin-inner" style="background-image:url('${p.file}')"></div>
          <div class="photo-pin-num">${idx + 1}</div>
        </div>`;
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'photo-wrap',
          html,
          iconSize: [40, 40], iconAnchor: [20, 20],
        }),
        draggable: true,
        riseOnHover: true,
        title: p.caption,
        zIndexOffset: 800,
      }).addTo(map);

      const photoRef = { day: d, idx, photo: p, marker };
      allPhotos.push(photoRef);

      marker.on('click', () => openLightbox(d.num, idx));
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        saved[p.file] = { lat: pos.lat, lon: pos.lng };
        try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) {}
      });
    });

    const bounds = L.latLngBounds(ll);
    map.fitBounds(bounds, { padding: [25, 25] });
    setTimeout(() => map.invalidateSize(), 60);

    // Photo strip clicks
    const strip = document.getElementById('day-photos-' + d.num);
    if (strip) {
      strip.querySelectorAll('.dp-thumb').forEach((b) => {
        b.addEventListener('click', () => {
          openLightbox(parseInt(b.dataset.day, 10), parseInt(b.dataset.photo, 10));
        });
      });
    }
  }

  function kmToIndex(cum, meters) {
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] < meters) lo = m + 1; else hi = m;
    }
    return Math.max(0, Math.min(cum.length - 1, lo));
  }

  // ===================================================================
  // Lightbox (global, browses every photo across every day)
  // ===================================================================
  let lbIdx = -1;
  function findFlatIndex(dayNum, photoIdx) {
    return allPhotos.findIndex((p) => p.day.num === dayNum && p.idx === photoIdx);
  }
  function openLightbox(dayNum, photoIdx) {
    const i = findFlatIndex(dayNum, photoIdx);
    if (i < 0) return;
    lbIdx = i;
    showLb();
  }
  function showLb() {
    if (lbIdx < 0 || lbIdx >= allPhotos.length) return;
    const item = allPhotos[lbIdx];
    document.getElementById('lb-img').src = item.photo.file;
    document.getElementById('lb-caption').textContent = item.photo.caption;
    document.getElementById('lb-meta').textContent = `Jour ${item.day.num} · ${item.day.from}${item.day.to ? ' → ' + item.day.to : ''} · photo ${item.idx + 1}/${item.day.photos.length}`;
    document.getElementById('lightbox').classList.add('open');
  }
  function closeLb() {
    document.getElementById('lightbox').classList.remove('open');
    lbIdx = -1;
  }
  document.getElementById('lb-close').addEventListener('click', closeLb);
  document.getElementById('lb-prev').addEventListener('click', (e) => { e.stopPropagation(); lbIdx = (lbIdx - 1 + allPhotos.length) % allPhotos.length; showLb(); });
  document.getElementById('lb-next').addEventListener('click', (e) => { e.stopPropagation(); lbIdx = (lbIdx + 1) % allPhotos.length; showLb(); });
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox' || e.target.id === 'lb-backdrop') closeLb();
  });
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') { lbIdx = (lbIdx - 1 + allPhotos.length) % allPhotos.length; showLb(); }
    else if (e.key === 'ArrowRight') { lbIdx = (lbIdx + 1) % allPhotos.length; showLb(); }
  });
})();
