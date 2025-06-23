<template>
  <head>
    <link rel="stylesheet" href="style.css">
  </head>
  
  <header>
    <nav>
      <div class="nav-left">
        <img class="nav_item" src="./assets/vue.svg"/>
        <router-link to="/">Accueil</router-link>
      </div>
      <div class="nav-right">
        <router-link to="/ACPM">Dev</router-link>
      <router-link to="/dev"> Dev </router-link>
      </div>
    </nav>
    <router-view/>
  </header>
  <footer>
    <div class="footer-content">
      <p>© 2025 - Tous droits réservés</p>
      <p>Développé par <a href="https://github.com/VeKTyS" target="_blank">VeKTyS</a>
      | <a href="https://github.com/MaceoMARLIN" target="_blank">Darksasuke911</a>
      | <a href="https://github.com/jona3341" target="_blank">jona3341</a></p>
    </div>
  </footer>
</template>