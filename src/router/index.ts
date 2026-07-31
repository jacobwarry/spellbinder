import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/views/HomePage.vue'
import Dashboard from '@/views/Dashboard.vue'
import ConfigView from '@/views/ConfigView.vue'
import PlanEditor from '@/views/PlanEditor.vue'
import DecksView from '@/views/DecksView.vue'
import CardDetailView from '@/views/CardDetailView.vue'

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: Dashboard
  },
  {
    path: '/collection',
    name: 'collection',
    component: HomePage
  },
  {
    path: '/config',
    name: 'config',
    component: ConfigView
  },
  // Old dashboard path — keep working for existing bookmarks.
  {
    path: '/dashboard',
    redirect: '/'
  },
  {
    path: '/sets',
    name: 'sets',
    component: PlanEditor
  },
  {
    path: '/sets/:id',
    name: 'set-detail',
    component: PlanEditor
  },
  {
    path: '/decks',
    name: 'decks',
    component: DecksView
  },
  {
    path: '/decks/:id',
    name: 'deck-detail',
    component: DecksView
  },
  // Read-only single-card page: full card data + price telemetry. Keyed by Scryfall id.
  {
    path: '/card/:id',
    name: 'card-detail',
    component: CardDetailView
  },
  // Dev-only design-system gallery (excluded from production build)
  ...(import.meta.env.DEV
    ? [
        {
          path: '/styleguide',
          name: 'styleguide',
          component: () => import('@/views/StyleguidePage.vue')
        }
      ]
    : [])
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
