# 🎲 Ludo Royale - Telegram Mini App & Bot

A premium, full-featured Ludo multiplayer game built as a Telegram Mini App. Features real-time room synchronization, offline bot play, custom canvas match results certificate generation, and an 8-bit vintage audio synthesizer.

---

## 🌟 Key Features

*   **🎮 Multiplayer Ludo Room Sync**: Players can join the same room via short codes or direct Telegram links, synchronizing dice rolls, pawn movements, captures, and turn passes in real time.
*   **🤖 AI Autopilot / VS Bot**:
    *   **Offline Mode**: Play locally against three computer-controlled bots.
    *   **Online Autopilot**: If a player disconnects or idles during a live multiplayer match, the server automatically takes their turn using Ludo AI.
*   **🔊 Web Audio Sound Synthesis**: Built-in 8-bit sound effects (rolling dice, pawn move, captures, home chimes, and victory fanfares) synthesized on the fly. Requires **zero audio files** to download, meaning zero latency!
*   **🏆 Shareable Certificate Canvas**: Generates a gorgeous visual standings certificate (1st, 2nd, 3rd, 4th place) on a canvas at the end of the game, which can be shared directly back to the Telegram group.
*   **💎 Premium Dark Glassmorphic Design**: Tailored visual palette with custom typography, glowing player indicators, and 3D dice rolling animations.

---

## 🛠️ Project Structure

```text
├── backend/
│   ├── main.py            # FastAPI Server (REST APIs, static hosting, WebSockets)
│   ├── bot.py             # Telegram Bot Event Handlers (Telegraf / pyTelegramBotAPI)
│   └── game_manager.py    # Ludo Room & Lobby State Manager
└── frontend/
    ├── index.html         # Main Entry Page (Lobby, Game Board, and Game Over views)
    ├── style.css          # Custom Stylesheet, Responsive Grid, and Dice Cube
    └── game.js            # Ludo Game Engine, WS Client, Sound Synth, & Canvas
```

---

## 🚀 Quick Start Guide

### 1. Requirements
Ensure you have Python 3.10+ installed. Install the dependencies:
```bash
python -m pip install fastapi uvicorn websockets pyTelegramBotAPI httpx
```

### 2. Configure Telegram Bot
To run inside Telegram:
1.  Talk to [@BotFather](https://t.me/BotFather) on Telegram and create a new bot to get a **Bot Token**.
2.  Send `/newapp` to register your Mini App link. Set the WebApp URL to your public HTTPS URL (e.g. your ngrok tunnel).
3.  Add the bot to a Telegram group and type `/ludo` to start playing!

### 3. Run Locally
Set your environment variables:
```bash
# Windows PowerShell
$env:TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
$env:WEBAPP_URL="https://YOUR_TUNNEL.ngrok-free.app"
```

Start the FastAPI server:
```bash
cd backend
python -m uvicorn main:app --reload
```
You can now test the app directly in your browser by visiting `http://localhost:8000/`.

---

## 🏆 Standings Certificate Image Sharing Flow

When a game is completed, the frontend uses an HTML5 Canvas to render a custom certificate card showing:
1.  Ludo Royale winner banner.
2.  Names and medals (🥇, 🥈, 🥉, 🎖️) of players.
3.  The client POSTs this image (encoded in Base64) to the backend REST API `/api/share-results`.
4.  The Telegram bot fetches the payload and uploads the image directly back to the group chat where the game started.

---
*Created with 💖 for Telegram gaming.*
