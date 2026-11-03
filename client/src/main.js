import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (!app) throw new Error('Prototype root #app was not found.');
  window.deepTroopersPrototype = new Game();
});
