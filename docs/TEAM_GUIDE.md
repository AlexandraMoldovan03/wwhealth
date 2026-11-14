# Team guide — UniHack

## Who does what

| | Developer 1 — AI | Developer 2 — Mobile | Developer 3 — Backend |
|---|---|---|---|
| Owns | `ai/` | `app/`, `frontend/`, `assets/`, `app.json`, `package.json` | `backend/` |
| Builds | DenseNet121 training, Grad-CAM, evaluation, `predict_xray()` | screens, navigation, UI, Auth0 login in app, QR display/scan, API mode | FastAPI, PostgreSQL, Auth0 validation, Gemini, secure QR tokens, ElevenLabs, model integration |
| Hands off | `predict_xray()` contract + weights file | — | endpoints from `docs/API_CONTRACT.md` |

Shared (change only via PR + tell the team): `docs/`, `README.md`, `.gitignore`.

## Start your part

**Mobile** (repo root):
```bash
npm install
cp .env.example .env        # EXPO_PUBLIC_USE_MOCKS=true works without backend
npm start                   # scan the QR with Expo Go
npm run check               # TypeScript + ESLint before pushing
```

**Backend**:
```bash
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000     # http://localhost:8000/docs
pytest
```

**AI**:
```bash
python3.12 -m venv ai/.venv && source ai/.venv/bin/activate
pip install -r ai/requirements.txt
python -c "from ai.inference.predict import predict_xray; print(predict_xray(b''))"   # run from repo root
```

**Integrated test:** backend running with `--host 0.0.0.0`; mobile `.env`:
`EXPO_PUBLIC_USE_MOCKS=false`, `EXPO_PUBLIC_API_BASE_URL=http://<backend laptop LAN IP>:8000`, then `npx expo start --clear`.
All devices on the same Wi-Fi (or the backend dev runs `ngrok http 8000` and you use that URL).

## Git workflow

- `main` is always runnable. **Never push directly to `main`**, never force-push it.
- Branch per task: `ai/gradcam`, `mobile/qr-scanner`, `backend/auth0` (`<area>/<short-name>`).
- Small PRs (< ~400 lines), merged several times a day. 1 approval from a teammate, or self-merge if it only touches your folder and checks pass.
- Before opening a PR: `git pull origin main` (merge or rebase **your own unpushed** branch), run your checks:
  mobile `npm run check`, backend `pytest`.
- Commit messages: `mobile: add QR scanner screen`, `backend: gemini extraction`, `ai: gradcam overlay`.

## Avoiding conflicts

1. **Stay in your folder.** The folder split means AI, mobile and backend almost never touch the same files.
2. **Contract changes = their own small PR** touching `docs/API_CONTRACT.md` + types/schemas, announced in the team chat.
3. `package.json` / `package-lock.json`: only Mobile adds JS deps, always with `npx expo install <pkg>` (Expo Go compatible only).
4. `requirements.txt`: only the owner of that folder edits it.
5. Never commit `.env`, venvs, datasets or model weights (already gitignored). Share weights via Drive/Hugging Face.
6. Pull `main` at least every couple of hours. If a conflict is in someone else's folder, ask them — don't guess.

## Rule of thumb for "who decides"

Response shape → Backend proposes, Mobile approves. Model labels/output → AI decides, documented in `ai/config.py`.
UI/UX → Mobile. Anything security-related (tokens, scopes, secrets) → Backend.
