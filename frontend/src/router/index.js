import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import ACPM from '../pages/ACPM.vue'
import Dev from '../pages/Dev.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/ACPM', name: 'ACPM', component: ACPM},
  { path :'/Dev', name: 'Dev', component: Dev }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router