import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/views/HomePage.vue'
import PlanEditor from '@/views/PlanEditor.vue'
import DecksView from '@/views/DecksView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage
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
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
