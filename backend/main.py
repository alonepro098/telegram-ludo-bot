import os
import json
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Dict, List, Optional
import asyncio

# Import bot and game manager
from game_manager import GameManager, Room, Player, LudoGame
import bot

# Initialize app
app = FastAPI(title="Ludo Telegram Mini App Backend")

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory room manager
game_manager = GameManager()

# Store active websockets: room_id -> { user_id -> WebSocket }
active_connections: Dict[str, Dict[int, WebSocket]] = {}

# Initialize bot handlers and run polling
bot.init_bot_handlers(game_manager)
bot.run_bot_polling()

# Pydantic models for REST endpoints
class StandingItem(BaseModel):
    user_id: int
    name: str
    username: Optional[str] = ""
    color: str

class ShareResultsRequest(BaseModel):
    chat_id: str
    room_id: str
    image_base64: Optional[str] = None
    standings: List[StandingItem]

@app.post("/api/share-results")
async def share_results(request: ShareResultsRequest):
    """API endpoint to receive canvas-generated screenshot and send to group chat."""
    print(f"[API] Received results for room {request.room_id}, sending to chat {request.chat_id}")
    
    # Process base64 image if present
    img_bytes = None
    if request.image_base64:
        try:
            # Handle data URI prefix
            b64_str = request.image_base64
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]
            img_bytes = base64.b64decode(b64_str)
        except Exception as e:
            print(f"[API] Failed to decode base64 image: {e}")

    # Convert Pydantic items to dicts
    standings_list = [item.dict() for item in request.standings]

    # Use bot to send photo/message
    # Run in thread pool to prevent blocking FastAPI event loop
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None, 
        bot.send_game_results, 
        request.chat_id, 
        standings_list, 
        img_bytes
    )
    
    return {"status": "success"}

@app.get("/api/room/{room_id}")
async def get_room_details(room_id: str):
    """Check room status and see if players can join."""
    room = game_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    return room.to_dict()

@app.post("/api/room/create")
async def create_room_endpoint(chat_id: Optional[str] = None):
    """API endpoint to create a new game room."""
    room = game_manager.create_room(chat_id=chat_id)
    return {"room_id": room.room_id}

# Broadcast helper functions
async def broadcast_to_room(room_id: str, message: dict):
    if room_id not in active_connections:
        return
    
    # Build list of ws to send to, to avoid dictionary modification during iteration
    ws_list = list(active_connections[room_id].values())
    dead_connections = []

    for ws in ws_list:
        try:
            await ws.send_json(message)
        except Exception:
            dead_connections.append(ws)

    # Clean up dead sockets
    for dead_ws in dead_connections:
        # Find user_id for this socket
        for u_id, ws_inst in list(active_connections[room_id].items()):
            if ws_inst == dead_ws:
                del active_connections[room_id][u_id]
                break

async def auto_turn_handler(room_id: str, color: str):
    """Automatically roll or move if player is disconnected or takes too long."""
    # Give a short delay to simulate natural play
    await asyncio.sleep(2)
    
    room = game_manager.get_room(room_id)
    if not room or not room.started or room.game.current_player_color != color:
        return
        
    game = room.game
    if not game.dice_rolled:
        # AI rolls the dice
        val = game.roll_dice()
        print(f"[AI Autopilot] Room {room_id} ({color}) rolled a {val}")
        
        valid_moves = game.get_valid_moves(color)
        await broadcast_to_room(room_id, {
            "type": "game_update",
            "event": "dice_rolled",
            "player": color,
            "roll": val,
            "valid_moves": valid_moves,
            "game_state": room.to_dict()["game"]
        })
        
        # If no valid moves, turn is passed automatically
        if not valid_moves:
            await asyncio.sleep(1.5)
            game.pass_turn()
            next_p = game.current_player_color
            await broadcast_to_room(room_id, {
                "type": "game_update",
                "event": "turn_passed",
                "next_player": next_p,
                "game_state": room.to_dict()["game"]
            })
            # Trigger bot for next player if they are disconnected / bot
            await check_and_trigger_autopilot(room_id)
        else:
            # Let the autopilot select a pawn to move
            await asyncio.sleep(1.5)
            await perform_ai_pawn_move(room_id, color, valid_moves)
    else:
        # Dice already rolled, pick a pawn
        valid_moves = game.get_valid_moves(color)
        if valid_moves:
            await perform_ai_pawn_move(room_id, color, valid_moves)

async def perform_ai_pawn_move(room_id: str, color: str, valid_moves: List[int]):
    room = game_manager.get_room(room_id)
    if not room or not room.started:
        return
        
    game = room.game
    # Simple AI rule:
    # 1. Capture if possible
    # 2. Go home if possible
    # 3. Release from base if possible
    # 4. Otherwise, pick the pawn furthest along
    chosen_idx = valid_moves[0]
    best_score = -100
    
    for idx in valid_moves:
        pawn_steps = game.pawns[color][idx]
        score = pawn_steps  # base score is progress
        
        # Release from base
        if pawn_steps == 0:
            score += 50
            
        new_steps = pawn_steps + game.dice_value
        
        # Reaching home
        if new_steps == 57:
            score += 100
            
        # Check captures
        if 1 <= new_steps <= 51:
            target_cell = game.get_track_cell(color, new_steps)
            if target_cell not in SAFE_CELLS:
                for opp_col, opp_p in game.pawns.items():
                    if opp_col == color:
                        continue
                    for os in opp_p:
                        if 1 <= os <= 51 and game.get_track_cell(opp_col, os) == target_cell:
                            score += 200 # Heavy priority on capturing!
                            
        if score > best_score:
            best_score = score
            chosen_idx = idx
            
    res = game.move_pawn(color, chosen_idx)
    if res["success"]:
        print(f"[AI Autopilot] Room {room_id} ({color}) moved pawn {chosen_idx} to {res['new_steps']}")
        await broadcast_to_room(room_id, {
            "type": "game_update",
            "event": "pawn_moved",
            "player": color,
            "pawn_idx": chosen_idx,
            "old_steps": res["old_steps"],
            "new_steps": res["new_steps"],
            "roll": res["roll"],
            "captured": res["captured"],
            "another_turn": res["another_turn"],
            "pawn_finished": res["pawn_finished"],
            "next_player": res["next_player"],
            "game_state": room.to_dict()["game"]
        })
        
        # Check if game is over
        if game.is_game_over():
            await broadcast_to_room(room_id, {
                "type": "game_over",
                "standings": [
                    room.get_player_by_color(c).to_dict() if room.get_player_by_color(c) else {"name": f"AI ({c})", "color": c}
                    for c in game.standings
                ]
            })
        else:
            await check_and_trigger_autopilot(room_id)

async def check_and_trigger_autopilot(room_id: str):
    room = game_manager.get_room(room_id)
    if not room or not room.started:
        return
        
    current_color = room.game.current_player_color
    if not current_color:
        return
        
    player = room.get_player_by_color(current_color)
    # Trigger autopilot if:
    # 1. Player is marked inactive (disconnected from websocket)
    # 2. No real player is assigned to this color (e.g. less than 4 players, unfilled colors)
    if not player or not player.active:
        asyncio.create_task(auto_turn_handler(room_id, current_color))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    room_id = None
    user_id = None
    player_color = None
    
    try:
        while True:
            # Read JSON messages
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "join_lobby":
                room_id = data.get("room_id")
                user_id = int(data.get("user_id"))
                name = data.get("name")
                username = data.get("username")
                
                room = game_manager.get_room(room_id)
                if not room:
                    await websocket.send_json({"type": "error", "message": "Room not found"})
                    continue
                    
                if room.started:
                    # Reconnecting to an active game
                    player = room.players.get(user_id)
                    if not player:
                        await websocket.send_json({"type": "error", "message": "Game already started, cannot join"})
                        continue
                    player.active = True
                    player_color = player.color
                else:
                    # Joining a waiting lobby
                    if len(room.players) >= 4:
                        await websocket.send_json({"type": "error", "message": "Lobby is full"})
                        continue
                    
                    player = room.add_player(user_id, username, name)
                    player_color = player.color
                
                # Add to websocket connections map
                if room_id not in active_connections:
                    active_connections[room_id] = {}
                active_connections[room_id][user_id] = websocket
                
                # Send lobby update to everyone in room
                await broadcast_to_room(room_id, {
                    "type": "lobby_update",
                    "room_state": room.to_dict()
                })
                
                # If game was already started, sync the board state with the reconnecting player
                if room.started:
                    await websocket.send_json({
                        "type": "game_start",
                        "game_state": room.to_dict()["game"]
                    })
                    # Trigger autopilot check in case it's their turn
                    await check_and_trigger_autopilot(room_id)

            elif msg_type == "start_game":
                room = game_manager.get_room(room_id)
                if room and not room.started:
                    # Assign colors
                    room.assign_colors()
                    
                    # Start Ludo game engine
                    active_colors = [p.color for p in room.players.values() if p.color]
                    room.game.start_game(active_colors)
                    room.started = True
                    
                    print(f"[Game] Starting game in room {room_id} with colors {active_colors}")
                    
                    # Broadcast game start
                    await broadcast_to_room(room_id, {
                        "type": "game_start",
                        "game_state": room.to_dict()["game"]
                    })
                    
                    # Check if the starting turn belongs to a disconnected player or bot
                    await check_and_trigger_autopilot(room_id)

            elif msg_type == "roll_dice":
                room = game_manager.get_room(room_id)
                if room and room.started:
                    game = room.game
                    if game.current_player_color == player_color and not game.dice_rolled:
                        val = game.roll_dice()
                        valid_moves = game.get_valid_moves(player_color)
                        
                        await broadcast_to_room(room_id, {
                            "type": "game_update",
                            "event": "dice_rolled",
                            "player": player_color,
                            "roll": val,
                            "valid_moves": valid_moves,
                            "game_state": room.to_dict()["game"]
                        })
                        
                        # Auto pass turn if no moves are valid
                        if not valid_moves:
                            await asyncio.sleep(1.5)
                            game.pass_turn()
                            next_p = game.current_player_color
                            await broadcast_to_room(room_id, {
                                "type": "game_update",
                                "event": "turn_passed",
                                "next_player": next_p,
                                "game_state": room.to_dict()["game"]
                            })
                            # Trigger bot autopilot if next player is bot/offline
                            await check_and_trigger_autopilot(room_id)

            elif msg_type == "move_pawn":
                pawn_idx = int(data.get("pawn_idx"))
                room = game_manager.get_room(room_id)
                if room and room.started:
                    game = room.game
                    if game.current_player_color == player_color and game.dice_rolled:
                        res = game.move_pawn(player_color, pawn_idx)
                        if res["success"]:
                            await broadcast_to_room(room_id, {
                                "type": "game_update",
                                "event": "pawn_moved",
                                "player": player_color,
                                "pawn_idx": pawn_idx,
                                "old_steps": res["old_steps"],
                                "new_steps": res["new_steps"],
                                "roll": res["roll"],
                                "captured": res["captured"],
                                "another_turn": res["another_turn"],
                                "pawn_finished": res["pawn_finished"],
                                "next_player": res["next_player"],
                                "game_state": room.to_dict()["game"]
                            })
                            
                            # Check if game is over
                            if game.is_game_over():
                                standings_data = []
                                for c in game.standings:
                                    player_obj = room.get_player_by_color(c)
                                    if player_obj:
                                        standings_data.append(player_obj.to_dict())
                                    else:
                                        standings_data.append({"name": f"AI ({c})", "color": c})
                                        
                                await broadcast_to_room(room_id, {
                                    "type": "game_over",
                                    "standings": standings_data
                                })
                            else:
                                # Trigger bot autopilot if next turn belongs to bot/offline player
                                await check_and_trigger_autopilot(room_id)

    except WebSocketDisconnect:
        print(f"[WebSocket] User {user_id} disconnected from room {room_id}")
        if room_id and user_id:
            room = game_manager.get_room(room_id)
            if room:
                room.remove_player(user_id)
                if room_id in active_connections and user_id in active_connections[room_id]:
                    del active_connections[room_id][user_id]
                
                # Check if room is completely empty
                active_sockets = len(active_connections.get(room_id, {}))
                if active_sockets == 0 and not room.started:
                    # Clean up inactive lobbies
                    game_manager.delete_room(room_id)
                    if room_id in active_connections:
                        del active_connections[room_id]
                    print(f"[Room] Cleaned up empty room {room_id}")
                else:
                    # Broadcast member left to room
                    await broadcast_to_room(room_id, {
                        "type": "lobby_update",
                        "room_state": room.to_dict()
                    })
                    
                    # If game is running, check if they were current player and trigger autopilot
                    if room.started:
                        await check_and_trigger_autopilot(room_id)

# Get current file dir paths
current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.join(os.path.dirname(current_dir), "frontend")

# Create frontend dir if it doesn't exist
os.makedirs(frontend_dir, exist_ok=True)

# Mount static files to serve the WebApp
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
