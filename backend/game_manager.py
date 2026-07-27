import random
from typing import Dict, List, Optional, Union

# Ludo constants
START_CELLS = {"Red": 1, "Green": 14, "Yellow": 27, "Blue": 40}
SAFE_CELLS = {1, 9, 14, 22, 27, 35, 40, 48}
COLORS = ["Red", "Green", "Yellow", "Blue"]

class Player:
    def __init__(self, user_id: int, username: str, name: str):
        self.user_id = user_id
        self.username = username or ""
        self.name = name or f"Player {user_id}"
        self.color: Optional[str] = None
        self.active: bool = True
        self.is_host: bool = False

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "username": self.username,
            "name": self.name,
            "color": self.color,
            "active": self.active,
            "is_host": self.is_host
        }

class LudoGame:
    def __init__(self):
        # Maps color to list of 4 pawn steps (0 = base, 1 = start cell, 57 = home)
        self.pawns: Dict[str, List[int]] = {
            "Red": [0, 0, 0, 0],
            "Green": [0, 0, 0, 0],
            "Yellow": [0, 0, 0, 0],
            "Blue": [0, 0, 0, 0]
        }
        self.turn_order: List[str] = []
        self.current_turn_idx: int = 0
        self.dice_value: int = 0
        self.dice_rolled: bool = False
        self.consecutive_sixes: int = 0
        self.standings: List[str] = []  # List of player colors in finishing order (1st, 2nd, 3rd, 4th)
        self.has_winner: bool = False
        self.last_activity: float = 0.0

    def start_game(self, active_colors: List[str]):
        self.turn_order = [color for color in COLORS if color in active_colors]
        # Shuffle turn order for fairness
        random.shuffle(self.turn_order)
        self.current_turn_idx = 0
        self.pawns = {color: [0, 0, 0, 0] for color in active_colors}
        self.dice_value = 0
        self.dice_rolled = False
        self.consecutive_sixes = 0
        self.standings = []
        self.has_winner = False

    @property
    def current_player_color(self) -> Optional[str]:
        if not self.turn_order:
            return None
        # Skip finished players
        while self.turn_order[self.current_turn_idx] in self.standings:
            self.current_turn_idx = (self.current_turn_idx + 1) % len(self.turn_order)
        return self.turn_order[self.current_turn_idx]

    def roll_dice(self) -> int:
        if self.dice_rolled:
            return self.dice_value
        self.dice_value = random.randint(1, 6)
        self.dice_rolled = True
        
        if self.dice_value == 6:
            self.consecutive_sixes += 1
            if self.consecutive_sixes == 3:
                # 3 consecutive sixes means turn is forfeited
                self.dice_rolled = False
                self.consecutive_sixes = 0
                self.pass_turn()
        else:
            self.consecutive_sixes = 0
            
        return self.dice_value

    def get_valid_moves(self, color: str) -> List[int]:
        """Returns list of indices (0-3) of pawns that can move based on self.dice_value."""
        if not self.dice_rolled or self.dice_value == 0:
            return []
        
        valid = []
        pawn_positions = self.pawns.get(color, [])
        for idx, steps in enumerate(pawn_positions):
            # Pawn in base (0) needs a 6 to release (steps_moved becomes 1)
            if steps == 0:
                if self.dice_value == 6:
                    valid.append(idx)
            # Pawn finished (57) cannot move
            elif steps == 57:
                continue
            # Pawn on board or home run
            elif steps + self.dice_value <= 57:
                valid.append(idx)
        return valid

    def move_pawn(self, color: str, pawn_idx: int) -> dict:
        """Moves the specified pawn. Returns status info (capture details, turn status, etc.)."""
        if color != self.current_player_color or not self.dice_rolled:
            return {"success": False, "error": "Not your turn or dice not rolled"}
        
        valid_moves = self.get_valid_moves(color)
        if pawn_idx not in valid_moves:
            return {"success": False, "error": "Invalid move for this pawn"}
        
        old_steps = self.pawns[color][pawn_idx]
        new_steps = 0
        
        if old_steps == 0:
            # Releasing from base
            new_steps = 1
        else:
            new_steps = old_steps + self.dice_value
            
        self.pawns[color][pawn_idx] = new_steps
        
        # Check if pawn finished
        pawn_finished = (new_steps == 57)
        if pawn_finished and all(s == 57 for s in self.pawns[color]):
            if color not in self.standings:
                self.standings.append(color)
                self.has_winner = True
        
        # Check captures (only on outer track, i.e., steps 1 to 51)
        captured_color = None
        captured_idx = None
        
        if 1 <= new_steps <= 51:
            target_track_cell = self.get_track_cell(color, new_steps)
            if target_track_cell not in SAFE_CELLS:
                # Look for opponent pawns on the same track cell
                for opp_color, opp_pawns in self.pawns.items():
                    if opp_color == color:
                        continue
                    for idx, opp_steps in enumerate(opp_pawns):
                        if 1 <= opp_steps <= 51:
                            opp_track_cell = self.get_track_cell(opp_color, opp_steps)
                            if opp_track_cell == target_track_cell:
                                # Capture!
                                self.pawns[opp_color][idx] = 0
                                captured_color = opp_color
                                captured_idx = idx
                                break
                    if captured_color:
                        break

        # Post-move turn logic:
        # A player gets another roll if:
        # 1. They rolled a 6 (and it wasn't the third consecutive 6)
        # 2. They captured an opponent pawn
        # 3. A pawn reached home
        another_turn = (self.dice_value == 6 and self.consecutive_sixes < 3) or (captured_color is not None) or pawn_finished
        
        # If the player has completed the game (all 4 pawns home), they cannot get another turn
        if color in self.standings:
            another_turn = False

        rolled_val = self.dice_value
        self.dice_value = 0
        self.dice_rolled = False
        
        if not another_turn:
            self.consecutive_sixes = 0
            self.pass_turn()
            
        return {
            "success": True,
            "moved_pawn": pawn_idx,
            "old_steps": old_steps,
            "new_steps": new_steps,
            "roll": rolled_val,
            "captured": {"color": captured_color, "idx": captured_idx} if captured_color else None,
            "another_turn": another_turn,
            "pawn_finished": pawn_finished,
            "next_player": self.current_player_color
        }

    def get_track_cell(self, color: str, steps: int) -> int:
        """Translates player color + steps_moved (1-51) to 0-51 outer track cell index."""
        start = START_CELLS[color]
        return (start + steps - 1) % 52

    def pass_turn(self):
        if not self.turn_order:
            return
        
        # Check if game is over (all but one player have finished, or all active players finished)
        playable_players = [c for c in self.turn_order if c not in self.standings]
        if len(playable_players) <= 1:
            # Put remaining players in standings in order of their remaining progress
            # Sort remaining players by total steps of their pawns descending
            remaining_sorted = sorted(
                playable_players, 
                key=lambda c: sum(self.pawns[c]), 
                reverse=True
            )
            for c in remaining_sorted:
                if c not in self.standings:
                    self.standings.append(c)
            return

        # Advance turn
        self.current_turn_idx = (self.current_turn_idx + 1) % len(self.turn_order)
        # Skip finished players
        while self.turn_order[self.current_turn_idx] in self.standings:
            self.current_turn_idx = (self.current_turn_idx + 1) % len(self.turn_order)
        
        self.dice_value = 0
        self.dice_rolled = False
        self.consecutive_sixes = 0

    def is_game_over(self) -> bool:
        if not self.turn_order:
            return False
        # Game is over when all players are in standings
        return len(self.standings) >= len(self.turn_order)

class Room:
    def __init__(self, room_id: str, chat_id: Optional[str] = None):
        self.room_id = room_id
        self.chat_id = chat_id
        self.players: Dict[int, Player] = {}  # user_id -> Player
        self.game = LudoGame()
        self.started = False

    def add_player(self, user_id: int, username: str, name: str) -> Player:
        if user_id in self.players:
            self.players[user_id].active = True
            return self.players[user_id]
        
        player = Player(user_id, username, name)
        # If this is the first player, make them host
        if not self.players:
            player.is_host = True
            
        self.players[user_id] = player
        return player

    def remove_player(self, user_id: int):
        if user_id in self.players:
            # In a multiplayer session, we soft-delete / mark inactive
            # so they can reconnect if they lose connection.
            self.players[user_id].active = False

    def assign_colors(self):
        # Standard assignment: Red, Green, Yellow, Blue in order of joining
        available_colors = COLORS.copy()
        for p in self.players.values():
            if available_colors:
                p.color = available_colors.pop(0)

    def get_player_by_color(self, color: str) -> Optional[Player]:
        for p in self.players.values():
            if p.color == color:
                return p
        return None

    def to_dict(self) -> dict:
        return {
            "room_id": self.room_id,
            "chat_id": self.chat_id,
            "players": [p.to_dict() for p in self.players.values()],
            "started": self.started,
            "game": {
                "pawns": self.game.pawns,
                "turn_order": self.game.turn_order,
                "current_player": self.game.current_player_color,
                "dice_value": self.game.dice_value,
                "dice_rolled": self.game.dice_rolled,
                "standings": self.game.standings,
                "is_over": self.game.is_game_over()
            } if self.started else None
        }

class GameManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def create_room(self, chat_id: Optional[str] = None) -> Room:
        # Generate clean 6-digit room token
        while True:
            room_id = "".join(random.choices("0123456789", k=6))
            if room_id not in self.rooms:
                break
        
        room = Room(room_id, chat_id)
        self.rooms[room_id] = room
        return room

    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id)

    def delete_room(self, room_id: str):
        if room_id in self.rooms:
            del self.rooms[room_id]
