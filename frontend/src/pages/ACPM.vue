<template>
  <div class="about-page">
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
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 40px;
  gap: 40px;
}
.about-mission,
.about-story {
  flex: 1;
}
.about-mission .about-text {
  text-align: left;
}
.about-story .about-text {
  text-align: right;
}
</style>
