<template>
  <div>
    <nav>
      <router-link to="/">Accueil</router-link> |
      <router-link to="/ACPM">À propos</router-link>
      <router-link to="/dev"> Dev </router-link>
    </nav>
    <router-view />
  </div>
</template>