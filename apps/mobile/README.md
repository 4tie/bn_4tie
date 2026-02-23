# Mobile (Phase 2)

This Expo app is a minimal real-API client for paper trade lifecycle checks.

## Run
```bash
cd apps/mobile
npm install
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 npm run start
```

No mock data is used. The app calls:
- `GET /api/trades?status=open`
- `GET /api/trades?status=closed`
- `POST /api/orders` (buy market)
- `POST /api/trades/{id}/close` (sell/close)
