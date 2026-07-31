import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/inter'
import '@fontsource-variable/sora'
import router from './router'
import './style.css'
import App from './App.vue'
import { migrateBindersToTyped, purgeOrphanedBinders } from './utils/binderMigration'
import { initTheme } from './composables/useTheme'

// Run migrations before app initialization
migrateBindersToTyped()
purgeOrphanedBinders()

// Resolve + apply light/dark before mount
initTheme()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
