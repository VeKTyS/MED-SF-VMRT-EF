<template>
  <div class="main-layout">
    <div class="center-panel">
      <div class="form-card">
        <div class="mode-switch">
          <label class="custom-btn">
            <input type="radio" v-model="mode" value="route" />
            Itinéraire (Station à Station)
          </label>
          <label class="custom-btn">
            <input type="radio" v-model="mode" value="mst" />
            Arbre couvrant (ACPM)
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
                v-for="suggestion in filteredStartSuggestions"
                :key="suggestion"
                @mousedown.prevent="selectStartSuggestion(suggestion)"
              >
                {{ suggestion }}
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
                v-for="suggestion in filteredEndSuggestions"
                :key="suggestion"
                @mousedown.prevent="selectEndSuggestion(suggestion)"
              >
                {{ suggestion }}
              </li>
            </ul>
          </div>
          <button
            class="dev-search-btn"
            @click="fetchJourney"
            :disabled="!startStation || !endStation || startStation === endStation"
          >
            Rechercher
          </button>
        </div>
        <div v-if="mode === 'mst'" class="mst-controls">
          <button class="dev-search-btn" @click="drawKruskal">Afficher Kruskal</button>
          <button class="dev-search-btn" disabled @click="drawPrim">Afficher Prim</button>
        </div>
      </div>
      <div v-if="(mode === 'route' && roadmap.length) || (mode === 'mst' && roadmap.length)" class="roadmap-card">
        <div class="dev-time">
          <span>Temps estimé</span>
          <h2>00:22:51</h2>
        </div>
        <div class="dev-roadmap-details">
          <h4>Roadmap</h4>
          <ol>
            <li v-for="station in roadmap" :key="station">{{ station }}</li>
          </ol>
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
          v-for="(edge, idx) in mstEdges"
          :key="'mst-edge-' + idx"
          :lat-lngs="edge"
          color="red"
          :weight="4"
        />
        <l-polyline
          v-for="(segment, idx) in coloredRouteSegments"
          :key="'route-segment-' + idx"
          :lat-lngs="segment.latlngs"
          :color="segment.color"
          :weight="6"
        />
        <l-marker
          v-for="station in roadmap"
          :key="station.id"
          :lat-lng="[pospointsMap[station.id]?.lat, pospointsMap[station.id]?.lon]"
        >
          <l-popup>{{ station.name }}</l-popup>
        </l-marker>
      </l-map>
    </div>
    <div class="bottom-buttons">
      <button class="custom-btn" disabled> PMR </button>
      <button class="custom-btn" disabled>Connexité</button>
      <button class="custom-btn" disabled>Indicateur Efficience</button>
      <button class="custom-btn" disabled>Indicateur Efficacité</button>
      <button class="custom-btn" disabled>Indicateur Capacité</button>
      <button class="custom-btn" disabled>Indicateur de qualité</button>
    </div>
  </div>
</template>

<script>
import { LMap, LTileLayer, LMarker, LPopup, LPolyline, LImageOverlay } from "@vue-leaflet/vue-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

export default {
  name: "Dev",
  components: { LMap, LTileLayer, LMarker, LPopup, LPolyline, LImageOverlay },
  data() {
    return {
      apiBase: "http://localhost:3000/api",
      pospoints: [],
      pospointsMap: {},
      stationNames: [],
      subwayEdges: [],
      roadmap: [],
      routeCoords: [],
      mode: "route",
      startStation: "",
      endStation: "",
      startInput: "",
      endInput: "",
      filteredStartSuggestions: [],
      filteredEndSuggestions: [],
      showStartSuggestions: false,
      showEndSuggestions: false,
      // Simple CRS settings
      simpleCrs: L.CRS.Simple,
      mapWidth: 1000,   
      mapHeight: 800,   
      backgroundImage: null,
      mapCenterLat: 48.8566, 
      mapCenterLon: 2.3522  
    };
  },
  async mounted() {
    // Fetch all station coordinates (should be in pixel coordinates: { name, x, y })
    this.pospoints = await fetch(`${this.apiBase}/pospoints`).then(r => r.json());
    this.pospointsMap = {};
    this.pospoints.forEach(p => {
      this.pospointsMap[p.name] = p;
    });
    this.stationNames = this.pospoints.map(p => p.name);

    // Fetch subway edges
    const edges = await fetch(`${this.apiBase}/edges`).then(r => r.json());
    // edges: [ [fromName, toName], ... ]
    this.subwayEdges = edges
      .map(([from, to]) => {
        const a = this.pospointsMap[from];
        const b = this.pospointsMap[to];
        return a && b ? [
          [a.y, a.x],
          [b.y, b.x]
        ] : null;
      })
      .filter(Boolean);
  },
  watch: {
    mode(newMode) {
      this.roadmap = [];
      this.routeCoords = [];
      this.startInput = "";
      this.endInput = "";
      this.startStation = "";
      this.endStation = "";
    }
  },
  methods: {
    async fetchJourney() {
      if (!this.startStation || !this.endStation || this.startStation === this.endStation) return;
      const res = await fetch(`${this.apiBase}/journey?from=${encodeURIComponent(this.startStation)}&to=${encodeURIComponent(this.endStation)}`);
      const data = await res.json();
      if (!data.path || !Array.isArray(data.path)) {
        this.roadmap = [];
        this.routeCoords = [];
        return;
      }
      this.roadmap = data.path.map(st => st.name);
      // Build the polyline for the route (in pixel coordinates)
      this.routeCoords = data.path
        .map(st => this.pospointsMap[st.name])
        .filter(Boolean)
        .map(st => [st.y, st.x]);
    },
    async drawKruskal() {
      // Fetch MST edges from the backend
      const res = await fetch(`${this.apiBase}/kruskal`);
      const mstEdges = await res.json();
      this.routeCoords = mstEdges
        .map(({ from, to }) => {
          const a = this.pospointsMap[from];
          const b = this.pospointsMap[to];
          return a && b ? [
            [a.y, a.x],
            [b.y, b.x]
          ] : null;
        })
        .filter(Boolean);
      this.roadmap = [];
    },

    async drawPrim() {
      // Fetch MST edges from the backend
      const res = await fetch(`${this.apiBase}/prim`);
      const mstEdges = await res.json();
      // Convert to polylines in pixel CRS
      this.routeCoords = mstEdges
        .map(({ from, to }) => {
          const a = this.pospointsMap[from];
          const b = this.pospointsMap[to];
          return a && b ? [
            [a.y, a.x],
            [b.y, b.x]
          ] : null;
        })
        .filter(Boolean);
      this.roadmap = [];
    },


    filterStartSuggestions() {
      const input = this.startInput.trim().toLowerCase();
      this.filteredStartSuggestions = input
        ? this.stationNames.filter(name => name.toLowerCase().includes(input) && name !== this.endStation)
        : [];
      this.showStartSuggestions = !!this.filteredStartSuggestions.length;
      this.startStation = this.stationNames.includes(this.startInput) ? this.startInput : "";
    },
    filterEndSuggestions() {
      const input = this.endInput.trim().toLowerCase();
      this.filteredEndSuggestions = input
        ? this.stationNames.filter(name => name.toLowerCase().includes(input) && name !== this.startStation)
        : [];
      this.showEndSuggestions = !!this.filteredEndSuggestions.length;
      this.endStation = this.stationNames.includes(this.endInput) ? this.endInput : "";
    },
    selectStartSuggestion(suggestion) {
      this.startInput = suggestion;
      this.startStation = suggestion;
      this.filteredStartSuggestions = [];
      this.showStartSuggestions = false;
    },
    selectEndSuggestion(suggestion) {
      this.endInput = suggestion;
      this.endStation = suggestion;
      this.filteredEndSuggestions = [];
      this.showEndSuggestions = false;
    },
    hideStartSuggestions() {
      setTimeout(() => { this.showStartSuggestions = false; }, 100);
    },
    hideEndSuggestions() {
      setTimeout(() => { this.showEndSuggestions = false; }, 100);
    }
  }
};
</script>

<style>
h1 {
  font-size: 2rem;
  margin-bottom: 20px;
  color: #FFD600;
}
p {
  font-size: 1.2rem;
  line-height: 1.5;
  color: #e0e6ed;
  margin-bottom: 20px;
}
body, .main-layout {
  font-family: 'Inter', Arial, sans-serif;
  background: linear-gradient(135deg, #3a3a3a 0%, #000000 100%);
  color: #e0e6ed;
}

.main-layout {
  display: flex;
  flex-direction: row;
  height: 100vh;
}

.center-panel {
  flex: 0 0 400px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 10;
}

.form-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  width:auto;
  backdrop-filter: blur(10px);
}

.mode-switch {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  font-size: large;
}

.mode-switch label {
  cursor: pointer;
  padding: 10px 20px;
  border-radius: 20px;
  transition: background 0.3s;
}

.mode-switch input {
  display: none;
}

.mode-switch label:hover {
  background: rgba(255, 255, 255, 0.2);
}

.mode-switch input:checked + label {
  background: #FFD600;
  color: #181c23;
}

.route-controls, .mst-controls {
  margin-top: 20px;
  font-size: large;
}

.autocomplete-group {
  margin-bottom: 15px;
}

.autocomplete-group label {
  display: block;
  margin-bottom: 5px;
}

.autocomplete-group input {
  width: 100%;
  padding: 10px 0px;
  border: 1px solid #444;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #e0e6ed;
  transition: border 0.3s;
}

.autocomplete-group input:focus {
  border-color: #FFD600;
  outline: none;
}

.suggestions {
  font-size: 1rem;
  list-style: none;
  padding: 0;
  margin: 0;
  background: #232733;
  border-radius: 4px;
  border: 1px solid #444;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  position: absolute;
  width: calc(100% - 22px);
}

.suggestions li {
  padding: 10px;
  cursor: pointer;
  transition: background 0.3s;
}

.suggestions li:hover {
  background: rgba(255, 255, 255, 0.2);
}

.loading-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 123, 255, 0.3);
  border-top: 4px solid rgba(0, 123, 255, 1);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.dev-search-btn {
  width: 100%;
  padding: 12px;
  background: #1e90ff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  margin-top: 10px;
  cursor: pointer;
  transition: background 0.2s;
}
.dev-search-btn:hover {
  background: #1565c0;
}

.dev-search-btn:disabled {
  background: rgba(255, 214, 0, 0.5);
  cursor: not-allowed;
}

.roadmap-card {
  font-size: 1.2rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  backdrop-filter: blur(10px);
}

.dev-time {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.dev-time h2 {
  margin: 0;
  font-size: 24px;
  color: #FFD600;
}

.dev-roadmap-details {
  margin-top: 10px;
}

.dev-roadmap-details h4 {
  margin: 0 0 10px 0;
  font-size: 18px;
  color: #FFD600;
}

.dev-roadmap-details ol {
  padding-left: 20px;
}

.dev-roadmap-details li {
  margin-bottom: 5px;
}

.map-panel {
  flex: 1;
  position: relative;
  z-index: 1;
}

.bottom-buttons {
  position: absolute;
  bottom: 0;
  left: 15px;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12px;
  z-index: 20;
  width: 410px; 
}

.custom-btn {
  flex: 1 1 100px;
  min-width: 110px;   
  max-width: 130px;  
  padding: 12px 0;
  background: rgba(255, 214, 0, 0.5);;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  margin: 0;
  cursor: pointer;
  transition: background 0.2s;
  text-align: center;
}

.custom-btn:disabled {
  background: rgba(255, 214, 0, 0.3);
  cursor: not-allowed;
}
.custom-btn:hover {
  background: #1565c0;
}

.loading-time {
  margin-top: 8px;
  font-size: 0.95em !important;
  color: #888;
}
</style>