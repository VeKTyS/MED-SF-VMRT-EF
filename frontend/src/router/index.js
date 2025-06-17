import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import ACPM from '../pages/ACPM.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/ACPM', name: 'ACPM', component: ACPM}
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router