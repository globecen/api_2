class InstanceManager:
    def __init__(self, max_players_per_instance=10):
        self.max_players = max_players_per_instance
        self.instances = {}  # {instance_id: set(account_ids)}
        self.next_instance_id = 1

        # OPTIONNEL : créer une instance vide au démarrage
        self._create_instance()

    def _create_instance(self):
        instance_id = self.next_instance_id
        self.instances[instance_id] = set()   # ← instance vide créée
        self.next_instance_id += 1
        return instance_id

    def assign_player(self, account_id: int):
        # Cherche une instance non pleine
        for instance_id, players in self.instances.items():
            if len(players) < self.max_players:
                players.add(account_id)
                return instance_id

        # Sinon on crée une nouvelle instance vide
        new_id = self._create_instance()
        self.instances[new_id].add(account_id)
        return new_id

    def remove_player(self, account_id: int):
        for instance_id, players in self.instances.items():
            if account_id in players:
                players.remove(account_id)
                return instance_id
        return None

    def get_status(self):
        # Renvoie TOUTES les instances, même vides
        return [
            {
                "instance_id": instance_id,
                "players": len(players),
                "player_ids": list(players)
            }
            for instance_id, players in self.instances.items()
        ]