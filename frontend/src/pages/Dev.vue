<!-- filepath: c:\Users\PC\Desktop\MED-SF-VMRT-EF\frontend\src\pages\Dev.vue -->
<template>
  <div>
    <div class="controls">
      <h3>Options</h3>
      <div>
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
          @click="fetchJourney"
          :disabled="!startStation || !endStation || startStation === endStation"
        >
          Calculer l'itinéraire
        </button>
      </div>
      <div v-if="mode === 'mst'" class="mst-controls">
        <button @click="drawKruskal">Afficher Kruskal</button>
        <button disabled title="À venir">Afficher Prim (bientôt)</button>
      </div>
    </div>

    <div v-if="mode === 'route' && roadmap.length" class="roadmap">
      <h4>Roadmap</h4>
      <ol>
        <li v-for="station in roadmap" :key="station">{{ station }}</li>
      </ol>
    </div>
  </div>
</template>

<script>
export default {
  name: "Dev",
  data() {
    return {
      apiBase: "http://localhost:3000/api",
      pospoints: [],
      pospointsMap: {},
      stationNames: [],
      mode: "route",
      startStation: "",
      endStation: "",
      roadmap: [],
      // Autocomplete
      startInput: "",
      endInput: "",
      filteredStartSuggestions: [],
      filteredEndSuggestions: [],
      showStartSuggestions: false,
      showEndSuggestions: false
    };
  },
  async mounted() {
    // Fetch all stations coordinates from /api/pospoints
    this.pospoints = await fetch(`${this.apiBase}/pospoints`).then(r => r.json());
    this.pospointsMap = {};
    this.pospoints.forEach(p => {
      this.pospointsMap[p.name] = p;
    });
    this.stationNames = this.pospoints.map(p => p.name);
  },
  watch: {
    mode(newMode) {
      this.roadmap = [];
      this.startInput = "";
      this.endInput = "";
      this.startStation = "";
      this.endStation = "";
      // Optionally, you can clear other state here if needed
    }
  },
  methods: {
    async fetchJourney() {
      if (!this.startStation || !this.endStation || this.startStation === this.endStation) return;
      const res = await fetch(`${this.apiBase}/journey?from=${encodeURIComponent(this.startStation)}&to=${encodeURIComponent(this.endStation)}`);
      const data = await res.json();
      if (!data.path || !Array.isArray(data.path)) {
        this.roadmap = [];
        return;
      }
      this.roadmap = data.path.map(st => st.name);
    },
    async drawKruskal() {
      // Placeholder for ACPM logic if needed
      // You can implement roadmap display for ACPM here if desired
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
.controls {
  margin-bottom: 1rem;
  background: #f8f8f8;
  padding: 1rem;
  border-radius: 8px;
}
.roadmap {
  margin-top: 1rem;
  background: #f4f9ff;
  padding: 1rem;
  border-radius: 8px;
  max-width: 400px;
}
.route-controls {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}
.autocomplete-group {
  position: relative;
  width: 250px;
}
.suggestions {
  position: absolute;
  z-index: 10;
  background: white;
  border: 1px solid #ccc;
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
}
.suggestions li:hover {
  background: #e6f0ff;
}
</style>