# Gym Electron (Production-ready)

## Install
```bash
npm install
```

## Setup DB
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Run (dev)
```bash
npm run dev
```

## Build Installer (Windows)
```bash
npm run build
```

Installer output:
- `release/`

## Notes
- ضع الخطوط العربية (Cairo/Tajawal) داخل: `packages/renderer/public/fonts`
- ضع الأيقونة: `assets/icon.ico`
- شاشة Splash: `packages/renderer/public/splash/splash.html`