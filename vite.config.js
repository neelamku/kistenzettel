import { defineConfig } from 'vite';

// Für GitHub Pages als Projektseite (https://DEIN_NAME.github.io/REPO_NAME/)
// muss "base" exakt dem Repository-Namen entsprechen, inklusive Schrägstriche.
// Heißt dein Repo z. B. "kistenzettel", bleibt es unten so stehen.
// Nur wenn dein Repo "DEIN_NAME.github.io" heißt (Benutzerseite), setze base auf '/'.
export default defineConfig({
  base: '/kistenzettel/',
});
