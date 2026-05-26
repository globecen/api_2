let chatWS = null;

const AUTH = "http://127.0.0.1:3001";
const GAME = "http://127.0.0.1:3000";

let sessionId = null;
let accountId = null;
let selectedCharacter = null;
let currentInstanceId = null;
let ws = null;
let gameWS = null;
const remotePlayers = {};
/* =========================
   MAP
========================= */
let saveTimeout = null;


const TILE_SIZE = 32;

let currentMapX = 0;
let currentMapY = 0;

const MAP_WIDTH = 25;
const MAP_HEIGHT = 18;

const MAPS = {};

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


function moveStep() {
    if (!path.length) {
        moving = false;
        return;
    }

    const next = path.shift();

    player.x = next.x;
    player.y = next.y;
    updatePlayer();
    if (gameWS && gameWS.readyState === WebSocket.OPEN) {

        gameWS.send(JSON.stringify({
            type: "move",
            x: player.x,
            y: player.y
        }));
    }
    const sprite = document.getElementById("playerSprite");
    if (sprite) {
        sprite.classList.add("walking");

        setTimeout(() => {
            sprite.classList.remove("walking");
        }, 150);
    }
    scheduleSavePosition();
    setTimeout(moveStep, 120); // vitesse déplacement

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
    hideAllPanels();
    gamePanel.style.display = "block";
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

function generateMap(w, h) {

    const map = [];

    for (let y = 0; y < h; y++) {

        const row = [];

        for (let x = 0; x < w; x++) {

            // murs bords
            if (
                x === 0 ||
                y === 0 ||
                x === w - 1 ||
                y === h - 1
            ) {
                row.push(1);
            } else {
                row.push(0);
            }
        }

        map.push(row);
    }

    return map;
}
function renderMap() {

    const world = document.getElementById("gameWorld");
    if (!world) return;

    world.innerHTML = "";

    const key = `${currentMapX}_${currentMapY}`;

    if (!MAPS[key]) {
        MAPS[key] = generateMap(MAP_WIDTH, MAP_HEIGHT);
    }

    const map = MAPS[key];

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {

            const tile = document.createElement("div");
            tile.className = "tile " + (map[y][x] === 1 ? "wall" : "ground");

            tile.style.left = (x * TILE_SIZE) + "px";
            tile.style.top = (y * TILE_SIZE) + "px";

            world.appendChild(tile);
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

    const map = MAPS[`${currentMapX}_${currentMapY}`];
    if (!map) return;

    if (map[target.y][target.x] === 1) return;

    const start = { x: player.x, y: player.y };

    path = findPath(start, target, map);

    if (path.length > 0) {
        path.shift(); // retire position actuelle
        moving = true;
        moveStep();
    }
});
/* ------------------------------
   PREVIEW
------------------------------ */
async function initGame() {
    if (!selectedCharacter || !currentInstanceId) return;

    showGame();

    const key = `${currentMapX}_${currentMapY}`;

    if (!MAPS[key]) {
        MAPS[key] = generateMap(MAP_WIDTH, MAP_HEIGHT);
    }

    // 🔥 ATTEND LA POSITION BDD
    const pos = await loadCharacterPosition(selectedCharacter.id);

    console.log("Loaded position:", pos);

    player.x = pos.x;
    player.y = pos.y;

    renderMap();
    createPlayer();
    updatePlayer();
    connectGameWS();
    openChatWebSocket(currentInstanceId);
    loadCharacterStats(selectedCharacter.id);
    
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

    await fetch(`${GAME}/character/update_position`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Session " + sessionId
        },
        body: JSON.stringify({
            char_id: selectedCharacter.id,
            x: player.x,
            y: player.y
        })
    });
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

    document.getElementById("previewName").textContent = "Nom : " + name;
    document.getElementById("previewClass").textContent = "Classe : " + charClass;
    document.getElementById("previewColor").textContent = "Couleur : " + color;
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
function connectGameWS() {

    if (gameWS)
        gameWS.close();

    gameWS = new WebSocket(
        `ws://127.0.0.1:3000/ws/game/${currentInstanceId}/${selectedCharacter.id}`
    );

    gameWS.onmessage = (event) => {

        const data = JSON.parse(event.data);

        // liste joueurs
        if (data.type === "players") {

            data.players.forEach(p => {

                // soi-même
                if (p.id === selectedCharacter.id)
                    return;

                createOrUpdateRemotePlayer(p);
            });
        }

        // mouvement
        if (data.type === "move") {

            if (data.character_id === selectedCharacter.id)
                return;

            const p = remotePlayers[data.character_id];

            if (!p) return;

            p.style.left = `${data.x * TILE_SIZE}px`;
            p.style.top = `${data.y * TILE_SIZE}px`;
        }

        // déco
        if (data.type === "disconnect") {

            const p = remotePlayers[data.character_id];

            if (p) {
                p.remove();
                delete remotePlayers[data.character_id];
            }
        }
    };
}
function createOrUpdateRemotePlayer(data) {

    let el = remotePlayers[data.id];

    if (!el) {

        el = document.createElement("div");
        el.className = "remotePlayer";

        const color =
            data.appearance?.color || "#00aaff";

        const spriteClass =
            data.class === "Guerrier"
                ? "class-guerrier"
                : data.class === "Mage"
                    ? "class-mage"
                    : data.class === "Archer"
                        ? "class-archer"
                        : "class-necromancien";

        el.innerHTML = `
            <div class="playerName">
                ${data.name}
            </div>

            <div class="charSprite ${spriteClass}"
                 style="--char-color:${color};">

                <div class="charAura"></div>
                <div class="charBody"></div>
                <div class="charHead"></div>
                <div class="charWeapon"></div>
                <div class="charStaff"></div>
                <div class="charBow"></div>

            </div>
        `;

        document
            .getElementById("gameWorld")
            .appendChild(el);

        remotePlayers[data.id] = el;
    }

    el.style.left = `${data.x * TILE_SIZE}px`;
    el.style.top = `${data.y * TILE_SIZE}px`;
}
function cleanupGameUI() {

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
}
/* ------------------------------
   CHAT
------------------------------ */

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

    ws = new WebSocket("ws://127.0.0.1:3000/ws/instances");
}

showLogin();