# MIJO — Asistente de voz para verificar noticias (app funcional)

Este proyecto parte del prototipo de Figma y ahora es una app **funcional de punta a punta**:

- 🎙️ **Reconocimiento de voz real** (Web Speech API del navegador) — el micrófono transcribe lo que dices de verdad.
- 🔊 **Voz real de MIJO** (síntesis de voz del navegador) al leer sus respuestas.
- 🤖 **Respuestas reales generadas por IA** (Claude, vía la API de Anthropic) en lugar de texto fijo.
- 💬 Chat, historial, adjuntar imagen o link, y minijuegos educativos del prototipo original.

## Estructura

```
/                 → Frontend (React + Vite)
/server           → Backend (Node + Express) que llama a la API de Anthropic
```

El frontend nunca llama directo a Anthropic (para no exponer tu API key en el navegador); habla con tu propio backend local, y este es el que llama a Anthropic.

## 1. Instalación

Necesitas Node.js 18 o superior.

```bash
npm run setup
```

Esto instala las dependencias del frontend y del backend.

## 2. Configura tu API key de Anthropic

```bash
cp server/.env.example server/.env
```

Edita `server/.env` y coloca tu clave real:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Puedes obtener una clave en https://console.anthropic.com/settings/keys

## 3. Ejecutar la app

```bash
npm run dev
```

Esto levanta a la vez:
- el **backend** en `http://localhost:3001`
- el **frontend** en `http://localhost:5173` (Vite te mostrará la URL exacta)

Abre esa URL en **Google Chrome o Edge** (el reconocimiento de voz del navegador no funciona igual en todos los navegadores; Chrome tiene el mejor soporte).

## Notas sobre el reconocimiento y síntesis de voz

- El micrófono pide permiso al navegador la primera vez — acéptalo.
- El reconocimiento de voz funciona en `localhost` sin necesidad de HTTPS. Si despliegas la app en un dominio real, necesitarás HTTPS para que el micrófono funcione.
- La app usa el idioma `es-EC` para el reconocimiento y `es-ES` para la síntesis de voz; si tu navegador no tiene una voz en español instalada, usará la voz por defecto del sistema.

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run setup` | Instala dependencias del frontend y backend |
| `npm run dev` | Corre frontend + backend juntos |
| `npm run dev:client` | Solo el frontend (Vite) |
| `npm run dev:server` | Solo el backend (Express) |
| `npm run build` | Compila el frontend para producción |

## Despliegue

Para producción necesitarás:
1. Desplegar `/server` en algún host de Node (Render, Railway, Fly.io, etc.) con `ANTHROPIC_API_KEY` como variable de entorno.
2. Compilar el frontend (`npm run build`) y desplegarlo (Vercel, Netlify, etc.), apuntando las llamadas a `/api/*` hacia la URL de tu backend desplegado.
3. Servir el frontend sobre HTTPS para que el micrófono funcione fuera de localhost.
