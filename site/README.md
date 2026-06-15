# Lumoweb — Homepage

Eine komplette, statische Homepage für **Lumoweb** (Game- & Web-Hosting) mit
eigenem Design-System, custom SVG-Icons, einem deklarativen Formular-Regelwerk
und einem Demo-Login-System.

> Reines HTML/CSS/JS — kein Build-Schritt, keine Abhängigkeiten.

## Features

- **Custom Icon-Set** – handgezeichnete SVG-Symbole als Sprite
  (`assets/icons/sprite.svg`), per `currentColor` themebar.
- **Design-System** – Glassmorphism, Dark/Light-Mode (gespeichert + System-
  Präferenz), Ambient-Orbs, Scroll-Reveal und Animationen
  (`float`, `pulse`, `fadeInUp`, `scaleIn`, `shake`).
- **Formular-Regelwerk** – kleine, deklarative Validierungs-Engine
  (`assets/js/validation.js`). Regeln werden direkt am Input deklariert:
  ```html
  <input data-rules="required|email|min:8|match:password">
  ```
  Verfügbar: `required`, `email`, `min:n`, `max:n`, `alphanum`, `strongpw`,
  `match:feld`, `checked` — inkl. Live-Feedback + Passwortstärke-Anzeige.
- **Demo-Login-System** – Registrierung & Login (`assets/js/auth.js`),
  Session und Accounts in `localStorage`. Die Nav/Buttons reagieren auf den
  Login-Status (`data-when-auth` / `data-when-guest`).

## Struktur

```
index.html          Homepage (Hero, Features, Panel, Preise, Kontakt, Footer)
login.html          Login / Registrierung / Account-Ansicht
assets/
  css/style.css     Design-System
  js/validation.js  Formular-Regelwerk
  js/auth.js        Demo-Auth (localStorage)
  js/main.js        Theme, Nav, Reveal, Account-State, Kontaktformular
  icons/sprite.svg  Custom SVG-Icon-Set
```

## Lokal starten

SVG-Sprites via `<use href="…">` brauchen HTTP (nicht `file://`):

```bash
cd lumoweb-site
python3 -m http.server 8080
# -> http://localhost:8080
```

## Sicherheitshinweis

Das Login ist eine **Demo** (Frontend-only). Accounts/Passwörter liegen im
`localStorage` und sind nur leicht obfuskiert — **keine echte Authentifizierung**.
Für den Produktivbetrieb an ein Backend anbinden (z.B. PHP-Sessions / API).
