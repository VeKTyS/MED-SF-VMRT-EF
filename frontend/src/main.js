import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import 'leaflet/dist/leaflet.css';
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import '@mdi/font/css/materialdesignicons.css'

const vuetify = createVuetify()
createApp(App).use(vuetify).use(router).mount('#app')