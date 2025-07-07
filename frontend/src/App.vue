<template>
  <head>
    <link rel="stylesheet" href="style.css">
  </head>
  
  <header>
    <nav>
      <div class="nav-left">
        <router-link to="/"><img class="nav_item" style="width: 40%" src="./assets/image (1).svg"/></router-link>
      </div>
      <div class="nav-right">
        <router-link to="/about">A propos</router-link>
      <router-link to="/dev"> Dev </router-link>
      </div>
    </nav>
    <router-view/>
  </header>
  <footer>
    <div class="footer-content">
      <p>© 2025 - Tous droits réservés</p>
      <p>Développé par <a href="https://github.com/VeKTyS" target="_blank">Lucas</a>
      | <a href="https://github.com/MaceoMARLIN" target="_blank">Maceo</a>
      | <a href="https://github.com/jona3341" target="_blank">Jonathan</a>
      | <a href="https://github.com/Honestyle" target="_blank">Honesty</a>
      | <a href="https://github.com/jeanmicheldu" target="_blank">Cécilia</a>

    </p>
    </div>
  </footer>
</template>