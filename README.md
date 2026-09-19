# Kistenzettel

QR-Etiketten für Umzugskisten. Ablauf:

1. Etiketten erstellen (Kategorie wählen, z. B. „Küche“, optional „Zerbrechlich“) und ausdrucken.
2. Auf die Kisten kleben — noch bevor die Liste feststeht.
3. Beim Packen den Code auf der Kiste scannen → Liste eintippen → speichern.
4. Jede*r, der/die den Code später scannt, sieht die Liste — ganz ohne Anmeldung.
   Bearbeiten (Liste anlegen/ändern, Etiketten erstellen, Kisten löschen) kann nur die
   Besitzerin, nach Anmeldung mit Google.

Technisch: eine statische Vite-App, gehostet auf GitHub Pages, mit
[Firebase Firestore](https://firebase.google.com/docs/firestore) als Datenbank
(kostenloser „Spark“-Tarif reicht locker). Firestore-Regeln erlauben Lesen pro
Kiste für alle, aber Schreiben und Auflisten nur für die Besitzerin — siehe
`firestore.rules`.

## Einmalige Einrichtung

### 1. Firebase-Projekt anlegen

1. Auf [console.firebase.google.com](https://console.firebase.google.com) ein neues Projekt erstellen (Google Analytics ist nicht nötig).
2. Im Projekt: **Build → Firestore Database → Datenbank erstellen**. Standort egal, Produktionsmodus wählen.
3. **Build → Authentication → Sign-in-Methode → Google** aktivieren.
4. **Projekteinstellungen (Zahnrad) → Allgemein → Meine Apps → Web-App hinzufügen** (Symbol `</>`). Kein Firebase Hosting nötig. Die angezeigten Config-Werte (`apiKey`, `authDomain`, `projectId`, …) in `src/firebase.js` eintragen, anstelle der Platzhalter.
5. **Authentication → Settings → Authorized domains**: `DEIN_NAME.github.io` hinzufügen (erst möglich, sobald die Seite auf GitHub Pages läuft, siehe unten — `localhost` ist für die lokale Entwicklung bereits automatisch erlaubt).
6. **Firestore Database → Regeln**: den Inhalt von `firestore.rules` einfügen und veröffentlichen.

### 2. Eigene E-Mail-Adresse eintragen

In `firestore.rules` (Zeile mit `istBesitzerin()`) und in `src/firebase.js` (`OWNER_EMAIL`)
steht bereits `neelamkumariyadav95@gmail.com`. Nur mit einem Google-Konto dieser Adresse
lassen sich Etiketten erstellen und Listen bearbeiten. Bei Änderung: an beiden Stellen
gleichzeitig anpassen und die Regeln in der Firebase-Konsole neu veröffentlichen.

### 3. Lokal testen

```
npm install
npm run dev
```

Öffnet die Seite lokal. Zum Testen mit dem eigenen Google-Konto anmelden — danach lassen
sich Etiketten erstellen. In einem privaten Browserfenster (nicht angemeldet) prüfen, dass
das Scannen eines Codes die Liste zeigt, aber keine Bearbeiten-Buttons.

### 4. Auf GitHub veröffentlichen

```
git init
git add .
git commit -m "Kistenzettel: erste Version"
```

Dann auf [github.com/new](https://github.com/new) ein neues, leeres Repository anlegen
(z. B. `kistenzettel`) und:

```
git remote add origin https://github.com/DEIN_NAME/kistenzettel.git
git branch -M main
git push -u origin main
```

Falls das Repo anders als `kistenzettel` heißt, `base` in `vite.config.js` entsprechend
anpassen (muss exakt `/REPO_NAME/` sein), bevor du pushst.

**GitHub Pages aktivieren:** Repo → Settings → Pages → „Source“ auf **GitHub Actions**
stellen. Der mitgelieferte Workflow (`.github/workflows/deploy.yml`) baut die Seite bei
jedem Push auf `main` automatisch und veröffentlicht sie unter
`https://DEIN_NAME.github.io/kistenzettel/`.

Nicht vergessen: diese endgültige URL noch bei **Authentication → Settings →
Authorized domains** in der Firebase-Konsole eintragen (nur der Domain-Teil,
`DEIN_NAME.github.io`), sonst schlägt die Google-Anmeldung dort fehl.

## Datenmodell

Firestore-Sammlung `boxes`, ein Dokument pro Kiste, ID = der 5-stellige Code auf dem
Etikett:

```
{
  code, tag, fragile,
  items: [{ text, checked }],
  notes,
  createdAt, updatedAt
}
```

## Sicherheit

- `apiKey` & Co. in `src/firebase.js` sind bewusst öffentlich — Firebase-Config ist kein
  Geheimnis, der Schutz kommt aus `firestore.rules`.
- Fremde können mit dem Link genau die eine gescannte Kiste lesen (`allow get`), aber
  nicht die gesamte Sammlung auflisten (`allow list` nur für die Besitzerin) — dein
  restliches Kisten-Inventar bleibt privat.
- Häkchen, die Nicht-Besitzer*innen beim Auspacken setzen, werden nur lokal im Browser
  gespeichert (nicht geteilt) — nur die Besitzerin kann den geteilten Status ändern.
