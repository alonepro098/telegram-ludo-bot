import os
import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from typing import List, Dict, Optional

# Load Bot Token and WebApp URL from environment or use placeholders for demo
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "http://localhost:8000")

# If token is present, initialize the bot
bot = None
if BOT_TOKEN:
    try:
        # Use TeleBot (synchronous for simplicity, can be run in executor thread or async)
        bot = telebot.TeleBot(BOT_TOKEN, parse_mode="MARKDOWN")
        print(f"[Bot] Initialized successfully. WebApp URL: {WEBAPP_URL}")
    except Exception as e:
        print(f"[Bot] Initialization failed: {e}")
else:
    print("[Bot] WARNING: TELEGRAM_BOT_TOKEN environment variable not set. Running in Web-only mode.")

def get_bot_username() -> str:
    if bot:
        try:
            return bot.get_me().username
        except Exception:
            pass
    return "ludo_game_bot"

def init_bot_handlers(game_manager):
    if not bot:
        return

    @bot.message_handler(commands=["start", "help"])
    def send_welcome(message):
        chat_type = message.chat.type
        user_name = message.from_user.first_name

        if chat_type in ["group", "supergroup"]:
            # If in group, prompt to start ludo in group
            welcome_text = (
                f"🎲 *Hello {user_name}!* Ready to play Ludo with your group?\n\n"
                f"Send `/ludo` to start a match here!"
            )
            bot.reply_to(message, welcome_text)
        else:
            # Private chat welcome
            welcome_text = (
                f"🎲 *Welcome to Ludo Game Bot, {user_name}!*\n\n"
                f"You can play Ludo directly inside Telegram!\n\n"
                f"👉 *How to play with friends:*\n"
                f"1. Add me to your Telegram Group.\n"
                f"2. Send `/ludo` in the group chat.\n"
                f"3. Everyone can tap the join button to enter the same lobby!\n\n"
                f"Or play offline right now by tapping the button below!"
            )
            markup = InlineKeyboardMarkup()
            markup.add(
                InlineKeyboardButton(
                    text="🎮 Play Ludo (Solo / Local)",
                    web_app=WebAppInfo(url=f"{WEBAPP_URL}/")
                )
            )
            bot.send_message(message.chat.id, welcome_text, reply_markup=markup)

    @bot.message_handler(commands=["ludo"])
    def start_ludo_game(message):
        chat_id = str(message.chat.id)
        chat_type = message.chat.type

        # Create a new room synced to this group chat
        room = game_manager.create_room(chat_id=chat_id)
        room_id = room.room_id

        # Telegram deep link format to invite others:
        # https://t.me/botusername/appname?startapp=ROOM_CODE
        # For inline button, we directly link to the webapp URL with query parameters
        game_url = f"{WEBAPP_URL}/?room={room_id}&chat_id={chat_id}"
        
        # Build invite message
        text = (
            f"🎲 *Ludo Match Created!* 🎲\n\n"
            f"Room Code: `{room_id}`\n"
            f"Tap *Join Game* below to enter the lobby. Up to 4 players can join!"
        )

        markup = InlineKeyboardMarkup()
        markup.add(
            InlineKeyboardButton(
                text="🎮 Join Game",
                web_app=WebAppInfo(url=game_url)
            )
        )

        bot.send_message(message.chat.id, text, reply_markup=markup)

def send_game_results(chat_id: str, standings: List[Dict], img_bytes: Optional[bytes] = None):
    """Sends the standings list and the canvas certificate image back to the group."""
    if not bot:
        print("[Bot] Cannot send game results: Bot is not initialized.")
        return

    # Build standings text
    text = "🏆 *Ludo Game Results!* 🏆\n\n"
    medals = ["🥇 1st Place", "🥈 2nd Place", "🥉 3rd Place", "🎖️ 4th Place"]
    
    for idx, player in enumerate(standings):
        medal = medals[idx] if idx < len(medals) else "🎖️ Finished"
        color_emoji = "🔴" if player["color"] == "Red" else \
                      "🟢" if player["color"] == "Green" else \
                      "🟡" if player["color"] == "Yellow" else "🔵"
        
        name = player["name"]
        username_str = f" (@{player['username']})" if player["username"] else ""
        text += f"{medal}: {color_emoji} *{name}*{username_str}\n"

    text += "\nThank you for playing! Roll the dice again with `/ludo`!"

    try:
        if img_bytes:
            # Send photo with standings caption
            bot.send_photo(
                chat_id=chat_id,
                photo=img_bytes,
                caption=text,
                parse_mode="MARKDOWN"
            )
            print(f"[Bot] Successfully sent result image to chat {chat_id}")
        else:
            # Send text only
            bot.send_message(chat_id=chat_id, text=text)
            print(f"[Bot] Successfully sent result text to chat {chat_id}")
    except Exception as e:
        print(f"[Bot] Failed to send game results to chat {chat_id}: {e}")

def run_bot_polling():
    if bot:
        import threading
        def poll():
            print("[Bot] Starting polling thread...")
            bot.infinity_polling()
        
        t = threading.Thread(target=poll, daemon=True)
        t.start()
