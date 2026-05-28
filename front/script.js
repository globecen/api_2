let chatWS = null;
//const URL_BASE = "85.69.92.4";
const URL_BASE = "127.0.0.1";
const AUTH = "http://" + URL_BASE + ":3001";
const GAME = "http://" + URL_BASE + ":3000";
let isMapLoading = false;
let sessionId = null;
let accountId = null;
let selectedCharacter = null;
let currentInstanceId = null;
let ws = null;
let gameWS = null;
const remotePlayers = {}; // id → { x, y, dom }
let saveTimeout = null;
/* =========================
   MAP
========================= */
const MAPS = {};
const WORLD_WIDTH = 3;   // nombre de maps en X
const WORLD_HEIGHT = 3;  // nombre de maps en Y


const TILE_SIZE = 32;

let currentMapX = 0;
let currentMapY = 0;

const MAP_WIDTH = 25;
const MAP_HEIGHT = 18;


const player = {
    x: null,
    y: null
};

function getNodeKey(x, y) {
    return `${x}_${y}`;
}

function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getNeighbors(x, y, map) {
    const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
    ];

    const res = [];

    for (const d of dirs) {
        const nx = x + d.x;
        const ny = y + d.y;

        if (!map[ny] || map[ny][nx] === 1) continue;

        res.push({ x: nx, y: ny });
    }

    return res;
}
function scheduleSavePosition() {
    clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        savePosition();
    }, 200);
}
function findPath(start, end, map) {
    const open = [];
    const closed = new Set();

    open.push({
        x: start.x,
        y: start.y,
        g: 0,
        f: 0,
        parent: null
    });

    while (open.length > 0) {

        // node avec f le plus bas
        open.sort((a, b) => a.f - b.f);
        const current = open.shift();

        if (current.x === end.x && current.y === end.y) {
            // reconstruction chemin
            const path = [];
            let c = current;

            while (c) {
                path.push({ x: c.x, y: c.y });
                c = c.parent;
            }

            return path.reverse();
        }

        closed.add(getNodeKey(current.x, current.y));

        const neighbors = getNeighbors(current.x, current.y, map);

        for (const n of neighbors) {

            const key = getNodeKey(n.x, n.y);
            if (closed.has(key)) continue;

            const g = current.g + 1;
            const h = heuristic(n, end);
            const f = g + h;

            const existing = open.find(o => o.x === n.x && o.y === n.y);

            if (!existing) {
                open.push({
                    x: n.x,
                    y: n.y,
                    g,
                    f,
                    parent: current
                });
            }
        }
    }

    return [];
}
let path = [];
let moving = false;


async function moveStep() {
    if (!path.length) {
        moving = false;
        return;
    }

    const next = path.shift();
    drawMinimap();
    player.x = next.x;
    player.y = next.y;

    updatePlayer();
    drawMinimap();
    updateMinimapCoords();

    // 🔥 ATTENDRE le changement de carte
    const changed = await checkMapTransition();
    if (changed) return;

    // WebSocket
    if (gameWS && gameWS.readyState === WebSocket.OPEN) {
        gameWS.send(JSON.stringify({
            type: "move",
            x: player.x,
            y: player.y,
            map_x: currentMapX,
            map_y: currentMapY
        }));
    }

    // Animation
    const sprite = document.getElementById("playerSprite");
    if (sprite) {
        sprite.classList.add("walking");
        setTimeout(() => sprite.classList.remove("walking"), 150);
    }

    // Sauvegarde BDD
    scheduleSavePosition();

    setTimeout(moveStep, 60);
}



/* ------------------------------
   DOM
------------------------------ */

const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");
const characterPanel = document.getElementById("characterPanel");
const createCharacterPanel = document.getElementById("createCharacterPanel");
const instancePanel = document.getElementById("instancePanel");
const gamePanel = document.getElementById("gamePanel");

/* ------------------------------
   PANELS
------------------------------ */

function hideAllPanels() {
    loginPanel.style.display = "none";
    registerPanel.style.display = "none";
    characterPanel.style.display = "none";
    createCharacterPanel.style.display = "none";
    instancePanel.style.display = "none";
    gamePanel.style.display = "none";
}

function showLogin() {
    hideAllPanels();
    loginPanel.style.display = "block";
}

function showRegister() {
    hideAllPanels();
    registerPanel.style.display = "block";
}

function showCharacters() {
    hideAllPanels();
    characterPanel.style.display = "block";
}

function showCreateCharacter() {
    hideAllPanels();
    createCharacterPanel.style.display = "block";
    updatePreview();
}

function showInstances() {
    hideAllPanels();
    instancePanel.style.display = "block";
}

function showGame() {
    document.body.classList.add("in-game");
    hideAllPanels();
    gamePanel.style.display = "flex"; // pas block
}

/* ------------------------------
   LOGOUT
------------------------------ */

async function logout() {

    if (chatWS) {
        chatWS.close();
        chatWS = null;
    }

    if (ws) {
        ws.close();
        ws = null;
    }

    await leaveInstance();

    sessionId = null;
    accountId = null;
    selectedCharacter = null;
    currentInstanceId = null;

    player.x = 5;
    player.y = 5;

    localStorage.clear();

    cleanupGameUI();
    showLogin();
}
function clearRemotePlayers() {
    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (rp.dom) rp.dom.remove();
        delete remotePlayers[id];
    }
}


async function loadCharacterPosition(characterId) {
    const res = await fetch(`${GAME}/character/${characterId}`, {
        headers: {
            Authorization: "Session " + sessionId
        }
    });

    if (!res.ok) {
        console.warn("Position BDD introuvable → fallback");
        return { x: 2, y: 2 };
    }

    const c = await res.json();

    console.log("Position BDD:", c.pos_x, c.pos_y);

    return {
        x: c.pos_x ?? 2,
        y: c.pos_y ?? 2
    };
}
function getPlayerStorageKey() {
    if (!selectedCharacter?.id) return null;
    return selectedCharacter.id;
}
function saveSessionState() {
    localStorage.setItem("sessionId", sessionId);
    localStorage.setItem("accountId", accountId);

    if (selectedCharacter)
        localStorage.setItem("selectedCharacter", JSON.stringify(selectedCharacter));

    if (currentInstanceId)
        localStorage.setItem("currentInstanceId", currentInstanceId);
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
        alert(await res.text());
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
    saveSessionState();
}

/* ------------------------------
   CHARACTERS
------------------------------ */

async function loadCharacters() {
    const res = await fetch(`${GAME}/characters_list`, {
        headers: { Authorization: "Session " + sessionId }
    });

    const data = await res.json();

    const div = document.getElementById("charList");
    div.innerHTML = "";

    if (!data.characters.length) {
        showCreateCharacter();
        return;
    }

    showCharacters();

    data.characters.forEach(c => {
        const spriteClass =
            c.class === "Guerrier" ? "class-guerrier" :
                c.class === "Mage" ? "class-mage" :
                    c.class === "Archer" ? "class-archer" :
                        "class-necromancien";

        const color = c.appearance?.color || "#ff0000";

        const card = document.createElement("div");
        card.className = "characterItem";

        card.innerHTML = `
            <div class="characterMiniSprite">
                <div class="charSprite ${spriteClass}" style="--char-color:${color};">
                    <div class="charAura"></div>
                    <div class="charBody"></div>
                    <div class="charHead"></div>
                    <div class="charWeapon"></div>
                    <div class="charStaff"></div>
                    <div class="charBow"></div>
                </div>
            </div>

            <div class="characterText">
                <div class="characterName">${c.name}</div>
                <div class="characterMeta">
                    Classe : ${c.class} • Niveau ${c.level}
                </div>
            </div>
        `;

        card.onclick = () => selectCharacter(c);
        div.appendChild(card);
    });
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
        alert(txt);
        return;
    }

    charName.value = "";
    await loadCharacters();
}

function renderMap() {
    const key = `${currentMapX}_${currentMapY}`;
    const mapData = MAPS[key];

    if (!mapData) {
        console.error("❌ MAP NON CHARGÉE :", key);
        return;
    }

    // --- Correction : accepter les deux formats ---
    const tiles = mapData.tiles || mapData;

    if (!Array.isArray(tiles) || !tiles.length) {
        console.error("❌ MAP SANS TILES :", key, mapData);
        return;
    }

    const world = document.getElementById("gameWorld");
    world.innerHTML = "";

    const TILE_SIZE = 32;

    for (let y = 0; y < tiles.length; y++) {
        for (let x = 0; x < tiles[y].length; x++) {

            const t = tiles[y][x];
            const div = document.createElement("div");
            div.classList.add("tile");

            div.style.left = (x * TILE_SIZE) + "px";
            div.style.top = (y * TILE_SIZE) + "px";

            switch (t) {
                case 0: div.classList.add("ground"); break;
                case 1: div.classList.add("wall"); break;
                case 6: div.classList.add("water"); break;
                case 7: div.classList.add("tree"); break;

                case 2:
                case 3:
                case 4:
                case 5:
                    div.classList.add("ground");
                    div.dataset.pastille = t;
                    break;
            }

            world.appendChild(div);
        }
    }
}



function createPlayer() {

    const world = document.getElementById("gameWorld");
    if (!world) return;

    let old = document.getElementById("player");
    if (old) old.remove();

    const el = document.createElement("div");
    el.id = "player";

    const color =
        selectedCharacter?.appearance?.color || "#ff0000";

    // =========================
    // CLASSE VISUELLE
    // =========================

    let spriteClass = "class-guerrier";

    if (selectedCharacter?.class === "Mage")
        spriteClass = "class-mage";

    else if (selectedCharacter?.class === "Archer")
        spriteClass = "class-archer";

    else if (selectedCharacter?.class === "Nécromancien")
        spriteClass = "class-necromancien";

    // =========================
    // HTML
    // =========================

    el.innerHTML = `
        <div class="playerName">
            ${selectedCharacter?.name || "Player"}
        </div>

        <div id="playerSprite"
             class="charSprite ${spriteClass}"
             style="--char-color:${color};">

            <div class="charAura"></div>

            <div class="charBody"></div>
            <div class="charHead"></div>

            <div class="charWeapon"></div>
            <div class="charStaff"></div>
            <div class="charBow"></div>
        </div>
    `;

    world.appendChild(el);

    updatePlayer();
}


function updateCamera() {

    const world = document.getElementById("gameWorld");
    const container = document.getElementById("mapContainer");

    if (!world || !container) return;

    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;

    const offsetX = centerX - (player.x * TILE_SIZE);
    const offsetY = centerY - (player.y * TILE_SIZE);

    world.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}
function updatePlayer() {
    const el = document.getElementById("player");
    if (!el) return;

    el.style.left = `${player.x * TILE_SIZE}px`;
    el.style.top = `${player.y * TILE_SIZE}px`;

    updateCamera();
}
document.addEventListener("click", e => {

    if (gamePanel.style.display === "none") return;

    const world = document.getElementById("gameWorld");
    if (!world || !world.contains(e.target)) return;

    const rect = world.getBoundingClientRect();

    const target = {
        x: Math.floor((e.clientX - rect.left) / TILE_SIZE),
        y: Math.floor((e.clientY - rect.top) / TILE_SIZE)
    };

    const mapObj = MAPS[`${currentMapX}_${currentMapY}`];
    if (!mapObj) return;

    const map = mapObj.tiles;   // 🔥 la vraie grille 2D

    // 🔥 Vérification des limites
    if (
        target.y < 0 ||
        target.y >= map.length ||
        target.x < 0 ||
        target.x >= map[0].length
    ) {
        return; // clic hors map → on ignore
    }

    // 🔥 Vérification obstacle
    if (map[target.y][target.x] === 1) return;

    const start = { x: player.x, y: player.y };

    path = findPath(start, target, map);

    if (path.length > 0) {
        path.shift();
        moving = true;
        moveStep();
    }
});

/* ------------------------------
   PREVIEW
------------------------------ */


async function loadMapFile(mapX, mapY) {
    const key = `${mapX}_${mapY}`;

    // Déjà chargée → on renvoie l'objet complet
    if (MAPS[key]) {
        console.log(`📦 Map déjà en cache : ${key}`);
        return MAPS[key]; // MAPS[key] = { id, width, height, tiles }
    }

    const url = `/maps/${key}.json`;
    const res = await fetch(url);

    if (!res.ok) {
        console.error(`❌ Impossible de charger ${url} (HTTP ${res.status})`);
        return null;
    }

    const data = await res.json();

    // Stockage de l'objet complet
    MAPS[key] = data;

    return data;
}


async function loadMapChunk() {
    const key = `${currentMapX}_${currentMapY}`;

    const mapData = await loadMapFile(currentMapX, currentMapY);

    if (!mapData) {
        console.warn("⚠ Impossible de charger la map :", currentMapX, currentMapY);
        return false;
    }

    currentMapData = mapData.tiles; // 🔥 obligatoire

    return true;
}






async function preloadAllMaps() {
    const coords = [
        [-1, 2], [0, 2], [1, 2], [2, 2],
        [-1, 1], [0, 1], [1, 1], [2, 1],
        [-1, 0], [0, 0], [1, 0], [2, 0]
    ];

    for (const [mx, my] of coords) {
        await loadMapFile(mx, my);
    }

    console.log("✔ Toutes les maps sont préchargées");
}

async function changeMap(newX, newY, newPlayerX, newPlayerY) {

    if (isMapLoading) return false;
    isMapLoading = true;

    currentMapX = newX;
    currentMapY = newY;

    player.x = newPlayerX;
    player.y = newPlayerY;

    const ok = await loadMapChunk();

    if (!ok || !currentMapData) {
        console.error("❌ Impossible de charger la map", newX, newY);
        isMapLoading = false;
        return false;
    }

    renderMap();
    drawMinimap();
    console.log("renderMap → currentMapData =", currentMapData);
    createPlayer();
    updatePlayer();
    drawMinimap();
    updateMinimapCoords();
    clearRemotePlayers();
    await loadRemotePlayers();
    updateCamera();

    isMapLoading = false;
    return true;
}




function showMapLoading(show) {
    const el = document.getElementById("mapLoading");
    el.style.display = show ? "flex" : "none";
}


async function checkMapTransition() {
    const key = `${currentMapX}_${currentMapY}`;
    const tiles = MAPS[key].tiles || MAPS[key];

    const t = tiles[player.y][player.x];

    switch (t) {
        case 2: // haut
            return await changeMap(
                currentMapX,
                currentMapY + 1,
                player.x,
                tiles.length - 2
            );

        case 3: // bas
            return await changeMap(
                currentMapX,
                currentMapY - 1,
                player.x,
                1
            );

        case 4: // gauche
            return await changeMap(
                currentMapX - 1,
                currentMapY,
                tiles[0].length - 2,
                player.y
            );

        case 5: // droite
            return await changeMap(
                currentMapX + 1,
                currentMapY,
                1,
                player.y
            );
    }

    return false;
}



async function initGame() {
    if (!selectedCharacter || !currentInstanceId) return;

    // 1. Récupérer l'état complet du joueur
    const res = await fetch(`${GAME}/me/state`, {
        method: "GET",
        headers: {
            Authorization: "Session " + sessionId
        }
    });

    if (res.status === 401) {
        showLogoutPopup();
        return;
    }

    const state = await res.json();

    if (!state.in_instance) {
        console.warn("Le joueur n'est pas dans une instance.");
        return;
    }

    // 2. Mettre à jour la carte et la position
    currentMapX = state.character.map_x;
    currentMapY = state.character.map_y;

    player.x = state.character.pos_x;
    player.y = state.character.pos_y;

    // 3. Précharger toutes les maps JSON
    await preloadAllMaps();

    // 4. Charger la map actuelle
    await loadMapChunk();

    // 5. Construire la map
    renderMap();

    // 6. Créer le joueur
    createPlayer();
    updatePlayer(); // recentre la caméra

    // 7. Charger les autres joueurs
    await loadRemotePlayers();

    // 8. Connecter les WebSockets
    connectGameWS();
    openChatWebSocket(currentInstanceId);

    // 9. Charger les stats
    loadCharacterStats(selectedCharacter.id);

    // 10. Afficher le jeu
    showGame();
}



async function loadRemotePlayers() {

    if (!currentInstanceId) return;

    const res = await fetch(`${GAME}/instance/players/${currentInstanceId}`, {
        headers: {
            Authorization: "Session " + sessionId
        }
    });

    if (!res.ok) return;

    const data = await res.json();

    data.players.forEach(p => {
        if (p.id === selectedCharacter.id) return;
        createOrUpdateRemotePlayer(p);
    });
}
function updateMinimapCoords() {
    const el = document.getElementById("minimapCoords");
    if (!el) return;

    el.textContent = `X: ${player.x} | Y: ${player.y} | Map: ${currentMapX},${currentMapY}`;
}

function createRemotePlayer(p) {

    const world = document.getElementById("gameWorld");

    // 🔥 Si le joueur existe déjà → on met juste à jour
    if (remotePlayers[p.account_id]) {
        createOrUpdateRemotePlayer(p);
        return;
    }

    const el = document.createElement("div");
    el.className = "remotePlayer";
    el.id = "remote_" + p.account_id;

    let spriteClass = "class-guerrier";
    if (p.class === "Mage") spriteClass = "class-mage";
    if (p.class === "Archer") spriteClass = "class-archer";
    if (p.class === "Nécromancien") spriteClass = "class-necromancien";

    el.innerHTML = `
        <div class="playerName">${p.name}</div>

        <div class="charSprite ${spriteClass}"
             style="--char-color:${p.appearance?.color || "#ff0000"}">

            <div class="charAura"></div>
            <div class="charBody"></div>
            <div class="charHead"></div>
            <div class="charWeapon"></div>
            <div class="charStaff"></div>
            <div class="charBow"></div>
        </div>
    `;

    el.style.left = (p.x * TILE_SIZE) + "px";
    el.style.top = (p.y * TILE_SIZE) + "px";

    world.appendChild(el);

    // 🔥 On stocke le joueur pour les updates WebSocket
    remotePlayers[p.account_id] = {
        id: p.account_id,
        x: p.x,
        y: p.y,
        dom: el
    };
}

window.addEventListener("load", async () => {
    sessionId = localStorage.getItem("sessionId");

    if (!sessionId) {
        showLogin();
        return;
    }

    const check = await fetch(`${AUTH}/validate_session`, {
        headers: { Authorization: "Session " + sessionId }
    });

    if (!check.ok) {
        logout();
        return;
    }

    const info = await check.json();
    accountId = info.account_id;

    connectWebSocket();

    const res = await fetch(`${GAME}/me/state`, {
        headers: { Authorization: "Session " + sessionId }
    });

    let state = null;
    if (res.ok) state = await res.json();

    if (state?.in_instance && state.character) {

        selectedCharacter = state.character;
        currentInstanceId = state.instance_id;

        // ❌ NE PLUS TOUCHER player ici
        showGame();
        await initGame(); // 🔥 IMPORTANT: await

    } else {
        loadCharacters();
    }
});

async function savePosition() {
    if (!selectedCharacter) return;

    const res = await fetch(`${GAME}/character/update_position`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Session " + sessionId
        },
        body: JSON.stringify({
            char_id: selectedCharacter.id,
            x: player.x,
            y: player.y,
            map_x: currentMapX,
            map_y: currentMapY
        })
    });

    if (res.status === 401) {
        showLogoutPopup();
        return;
    }
}


function showLogoutPopup() {
    const div = document.createElement("div");
    div.style.position = "fixed";
    div.style.top = "0";
    div.style.left = "0";
    div.style.width = "100%";
    div.style.height = "100%";
    div.style.background = "rgba(0,0,0,0.7)";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.zIndex = "9999";

    div.innerHTML = `
        <div style="
            background: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            width: 300px;
            font-family: sans-serif;
        ">
            <h3>Session expirée</h3>
            <p>Vous avez été déconnecté.</p>
            <button id="logout-ok" style="
                padding: 10px 20px;
                margin-top: 10px;
                cursor: pointer;
            ">OK</button>
        </div>
    `;

    document.body.appendChild(div);

    document.getElementById("logout-ok").onclick = () => {
        location.reload(); // F5
    };
}



function updatePreview() {
    const color = charColor.value;
    const name = charName.value.trim() || "(vide)";
    const charClass = charClassSelect.value;

    document.documentElement.style.setProperty("--char-color", color);

    const sprite = document.getElementById("charSprite");

    sprite.classList.remove(
        "class-guerrier",
        "class-mage",
        "class-archer",
        "class-necromancien"
    );

    if (charClass === "Guerrier") sprite.classList.add("class-guerrier");
    else if (charClass === "Mage") sprite.classList.add("class-mage");
    else if (charClass === "Archer") sprite.classList.add("class-archer");
    else if (charClass === "Nécromancien") sprite.classList.add("class-necromancien");
}

/* ------------------------------
   SELECT CHARACTER
------------------------------ */

async function selectCharacter(character) {
    selectedCharacter = character;

    currentInstanceId = null;

    localStorage.setItem("selectedCharacterId", character.id);
    localStorage.setItem("selectedCharacter", JSON.stringify(character));

    saveSessionState();

    // 🔥 IMPORTANT : reset position locale
    player.x = null;
    player.y = null;

    loadInstances();
}

/* ------------------------------
   INSTANCES
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
            <button onclick="joinInstance(${inst.instance_id})">
                Rejoindre
            </button>
        `;

        div.appendChild(box);
    });
}

/* ------------------------------
   JOIN INSTANCE
------------------------------ */

async function joinInstance(id) {

    const res = await fetch(`${GAME}/join_instance`, {
        method: "POST",
        headers: {
            Authorization: "Session " + sessionId,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            instance_id: id
        })
    });

    if (!res.ok) {
        alert(await res.text());
        return;
    }

    currentInstanceId = id;

    localStorage.setItem("currentInstanceId", id);
    saveSessionState();

    showGame();
    await initGame();
}
async function loadCharacterPositionAndMap(charId) {
    const res = await fetch(`${GAME}/character/get_position`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Session " + sessionId
        },
        body: JSON.stringify({ char_id: charId })
    });

    if (res.status === 401) {
        showLogoutPopup();
        return null;
    }

    return await res.json();
}
function syncRemotePlayersList(serverPlayers) {

    const alive = new Set(serverPlayers.map(p => p.id));

    // 🔥 SUPPRIMER les joueurs absents
    for (const id in remotePlayers) {
        if (!alive.has(Number(id))) {
            const rp = remotePlayers[id];
            if (rp.dom) rp.dom.remove();
            delete remotePlayers[id];
        }
    }

    // 🔥 CRÉER / METTRE À JOUR les joueurs présents
    serverPlayers.forEach(p => {
        if (p.id !== selectedCharacter.id) {
            createOrUpdateRemotePlayer(p);
        }
    });
}


function scheduleSavePosition() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(savePosition, 200);
}

function connectGameWS() {

    // fermer ancien socket proprement
    if (gameWS) {
        gameWS.onmessage = null;
        gameWS.onclose = null;
        gameWS.close();
    }

    if (!currentInstanceId || !selectedCharacter) return;

    gameWS = new WebSocket(
        `ws://${URL_BASE}:3000/ws/game/${currentInstanceId}/${selectedCharacter.id}`
    );

    gameWS.onopen = () => {
        console.log("Game WS connected");
    };

    gameWS.onclose = () => { };

    gameWS.onmessage = (event) => {

        const data = JSON.parse(event.data);

        // SNAPSHOT COMPLET
        if (data.type === "players") {
            syncRemotePlayersList(data.players);
            return;
        }

        // MOUVEMENT
        if (data.type === "move") {
            if (data.character_id !== selectedCharacter.id) {
                createOrUpdateRemotePlayer(data);
            }
            return;
        }

        // DÉCONNEXION
        if (data.type === "disconnect") {
            const id = data.character_id || data.id;
            if (remotePlayers[id]) {
                remotePlayers[id].dom.remove();
                delete remotePlayers[id];
            }
            return;
        }
    };



}




function createOrUpdateRemotePlayer(data) {

    const id = data.id ?? data.character_id;
    const world = document.getElementById("gameWorld");
    if (!world) return;

    let rp = remotePlayers[id];

    // --- Création structure ---
    if (!rp) {
        rp = remotePlayers[id] = {
            id,
            x: data.x,
            y: data.y,
            name: data.name,
            class: data.class,
            appearance: data.appearance,
            dom: null
        };
    }

    // --- Mise à jour logique ---
    rp.x = data.x;
    rp.y = data.y;

    // --- Création DOM si nécessaire ---
    if (!rp.dom) {

        const el = document.createElement("div");
        el.className = "remotePlayer";
        el.id = "remote_" + id;

        const color = rp.appearance?.color || "#00aaff";

        let spriteClass = "class-guerrier";
        if (rp.class === "Mage") spriteClass = "class-mage";
        else if (rp.class === "Archer") spriteClass = "class-archer";
        else if (rp.class === "Nécromancien") spriteClass = "class-necromancien";

        el.innerHTML = `
            <div class="playerName">${rp.name ?? ""}</div>
            <div class="charSprite ${spriteClass}" style="--char-color:${color}">
                <div class="charAura"></div>
                <div class="charBody"></div>
                <div class="charHead"></div>
                <div class="charWeapon"></div>
                <div class="charStaff"></div>
                <div class="charBow"></div>
            </div>
        `;

        world.appendChild(el);
        rp.dom = el;
    }

    // --- Mise à jour DOM ---
    rp.dom.style.left = `${rp.x * TILE_SIZE}px`;
    rp.dom.style.top = `${rp.y * TILE_SIZE}px`;
}






async function syncRemotePlayers() {

    if (!currentInstanceId) return;

    const res = await fetch(`${GAME}/instance/players/${currentInstanceId}`, {
        headers: { Authorization: "Session " + sessionId }
    });

    if (!res.ok) return;

    const data = await res.json();
    const serverList = data.players;

    const stillAlive = new Set();

    // --- Création / mise à jour ---
    serverList.forEach(p => {
        if (p.id === selectedCharacter.id) return;

        createOrUpdateRemotePlayer(p);
        stillAlive.add(p.id);
    });

    // --- Suppression des joueurs disparus ---
    for (const id in remotePlayers) {
        if (!stillAlive.has(Number(id))) {
            remotePlayers[id].dom.remove();
            delete remotePlayers[id];
        }
    }
}


function cleanupGameUI() {
    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (rp.dom) rp.dom.remove();
        delete remotePlayers[id];
    }
    // =========================
    // MAP
    // =========================

    const world =
        document.getElementById("gameWorld");

    if (world) {
        world.innerHTML = "";
    }

    // =========================
    // CHAT
    // =========================

    const chatBox =
        document.getElementById("chatBox");

    if (chatBox) {
        chatBox.innerHTML = "";
    }

    const chatInput =
        document.getElementById("chatInput");

    if (chatInput) {
        chatInput.value = "";
    }

    // =========================
    // HUD
    // =========================

    const hudIds = [
        "hudName",
        "hudClass",
        "hudLevel",
        "hudHp",
        "hudMana",
        "hudStr",
        "hudAgi",
        "hudInt"
    ];

    hudIds.forEach(id => {

        const el =
            document.getElementById(id);

        if (el)
            el.textContent = "";
    });

    // =========================
    // PLAYER
    // =========================

    const player =
        document.getElementById("player");

    if (player) {
        player.remove();
    }

    // =========================
    // REMOTE PLAYERS
    // =========================

    document
        .querySelectorAll(".remotePlayer")
        .forEach(p => p.remove());

    // =========================
    // RESET MAP
    // =========================

    currentMapX = 0;
    currentMapY = 0;
    document.body.classList.remove("in-game");
}
/* ------------------------------
   CHAT
------------------------------ */

function openChatWebSocket(instanceId) {
    if (chatWS) chatWS.close();

    chatWS = new WebSocket(`ws://` + URL_BASE + `:3000/ws/chat/${instanceId}`);

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
function drawMinimap() {
    const canvas = document.getElementById("minimap");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const size = canvas.width;

    const tileSize = size / (WORLD_WIDTH * MAP_WIDTH);

    ctx.clearRect(0, 0, size, size);

    // --- DESSIN DE TOUTES LES MAPS ---
    for (let my = 0; my < WORLD_HEIGHT; my++) {
        for (let mx = 0; mx < WORLD_WIDTH; mx++) {

            const key = `${mx}_${my}`;
            const map = MAPS[key];
            if (!map) continue;

            for (let y = 0; y < MAP_HEIGHT; y++) {
                for (let x = 0; x < MAP_WIDTH; x++) {

                    const tile = map[y]?.[x];
                    if (tile === undefined) continue;

                    if (tile === 0) ctx.fillStyle = "#4CAF50"; // herbe
                    else if (tile === 1) ctx.fillStyle = "#2196F3"; // eau
                    else if (tile === 2) ctx.fillStyle = "#616161"; // mur

                    const px = (mx * MAP_WIDTH + x) * tileSize;
                    const py = (my * MAP_HEIGHT + y) * tileSize;

                    ctx.fillRect(px, py, tileSize, tileSize);
                }
            }
        }
    }

    // --- MAP ACTUELLE ---
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;

    ctx.strokeRect(
        currentMapX * MAP_WIDTH * tileSize,
        currentMapY * MAP_HEIGHT * tileSize,
        MAP_WIDTH * tileSize,
        MAP_HEIGHT * tileSize
    );

    // --- AUTRES JOUEURS ---
    ctx.fillStyle = "#ff0000";
    for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        const px = (rp.mapX * MAP_WIDTH + rp.x) * tileSize;
        const py = (rp.mapY * MAP_HEIGHT + rp.y) * tileSize;
        ctx.fillRect(px, py, tileSize, tileSize);
    }

    // --- TOI ---
    ctx.fillStyle = "#ffff00";
    const px = (currentMapX * MAP_WIDTH + player.x) * tileSize;
    const py = (currentMapY * MAP_HEIGHT + player.y) * tileSize;
    ctx.fillRect(px, py, tileSize, tileSize);
}



setInterval(() => {
    drawMinimap();
}, 500);
/* ------------------------------
   RETURN
------------------------------ */

function returnToCharacterSelect() {
    if (chatWS) {
        chatWS.close();
        chatWS = null;
    }
    leaveInstance();
    cleanupGameUI();
    localStorage.removeItem("currentInstanceId");
    loadCharacters();
}
async function loadCharacterStats(characterId) {
    const res = await fetch(`${GAME}/character/${characterId}`, {
        headers: {
            Authorization: "Session " + sessionId
        }
    });

    if (!res.ok) {
        console.error("Impossible de charger le personnage");
        return;
    }

    const c = await res.json();

    document.getElementById("hudName").textContent = c.name;
    document.getElementById("hudClass").textContent = c.class;
    document.getElementById("hudLevel").textContent = c.level;
    document.getElementById("hudHp").textContent = c.hp;
    document.getElementById("hudMana").textContent = c.mana;
    document.getElementById("hudStr").textContent = c.force;
    document.getElementById("hudAgi").textContent = c.agilite;
    document.getElementById("hudInt").textContent = c.intelligence;
}

async function leaveInstance() {
    if (!currentInstanceId) return;

    try {
        await fetch(`${GAME}/leave_instance`, {
            method: "POST",
            headers: {
                Authorization: "Session " + sessionId,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                instance_id: currentInstanceId
            })
        });
    } catch (e) {
        console.warn("Leave instance failed:", e);
    }

    currentInstanceId = null;
}

/* ------------------------------
   WS
------------------------------ */

function connectWebSocket() {
    if (ws) ws.close();

    ws = new WebSocket("ws://" + URL_BASE + ":3000/ws/instances");
}

showLogin();