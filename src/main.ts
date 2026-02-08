import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import './style.css'
import App from './App.vue'
import { migrateBindersToTyped } from './utils/binderMigration'

// Run migrations before app initialization
migrateBindersToTyped()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
