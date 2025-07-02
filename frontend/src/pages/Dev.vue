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
          <button class="dev-search-btn" @click="drawKruskal" :disabled="isLoading">Afficher Kruskal</button>
        </div>
        <div v-if="mode === 'connexite'" class="connexite-controls">
          <button class="dev-search-btn" @click="fetchConnexite" :disabled="isLoading">Afficher Connexité</button>
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
        isLoading: false, // indicate loading state for journey or MST
        lastJourneyLoadTime: null
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

        const total = Math.round(this.totalDistance);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const seconds = total % 60;
        return [
          hours.toString().padStart(2, '0'),
          minutes.toString().padStart(2, '0'),
          seconds.toString().padStart(2, '0')
        ].join(':');
      },
      coloredRouteSegments() {
        if (!this.roadmap.length) return [];
        const segments = [];
        for (let i = 1; i < this.roadmap.length; i++) {
          const prev = this.roadmap[i - 1];
          const curr = this.roadmap[i];
          const prevPos = this.pospointsMap[prev.id];
          const currPos = this.pospointsMap[curr.id];
          if (prevPos && currPos) {
            // Find common line between prev and curr
            const prevStation = this.stationsMap[prev.id] || {};
            const currStation = this.stationsMap[curr.id] || {};
            let color = "#FFD600"; // Default
            if (prevStation.lineNumbers && currStation.lineNumbers) {
              const commonLines = prevStation.lineNumbers.filter(l => currStation.lineNumbers.includes(l));
              if (commonLines.length > 0) {
                color = this.lineColors[commonLines[0]] || color;
              }
            }
            segments.push({
              latlngs: [
                [prevPos.lat, prevPos.lon],
                [currPos.lat, currPos.lon]
              ],
              color
            });
          }
        }
        return segments;
      },
      roadmapColors() {
        // Returns an array of colors for each station in roadmap, based on the line used to reach it
        if (!this.roadmap.length) return [];
        const colors = [];
        for (let i = 0; i < this.roadmap.length; i++) {
          if (i === 0) {
            // First station: use its main line or default
            const st = this.stationsMap[this.roadmap[0].id] || {};
            let color = "#FFD600";
            if (st.lineNumbers && st.lineNumbers.length) {
              color = this.lineColors[st.lineNumbers[0]] || color;
            }
            colors.push(color);
          } else {
            // For other stations, use the line shared with previous
            const prev = this.stationsMap[this.roadmap[i - 1].id] || {};
            const curr = this.stationsMap[this.roadmap[i].id] || {};
            let color = "#FFD600";
            if (prev.lineNumbers && curr.lineNumbers) {
              const commonLines = prev.lineNumbers.filter(l => curr.lineNumbers.includes(l));
              if (commonLines.length > 0) {
                color = this.lineColors[commonLines[0]] || color;
              }
            }
            colors.push(color);
          }
        }
        return colors;
      },
    },
    methods: {
      async fetchJourney() {
        this.isLoading = true;
        try {
          if (!this.startStation || !this.endStation || this.startStation.id === this.endStation.id) return;
          const fromId = encodeURIComponent(this.startStation.id);
          const toId = encodeURIComponent(this.endStation.id);
          const res = await fetch(`${this.apiBase}/journey?from=${fromId}&to=${toId}`);
          if (!res.ok) throw new Error((await res.json()).error || `HTTP error! status: ${res.status}`);
          const data = await res.json();
          if (!data.path?.length) throw new Error("No valid path found between the selected stations.");
          this.roadmap = data.path.map(st => ({ id: st.id, name: st.name, cumulativeDistance: st.distance }));
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
        let currentLine = this.getMainLine(roadmap[0]);
        for (let i = 1; i < roadmap.length; i++) {
          const line = this.getMainLine(roadmap[i]);
          if (line !== currentLine) {
            segments.push({
              line: currentLine,
              from: roadmap[startIdx].name,
              to: roadmap[i - 1].name,
              fromId: roadmap[startIdx].id,
              toId: roadmap[i - 1].id,
              count: i - startIdx
            });
            startIdx = i; // Correction ici pour éviter les doublons de stations
            currentLine = line;
          }
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
        return station.lineNumbers && station.lineNumbers.length ? station.lineNumbers[0] : null;
      },

      formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
      }
    }
  };
</script>



