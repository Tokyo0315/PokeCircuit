// ============================================================
// POKECIRCUIT ARENA — PVP Pokémon selection lobby
// Manages roster locks, readiness, and countdown to battle
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabase) {
    console.error("❌ Supabase not loaded");
    return;
  }

  const CURRENT_USER_ID = window.CURRENT_USER_ID;
  const CURRENT_WALLET = window.CURRENT_WALLET_ADDRESS;

  if (!CURRENT_USER_ID) {
    alert("Please connect your wallet first!");
    window.location.href = "home.html";
    return;
  }

  const roomId = localStorage.getItem("PVP_ROOM_ID");
  const roomCode = localStorage.getItem("PVP_ROOM_CODE");
  const isHost = localStorage.getItem("PVP_IS_HOST") === "true";

  if (!roomId || !roomCode) {
    alert("No battle room found!");
    window.location.href = "pvp-lobby.html";
    return;
  }

  // ============================================================
  // DOM references for the selection UI
  // ============================================================

  const roomCodeDisplay = document.getElementById("roomCodeDisplay");
  const betAmountDisplay = document.getElementById("betAmountDisplay");
  const selectionTimer = document.getElementById("selectionTimer");
  const battleModeDisplay = document.getElementById("battleModeDisplay");
  const selectionTitleText = document.getElementById("selectionTitleText");
  const selectionCount = document.getElementById("selectionCount");
  const selectionWarning = document.querySelector(
    ".selection-title .title-warning"
  );

  const yourName = document.getElementById("yourName");
  const yourPokemonSlot = document.getElementById("yourPokemonSlot");
  const yourStatus = document.getElementById("yourStatus");

  const opponentNameEl = document.getElementById("opponentName");
  const opponentPokemonSlot = document.getElementById("opponentPokemonSlot");
  const opponentStatus = document.getElementById("opponentStatus");

  const pokemonGrid = document.getElementById("pokemonGrid");
  const emptyCollection = document.getElementById("emptyCollection");

  const readyBtn = document.getElementById("readyBtn");
  const leaveBtn = document.getElementById("leaveBtn");

  // Modals
  const waitingModal = document.getElementById("waitingModal");
  const waitingYourSprite = document.getElementById("waitingYourSprite");
  const waitingYourName = document.getElementById("waitingYourName");

  const battleStartModal = document.getElementById("battleStartModal");
  const startYourSprite = document.getElementById("startYourSprite");
  const startYourName = document.getElementById("startYourName");
  const startOpponentSprite = document.getElementById("startOpponentSprite");
  const startOpponentName = document.getElementById("startOpponentName");
  const battleCountdown = document.getElementById("battleCountdown");

  const confirmModal = document.getElementById("confirmModal");
  const confirmSprite = document.getElementById("confirmSprite");
  const confirmName = document.getElementById("confirmName");
  const confirmRarity = document.getElementById("confirmRarity");
  const confirmLevel = document.getElementById("confirmLevel");
  const confirmNameRepeat = document.getElementById("confirmNameRepeat");
  const confirmTeamList = document.getElementById("confirmTeamList");
  const confirmPokemonBlock = document.querySelector(".confirm-pokemon");
  const confirmCancel = document.getElementById("confirmCancel");
  const confirmAccept = document.getElementById("confirmAccept");

  const txModal = document.getElementById("txModal");
  const txTitle = document.getElementById("txTitle");
  const txMessage = document.getElementById("txMessage");
  const txStep1 = document.getElementById("txStep1");
  const txStep2 = document.getElementById("txStep2");
  const txStep3 = document.getElementById("txStep3");

  // ============================================================
  // Selection state
  // ============================================================

  let room = null;
  let collection = [];
  let selectedPokemon = null;
  let battleMode = "single";
  let selectedIds = new Set();
  let isReady = false;
  let roomSubscription = null;
  let timerInterval = null;
  let timeLeft = 60;

  // ============================================================
  // Helper functions for display + selection rules
  // ============================================================

  function shortenWallet(wallet) {
    if (!wallet) return "Unknown";
    if (wallet.length <= 13) return wallet;
    return wallet.slice(0, 6) + "..." + wallet.slice(-4);
  }

  function getDisplayName(username, wallet) {
    if (username && username.length > 0 && username !== "Trainer") {
      if (username.length > 15) {
        return username.slice(0, 12) + "...";
      }
      return username;
    }
    return shortenWallet(wallet);
  }

  function formatBattleMode(mode) {
    return mode === "team" ? "Team (3v3)" : "Single";
  }

  function requiredTeamSize() {
    return battleMode === "team" ? 3 : 1;
  }

  function getSelectedTeam() {
    const ids = Array.from(selectedIds);
    return ids
      .map((id) => collection.find((p) => p.id === id))
      .filter(Boolean);
  }

  function renderTeamSlots(container, team, isOpponent = false) {
    if (battleMode !== "team") {
      if (!team.length) {
        container.innerHTML = `
          <div class="empty-slot ${isOpponent ? "opponent" : ""}">
            <span class="empty-icon">?</span>
            <span class="empty-text">${
              isOpponent ? "Waiting for selection..." : "Select Your Fighter"
            }</span>
          </div>
        `;
        return;
      }

      const mon = team[0];
      container.innerHTML = `
        <div class="selected-pokemon-display">
          <img src="${mon.sprite}" alt="${mon.name}">
          <span class="selected-pokemon-name">${mon.name}</span>
          <span class="selected-pokemon-level">Level ${mon.level}</span>
        </div>
      `;
      return;
    }

    const slots = [];
    for (let i = 0; i < 3; i++) {
      const mon = team[i];
      if (mon) {
        slots.push(`
          <div class="team-slot">
            <img src="${mon.sprite}" alt="${mon.name}">
            <div class="slot-name">${mon.name}</div>
          </div>
        `);
      } else {
        slots.push(`
          <div class="team-slot empty">
            <div>Empty</div>
          </div>
        `);
      }
    }

    container.innerHTML = `<div class="team-slots">${slots.join("")}</div>`;
  }

  function updateSelectionHeader() {
    const needed = requiredTeamSize();
    selectionCount.textContent = `${selectedIds.size}/${needed}`;
    if (selectionTitleText) {
      selectionTitleText.textContent =
        battleMode === "team" ? "CHOOSE YOUR TEAM" : "CHOOSE YOUR FIGHTER";
    }
    if (selectionWarning) {
      selectionWarning.textContent =
        battleMode === "team"
          ? "ƒsÿ‹,? These PokAcmon will be LOST if you lose!"
          : "ƒsÿ‹,? This PokAcmon will be LOST if you lose!";
    }
  }

  // ============================================================
  // INITIALIZE
  // ============================================================

  async function init() {
    const { data: roomData, error } = await supabase
      .from("pvp_battle_rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (error || !roomData) {
      alert("Battle room not found!");
      clearRoomData();
      window.location.href = "pvp-lobby.html";
      return;
    }

    room = roomData;

    roomCodeDisplay.textContent = room.room_code;
    betAmountDisplay.textContent = `${room.bet_amount} PKCHP`;
    battleMode = room.battle_mode || localStorage.getItem("PVP_BATTLE_MODE") || "single";
    localStorage.setItem("PVP_BATTLE_MODE", battleMode);
    if (battleModeDisplay) {
      battleModeDisplay.textContent = formatBattleMode(battleMode);
    }
    updateSelectionHeader();

    // FIXED: Use getDisplayName for proper truncation
    if (isHost) {
      yourName.textContent = getDisplayName(
        room.host_username,
        room.host_wallet
      );
      opponentNameEl.textContent = getDisplayName(
        room.guest_username,
        room.guest_wallet
      );
    } else {
      yourName.textContent = getDisplayName(
        room.guest_username,
        room.guest_wallet
      );
      opponentNameEl.textContent = getDisplayName(
        room.host_username,
        room.host_wallet
      );
    }

    await loadCollection();
    subscribeToRoom();
    startTimer();

    console.log("✓ PVP Select initialized", { isHost, roomId });
  }

  // ============================================================
  // LOAD COLLECTION
  // ============================================================

  async function loadCollection() {
    const { data, error } = await supabase
      .from("user_pokemon")
      .select("*")
      .eq("user_id", CURRENT_USER_ID);

    if (error) {
      console.error("Collection load error:", error);
      return;
    }

    collection = data.map((p) => ({
      id: p.id,
      name: p.pokemon_name,
      rarity: p.rarity,
      sprite: p.sprite_url,
      hp: p.hp,
      attack: p.attack,
      defense: p.defense,
      speed: p.speed,
      level: p.level || 1,
      exp: p.exp || 0,
    }));

    const required = requiredTeamSize();
    if (collection.length < required) {
      pokemonGrid.style.display = "none";
      emptyCollection.classList.add("show");

      const emptyTitle = emptyCollection.querySelector("h3");
      const emptyText = emptyCollection.querySelector("p");
      if (emptyTitle) {
        emptyTitle.textContent =
          required === 1 ? "No PokAcmon Available" : "Not Enough PokAcmon";
      }
      if (emptyText) {
        emptyText.textContent =
          required === 1
            ? "You need PokAcmon in your collection to battle!"
            : `You need at least ${required} PokAcmon for a Team (3v3) battle.`;
      }

      readyBtn.disabled = true;
      return;
    }

    renderCollection();
  }

  // ============================================================
  // RENDER COLLECTION
  // ============================================================

  function renderCollection() {
    pokemonGrid.innerHTML = "";

    collection.forEach((pokemon) => {
      const card = document.createElement("div");
      const picked = selectedIds.has(pokemon.id);
      card.className = `pokemon-card${picked ? " selected" : ""}`;
      card.dataset.id = pokemon.id;

      card.innerHTML = `
        <span class="card-rarity rarity-${pokemon.rarity.toLowerCase()}">${
        pokemon.rarity
      }</span>
        <img src="${pokemon.sprite}" class="card-sprite" alt="${pokemon.name}">
        <div class="card-name">${pokemon.name}</div>
        <div class="card-level">Level ${pokemon.level}</div>
        <div class="card-stats">
          <div class="stat">HP <span>${pokemon.hp}</span></div>
          <div class="stat">ATK <span>${pokemon.attack}</span></div>
          <div class="stat">DEF <span>${pokemon.defense}</span></div>
          <div class="stat">SPD <span>${pokemon.speed}</span></div>
        </div>
      `;

      card.addEventListener("click", () => selectPokemon(pokemon));
      pokemonGrid.appendChild(card);
    });
  }

  function updateSelectedUI() {
    const team = getSelectedTeam();
    renderTeamSlots(yourPokemonSlot, team, false);
    updateSelectionHeader();

    const needed = requiredTeamSize();
    const readyText = readyBtn.querySelector(".ready-text");
    const isReadyToLock = team.length === needed;
    readyBtn.disabled = !isReadyToLock;
    if (readyText) {
      readyText.textContent = isReadyToLock
        ? battleMode === "team"
          ? "LOCK IN TEAM & READY"
          : "LOCK IN & READY"
        : `SELECT ${needed} POKA%MON`;
    }
  }

  // ============================================================
  // SELECT POKEMON
  // ============================================================

  function selectPokemon(pokemon) {
    if (isReady) return;

    if (battleMode === "single") {
      selectedIds.clear();
      selectedIds.add(pokemon.id);
      selectedPokemon = pokemon;
    } else {
      if (selectedIds.has(pokemon.id)) {
        selectedIds.delete(pokemon.id);
      } else {
        if (selectedIds.size >= 3) {
          alert("Max 3 PokAcmon for team match.");
          return;
        }
        selectedIds.add(pokemon.id);
      }
    }

    renderCollection();
    updateSelectedUI();
  }

  // ============================================================
  // READY BUTTON
  // ============================================================

  readyBtn.addEventListener("click", () => {
    const team = getSelectedTeam();
    if (team.length !== requiredTeamSize()) return;

    if (battleMode === "single") {
      selectedPokemon = team[0];
      confirmPokemonBlock.style.display = "flex";
      confirmTeamList.innerHTML = "";
      confirmSprite.src = selectedPokemon.sprite;
      confirmName.textContent = selectedPokemon.name;
      confirmRarity.textContent = selectedPokemon.rarity;
      confirmLevel.textContent = `Level ${selectedPokemon.level}`;
      confirmNameRepeat.textContent = selectedPokemon.name;
    } else {
      confirmPokemonBlock.style.display = "none";
      confirmTeamList.innerHTML = team
        .map(
          (mon) => `
          <div class="team-slot">
            <img src="${mon.sprite}" alt="${mon.name}">
            <div class="slot-name">${mon.name}</div>
          </div>
        `
        )
        .join("");
      confirmNameRepeat.textContent = "these PokAcmon";
    }

    showModal(confirmModal);
  });

  confirmCancel.addEventListener("click", () => {
    hideModal(confirmModal);
  });

  confirmAccept.addEventListener("click", async () => {
    hideModal(confirmModal);
    showModal(txModal);
    setTxStep(1);
    txMessage.textContent = "Locking in your selection...";

    try {
      setTxStep(2);

      const team = getSelectedTeam();
      const teamPayload = team.map((mon) => ({
        id: mon.id,
        name: mon.name,
        rarity: mon.rarity,
        sprite: mon.sprite,
        hp: mon.hp,
        attack: mon.attack,
        defense: mon.defense,
        speed: mon.speed,
        level: mon.level,
        exp: mon.exp || 0,
      }));

      const payload = battleMode === "team" ? teamPayload : teamPayload[0];
      const updateData = isHost
        ? { host_pokemon: payload, host_ready: true }
        : { guest_pokemon: payload, guest_ready: true };

      const { error } = await supabase
        .from("pvp_battle_rooms")
        .update(updateData)
        .eq("id", roomId);

      if (error) throw error;

      setTxStep(3);
      txMessage.textContent = "Waiting for opponent...";

      isReady = true;

      yourStatus.innerHTML = `
        <span class="status-dot ready"></span>
        <span>Ready!</span>
      `;

      readyBtn.disabled = true;
      readyBtn.querySelector(".ready-text").textContent = "LOCKED IN ✓";

      pokemonGrid.querySelectorAll(".pokemon-card").forEach((c) => {
        c.style.pointerEvents = "none";
      });

      hideModal(txModal);

      const { data: updatedRoom } = await supabase
        .from("pvp_battle_rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      const opponentReady = isHost
        ? updatedRoom.guest_ready
        : updatedRoom.host_ready;

      if (!opponentReady) {
        const waitingMon = battleMode === "team" ? team[0] : selectedPokemon;
        waitingYourSprite.src = waitingMon.sprite;
        waitingYourName.textContent = waitingMon.name;
        showModal(waitingModal);
      }
    } catch (err) {
      console.error("Lock in error:", err);
      hideModal(txModal);
      alert("Failed to lock in selection: " + err.message);
    }
  });

  // ============================================================
  // SUBSCRIBE TO ROOM UPDATES
  // ============================================================

  function subscribeToRoom() {
    roomSubscription = supabase
      .channel(`pvp-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pvp_battle_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          console.log("Room update:", payload.new);
          handleRoomUpdate(payload.new);
        }
      )
      .subscribe();
  }

  function handleRoomUpdate(updatedRoom) {
    room = updatedRoom;

    const opponentPayload = isHost ? room.guest_pokemon : room.host_pokemon;
    const opponentReady = isHost ? room.guest_ready : room.host_ready;
    const myReady = isHost ? room.host_ready : room.guest_ready;
    const opponentTeam = Array.isArray(opponentPayload)
      ? opponentPayload
      : opponentPayload
      ? [opponentPayload]
      : [];

    if (opponentReady) {
      renderTeamSlots(opponentPokemonSlot, opponentTeam, true);
      opponentStatus.innerHTML = `
        <span class="status-dot ready"></span>
        <span>Ready!</span>
      `;
    }

    if (myReady && opponentReady) {
      hideModal(waitingModal);
      startBattleCountdown(opponentTeam);
    }

    if (room.status === "cancelled") {
      alert("Battle was cancelled!");
      clearRoomData();
      window.location.href = "pvp-lobby.html";
    }
  }

  // ============================================================
  // BATTLE COUNTDOWN
  // ============================================================

  function startBattleCountdown(opponentTeam) {
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    const myTeam = getSelectedTeam();
    const myLead = battleMode === "team" ? myTeam[0] : selectedPokemon;
    const opponentLead = opponentTeam[0];

    startYourSprite.src = myLead.sprite;
    startYourName.textContent = myLead.name;
    startOpponentSprite.src = opponentLead.sprite;
    startOpponentName.textContent = opponentLead.name;

    showModal(battleStartModal);

    let count = 3;
    battleCountdown.textContent = count;

    const countInterval = setInterval(() => {
      count--;
      if (count > 0) {
        battleCountdown.textContent = count;
      } else {
        clearInterval(countInterval);
        battleCountdown.textContent = "GO!";

        setTimeout(() => {
          window.location.href = "pvp-battle.html";
        }, 500);
      }
    }, 1000);
  }

  // ============================================================
  // TIMER
  // ============================================================

  function startTimer() {
    timerInterval = setInterval(() => {
      timeLeft--;
      selectionTimer.textContent = timeLeft;

      if (timeLeft <= 10) {
        selectionTimer.style.color = "#ef4444";
        selectionTimer.style.animation = "timerPulse 0.5s ease-in-out infinite";
      }

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        handleTimeout();
      }
    }, 1000);
  }

  async function handleTimeout() {
    if (!isReady) {
      alert("Time's up! You didn't select a Pokémon in time.");
      await leaveRoom();
    }
  }

  // ============================================================
  // LEAVE BATTLE
  // ============================================================

  leaveBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to leave? You'll forfeit the battle!")) {
      await leaveRoom();
    }
  });

  async function leaveRoom() {
    try {
      await supabase
        .from("pvp_battle_rooms")
        .update({ status: "cancelled" })
        .eq("id", roomId);
    } catch (err) {
      console.error("Leave room error:", err);
    }

    clearRoomData();
    window.location.href = "pvp-lobby.html";
  }

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  function showModal(modal) {
    modal.classList.add("show");
  }

  function hideModal(modal) {
    modal.classList.remove("show");
  }

  function setTxStep(step) {
    txStep1.className = "tx-step";
    txStep2.className = "tx-step";
    txStep3.className = "tx-step";

    if (step >= 1)
      txStep1.className = step === 1 ? "tx-step active" : "tx-step completed";
    if (step >= 2)
      txStep2.className = step === 2 ? "tx-step active" : "tx-step completed";
    if (step >= 3)
      txStep3.className = step === 3 ? "tx-step active" : "tx-step completed";
  }

  function clearRoomData() {
    localStorage.removeItem("PVP_ROOM_ID");
    localStorage.removeItem("PVP_ROOM_CODE");
    localStorage.removeItem("PVP_IS_HOST");
    localStorage.removeItem("PVP_BATTLE_MODE");
  }

  window.addEventListener("beforeunload", () => {
    if (roomSubscription) {
      roomSubscription.unsubscribe();
    }
    if (timerInterval) {
      clearInterval(timerInterval);
    }
  });

  // ============================================================
  // INITIALIZE
  // ============================================================

  await init();
});
