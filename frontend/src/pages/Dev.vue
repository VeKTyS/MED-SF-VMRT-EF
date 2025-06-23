<!-- filepath: c:\Users\PC\Desktop\MED-SF-VMRT-EF\frontend\src\pages\Dev.vue -->
<template>
  <div class="main-layout">
    <div class="center-panel">
      <nav class="top-nav">
        <a href="#" class="nav-link">Accueil</a> | <a href="#" class="nav-link">À propos</a>
      </nav>
      <div class="form-card">
        <div class="mode-switch">
          <label>
            <input type="radio" v-model="mode" value="route" />
            Itinéraire (Bonjour RATP)
          </label>
          <label>
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
          <button class="dev-search-btn" disabled title="À venir">Afficher Prim (bientôt)</button>
        </div>
      </div>
      <div v-if="(mode === 'route' && roadmap.length) || (mode === 'mst' && roadmap.length)" class="roadmap-card">
        <div class="dev-time">
          <span>Temps estimé</span>
          <h2>
            {{ formattedTime }}
          </h2>
        </div>
        <div class="dev-roadmap-details">
          <h4>Roadmap</h4>
          <ol>
            <li v-for="station in roadmap" :key="station.name + station.line">
              {{ station.name }} — Ligne {{ station.line }}
              <span
                v-if="station.correspondance"
                class="correspondance-label"
              >
                (Correspondance : {{ station.fromLine }} → {{ station.toLine }})
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
    <div class="map-panel">
      <l-map
        style="height: 100vh; width: 100%; min-width: 600px"
        :zoom="0"
        :center="[mapHeight / 2, mapWidth / 2]"
        :crs="simpleCrs"
        :maxBounds="[[0,0],[mapHeight,mapWidth]]"
        :minZoom="-2"
        :maxZoom="4"
        :zoomControl="false"
        :scrollWheelZoom="true"
      >
        <!-- Optionally, add a background image for your map here -->
        <!--
        <l-image-overlay
          v-if="backgroundImage"
          :url="backgroundImage"
          :bounds="[[0,0],[mapHeight,mapWidth]]"
        />
        -->
        <l-polyline
          v-for="(edge, idx) in subwayEdges"
          :key="idx"
          :lat-lngs="edge"
          color="#444"
          :weight="2"
        />
        <l-polyline
          v-if="routeCoords.length"
          :lat-lngs="routeCoords"
          color="#FFD600"
          :weight="6"
        />
        <l-marker
          v-for="station in pospoints"
          :key="station.name"
          :lat-lng="[station.y, station.x]"
        >
          <l-popup>{{ station.name }}</l-popup>
        </l-marker>
      </l-map>
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
      totalDistance: 0,
      // Autocomplete
      startInput: "",
      endInput: "",
      filteredStartSuggestions: [],
      filteredEndSuggestions: [],
      showStartSuggestions: false,
      showEndSuggestions: false,
      // Simple CRS settings
      simpleCrs: L.CRS.Simple,
      mapWidth: 1000,   // Set to your network's pixel width
      mapHeight: 800,   // Set to your network's pixel height
      backgroundImage: null // Optionally, set a background image for your map
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

    // Optionally, set a background image (must match mapWidth/mapHeight)
    // this.backgroundImage = require('@/assets/your-background.png');
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
  computed: {
    formattedTime() {
      // Assuming totalDistance is in seconds
      const total = Math.round(this.totalDistance);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        seconds.toString().padStart(2, '0')
      ].join(':');
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
        this.totalDistance = 0;
        return;
      }
      this.roadmap = data.path.map(st => ({
        name: st.name,
        line: st.line
      })); 
      // Build the polyline for the route (in pixel coordinates)
      this.routeCoords = data.path
        .map(st => this.pospointsMap[st.name])
        .filter(Boolean)
        .map(st => [st.y, st.x]);
      this.totalDistance = data.totalDistance || 0;
    },
    async drawKruskal() {
      // Placeholder for MST logic
      this.roadmap = [];
      this.routeCoords = [];
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

<style scoped>
.main-layout {
  display: flex;
  min-height: 100vh;
  background: #181c23;
}
.center-panel {
  width: 420px;
  margin: 40px auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.top-nav {
  width: 100%;
  text-align: center;
  margin-bottom: 18px;
}
.nav-link {
  color: #3b82f6;
  text-decoration: none;
  font-size: 1rem;
}
.form-card {
  background: #181e29;
  border-radius: 12px;
  box-shadow: 0 2px 12px #0004;
  padding: 32px 24px;
  width: 100%;
  margin-bottom: 32px;
}
.mode-switch {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
}
.mode-switch label {
  cursor: pointer;
}
.route-controls {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin-bottom: 1rem;
}
.autocomplete-group {
  position: relative;
  width: 100%;
}
.autocomplete-group label {
  font-size: 1rem;
  margin-bottom: 0.2rem;
  display: block;
}
.autocomplete-group input[type="text"] {
  width: 100%;
  margin-top: 6px;
  padding: 8px;
  border-radius: 6px;
  border: none;
  background: #232733;
  color: #fff;
  font-size: 1rem;
  outline: none;
}
.suggestions {
  position: absolute;
  z-index: 10;
  background: #232733;
  border: 1px solid #444;
  border-top: none;
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}
.suggestions li {
  padding: 0.5rem;
  cursor: pointer;
  color: #fff;
}
.suggestions li:hover {
  background: #1e90ff;
  color: #fff;
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
.roadmap-card {
  background: #181e29;
  border-radius: 12px;
  box-shadow: 0 2px 12px #0004;
  padding: 32px 24px;
  width: 100%;
  margin-top: 32px;
  text-align: center;
}
.dev-time {
  font-size: 1.1rem;
  margin-bottom: 18px;
}
.dev-time h2 {
  font-size: 2.2rem;
  margin: 0;
  color: #fff;
  font-weight: 700;
}
.dev-roadmap-details {
  margin-top: 12px;
}
.dev-roadmap-details h4 {
  margin-bottom: 0.5rem;
  color: #3b82f6;
}
.dev-roadmap-details ol {
  margin: 0;
  padding-left: 18px;
  color: #bdbdbd;
  font-size: 0.98rem;
  text-align: left;
}
.dev-roadmap-details li {
  margin-bottom: 2px;
}
.map-panel {
  flex: 1;
  min-width: 600px;
  background: #181c23;
  box-shadow: 2px 0 16px #000a;
}
</style>