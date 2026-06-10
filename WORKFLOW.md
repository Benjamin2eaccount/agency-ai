# Branch Workflow — Agency AI

## Branches

| Branch     | Eigenaar  | Doel                                        |
|------------|-----------|---------------------------------------------|
| `main`     | —         | Live op Railway — nooit direct pushen       |
| `frontend` | Jayden    | Alleen visuals: CSS, HTML, kleuren, layout  |
| `backend`  | Benjamin  | Alleen logica: routes, database, agents     |

---

## Wat hoort waar?

### `frontend` — Jayden (visuals only)
- `public/style.css`
- `public/landing.html`
- `public/portal.html`
- `public/index.html`
- `public/login.html`
- `public/register.html`
- `public/superadmin.html`
- `public/demo.html`
- `public/pages/` — alleen HTML/CSS wijzigingen
- `electron/launcher/index.html`
- `public/images/`

### `backend` — Benjamin (logic only)
- `server.js`
- `database.js`
- `lib/`
- `routes/`
- `migrations/`
- `scripts/`
- `public/pages/` — alleen JS logica wijzigingen
- `public/core.js`

---

## Hoe werken

### Jayden (frontend)
```bash
git checkout frontend
git pull
# maak visual changes in style.css / html files
git add .
git commit -m "visual: [wat je hebt gedaan]"
git push
```

### Benjamin (backend)
```bash
git checkout backend
git pull
# maak logic changes in server.js / routes / lib
git add .
git commit -m "feat: [wat je hebt gedaan]"
git push
```

---

## Mergen naar main (alleen Benjamin)

Via GitHub Actions:

1. Ga naar **Actions** → **Merge branches to main**
2. Klik **Run workflow**
3. Vink aan welke branches je wilt mergen
4. Railway deployt automatisch na merge naar main

---

## Regels

- **Jayden** werkt NOOIT in `server.js`, `database.js`, `lib/`, `routes/`, `migrations/` of `scripts/`
- **Benjamin** werkt NOOIT in `style.css` of `.html` files
- Bij twijfel: even overleggen voor je begint
- Altijd `git pull` voor je begint te werken
- Commit messages: `visual: ...` voor frontend, `feat: ...` / `fix: ...` voor backend
