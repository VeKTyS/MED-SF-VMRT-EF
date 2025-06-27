<template>
  <div class="main-layout">
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
            <li v-for="station in roadmap" :key="station.id" style="display: flex; align-items: center;">
              <span
                :style="{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: getStationColor(station, roadmap) || '#888',
                  marginRight: '8px'
                }"
              ></span>
              {{ station.name }} <span v-if="station.cumulativeDistance !== undefined">— {{ formatDistance(station.cumulativeDistance) }}</span>
            </li>
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
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <l-polyline
          v-for="(edge, idx) in subwayEdges"
          :key="idx"
          :lat-lngs="edge"
          color="#444"
          :weight="2"
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
          :lat-lng="[pospointsMap[station.name]?.lat, pospointsMap[station.name]?.lon]"
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
      // Map center for Paris (adjust as needed)
      mapCenterLat: 48.8566,
      mapCenterLon: 2.3522,
      lineColors: {
        "1": "#FFD600", "2": "#0055C8", "3": "#837902", "3bis": "#6EC4E8",
        "4": "#CF009E", "5": "#FF7E2E", "6": "#6EC4E8", "7": "#F5A2BD",
        "7bis": "#76D1EA", "8": "#E19BDF", "9": "#B6BD00", "10": "#C9910D",
        "11": "#704B1C", "12": "#007852", "13": "#6EC4E8", "14": "#62259D"
      },
      stationsMap: {} // for fast lookup of station info by name or id
    };
  },
  async mounted() {
    // Fetch all station coordinates
    this.pospoints = await fetch(`${this.apiBase}/pospoints`).then(r => r.json());
    // Ensure pospoints have lat/lon keys
    this.pospoints.forEach(p => {
      if (p.lat === undefined && p.y !== undefined) p.lat = p.y;
      if (p.lon === undefined && p.x !== undefined) p.lon = p.x;
    });
    this.pospointsMap = {};
    this.pospoints.forEach(p => {
      this.pospointsMap[p.name] = p;
    });
    this.stationNames = this.pospoints.map(p => p.name);

    // Fetch all stations for line info
    const stationsArr = await fetch(`${this.apiBase}/stations`).then(r => r.json());
    this.stationsMap = {};
    stationsArr.forEach(st => {
      this.stationsMap[st.id] = st;
      this.stationsMap[st.name] = st; // for lookup by name
    });

    // Fetch subway edges
    const edges = await fetch(`${this.apiBase}/edges`).then(r => r.json()).catch(() => []);
    this.subwayEdges = edges
      .map(([from, to]) => {
        const a = this.pospointsMap[from];
        const b = this.pospointsMap[to];
        return a && b ? [
          [a.lat, a.lon],
          [b.lat, b.lon]
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
    },
    coloredRouteSegments() {
      if (!this.roadmap.length) return [];
      const segments = [];
      for (let i = 1; i < this.roadmap.length; i++) {
        const prev = this.roadmap[i - 1];
        const curr = this.roadmap[i];
        const prevPos = this.pospointsMap[prev.name];
        const currPos = this.pospointsMap[curr.name];
        let color = "#FFD600";
        const prevStation = this.stationsMap[prev.id] || {};
        if (prevStation.lineNumbers && prevStation.lineNumbers.length) {
          color = this.lineColors[prevStation.lineNumbers[0]] || color;
        }
        segments.push({
          latlngs: [
            [prevPos.lat, prevPos.lon],
            [currPos.lat, currPos.lon]
          ],
          color
        });
      }
      return segments;
    },
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
      // The backend now returns path: [{id, name, distance}]
      this.roadmap = data.path.map(st => ({
        id: st.id,
        name: st.name,
        cumulativeDistance: st.distance
      }));
      // Build the polyline for the route (in lat/lon)
      this.routeCoords = data.path
        .map(st => this.pospointsMap[st.name])
        .filter(Boolean)
        .map(st => [st.lat, st.lon]);
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
    },
    getStationColor(station, roadmap) {
      const st = this.stationsMap[station.id] || {};
      if (st.lineNumbers && st.lineNumbers.length) {
        return this.lineColors[st.lineNumbers[0]] || "#FFD600";
      }
      return "#FFD600";
    },
    formatDistance(distance) {
      if (distance < 60) return `${distance}s`;
      if (distance < 3600) return `${Math.floor(distance / 60)}min ${distance % 60}s`;
      return `${Math.floor(distance / 3600)}h ${Math.floor((distance % 3600) / 60)}min`;
    }
  }
};
</script>


