<template>
  <div class="about-page">
    <div class="about-top">
      <!-- Section Mission -->
      <section class="about-mission">
        <div class="about-text">
          <h2>Notre mission</h2>
          <p>
            Notre mission est de développer une application de recherche d’itinéraires optimisés dans le réseau de transport parisien, en assurant un temps de calcul réduit et une consommation énergétique minimale. Nous visons également à offrir une expérience utilisateur fluide et intuitive, tout en intégrant des données GTFS 2025 et des fonctionnalités d’accessibilité.
          </p>
        </div>
      </section>
      <!-- Section Histoire -->
      <section class="about-story">
        <div class="about-text">
          <h2>Notre histoire</h2>
          <p>
            Partie de la problématique des déplacements étudiants, responsables de plus de 40 % des émissions de CO₂ d’un établissement, notre projet combine algorithmes de graphes performants (Dijkstra, Kruskal, Prim) et données réelles pour proposer des itinéraires écologiques. Nous contribuons ainsi à une mobilité plus durable et à la réduction de l’empreinte carbone.
          </p>
        </div>
      </section>
    </div>
    <!-- Section Technologies -->
    <section class="about-tech">
      <h2>Nos technologies</h2>
      <div class="tech-list">
        <div class="tech-item">
          <img src="../assets/vue.svg" alt="Vue.js" />
          <div>
            <b>Vue.js</b>
            <p>Framework JavaScript moderne pour construire des interfaces utilisateur réactives et performantes.</p>
          </div>
        </div>
        <div class="tech-item">
          <img src="../assets/Nodejs.svg" alt="Node.js" />
          <div>
            <b>Node.js</b>
            <p>Environnement d’exécution JavaScript côté serveur, idéal pour les applications web rapides et évolutives.</p>
          </div>
        </div>
        <div class="tech-item">
          <img src="../assets/MySQL.svg" alt="MySQL" />
          <div>
            <b>MySQL</b>
            <p>Système de gestion de base de données relationnelle robuste et largement utilisé.</p>
          </div>
        </div>
        <div class="tech-item">
          <img src="../assets/leaflet.svg" alt="Leaflet" />
          <div>
            <b>Leaflet</b>
            <p>Bibliothèque JavaScript open source pour des cartes interactives et légères.</p>
          </div>
        </div>
        <div class="tech-item">
          <img src="../assets/docker.svg" alt="Docker" />
          <div>
            <b>Docker</b>
            <p>Plateforme de conteneurisation pour déployer et gérer facilement les applications et leurs dépendances.</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  padding: 40px;
  gap: 40px;
}
.about-top {
  display: flex;
  gap: 40px;
}
.about-mission,
.about-story {
  flex: 1 1 0;
}
.tech-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.tech-item {
  display: flex;
  align-items: center;
  border-radius: 8px;
  padding: 10px;
  width: calc(33.333% - 20px);
}
.tech-item img {
  max-width: 40px;
  margin-right: 10px;
}
</style>
