<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="app">
    <header class="app-header">
      <router-link to="/" class="logo">Spellbinder</router-link>
      <div class="nav-buttons">
        <router-link
          to="/decks"
          class="btn btn-nav"
          :class="{ active: route.path.startsWith('/decks') }"
        >
          My Decks
        </router-link>
        <router-link
          to="/sets"
          class="btn btn-nav"
          :class="{ active: route.path.startsWith('/sets') }"
        >
          My Sets
        </router-link>
      </div>
    </header>

    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 2rem;
  background: #fff;
  border-bottom: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.logo {
  margin: 0;
  font-size: 1.5rem;
  font-weight: bold;
  color: #333;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.logo:hover {
  color: #4a90d9;
}

.nav-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-nav {
  background: #e5e5e5;
  color: #333;
  text-decoration: none;
}

.btn-nav:hover {
  background: #d5d5d5;
}

.btn-nav.active {
  background: #4a90d9;
  color: white;
}

.app-content {
  flex: 1;
  overflow: hidden;
}
</style>
