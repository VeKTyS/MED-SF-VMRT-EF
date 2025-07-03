<template>
  <div class="main-layout">
    <div v-if="isLoading" class="loading-indicator">
      <div class="spinner"></div>
    </div>
    <div class="center-panel">
      <div class="form-card">
        <div class="mode-switch">
          <label>
            <input type="radio" v-model="mode" value="route" />
            Itinéraire (Station à Station)
          </label>
          <label>
            <input type="radio" v-model="mode" value="mst" />
            Arbre couvrant (ACPM)
          </label>
          <label>
            <input type="radio" v-model="mode" value="connexite" />
            Connexité
          </label>
        </div>
        <div v-if="mode === 'route'" class="route-controls">
          <div class="autocomplete-group">
            <label>Départ :</label>
            <input
              type="text"
              v-model="startInput"
              @input="filterStartSuggestions"
              @focus="showStartSuggestions = true"
              @blur="hideStartSuggestions"
              autocomplete="off"
              placeholder="Entrez une station"
            />
            <ul v-if="showStartSuggestions && filteredStartSuggestions.length" class="suggestions">
              <li
                v-for="(suggestion, index) in filteredStartSuggestions"
                :key="suggestion.id + '-' + index"
                @mousedown.prevent="selectStartSuggestion(suggestion)"
              >
                {{ suggestion.label }}
                <span v-if="suggestion.lineNumbers && suggestion.lineNumbers.length" style="margin-left:8px;">
                  <template v-if="getLineType(suggestion) === 'RER'">
                    -
                    <span v-for="(line, idx) in suggestion.lineNumbers" :key="'rerline-' + line">
                      <span :style="{ color: lineColors[line] || '#4185C5', 'margin-right': '4px' }">
                        RER {{ line }}<span v-if="idx < suggestion.lineNumbers.length - 1">, </span>
                      </span>
                    </span>
                  </template>
                  <template v-else>
                    - <span :style="{ color: getLineType(suggestion) === 'Métro' ? '#FFD600' : '#fff' }">
                      {{ getLineType(suggestion) }} {{ suggestion.lineNumbers[0] }}
                    </span>
                  </template>
                </span>
              </li>
            </ul>
          </div>
          <div class="autocomplete-group">
            <label>Arrivée :</label>
            <input
              type="text"
              v-model="endInput"
              @input="filterEndSuggestions"
              @focus="showEndSuggestions = true"
              @blur="hideEndSuggestions"
              autocomplete="off"
              placeholder="Entrez une station"
            />
            <ul v-if="showEndSuggestions && filteredEndSuggestions.length" class="suggestions">
              <li
                v-for="(suggestion, index) in filteredEndSuggestions"
                :key="suggestion.id + '-' + index"
                @mousedown.prevent="selectEndSuggestion(suggestion)"
              >
                {{ suggestion.label }}
                <span v-if="suggestion.lineNumbers && suggestion.lineNumbers.length" style="margin-left:8px;">
                  <template v-if="getLineType(suggestion) === 'RER'">
                    -
                    <span v-for="(line, idx) in suggestion.lineNumbers" :key="'rerline-' + line">
                      <span :style="{ color: lineColors[line] || '#4185C5', 'margin-right': '4px' }">
                        RER {{ line }}<span v-if="idx < suggestion.lineNumbers.length - 1">, </span>
                      </span>
                    </span>
                  </template>
                  <template v-else>
                    - <span :style="{ color: getLineType(suggestion) === 'Métro' ? '#FFD600' : '#fff' }">
                      {{ getLineType(suggestion) }} {{ suggestion.lineNumbers[0] }}
                    </span>
                  </template>
                </span>
              </li>
            </ul>
          </div>
          <div class="autocomplete-group">
            <label>Heure de départ :</label>
            <input
              type="time"
              v-model="departureTime"
              step="60"
              style="width:140px;"
            />
          </div>
          <button
            class="dev-search-btn"
            @click="fetchJourneyWithTiming"
            :disabled="isLoading || !startStation || !endStation || startStation === endStation"
          >
            Rechercher
          </button>
          <div v-if="lastJourneyLoadTime !== null" style="margin-top: 8px; font-size: 0.95em; color: #888;">
            Temps de chargement : {{ lastJourneyLoadTime.toFixed(0) }} ms
          </div>
        </div>
        <div v-if="mode === 'mst'" class="mst-controls">
          <button class="dev-search-btn" @click="drawKruskalWithTiming" :disabled="isLoading">
            Afficher Kruskal
          </button>
          <div v-if="mstLoadTime !== null" style="margin-top: 8px; font-size: 0.95em; color: #888;">
            Temps de chargement ACPM : {{ mstLoadTime.toFixed(0) }} ms
          </div>
        </div>
        <div v-if="mode === 'connexite'" class="connexite-controls">
          <button class="dev-search-btn" @click="fetchConnexiteWithTiming" :disabled="isLoading">
            Afficher Connexité
          </button>
          <div v-if="connexiteLoadTime !== null" class="loading-time">
            Temps de chargement Connexité : {{ connexiteLoadTime.toFixed(0) }} ms
          </div>
        </div>
      </div>
      <div v-if="mode === 'mst' && mstInfo.totalWeight > 0" class="roadmap-card">
        <div class="dev-time">
          <h4>ACPM (Arbre Couvrant de Poids Minimum)</h4>
          <p>
            L'ACPM représente le réseau de transport le plus court connectant toutes les stations avec le coût total le plus bas (temps de trajet). C'est une manière de visualiser le réseau le plus efficace possible.
          </p>
          <span>Coût total du réseau</span>
          <h2>{{ formatTime(mstInfo.totalWeight) }}</h2>
        </div>
      </div>
      <div v-if="(mode === 'route' && roadmap.length) || (mode === 'mst' && mstRoadmap.length) || (mode === 'connexite' && bfsRoadmap.length)" class="roadmap-card">
        <div class="dev-time">
          <span v-if="mode === 'route'">Temps estimé</span>
          <h2 v-if="mode === 'route'">{{ formattedTime }}</h2>
          <h4 v-if="mode === 'mst'">Réseau optimisé</h4>
          <h4 v-if="mode === 'connexite'">Réseau complet (BFS)</h4>
        </div>
        <div class="dev-roadmap-details">
          <h4>
            {{ mode === 'route' ? 'Roadmap' : mode === 'mst' ? 'Connections' : 'Connexité' }}
          </h4>
          <ol>
            <li v-for="(item, idx) in (mode === 'route' ? roadmap : mode === 'mst' ? mstRoadmap : bfsRoadmap)" :key="idx">
              <span v-if="mode === 'route'">{{ item.name }}</span>
              <span v-if="mode === 'mst'">{{ item.from }} ↔ {{ item.to }} ({{ item.weight }})</span>
              <span v-if="mode === 'connexite'">{{ item.from }} ↔ {{ item.to }}</span>
            </li>
          </ol>
        </div>
        <div v-if="mode === 'route'" class="dev-roadmap-details">
          <h4>Roadmap par ligne</h4>
          <ul>
            <li v-for="(segment, idx) in groupRoadmapByLine(roadmap)" :key="idx">
              <span>
                <b style="margin-right:8px;"
                   :style="{color: lineColors[segment.line] || '#FFD600'}">
                  Ligne {{ segment.line }}
                </b>
                : {{ segment.from }} → {{ segment.to }}
                ({{ segment.count }} stations)
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div v-if="mode === 'connexite' && components.length > 0" class="roadmap-card" style="margin-bottom:16px;">
        <div class="dev-time">
          <h4>Composantes connexes détectées</h4>
          <p>
            Nombre de composantes : <b>{{ components.length }}</b><br>
            Taille de chaque composante :
            <span v-for="(comp, idx) in components" :key="'comp-size-' + idx">
              <b>{{ comp.length }}</b><span v-if="idx < components.length - 1">, </span>
            </span>
          </p>
          <span v-if="components.length > 1" style="color:red;">Le réseau n'est pas totalement connexe !</span>
          <span v-else style="color:green;">Le réseau est connexe.</span>
        </div>
      </div>
      <div v-if="mode === 'connexite' && components.length > 1" class="roadmap-card" style="margin-bottom:16px;">
        <div class="dev-time">
          <h4>Pourquoi le réseau n'est pas connexe ?</h4>
          <p>
            <span v-if="components.length > 1">
              <b>Stations isolées ou composantes non connectées :</b>
              <ul>
                <li v-for="(comp, idx) in components.filter(c => Array.isArray(c) && c.length < 10)" :key="'comp-reason-' + idx">
                  <b>Composante {{ idx + 1 }} ({{ comp.length }} stations) :</b>
                  <span v-for="id in comp" :key="id">
                    {{ stationsMap[id]?.name || id }}<span v-if="comp.length > 1">, </span>
                  </span>
                </li>
              </ul>
              <span v-if="components.filter(c => c.length < 10).length === 0">
                <i>Toutes les composantes sont de grande taille. Vérifiez les correspondances ou les liens manquants.</i>
              </span>
            </span>
          </p>
        </div>
      </div>
      <div v-if="mode === 'route' && roadmap.length" class="roadmap-card" style="padding:0;border-radius:12px;box-shadow:0 2px 8px #0001;max-width:420px;margin:auto;">
        <div style="background:#184b8a;color:#fff;padding:10px 18px 6px 18px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span v-for="(step, idx) in roadmapIcons" :key="'icon-'+idx" v-html="step.icon" :style="step.style" />
          </div>
          <div style="font-weight:bold;font-size:1.1em;">{{ formattedTime }}</div>
        </div>
        <div style="padding:18px 0 0 0;">
          <div class="timeline">
            <div v-for="(step, idx) in formattedRoadmap" :key="'step-'+idx" class="timeline-step" :style="step.isCorrespondance ? 'background:#f3f6fa;' : ''">
              <div class="timeline-left">
                <div v-html="step.icon" :style="step.iconStyle"></div>
                <div v-if="idx < formattedRoadmap.length-1" class="timeline-line"></div>
              </div>
              <div class="timeline-content">
                <div class="timeline-title">
                  <span v-html="step.title"></span>
                  <span v-if="step.lineLabel" :style="step.lineStyle">{{ step.lineLabel }}</span>
                </div>
                <div class="timeline-desc" v-if="step.desc">{{ step.desc }}</div>
              </div>
              <div class="timeline-time">{{ step.time }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="map-panel">
      <l-map
        style="height: 100vh; width: 100%; min-width: 600px"
        :zoom="12"
        :center="[mapCenterLat, mapCenterLon]"
        :zoomControl="true"
        :scrollWheelZoom="true"
      >
        <l-tile-layer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors &copy; <a href='https://carto.com/attributions'>CARTO</a>"
        />
        <l-polyline
          v-for="(edge, idx) in subwayEdges"
          :key="idx"
          :lat-lngs="edge"
          color="#444"
          :weight="2"
        />
        <l-polyline
          v-for="(edge, idx) in animatedMstEdges"
          :key="'mst-edge-' + idx"
          :lat-lngs="edge"
          color="red"
          :weight="4"
        />
        <l-polyline
          v-for="(edge, idx) in bfsEdges"
          :key="'bfs-edge-' + idx"
          :lat-lngs="edge"
          color="#00FF00"
          :weight="3"
        />
        <l-polyline
          v-for="(segment, idx) in coloredRouteSegments"
          :key="'route-segment-' + idx"
          :lat-lngs="segment.latlngs"
          :color="segment.color"
          :weight="6"
        />
        <l-marker
          v-for="(station, idx) in roadmap"
          :key="station.id"
          :lat-lng="[pospointsMap[station.id]?.lat, pospointsMap[station.id]?.lon]"
          :icon="getMetroIconWithColor(stationsMap[station.id], roadmapColors[idx])"
        >
          <l-popup>{{ station.name }}</l-popup>
        </l-marker>
      </l-map>
    </div>
  </div>
</template>


<script>
  import { LMap, LTileLayer, LMarker, LPopup, LPolyline } from "@vue-leaflet/vue-leaflet";
  import "leaflet/dist/leaflet.css";

  // --- Utilitaire SVG pour icônes ---
  function getIcon(type, line, lineColors) {
    if (type === 'walk') return '<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#bbb"/><text x="10" y="15" text-anchor="middle" font-size="13" fill="#fff">🚶‍♂️</text></svg>';
    if (type === 'metro') return `<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="${lineColors[line]||'#FFD600'}"/><text x="10" y="15" text-anchor="middle" font-size="13" fill="#232733">M</text></svg>`;
    if (type === 'rer') return `<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="${lineColors[line]||'#4185C5'}"/><text x="10" y="15" text-anchor="middle" font-size="13" fill="#fff">RER</text></svg>`;
    if (type === 'bus') return '<svg width="20" height="20" viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="3" fill="#0078d4"/><text x="10" y="15" text-anchor="middle" font-size="13" fill="#fff">BUS</text></svg>';
    return '';
  }

  export default {
    name: "Dev",
    components: { LMap, LTileLayer, LMarker, LPopup, LPolyline },
    data() {
      return {
        apiBase: "http://localhost:3000/api",
        pospoints: [],
        pospointsMap: {},
        stationList: [],
        subwayEdges: [],
        roadmap: [],
        routeCoords: [],
        mstEdges: [],
        animatedMstEdges: [], // Pour l'animation Kruskal
        mstRoadmap: [],
        bfsEdges: [],       // Edges pour l'arbre BFS
        bfsRoadmap: [],     // Liste des connexions BFS
        connexeStatus: null,// Statut de la connexité
        components: [], // Liste des composantes connexes
        mode: "route",
        startStation: null,
        endStation: null,
        totalDistance: 0,
        mstInfo: {
          totalWeight: 0,
          algorithm: null
        },
        // Autocomplete
        startInput: "",
        endInput: "",
        filteredStartSuggestions: [],
        filteredEndSuggestions: [],
        showStartSuggestions: false,
        showEndSuggestions: false,
        // Map center for Paris (adjust as needed)
        mapCenterLat: 48.8566,
        mapCenterLon: 2.3522,
        lineColors: {
          "1": "#FFD600",    // Jaune
          "2": "#0055C8",    // Bleu
          "3": "#837902",    // Olive
          "3bis": "#6EC4E8", // Bleu clair
          "4": "#CF009E",    // Magenta
          "5": "#FF7E2E",    // Orange
          "6": "#00C08D",    // Vert turquoise
          "7": "#F5A2BD",    // Rose pâle
          "7bis": "#76D1EA", // Bleu turquoise
          "8": "#E19BDF",    // Violet clair
          "9": "#B6BD00",    // Vert olive
          "10": "#C9910D",   // Moutarde
          "11": "#704B1C",   // Marron
          "12": "#007852",   // Vert foncé
          "13": "#6EC4E8",   // Bleu clair
          "14": "#62259D",   // Violet foncé
          "A": "#E2231A",    // RER A - Rouge
          "B": "#4185C5",    // RER B - Bleu
          "C": "#F9D616",    // RER C - Jaune
          "D": "#00814F",    // RER D - Vert
          "E": "#C48C31"     // RER E - Violet/Brun
        },
        stationsMap: {}, // for fast lookup of station info by name or id
        tripsMap: {}, // trip_id -> trip object
        stopsMap: {}, // stop_id -> stop object
        routesMap: {}, // route_id -> route object
        isLoading: false, // indicate loading state for journey or MST
        lastJourneyLoadTime: null,
        mstLoadTime: null,
        connexiteLoadTime: null,
        departureTime: '', // Heure de départ choisie par l'utilisateur (format HH:MM)
      };
    },
    async mounted() {

      this.pospoints = await fetch(`${this.apiBase}/pospoints`).then(r => r.json());
      this.pospoints.forEach(p => {
        if (p.lat === undefined && p.y !== undefined) p.lat = p.y;
        if (p.lon === undefined && p.x !== undefined) p.lon = p.x;
      });
      this.pospointsMap = {};
      this.pospoints.forEach(p => {
        this.pospointsMap[p.id] = p;
      });


      const stationsArr = await fetch(`${this.apiBase}/stations`).then(r => r.json());


      this.stationList = stationsArr;


      this.stationsMap = {};
      stationsArr.forEach(st => {
        this.stationsMap[st.id] = st;
        this.stationsMap[st.name] = st; 
      });


      const { links } = await fetch(`${this.apiBase}/links`).then(r => r.json()).catch(() => ({ links: [] }));
      this.subwayEdges = links
        .map(({ from, to }) => {
          const a = this.pospointsMap[from];
          const b = this.pospointsMap[to];
          return a && b ? [[a.lat, a.lon], [b.lat, b.lon]] : null;
        })
        .filter(Boolean);

      // Chargement des trips, stops et routes pour la direction réelle
      const tripsArr = await fetch(`${this.apiBase}/trips`).then(r => r.json()).catch(() => []);
      this.tripsMap = {};
      tripsArr.forEach(tr => { this.tripsMap[tr.trip_id] = tr; });
      const stopsArr = await fetch(`${this.apiBase}/stops`).then(r => r.json()).catch(() => []);
      this.stopsMap = {};
      stopsArr.forEach(st => { this.stopsMap[st.stop_id] = st; });
      const routesArr = await fetch(`${this.apiBase}/routes`).then(r => r.json()).catch(() => []);
      this.routesMap = {};
      routesArr.forEach(rt => { this.routesMap[rt.route_id] = rt; });
    },
    watch: {
      mode(newMode) {
        this.roadmap = [];
        this.mstRoadmap = [];
        this.bfsRoadmap = [];
        this.bfsEdges = [];
        this.connexeStatus = null;
        this.routeCoords = [];
        this.mstEdges = [];
        this.animatedMstEdges = [];
        this.startInput = "";
        this.endInput = "";
        this.startStation = "";
        this.endStation = "";
        this.mstInfo = { totalWeight: 0, algorithm: null };
      }
    },
    computed: {
      formattedTime() {
        // Calcule le temps total réel entre le départ et l'arrivée (en utilisant les horaires GTFS)
        if (!this.roadmap.length) return '';
        const parseSec = t => {
          if (typeof t === 'string' && t.includes(':')) {
            const [h, m, s] = t.split(':').map(Number);
            return h * 3600 + m * 60 + (s || 0);
          } else if (!isNaN(t)) return Number(t);
          return 0;
        };
        const start = this.roadmap[0].arrival_time ? parseSec(this.roadmap[0].arrival_time) : null;
        const end = this.roadmap[this.roadmap.length-1].arrival_time ? parseSec(this.roadmap[this.roadmap.length-1].arrival_time) : null;
        if (start === null || end === null) return '';
        let total = end - start;
        if (total < 0) total += 24*3600; // gestion passage minuit
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        return `${hours > 0 ? hours + 'h ' : ''}${minutes} min`;
      },
      roadmapIcons() {
        // Affiche la séquence d'icônes en haut (marche, lignes, etc.)
        if (!this.roadmap.length) return [];
        const icons = [];
        icons.push({ icon: getIcon('walk', null, this.lineColors), style: 'font-size:1.2em;' });
        for (let i = 1; i < this.roadmap.length; i++) {
          const st = this.stationsMap[this.roadmap[i].id] || {};
          const type = this.getLineType(st);
          if (type === 'Métro') icons.push({ icon: getIcon('metro', this.getMainLine(st), this.lineColors), style: `color:${this.lineColors[this.getMainLine(st)]||'#FFD600'};font-size:1.2em;` });
          else if (type === 'RER') icons.push({ icon: getIcon('rer', this.getMainLine(st), this.lineColors), style: `color:${this.lineColors[this.getMainLine(st)]||'#4185C5'};font-size:1.2em;` });
          else if (type === 'Bus') icons.push({ icon: getIcon('bus', null, this.lineColors), style: 'color:#0078d4;font-size:1.2em;' });
          icons.push({ icon: getIcon('walk', null, this.lineColors), style: 'font-size:1.2em;' });
        }
        return icons;
      },
      formattedRoadmap() {
        // Génère la liste des étapes pour la timeline
        if (!this.roadmap.length) return [];
        const steps = [];
        steps.push({
          icon: getIcon('walk', null, this.lineColors),
          iconStyle: 'font-size:1.3em;',
          title: `Départ : <b>${this.roadmap[0].name}</b>`,
          desc: null,
          time: this.roadmap[0].arrival_time ? this.formatHour(this.roadmap[0].arrival_time) : '',
          isCorrespondance: false
        });
        for (let i = 1; i < this.roadmap.length; i++) {
          const prev = this.roadmap[i-1];
          const curr = this.roadmap[i];
          const prevStation = this.stationsMap[prev.id] || {};
          const currStation = this.stationsMap[curr.id] || {};
          let line = null;
          if (prevStation.lineNumbers && currStation.lineNumbers) {
            const commonLines = prevStation.lineNumbers.filter(l => currStation.lineNumbers.includes(l));
            if (commonLines.length > 0) line = commonLines[0];
          }
          if (!line) line = (currStation.lineNumbers && currStation.lineNumbers.length) ? currStation.lineNumbers[0] : '';
          const type = (/^\d+$/.test(line) ? 'Métro' : /^[A-E]$/.test(line) ? 'RER' : /BUS/i.test(line) ? 'Bus' : '');
          // Détection de correspondance : changement de ligne ou type
          const prevLine = (prevStation.lineNumbers && prevStation.lineNumbers.length) ? prevStation.lineNumbers[0] : '';
          const prevType = (/^\d+$/.test(prevLine) ? 'Métro' : /^[A-E]$/.test(prevLine) ? 'RER' : /BUS/i.test(prevLine) ? 'Bus' : '');
          const isCorrespondance = (line !== prevLine || type !== prevType);
          if (type === 'Métro' || type === 'RER' || type === 'Bus') {
            steps.push({
              icon: getIcon(type.toLowerCase(), line, this.lineColors),
              iconStyle: `font-size:1.3em;${type==='Métro'?`color:${this.lineColors[line]||'#FFD600'};`:type==='RER'?`color:${this.lineColors[line]||'#4185C5'};`:''}`,
              title: `Prendre ${type} <b>${line}</b>`,
              lineLabel: line,
              lineStyle: `background:${this.lineColors[line]||'#FFD600'};color:#fff;padding:2px 8px;border-radius:8px;margin-left:8px;`,
              desc: `Direction ${this.getDirectionName(curr.trip_id)}`,
              time: curr.arrival_time ? this.formatHour(curr.arrival_time) : '',
              isCorrespondance: false
            });
          } else {
            // Correspondance ou marche
            // Calcul du temps d'attente si possible
            let waitDesc = null;
            if (curr.arrival_time && curr.departure_time) {
              // Les deux sont des strings HH:MM:SS ou en secondes
              let arr = curr.arrival_time, dep = curr.departure_time;
              let arrSec = 0, depSec = 0;
              if (typeof arr === 'string' && arr.includes(':')) {
                const [h, m, s] = arr.split(':').map(Number);
                arrSec = h * 3600 + m * 60 + (s || 0);
              } else if (!isNaN(arr)) arrSec = Number(arr);
              if (typeof dep === 'string' && dep.includes(':')) {
                const [h, m, s] = dep.split(':').map(Number);
                depSec = h * 3600 + m * 60 + (s || 0);
              } else if (!isNaN(dep)) depSec = Number(dep);
              let wait = depSec - arrSec;
              if (wait < 0) wait += 24 * 3600; // gestion passage minuit
              if (wait > 0 && wait < 3600) {
                waitDesc = `⏳ Attente : ${Math.floor(wait/60)} min`;
              } else if (wait >= 3600) {
                waitDesc = `⏳ Attente : ${Math.floor(wait/3600)}h${Math.floor((wait%3600)/60).toString().padStart(2,'0')}`;
              }
            }
            steps.push({
              icon: getIcon('walk', null, this.lineColors),
              iconStyle: 'font-size:1.3em;',
              title: `Correspondance à <b>${curr.name}</b>`,
              desc: waitDesc,
              time: curr.arrival_time ? this.formatHour(curr.arrival_time) : '',
              isCorrespondance: true
            });
          }
        }
        // Arrivée à pied
        steps.push({
          icon: getIcon('walk', null, this.lineColors),
          iconStyle: 'font-size:1.3em;',
          title: `Arrivée : <b>${this.roadmap[this.roadmap.length-1].name}</b>`,
          desc: null,
          time: this.roadmap[this.roadmap.length-1].arrival_time ? this.formatHour(this.roadmap[this.roadmap.length-1].arrival_time) : '',
          isCorrespondance: false
        });
        return steps;
      },
      coloredRouteSegments() {
        // Renvoie les segments du trajet avec couleur de ligne pour la carte
        if (!this.roadmap || this.roadmap.length < 2) return [];
        const segments = [];
        for (let i = 1; i < this.roadmap.length; i++) {
          const prev = this.roadmap[i-1];
          const curr = this.roadmap[i];
          const prevPos = this.pospointsMap[prev.id];
          const currPos = this.pospointsMap[curr.id];
          if (prevPos && currPos) {
            const prevStation = this.stationsMap[prev.id] || {};
            const currStation = this.stationsMap[curr.id] || {};
            let line = null;
            if (prevStation.lineNumbers && currStation.lineNumbers) {
              const commonLines = prevStation.lineNumbers.filter(l => currStation.lineNumbers.includes(l));
              if (commonLines.length > 0) line = commonLines[0];
            }
            if (!line) line = (currStation.lineNumbers && currStation.lineNumbers.length) ? currStation.lineNumbers[0] : '';
            segments.push({
              latlngs: [
                [prevPos.lat, prevPos.lon],
                [currPos.lat, currPos.lon]
              ],
              color: this.lineColors[line] || '#FFD600'
            });
          }
        }
        return segments;
      },

      roadmapColors() {
        // Retourne un tableau de couleurs pour chaque étape du roadmap (pour les marqueurs sur la carte)
        if (!this.roadmap || !this.roadmap.length) return [];
        const colors = [];
        for (let i = 0; i < this.roadmap.length; i++) {
          if (i === 0) {
            // Première station : couleur principale de la station
            const st = this.stationsMap[this.roadmap[0].id] || {};
            let color = '#FFD600';
            if (st.lineNumbers && st.lineNumbers.length) {
              color = this.lineColors[st.lineNumbers[0]] || color;
            }
            colors.push(color);
          } else {
            // Pour les autres, intersection des lignes avec la précédente
            const prev = this.stationsMap[this.roadmap[i-1].id] || {};
            const curr = this.stationsMap[this.roadmap[i].id] || {};
            let line = null;
            if (prev.lineNumbers && curr.lineNumbers) {
              const commonLines = prev.lineNumbers.filter(l => curr.lineNumbers.includes(l));
              if (commonLines.length > 0) line = commonLines[0];
            }
            if (!line) line = (curr.lineNumbers && curr.lineNumbers.length) ? curr.lineNumbers[0] : '';
            colors.push(this.lineColors[line] || '#FFD600');
          }
        }
        return colors;
      }
    },
    methods: {
      async fetchJourney() {
        this.isLoading = true;
        try {
          if (!this.startStation || !this.endStation || this.startStation.id === this.endStation.id) return;
          const fromId = encodeURIComponent(this.startStation.id);
          const toId = encodeURIComponent(this.endStation.id);
          let url = `${this.apiBase}/journey?from=${fromId}&to=${toId}`;
          if (this.departureTime) {
            url += `&departure_time=${encodeURIComponent(this.departureTime)}`;
          }
          const res = await fetch(url);
          if (!res.ok) throw new Error((await res.json()).error || `HTTP error! status: ${res.status}`);
          const data = await res.json();
          if (!data.path?.length) throw new Error("No valid path found between the selected stations.");
          // On garde toutes les propriétés de chaque étape (dont line/route_id)
          this.roadmap = data.path.map(st => ({ ...st }));
          this.routeCoords = data.path.map(st => this.pospointsMap[st.id]).filter(Boolean).map(st => [st.lat, st.lon]);
          this.totalDistance = data.totalDistance || 0;
        } catch (error) {
          console.error("Failed to fetch journey:", error);
          this.roadmap = [];
          this.routeCoords = [];
          this.totalDistance = 0;
          alert(`Error finding journey: ${error.message}`);
        } finally {
          this.isLoading = false;
        }
      },

      async fetchJourneyWithTiming() {
        const start = performance.now();
        await this.fetchJourney();
        const end = performance.now();
        const durationMs = end - start;
        console.log(`Temps de chargement du trajet : ${durationMs.toFixed(0)} ms`);
        // Tu peux aussi afficher ce temps dans l'UI si tu veux
        this.lastJourneyLoadTime = durationMs;
      },

      async drawKruskal() {
        this.isLoading = true;
        this.mstInfo = { totalWeight: 0, algorithm: 'Kruskal' };
        this.mstEdges = [];
        this.animatedMstEdges = [];
        this.mstRoadmap = [];
        try {
          const res = await fetch(`${this.apiBase}/kruskal`);
          const data = await res.json();
          if (!data.edges?.length) return;
          this.mstRoadmap = data.edges.map(e => ({ from: e.from, to: e.to, weight: e.weight }));
          this.mstInfo.totalWeight = data.edges.reduce((sum, edge) => sum + edge.weight, 0);
          this.mstEdges = data.edges.map(edge => {
            const from = this.pospointsMap[edge.fromId];
            const to = this.pospointsMap[edge.toId];
            return from && to ? [[from.lat, from.lon], [to.lat, to.lon]] : null;
          }).filter(Boolean);
          this.animatedMstEdges = [];
          this.animateKruskal();
        } finally {
          this.isLoading = false;
        }
      },

      animateKruskal() {
        this.animatedMstEdges = [];
        let i = 0;
        const total = this.mstEdges.length;
        const step = () => {
          if (i < total) {
            this.animatedMstEdges.push(this.mstEdges[i]);
            i++;
            if (i < total) setTimeout(step, 15);
          }
        };
        step();
      },

      async fetchConnexite() {
        this.isLoading = true;
        this.bfsEdges = [];
        this.bfsRoadmap = [];
        this.connexeStatus = null;
        this.components = [];
        try {
          const res = await fetch(`${this.apiBase}/connexite`);
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          this.connexeStatus = data.connexe;
          this.bfsRoadmap = data.tree || [];
          this.components = data.components || [];
          this.bfsEdges = this.bfsRoadmap.map(edge => {
            const from = this.pospointsMap[edge.from];
            const to = this.pospointsMap[edge.to];
            return from && to ? [[from.lat, from.lon], [to.lat, to.lon]] : null;
          }).filter(Boolean);
        } catch (error) {
          console.error("Failed to fetch connexite:", error);
          alert(`Error fetching connexite: ${error.message}`);
        } finally {
          this.isLoading = false;
        }
      },

      async drawKruskalWithTiming() {
        const start = performance.now();
        await this.drawKruskal();
        const end = performance.now();
        this.mstLoadTime = end - start;
        console.log(`Temps de chargement ACPM : ${this.mstLoadTime.toFixed(0)} ms`);
      },

      async fetchConnexiteWithTiming() {
        const start = performance.now();
        await this.fetchConnexite();
        const end = performance.now();
        this.connexiteLoadTime = end - start;
        console.log(`Temps de chargement Connexité : ${this.connexiteLoadTime.toFixed(0)} ms`);
      },

      forbiddenWords() {
        return ["rue", "entrée", "Entrée", "r.", "avenue", "boulevard", 'bd', "place", "impasse", "allée", "chemin", "quai", "square", "voie"];
      },

      filterStartSuggestions() {
        const input = this.startInput.trim().toLowerCase();
        const forbidden = this.forbiddenWords();
        if (!input) {
          this.filteredStartSuggestions = [];
          this.showStartSuggestions = false;
          return;
        }
        let suggestions = this.stationList.filter(st =>
          st.id &&
          st.name.toLowerCase().includes(input) &&
          !forbidden.some(word => st.name.toLowerCase().includes(word)) &&
          (!this.endStation || st.id !== this.endStation.id)
        );
        // Regroupement RER
        const rerPattern = /^[A-E]$/;
        const rerGroups = {};
        const metroSuggestions = [];
        suggestions.forEach(st => {
          const isRER = st.lineNumbers && st.lineNumbers.length && st.lineNumbers.every(l => rerPattern.test(l));
          if (isRER) {
            if (!rerGroups[st.name]) rerGroups[st.name] = { ...st, lineNumbers: [] };
            rerGroups[st.name].lineNumbers = Array.from(new Set([...rerGroups[st.name].lineNumbers, ...st.lineNumbers]));
          } else {
            metroSuggestions.push({ ...st, label: st.name });
          }
        });
        const rerSuggestions = Object.values(rerGroups).map(st => ({ ...st, label: st.name }));
        this.filteredStartSuggestions = [...metroSuggestions, ...rerSuggestions];
        this.showStartSuggestions = this.filteredStartSuggestions.length > 0;
      },

      filterEndSuggestions() {
        const input = this.endInput.trim().toLowerCase();
        const forbidden = this.forbiddenWords();
        if (!input) {
          this.filteredEndSuggestions = [];
          this.showEndSuggestions = false;
          return;
        }
        let suggestions = this.stationList.filter(st =>
          st.name.toLowerCase().includes(input) &&
          !forbidden.some(word => st.name.toLowerCase().includes(word)) &&
          (!this.startStation || st.id !== this.startStation.id)
        );
        const rerPattern = /^[A-E]$/;
        const rerGroups = {};
        const metroSuggestions = [];
        suggestions.forEach(st => {
          const isRER = st.lineNumbers && st.lineNumbers.length && st.lineNumbers.every(l => rerPattern.test(l));
          if (isRER) {
            if (!rerGroups[st.name]) rerGroups[st.name] = { ...st, lineNumbers: [] };
            rerGroups[st.name].lineNumbers = Array.from(new Set([...rerGroups[st.name].lineNumbers, ...st.lineNumbers]));
          } else {
            metroSuggestions.push({ ...st, label: st.name });
          }
        });
        const rerSuggestions = Object.values(rerGroups).map(st => ({ ...st, label: st.name }));
        this.filteredEndSuggestions = [...metroSuggestions, ...rerSuggestions];
        this.showEndSuggestions = this.filteredEndSuggestions.length > 0;
      },

      selectStartSuggestion(suggestion) {
        this.startInput = suggestion.name;
        this.startStation = suggestion;
        this.filteredStartSuggestions = [];
        this.showStartSuggestions = false;
      },

      selectEndSuggestion(suggestion) {
        this.endInput = suggestion.name;
        this.endStation = suggestion;
        this.filteredEndSuggestions = [];
        this.showEndSuggestions = false;
      },

      hideStartSuggestions() {
        setTimeout(() => { this.showStartSuggestions = false; }, 100);
      },

      hideEndSuggestions() {
        setTimeout(() => { this.showEndSuggestions = false; }, 100);
      },

      getStationColor(station) {
        const st = this.stationsMap[station.id] || {};
        if (st.lineNumbers && st.lineNumbers.length) {
          return this.lineColors[st.lineNumbers[0]] || "#FFD600";
        }
        return "#FFD600";
      },

      formatDistance(distance) {
        if (distance === undefined || distance === null) return "";
        const km = distance / 1000;
        return km >= 1 ? `${km.toFixed(1)} km` : `${distance} m`;
      },

      getLineType(station) {
        if (!station.lineNumbers || !station.lineNumbers.length) return '';
        const line = station.lineNumbers[0];
        if (/^\d+$/.test(line)) return 'Métro';
        if (/^[A-E]$/.test(line)) return 'RER';
        if (/TER/i.test(line)) return 'TER';
        if (/BUS/i.test(line)) return 'Bus';
        return '';
      },

      getMetroIcon(station) {
        const color = (station.lineNumbers && station.lineNumbers.length)
          ? this.lineColors[station.lineNumbers[0]] || "#FFD600"
          : "#FFD600";
        const svg = `
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14" cy="14" r="10" fill="${color}" stroke="#232733" stroke-width="4"/>
          </svg>
        `;
        return L.divIcon({
          className: "",
          html: svg,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14]
        });
      },

      getMetroIconWithColor(station, color) {
        const svg = `
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14" cy="14" r="10" fill="${color}" stroke="#232733" stroke-width="4"/>
          </svg>
        `;
        return L.divIcon({
          className: "",
          html: svg,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14]
        });
      },

      groupRoadmapByLine(roadmap) {
        if (!roadmap || roadmap.length === 0) return [];
        const segments = [];
        let startIdx = 0;
        let prevStation = this.stationsMap[roadmap[0].id] || {};
        let currentLine = (prevStation.lineNumbers && prevStation.lineNumbers.length) ? prevStation.lineNumbers[0] : '';
        for (let i = 1; i < roadmap.length; i++) {
          const currStation = this.stationsMap[roadmap[i].id] || {};
          let line = '';
          if (prevStation.lineNumbers && currStation.lineNumbers) {
            const commonLines = prevStation.lineNumbers.filter(l => currStation.lineNumbers.includes(l));
            if (commonLines.length > 0) line = commonLines[0];
          }
          if (!line) line = (currStation.lineNumbers && currStation.lineNumbers.length) ? currStation.lineNumbers[0] : '';
          if (line !== currentLine) {
            segments.push({
              line: currentLine,
              from: roadmap[startIdx].name,
              to: roadmap[i - 1].name,
              fromId: roadmap[startIdx].id,
              toId: roadmap[i - 1].id,
              count: i - startIdx
            });
            startIdx = i;
            currentLine = line;
          }
          prevStation = currStation;
        }
        segments.push({
          line: currentLine,
          from: roadmap[startIdx].name,
          to: roadmap[roadmap.length - 1].name,
          fromId: roadmap[startIdx].id,
          toId: roadmap[roadmap.length - 1].id,
          count: roadmap.length - startIdx - 1
        });
        return segments;
      },

      getMainLine(station) {
        return station && station.lineNumbers && station.lineNumbers.length ? station.lineNumbers[0] : '';
      },

      formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
      },

      formatHour(secOrStr) {
        if (!secOrStr) return '';
        // Si c'est un nombre (secondes)
        if (typeof secOrStr === 'number') {
          let h = Math.floor(secOrStr / 3600);
          let m = Math.floor((secOrStr % 3600) / 60);
          h = h % 24; // Boucle sur 24h
          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
        // Si c'est une string HH:MM:SS ou HH:MM
        if (typeof secOrStr === 'string' && secOrStr.includes(':')) {
          const parts = secOrStr.split(':').map(Number);
          let h = parts[0], m = parts[1];
          if (isNaN(h) || isNaN(m)) return secOrStr;
          h = h % 24; // Boucle sur 24h
          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
        return secOrStr;
      },

      getDirectionName(trip_id) {
        // Retourne le vrai nom du terminus si possible
        if (!trip_id || !this.tripsMap[trip_id]) return 'Terminus';
        const trip = this.tripsMap[trip_id];
        // GTFS: trip.headsign = direction, ou stop_sequence max = terminus
        if (trip && trip.trip_headsign) return trip.trip_headsign;
        // Fallback: essayer de trouver le dernier stop de ce trip
        if (trip && trip.stop_times && trip.stop_times.length) {
          const lastStop = trip.stop_times.reduce((a, b) => (a.stop_sequence > b.stop_sequence ? a : b));
          if (lastStop && this.stopsMap[lastStop.stop_id]) return this.stopsMap[lastStop.stop_id].stop_name;
        }
        return 'Terminus';
      },
    }
  };
</script>

<style scoped>
  .main-layout {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .center-panel {
    flex: 1;
    padding: 16px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    position: relative;
  }

  .form-card {
    background: #232733;
    color: #fff;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin-bottom: 16px;
  }

  .mode-switch {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .mode-switch label {
    cursor: pointer;
    padding: 8px 16px;
    border-radius: 16px;
    transition: background 0.3s;
    color: #fff;
  }

  .mode-switch input {
    display: none;
  }

  .mode-switch label:hover {
    background: #f0f0f0;
  }

  .mode-switch input:checked + label {
    background: #353942;
    color: #FFD600;
  }

  .route-controls,
  .mst-controls,
  .connexite-controls {
    margin-top: 16px;
  }

  .autocomplete-group {
    margin-bottom: 16px;
  }

  .autocomplete-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: bold;
    color: #fff;
  }

  .autocomplete-group input {
    width: 100%;
    padding: 10px 0px;
    border: 1px solid #444;
    border-radius: 8px;
    font-size: 16px;
    background: #353942;
    color: #fff;
  }

  .autocomplete-group input:focus {
    border-color: #FFD600;
    outline: none;
    background: #232733;
  }

  .suggestions {
    background: #353942;
    color: #fff;
    border: 1px solid #444;
  }

  .suggestions li {
    padding: 10px;
    cursor: pointer;
    transition: background 0.3s;
  }

  .suggestions li:hover {
    background: #232733;
  }

  .dev-search-btn {
    background: #FFD600;
    color: #232733;
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: background 0.3s, color 0.3s;
  }

  .dev-search-btn:hover:enabled {
    background: #ffe066;
    color: #232733;
  }

  .dev-search-btn:disabled {
    background: #888;
    color: #ccc;
    cursor: not-allowed;
  }

  .dev-time {
    margin-top: 16px;
    padding: 12px;
    background: #f8fafd;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
  }

  .dev-time h4 {
    margin: 0 0 8px 0;
    font-size: 18px;
    color: #184b8a;
  }

  .dev-time p {
    margin: 0 0 8px 0;
    color: #333;
  }

  .dev-time span {
    font-weight: bold;
    font-size: 1.2em;
    color: #184b8a;
  }

  .roadmap-card {
    background: #fff;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin-bottom: 16px;
  }

  .dev-roadmap-details {
    margin-top: 16px;
  }

  .dev-roadmap-details h4 {
    margin: 0 0 8px 0;
    font-size: 18px;
    color: #184b8a;
  }

  .dev-roadmap-details ol {
    padding-left: 20px;
    margin: 0;
  }

  .dev-roadmap-details li {
    margin-bottom: 8px;
    color: #333;
  }

  .timeline {
    position: relative;
    padding: 10px 0;
  }

  .timeline-step {
    position: relative;
    padding: 10px 0;
    display: flex;
    align-items: center;
  }

  .timeline-left {
    position: relative;
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .timeline-line {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #e0e0e0;
    z-index: 1;
  }

  .timeline-content {
    padding-left: 60px;
    flex: 1;
  }

  .timeline-title {
    font-weight: bold;
    color: #184b8a;
    display: flex;
    align-items: center;
  }

  .timeline-title span {
    margin-left: 4px;
    font-size: 14px;
    color: #666;
  }

  .timeline-desc {
    margin-top: 4px;
    font-size: 14px;
    color: #333;
  }

  .timeline-time {
    margin-left: auto;
    font-size: 14px;
    color: #666;
  }

  /* Ajout styles pour roadmap verticale façon IDFM */
.roadmap-card .timeline {
  display: flex;
  flex-direction: column;
  position: relative;
  margin-left: 24px;
}
.timeline-step {
  display: flex;
  align-items: flex-start;
  min-height: 48px;
  position: relative;
  padding-bottom: 8px;
}
.timeline-left {
  width: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.timeline-line {
  width: 2px;
  background: #bcd;
  flex: 1 1 auto;
  margin: 0 auto;
  min-height: 24px;
}
.timeline-content {
  flex: 1 1 auto;
  padding-left: 8px;
  padding-right: 8px;
  min-width: 120px;
}
.timeline-title {
  font-weight: bold;
  font-size: 1.05em;
  display: flex;
  align-items: center;
  gap: 8px;
}
.timeline-desc {
  color: #888;
  font-size: 0.97em;
  margin-top: 2px;
}
.timeline-time {
  min-width: 48px;
  text-align: right;
  font-size: 1.05em;
  color: #184b8a;
  font-weight: bold;
  margin-left: 8px;
}
</style>



