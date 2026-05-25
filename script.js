let chatWS = null;

const AUTH = "http://127.0.0.1:3001";
const GAME = "http://127.0.0.1:3000";

let sessionId = null;
let accountId = null;
let selectedCharacter = null;
let currentInstanceId = null;
let ws = null;

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

/* ------------------------------
   PREVIEW
------------------------------ */

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

function selectCharacter(character) {
    selectedCharacter = character;

    localStorage.setItem("selectedCharacterId", character.id);

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
            Authorization: "Session " + sessionId
        }
    });

    if (!res.ok) {
        alert(await res.text());
        return;
    }

    currentInstanceId = id;

    showGame();

    openChatWebSocket(id);

    // 👇 AJOUT ICI
    const charId = localStorage.getItem("selectedCharacterId");
    if (charId) {
        loadCharacterStats(charId);
    }
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

/* ------------------------------
   WS
------------------------------ */

function connectWebSocket() {
    if (ws) ws.close();

    ws = new WebSocket("ws://127.0.0.1:3000/ws/instances");
}

showLogin();