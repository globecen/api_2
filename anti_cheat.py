import time
import logging

logger = logging.getLogger("server")


class AntiCheat:
    def __init__(self):
        self.state = {}

        # Limites anti-cheat
        self.min_delay_between_kills = 0.3          # anti macro
        self.max_xp_per_minute = 5000               # anti farm
        self.max_monster_level_delta = 10           # anti exploit

    def _get_state(self, char_id: int):
        """Retourne l'état du personnage ou le crée s'il n'existe pas."""
        if char_id not in self.state:
            self.state[char_id] = {
                "last_kill_time": 0.0,
                "xp_window_start": time.time(),
                "xp_in_window": 0
            }
        return self.state[char_id]

    def check_monster_kill(self, char_id: int, char_level: int, monster_level: int, gained_xp: int) -> bool:
        now = time.time()
        st = self._get_state(char_id)

        # 1) Anti macro : trop rapide
        if now - st["last_kill_time"] < self.min_delay_between_kills:
            logger.warning(f"[ANTI-CHEAT] char {char_id}: kill trop rapide.")
            return False

        # 2) Anti exploit : monstre trop haut niveau
        if monster_level > char_level + self.max_monster_level_delta:
            logger.warning(
                f"[ANTI-CHEAT] char {char_id}: monstre trop haut niveau ({monster_level}) pour niveau perso {char_level}."
            )
            return False

        # 3) Anti farm XP : reset de la fenêtre de 60 sec
        if now - st["xp_window_start"] > 60:
            st["xp_window_start"] = now
            st["xp_in_window"] = 0

        # 4) Anti farm XP : limite par minute
        if st["xp_in_window"] + gained_xp > self.max_xp_per_minute:
            logger.warning(f"[ANTI-CHEAT] char {char_id}: XP par minute dépassé.")
            return False

        # Mise à jour de l'état
        st["last_kill_time"] = now
        st["xp_in_window"] += gained_xp

        return True