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
                v-for="(suggestion, index) in filteredStartSuggestions"
                :key="suggestion.id + '-' + index"
                @mousedown.prevent="selectStartSuggestion(suggestion)"
              >
                {{ suggestion.label }}
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
          :lat-lng="[pospointsMap[station.id]?.lat, pospointsMap[station.id]?.lon]"
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
        mode: "route",
        startStation: null,
        endStation: null,
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
          "1": "#FFD600",    // Jaune
          "2": "#0055C8",    // Bleu
          "3": "#837902",    // Olive
          "3bis": "#6EC4E8", // Bleu clair
          "4": "#CF009E",    // Magenta
          "5": "#FF7E2E",    // Orange
          "6": "#6EC4E8",    // Turquoise
          "7": "#F5A2BD",    // Rose pâle
          "7bis": "#76D1EA", // Bleu turquoise
          "8": "#E19BDF",    // Violet clair
          "9": "#B6BD00",    // Vert olive
          "10": "#C9910D",   // Moutarde
          "11": "#704B1C",   // Marron
          "12": "#007852",   // Vert foncé
          "13": "#6EC4E8",   // Bleu clair
          "14": "#62259D"    // Violet foncé
        },
        stationsMap: {} // for fast lookup of station info by name or id
      };
    },
    async mounted() {
      // Fetch all station coordinates
      this.pospoints = await fetch(`${this.apiBase}/pospoints`).then(r => r.json());
      this.pospoints.forEach(p => {
        if (p.lat === undefined && p.y !== undefined) p.lat = p.y;
        if (p.lon === undefined && p.x !== undefined) p.lon = p.x;
      });
      this.pospointsMap = {};
      this.pospoints.forEach(p => {
        this.pospointsMap[p.id] = p;
      });

      // Fetch all stations for line info
      const stationsArr = await fetch(`${this.apiBase}/stations`).then(r => r.json());

      // Now you can safely assign stationList
      this.stationList = [];
      stationsArr.forEach(st => {
        // For each line number, create a distinct entry
        (st.lineNumbers || []).forEach(line => {
          this.stationList.push({
            id: st.id,   // unique id per line
            name: st.name,
            lon: st.lon,
            lat: st.lat,
            lineNumber: line,
            lineNumbers: [line],      // single line for this entry
          });
        });
      });

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
          return a && b ? [[a.lat, a.lon], [b.lat, b.lon]] : null;
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
          const prevPos = this.pospointsMap[prev.id]; // ✅ au lieu de prev.name
          console.log("prev", prev);
          console.log("curr", curr);
          console.log("prevPos", prevPos);  
          const currPos = this.pospointsMap[curr.id]; // ✅ au lieu de curr.name

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
        console.log("Fetching journey from", this.startStation, "to", this.endStation);
        if (!this.startStation || !this.endStation || this.startStation.id === this.endStation.id) return;

        // Use IDs instead of names here
        const res = await fetch(`${this.apiBase}/journey?from=${encodeURIComponent(this.startStation.id)}&to=${encodeURIComponent(this.endStation.id)}`);
        const data = await res.json();

        if (!data.path || !Array.isArray(data.path)) {
          this.roadmap = [];
          this.routeCoords = [];
          this.totalDistance = 0;
          return;
        }

        this.roadmap = data.path.map(st => ({
          id: st.id,
          name: st.name,
          cumulativeDistance: st.distance
        }));

        this.routeCoords = data.path
          .map(st => this.pospointsMap[st.id]) // ✅
          .filter(Boolean)
          .map(st => [st.lat, st.lon]);


        this.totalDistance = data.totalDistance || 0;
      },


      async drawKruskal() {
      this.roadmap = [];
      this.routeCoords = [];
      const res = await fetch(`${this.apiBase}/kruskal`);
      const data = await res.json();

      if (!data.edges || !Array.isArray(data.edges)) {
        // Gestion d'erreur : pas de données valides
        this.roadmap = [];
        this.routeCoords = [];
        return;
      }

      // data.edges: [{from, to, fromName, toName, weight}]
      const stationSet = new Set();
      const roadmap = [];
      data.edges.forEach(edge => {
        if (!stationSet.has(edge.from)) {
          roadmap.push({ id: edge.from, name: edge.fromName });
          stationSet.add(edge.from);
        }
        if (!stationSet.has(edge.to)) {
          roadmap.push({ id: edge.to, name: edge.toName });
          stationSet.add(edge.to);
        }
      });
      this.roadmap = roadmap;
      this.routeCoords = data.edges.map(edge => {
        const from = this.pospointsMap[edge.fromName];
        const to = this.pospointsMap[edge.toName];
        return from && to ? [[from.lat, from.lon], [to.lat, to.lon]] : null;
      }).filter(Boolean);
    },
      forbiddenWords() {
        return ["rue", "entrée", "Entrée", "r.", "avenue", "boulevard", "place", "impasse", "allée", "chemin", "quai", "square", "voie"];
      },
      filterStartSuggestions() {
        const input = this.startInput.trim().toLowerCase();
        const forbidden = this.forbiddenWords();
        this.filteredStartSuggestions = input
          ? this.stationList
              .filter(st =>
                st.id &&
                st.name.toLowerCase().startsWith(input) &&
                !forbidden.some(word => st.name.toLowerCase().includes(word)) &&
                (!this.endStation || st.id !== this.endStation.id)
              )
              .map(st => ({
                ...st,
                id: st.id,
                label: `${st.name} (Ligne ${st.lineNumbers.join(", ")})`
              }))
          : [];
        this.showStartSuggestions = this.filteredStartSuggestions.length > 0;
      },

      filterEndSuggestions() {
        const input = this.endInput.trim().toLowerCase();
        const forbidden = this.forbiddenWords();
        this.filteredEndSuggestions = input
          ? this.stationList
              .filter(st =>
                st.name.toLowerCase().startsWith(input) &&
                !forbidden.some(word => st.name.toLowerCase().includes(word)) &&
                (!this.startStation || st.id !== this.startStation.id)
              )
              .map(st => ({
                ...st,
                id: st.id,
                label: `${st.name} (Ligne ${st.lineNumber})`
              }))
          : [];
        this.showEndSuggestions = this.filteredEndSuggestions.length > 0;
      },

      selectStartSuggestion(suggestion) {
        console.log("Selected start suggestion:", suggestion);
        this.startInput = suggestion.name;
        this.startStation = suggestion; // <-- was suggestion.id ❌
        this.filteredStartSuggestions = [];
        this.showStartSuggestions = false;
      },

      selectEndSuggestion(suggestion) {
        console.log("Selected end suggestion:", suggestion);
        this.endInput = suggestion.name;
        this.endStation = suggestion; // <-- was suggestion.id ❌
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


