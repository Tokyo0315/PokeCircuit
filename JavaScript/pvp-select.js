// ============================================================
// POKECIRCUIT ARENA - PVP POKEMON SELECTION
// Fixed: Wallet address truncation for display
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
  // DOM ELEMENTS
  // ============================================================

  const roomCodeDisplay = document.getElementById("roomCodeDisplay");
  const betAmountDisplay = document.getElementById("betAmountDisplay");
  const selectionTimer = document.getElementById("selectionTimer");

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
  const confirmCancel = document.getElementById("confirmCancel");
  const confirmAccept = document.getElementById("confirmAccept");

  const txModal = document.getElementById("txModal");
  const txTitle = document.getElementById("txTitle");
  const txMessage = document.getElementById("txMessage");
  const txStep1 = document.getElementById("txStep1");
  const txStep2 = document.getElementById("txStep2");
  const txStep3 = document.getElementById("txStep3");

  // ============================================================
  // STATE
  // ============================================================

  let room = null;
  let collection = [];
  let selectedPokemon = null;
  let isReady = false;
  let roomSubscription = null;
  let timerInterval = null;
  let timeLeft = 60;

  // ============================================================
  // HELPER FUNCTIONS
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

    if (collection.length === 0) {
      pokemonGrid.style.display = "none";
      emptyCollection.classList.add("show");
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
      card.className = "pokemon-card";
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

      card.addEventListener("click", () => selectPokemon(pokemon, card));
      pokemonGrid.appendChild(card);
    });
  }

  // ============================================================
  // SELECT POKEMON
  // ============================================================

  function selectPokemon(pokemon, cardElement) {
    if (isReady) return;

    pokemonGrid
      .querySelectorAll(".pokemon-card")
      .forEach((c) => c.classList.remove("selected"));

    cardElement.classList.add("selected");
    selectedPokemon = pokemon;

    yourPokemonSlot.innerHTML = `
      <div class="selected-pokemon-display">
        <img src="${pokemon.sprite}" alt="${pokemon.name}">
        <span class="selected-pokemon-name">${pokemon.name}</span>
        <span class="selected-pokemon-level">Level ${pokemon.level}</span>
      </div>
    `;

    readyBtn.disabled = false;
    readyBtn.querySelector(".ready-text").textContent = "LOCK IN & READY";
  }

  // ============================================================
  // READY BUTTON
  // ============================================================

  readyBtn.addEventListener("click", () => {
    if (!selectedPokemon) return;

    confirmSprite.src = selectedPokemon.sprite;
    confirmName.textContent = selectedPokemon.name;
    confirmRarity.textContent = selectedPokemon.rarity;
    confirmLevel.textContent = `Level ${selectedPokemon.level}`;
    confirmNameRepeat.textContent = selectedPokemon.name;

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

      const pokemonData = {
        id: selectedPokemon.id,
        name: selectedPokemon.name,
        rarity: selectedPokemon.rarity,
        sprite: selectedPokemon.sprite,
        hp: selectedPokemon.hp,
        attack: selectedPokemon.attack,
        defense: selectedPokemon.defense,
        speed: selectedPokemon.speed,
        level: selectedPokemon.level,
        exp: selectedPokemon.exp || 0,
      };

      const updateData = isHost
        ? { host_pokemon: pokemonData, host_ready: true }
        : { guest_pokemon: pokemonData, guest_ready: true };

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
        waitingYourSprite.src = selectedPokemon.sprite;
        waitingYourName.textContent = selectedPokemon.name;
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

    const opponentPokemon = isHost ? room.guest_pokemon : room.host_pokemon;
    const opponentReady = isHost ? room.guest_ready : room.host_ready;
    const myReady = isHost ? room.host_ready : room.guest_ready;

    if (opponentReady && opponentPokemon) {
      opponentPokemonSlot.innerHTML = `
        <div class="selected-pokemon-display">
          <img src="${opponentPokemon.sprite}" alt="${opponentPokemon.name}">
          <span class="selected-pokemon-name">${opponentPokemon.name}</span>
          <span class="selected-pokemon-level">Level ${opponentPokemon.level}</span>
        </div>
      `;
      opponentStatus.innerHTML = `
        <span class="status-dot ready"></span>
        <span>Ready!</span>
      `;
    }

    if (myReady && opponentReady) {
      hideModal(waitingModal);
      startBattleCountdown(opponentPokemon);
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

  function startBattleCountdown(opponentPokemon) {
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    startYourSprite.src = selectedPokemon.sprite;
    startYourName.textContent = selectedPokemon.name;
    startOpponentSprite.src = opponentPokemon.sprite;
    startOpponentName.textContent = opponentPokemon.name;

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
