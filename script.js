        let chatWS = null;
        const AUTH = "http://127.0.0.1:3001";
        const GAME = "http://127.0.0.1:3000";
        let sessionId = null;
        let accountId = null;
        let selectedCharacter = null;
        let currentInstanceId = null;
        let ws = null;
        /* ------------------------------
           PANELS
        ------------------------------ */
        function showLogin() {
            loginPanel.style.display = "block";
            registerPanel.style.display = "none";
            characterPanel.style.display = "none";
            instancePanel.style.display = "none";
            gamePanel.style.display = "none";
        }
        function showRegister() {
            loginPanel.style.display = "none";
            registerPanel.style.display = "block";
            characterPanel.style.display = "none";
            instancePanel.style.display = "none";
            gamePanel.style.display = "none";
        }
        function showCharacters() {
            loginPanel.style.display = "none";
            registerPanel.style.display = "none";
            characterPanel.style.display = "block";
            instancePanel.style.display = "none";
            gamePanel.style.display = "none";
        }
        function showInstances() {
            loginPanel.style.display = "none";
            registerPanel.style.display = "none";
            characterPanel.style.display = "none";
            instancePanel.style.display = "block";
            gamePanel.style.display = "none";
        }
        function showGame() {
            loginPanel.style.display = "none";
            registerPanel.style.display = "none";
            characterPanel.style.display = "none";
            instancePanel.style.display = "none";
            gamePanel.style.display = "block";
        }
        /* ------------------------------
           LOGOUT
        ------------------------------ */
        function logout() {
            sessionId = null;
            accountId = null;
            selectedCharacter = null;
            currentInstanceId = null;
            if (ws) {
                ws.close();
                ws = null;
            }
            if (chatWS) {
                chatWS.close();
                chatWS = null;
            }
            showLogin();
        }
        /* ------------------------------
           REGISTER
        ------------------------------ */
        async function register() {
            const username = regUser.value.trim();
            const password = regPass.value.trim();

            const res = await fetch(`${AUTH}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) {
                alert("Erreur : " + await res.text());
                return;
            }

            alert("Compte créé !");
            showLogin();
        }
        /* ------------------------------
           LOGIN
        ------------------------------ */
        async function login() {
            const username = loginUser.value.trim();
            const password = loginPass.value.trim();
            const res = await fetch(`${AUTH}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            if (!res.ok) {
                alert("Identifiants invalides");
                return;
            }
            const data = await res.json();
            sessionId = data.session_id;
            const check = await fetch(`${AUTH}/validate_session`, {
                headers: { Authorization: "Session " + sessionId }
            });
            const info = await check.json();
            accountId = info.account_id;
            connectWebSocket();
            loadCharacters();
        }
        /* ------------------------------
           WEBSOCKET INSTANCES
        ------------------------------ */
        function connectWebSocket() {
            if (ws) ws.close();
            ws = new WebSocket("ws://127.0.0.1:3000/ws/instances");
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (!data.instances) return;

                    if (currentInstanceId !== null) {
                        const stillExists = data.instances.some(
                            inst => inst.instance_id === currentInstanceId
                        );
                        if (!stillExists) {
                            currentInstanceId = null;
                            alert("L'instance a été vidée par l'administrateur. Retour au choix des instances.");
                            if (selectedCharacter) loadInstances();
                            else loadCharacters();
                        }
                    }
                } catch (e) {
                    console.error("Erreur WS:", e);
                }
            };
        }
        /* ------------------------------
           LOAD CHARACTERS
        ------------------------------ */
        async function loadCharacters() {
            showCharacters();
            const res = await fetch(`${GAME}/characters_list`, {
                headers: { Authorization: "Session " + sessionId }
            });
            const data = await res.json();
            const div = document.getElementById("charList");
            div.innerHTML = "";
            if (!data.characters.length) {
                div.textContent = "Aucun personnage.";
                return;
            }
            data.characters.forEach(c => {
                const btn = document.createElement("button");
                btn.textContent = `${c.name} (Lvl ${c.level}) – ${c.class}`;
                btn.onclick = () => selectCharacter(c);
                div.appendChild(btn);
            });
        }
        /* ------------------------------
           CHARACTER PREVIEW
        ------------------------------ */
        function updatePreview() {
            const color = charColor.value;
            const name = charName.value.trim() || "(vide)";
            const charClass = charClassSelect.value;
            document.documentElement.style.setProperty("--char-color", color);
            const sprite = document.getElementById("charSprite");
            sprite.classList.remove("class-guerrier", "class-mage", "class-archer", "class-necromancien");
            if (charClass === "Guerrier") sprite.classList.add("class-guerrier");
            else if (charClass === "Mage") sprite.classList.add("class-mage");
            else if (charClass === "Archer") sprite.classList.add("class-archer");
            else if (charClass === "Nécromancien") sprite.classList.add("class-necromancien");
            document.getElementById("previewName").textContent = "Nom : " + name;
            document.getElementById("previewClass").textContent = "Classe : " + charClass;
            document.getElementById("previewColor").textContent = "Couleur : " + color;
        }
        function openChatWebSocket(instanceId) {
            if (chatWS) chatWS.close();
            chatWS = new WebSocket(`ws://127.0.0.1:3000/ws/chat/${instanceId}`);
            const chatBox = document.getElementById("chatBox");
            chatBox.innerHTML = "";
            chatWS.onmessage = (event) => {
                const div = document.createElement("div");
                div.textContent = event.data;
                chatBox.appendChild(div);
                chatBox.scrollTop = chatBox.scrollHeight;
            };
        }
        function sendChatMessage() {
            const input = document.getElementById("chatInput");
            const msg = input.value.trim();
            if (!msg || !chatWS) return;
            chatWS.send(msg);
            input.value = "";
        }
        /* ------------------------------
           CREATE CHARACTER
        ------------------------------ */
        async function createCharacter() {
            const name = charName.value.trim();
            const charClass = charClassSelect.value;
            const color = charColor.value;
            if (!name) {
                alert("Nom obligatoire.");
                return;
            }
            const payload = {
                name,
                char_class: charClass,
                appearance: { color }
            };
            const res = await fetch(`${GAME}/characters`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Session " + sessionId
                },
                body: JSON.stringify(payload)
            });
            const txt = await res.text();
            if (!res.ok) {
                alert("Erreur création personnage : " + txt);
                return;
            }
            charName.value = "";
            updatePreview();
            loadCharacters();
        }
        function returnToCharacterSelect() {
            // Fermer le WebSocket du chat si ouvert
            if (chatWS) {
                chatWS.close();
                chatWS = null;
            }
            // Masquer le panneau de jeu
            document.getElementById("gamePanel").style.display = "none";
            // Réafficher le panneau de sélection des personnages
            document.getElementById("characterPanel").style.display = "block";
            // Recharger la liste des personnages
            loadCharacters();
        }
        /* ------------------------------
           SELECT CHARACTER → INSTANCE SELECTOR
        ------------------------------ */
        function selectCharacter(character) {
            selectedCharacter = character;
            loadInstances();
        }
        /* ------------------------------
           LOAD INSTANCES
        ------------------------------ */
        async function loadInstances() {
            showInstances();
            const res = await fetch(`${GAME}/instances_list`);
            const data = await res.json();
            const div = document.getElementById("instanceList");
            div.innerHTML = "";
            if (!data.instances.length) {
                div.textContent = "Aucune instance disponible.";
                return;
            }
            data.instances.forEach(inst => {
                const box = document.createElement("div");
                box.className = "instanceBox";
                box.innerHTML = `
            <strong>Instance ${inst.instance_id}</strong><br>
            Joueurs : ${inst.players}<br>
            <button onclick="joinInstance(${inst.instance_id})">Rejoindre</button>
        `;
                div.appendChild(box);
            });
            if (chatWS) {
                chatWS.close();
                chatWS = null;
            }
        }
        /* ------------------------------
           JOIN INSTANCE → GAME + HUD
        ------------------------------ */
        async function joinInstance(id) {
            const res = await fetch(`${GAME}/join_instance`, {
                method: "POST",
                headers: { Authorization: "Session " + sessionId }
            });
            if (!res.ok) {
                alert("Impossible de rejoindre l'instance : " + await res.text());
                return;
            }
            currentInstanceId = id;
            showGame();
            // HUD : stats dérivées simples
            const lvl = selectedCharacter.level;
            const cls = selectedCharacter.class;
            const color = selectedCharacter.appearance.color;
            let hp = 100 + lvl * 10;
            let mana = 50 + (cls === "Mage" || cls === "Nécromancien" ? lvl * 10 : lvl * 5);
            let str = 10, agi = 10, intel = 10;
            if (cls === "Guerrier") { str += 10; hp += 20; }
            if (cls === "Archer") { agi += 10; }
            if (cls === "Mage") { intel += 10; mana += 20; }
            if (cls === "Nécromancien") { intel += 8; mana += 15; hp -= 10; }
            gameInfo.textContent =
                `Vous jouez ${selectedCharacter.name} (Classe : ${cls}, Couleur : ${color})`;
            document.getElementById("hudName").textContent = selectedCharacter.name;
            document.getElementById("hudClass").textContent = cls;
            document.getElementById("hudLevel").textContent = lvl;
            document.getElementById("hudHp").textContent = hp;
            document.getElementById("hudMana").textContent = mana;
            document.getElementById("hudStr").textContent = str;
            document.getElementById("hudAgi").textContent = agi;
            document.getElementById("hudInt").textContent = intel;
            openChatWebSocket(id);
        }
        showLogin();
        updatePreview();