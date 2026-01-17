document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabase) {
    console.error("? Supabase not loaded");
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
  const isHost = localStorage.getItem("PVP_IS_HOST") === "true";

  if (!roomId) {
    alert("No battle room found!");
    window.location.href = "pvp-lobby.html";
    return;
  }

  // Contract addresses (use defaults if env vars missing)
  const PKCHP_ADDRESS =
    window.PKCHP_ADDRESS || "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";
  const PVP_ESCROW_ADDRESS =
    window.PVP_ESCROW_ADDRESS || "0x420D05bF983a1bC59917b80E81A0cC4d36486A2D";

  const PVP_ESCROW_ABI = [
    {
      inputs: [
        { internalType: "bytes32", name: "roomId", type: "bytes32" },
        { internalType: "address", name: "winner", type: "address" },
      ],
      name: "confirmWinner",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "roomId", type: "bytes32" }],
      name: "claimPrize",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "roomId", type: "bytes32" }],
      name: "getRoom",
      outputs: [
        { internalType: "address", name: "player1", type: "address" },
        { internalType: "address", name: "player2", type: "address" },
        { internalType: "uint256", name: "betAmount", type: "uint256" },
        { internalType: "uint256", name: "createdAt", type: "uint256" },
        { internalType: "uint256", name: "battleStartedAt", type: "uint256" },
        { internalType: "address", name: "winner", type: "address" },
        { internalType: "uint8", name: "status", type: "uint8" },
      ],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [{ internalType: "bytes32", name: "roomId", type: "bytes32" }],
      name: "getPrizeAmount",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
  ];

  // Escrow status constants matching the smart contract enum
  const ESCROW_STATUS = {
    WAITING_FOR_OPPONENT: 0,
    BATTLE_IN_PROGRESS: 1,
    BATTLE_COMPLETE: 2,
    CANCELLED: 3,
    CLAIMED: 4,
  };

  const ESCROW_STATUS_NAMES = {
    0: "WaitingForOpponent",
    1: "BattleInProgress",
    2: "BattleComplete",
    3: "Cancelled",
    4: "Claimed",
  };

  // DOM references for the battle UI

  const pvpRoomCode = document.getElementById("pvpRoomCode");
  const battleLog = document.getElementById("battleLog");

  const opponentCardName = document.getElementById("opponentCardName");
  const opponentCardInfo = document.getElementById("opponentCardInfo");
  const opponentPokemonSprite = document.getElementById("opponentPokemon");

  const playerCardName = document.getElementById("playerCardName");
  const playerCardInfo = document.getElementById("playerCardInfo");
  const playerPokemonSprite = document.getElementById("playerPokemon");

  const turnIndicator = document.getElementById("turnIndicator");
  const turnTimer = document.getElementById("turnTimer");
  const turnTimerValue = document.getElementById("turnTimerValue");

  const movesContainer = document.getElementById("movesContainer");
  const waitingTurn = document.getElementById("waitingTurn");

  // Modals
  const victoryModal = document.getElementById("victoryModal");
  const wonAmount = document.getElementById("wonAmount");
  const wonExp = document.getElementById("wonExp");
  const opponentLostPokemon = document.getElementById("opponentLostPokemon");
  const claimVictoryBtn = document.getElementById("claimVictoryBtn");

  const defeatModal = document.getElementById("defeatModal");
  const lostAmount = document.getElementById("lostAmount");
  const lostPokemonSprite = document.getElementById("lostPokemonSprite");
  const lostPokemonName = document.getElementById("lostPokemonName");
  const returnBtn = document.getElementById("returnBtn");

  const opponentLeftModal = document.getElementById("opponentLeftModal");
  const forfeitAmount = document.getElementById("forfeitAmount");
  const claimForfeitBtn = document.getElementById("claimForfeitBtn");

  const txModal = document.getElementById("txModal");
  const txTitle = document.getElementById("txTitle");
  const txMessage = document.getElementById("txMessage");
  const rewardNoticeModal = document.getElementById("rewardNoticeModal");
  const rewardNoticeTitle = document.getElementById("rewardNoticeTitle");
  const rewardNoticeMessage = document.getElementById("rewardNoticeMessage");
  const rewardNoticeOk = document.getElementById("rewardNoticeOk");

  // Client-side battle state

  let room = null;
  let myPokemon = null;
  let opponentPokemon = null;
  let myTeam = [];
  let opponentTeam = [];
  let initialMyTeam = [];
  let initialOpponentTeam = [];
  let myHP = 0;
  let opponentHP = 0;
  let myMaxHP = 0;
  let opponentMaxHP = 0;
  let isMyTurn = false;
  let battleActive = true;
  let myMoves = [];
  let roomSubscription = null;
  let turnTimeLeft = 30;
  let turnTimerInterval = null;
  let battleMode = "single";
  let lastMyPokemonId = null;
  let lastOpponentPokemonId = null;

  // Name/wallet formatting helpers

  function shortenWallet(wallet) {
    if (!wallet) return "Unknown";
    if (wallet.length <= 13) return wallet;
    return wallet.slice(0, 6) + "..." + wallet.slice(-4);
  }

  function getDisplayName(username, wallet) {
    if (username && username.length > 0 && username.length <= 15) {
      return username;
    }
    return shortenWallet(wallet);
  }

  function normalizeTeam(payload) {
    const team = Array.isArray(payload) ? payload : payload ? [payload] : [];
    return team.map((mon) => ({
      ...mon,
      current_hp: mon.current_hp ?? mon.hp,
    }));
  }

  function getActiveMon(team) {
    return team.length ? team[0] : null;
  }

  // EXP/LEVEL HELPERS (keep PVP leveling aligned with PVE logic)

  function getExpForLevel(level) {
    return level * 100;
  }

  function getTotalExpToLevel(level) {
    let total = 0;
    for (let l = 1; l < level; l++) {
      total += getExpForLevel(l);
    }
    return total;
  }

  function calculateLevelFromExp(totalExp) {
    let level = 1;
    let expNeeded = getExpForLevel(level);
    let remaining = totalExp;

    while (remaining >= expNeeded && level < 100) {
      remaining -= expNeeded;
      level++;
      expNeeded = getExpForLevel(level);
    }

    return { level, currentExp: remaining, expToNext: expNeeded };
  }

  async function awardExpToTeam(team, expReward) {
    for (const mon of team) {
      const currentLevel = mon.level || 1;
      const currentExp = mon.exp || 0;
      const cumulativeExp = getTotalExpToLevel(currentLevel) + currentExp;
      const newTotalExp = cumulativeExp + expReward;
      const levelData = calculateLevelFromExp(newTotalExp);
      const newLevel = Math.max(currentLevel, levelData.level);
      const expAtLevelStart = getTotalExpToLevel(newLevel);
      const storedExpForLevel = Math.max(0, newTotalExp - expAtLevelStart);
      const levelsGained = Math.max(0, newLevel - currentLevel);
      const statIncrease = levelsGained * 10;

      const updatePayload = {
        exp: storedExpForLevel,
        level: newLevel,
      };

      if (levelsGained > 0) {
        updatePayload.hp = (mon.hp || 100) + statIncrease;
        updatePayload.attack = (mon.attack || 50) + statIncrease;
        updatePayload.defense = (mon.defense || 50) + statIncrease;
        updatePayload.speed = (mon.speed || 50) + statIncrease;
      }

      await supabase
        .from("user_pokemon")
        .update(updatePayload)
        .eq("id", mon.id);
    }
  }

  async function deleteTeam(team) {
    for (const mon of team) {
      await supabase.from("user_pokemon").delete().eq("id", mon.id);
    }
  }

  // Escrow helpers

  function roomCodeToBytes32(roomCode) {
    return ethers.keccak256(ethers.toUtf8Bytes(roomCode));
  }

  // Get the current escrow room status from the blockchain
  async function getEscrowRoomStatus(roomCode) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS || !roomCode) {
      return null;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        provider,
      );
      const roomEscrowId = roomCodeToBytes32(roomCode);
      const roomData = await escrowContract.getRoom(roomEscrowId);

      const player1 = roomData[0];
      const player2 = roomData[1];
      const betAmount = roomData[2];
      const createdAt = Number(roomData[3]);
      const battleStartedAt = Number(roomData[4]);
      const winner = roomData[5];
      const status = Number(roomData[6]);

      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const roomExists = player1 !== zeroAddress;

      console.log("📊 Escrow room status:", {
        roomCode,
        roomExists,
        player1,
        player2,
        betAmount: betAmount.toString(),
        status,
        statusName: ESCROW_STATUS_NAMES[status] || "Unknown",
        winner,
        createdAt,
        battleStartedAt,
      });

      return {
        exists: roomExists,
        player1,
        player2,
        betAmount,
        createdAt,
        battleStartedAt,
        winner,
        status,
        statusName: ESCROW_STATUS_NAMES[status] || "Unknown",
      };
    } catch (err) {
      console.error("Failed to get escrow room status:", err);
      return null;
    }
  }

  async function getEscrowPrizeAmount(roomCode) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS || !roomCode) {
      return room.bet_amount * 2;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        provider,
      );
      const roomEscrowId = roomCodeToBytes32(roomCode);
      const prizeWei = await escrowContract.getPrizeAmount(roomEscrowId);
      return Math.floor(Number(ethers.formatUnits(prizeWei, 18)));
    } catch (err) {
      console.warn("Escrow prize lookup failed:", err);
      return room.bet_amount * 2;
    }
  }

  // Claim prize from escrow - auto-confirms winner if needed
  async function claimEscrowPrize(roomCode) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS || !roomCode) {
      throw new Error("Wallet not connected for escrow claim");
    }

    // First check the current escrow state
    const escrowStatus = await getEscrowRoomStatus(roomCode);

    if (!escrowStatus || !escrowStatus.exists) {
      throw new Error(
        "Escrow room not found on blockchain. The room may not have been created on-chain or both players did not deposit.",
      );
    }

    const currentWallet = CURRENT_WALLET.toLowerCase();

    // Status 0: WaitingForOpponent - opponent never joined escrow
    if (escrowStatus.status === ESCROW_STATUS.WAITING_FOR_OPPONENT) {
      throw new Error(
        "Opponent never deposited to escrow. Both players must deposit PKCHP before battle. The escrow was not properly set up.",
      );
    }

    // Status 3: Cancelled
    if (escrowStatus.status === ESCROW_STATUS.CANCELLED) {
      throw new Error(
        "This battle was cancelled. Refunds should have been issued.",
      );
    }

    // Status 4: Already claimed
    if (escrowStatus.status === ESCROW_STATUS.CLAIMED) {
      throw new Error("Prize has already been claimed for this battle.");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const escrowContract = new ethers.Contract(
      PVP_ESCROW_ADDRESS,
      PVP_ESCROW_ABI,
      signer,
    );
    const roomEscrowId = roomCodeToBytes32(roomCode);

    // Status 1: BattleInProgress - need to confirm winner first
    if (escrowStatus.status === ESCROW_STATUS.BATTLE_IN_PROGRESS) {
      console.log(
        "⚠️ Battle still in progress on-chain, confirming winner first...",
      );

      // Verify current user is a player in this room
      const isPlayer1 = escrowStatus.player1.toLowerCase() === currentWallet;
      const isPlayer2 = escrowStatus.player2.toLowerCase() === currentWallet;

      if (!isPlayer1 && !isPlayer2) {
        throw new Error("You are not a player in this escrow room.");
      }

      // Confirm the winner (current user claiming is the winner)
      console.log("📝 Confirming winner on-chain:", CURRENT_WALLET);
      const confirmTx = await escrowContract.confirmWinner(
        roomEscrowId,
        CURRENT_WALLET,
      );
      await confirmTx.wait();
      console.log("✅ Winner confirmed on-chain!");

      // Now claim immediately after confirming (we just set ourselves as winner)
      console.log("💰 Claiming prize from escrow...");
      const tx = await escrowContract.claimPrize(roomEscrowId);
      await tx.wait();
      console.log("✅ Prize claimed successfully!");
      return;
    }

    // Status 2: BattleComplete - verify we are the winner then claim
    if (escrowStatus.status === ESCROW_STATUS.BATTLE_COMPLETE) {
      if (escrowStatus.winner.toLowerCase() !== currentWallet) {
        throw new Error("Only the winner can claim the prize.");
      }

      console.log("💰 Claiming prize from escrow...");
      const tx = await escrowContract.claimPrize(roomEscrowId);
      await tx.wait();
      console.log("✅ Prize claimed successfully!");
      return;
    }

    // Fallback - shouldn't reach here but try to claim anyway
    console.log("💰 Claiming prize from escrow...");
    const tx = await escrowContract.claimPrize(roomEscrowId);
    await tx.wait();
    console.log("✅ Prize claimed successfully!");
  }

  // Confirm winner on escrow - checks state first
  async function confirmEscrowWinner(roomCode, winner) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS || !roomCode || !winner) {
      throw new Error("Wallet not connected for escrow confirm");
    }

    // First check the current escrow state
    const escrowStatus = await getEscrowRoomStatus(roomCode);

    if (!escrowStatus || !escrowStatus.exists) {
      console.warn("⚠️ Escrow room not found - skipping winner confirmation");
      return;
    }

    // If already complete or claimed, no need to confirm again
    if (escrowStatus.status === ESCROW_STATUS.BATTLE_COMPLETE) {
      console.log("✅ Winner already confirmed on-chain, skipping");
      return;
    }

    if (escrowStatus.status === ESCROW_STATUS.CLAIMED) {
      console.log("✅ Prize already claimed, skipping confirmation");
      return;
    }

    if (escrowStatus.status === ESCROW_STATUS.CANCELLED) {
      console.warn("⚠️ Battle was cancelled, cannot confirm winner");
      return;
    }

    // Status 0: Opponent never joined
    if (escrowStatus.status === ESCROW_STATUS.WAITING_FOR_OPPONENT) {
      console.warn(
        "⚠️ Opponent never deposited to escrow - cannot confirm winner",
      );
      throw new Error(
        "Escrow not ready: opponent never deposited. Both players must complete the escrow deposit before battle.",
      );
    }

    // Status 1: Battle in progress - can confirm winner
    if (escrowStatus.status === ESCROW_STATUS.BATTLE_IN_PROGRESS) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        signer,
      );
      const roomEscrowId = roomCodeToBytes32(roomCode);

      console.log("📝 Confirming winner on escrow:", winner);
      const tx = await escrowContract.confirmWinner(roomEscrowId, winner);
      await tx.wait();
      console.log("✅ Winner confirmed on-chain!");
    }
  }

  async function isEscrowClaimable(roomCode) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS || !roomCode) {
      return { ok: false, reason: "Wallet not connected." };
    }

    try {
      const escrowStatus = await getEscrowRoomStatus(roomCode);

      if (!escrowStatus || !escrowStatus.exists) {
        return { ok: false, reason: "Escrow room not found on blockchain." };
      }

      const wallet = String(CURRENT_WALLET || "").toLowerCase();
      const winner = String(escrowStatus.winner || "").toLowerCase();

      // Check various states
      if (escrowStatus.status === ESCROW_STATUS.WAITING_FOR_OPPONENT) {
        return { ok: false, reason: "Opponent never deposited to escrow." };
      }

      if (escrowStatus.status === ESCROW_STATUS.CANCELLED) {
        return { ok: false, reason: "Battle was cancelled." };
      }

      if (escrowStatus.status === ESCROW_STATUS.CLAIMED) {
        return { ok: false, reason: "Prize already claimed." };
      }

      // BattleInProgress - can claim (will auto-confirm winner)
      if (escrowStatus.status === ESCROW_STATUS.BATTLE_IN_PROGRESS) {
        const isPlayer =
          escrowStatus.player1.toLowerCase() === wallet ||
          escrowStatus.player2.toLowerCase() === wallet;
        if (!isPlayer) {
          return { ok: false, reason: "You are not a player in this room." };
        }
        return { ok: true, reason: "", needsConfirmation: true };
      }

      // BattleComplete - check if user is winner
      if (escrowStatus.status === ESCROW_STATUS.BATTLE_COMPLETE) {
        const noWinner =
          !winner || winner === "0x0000000000000000000000000000000000000000";
        if (noWinner || winner !== wallet) {
          return { ok: false, reason: "Only the winner can claim." };
        }
        return { ok: true, reason: "" };
      }

      return { ok: false, reason: "Unknown escrow state." };
    } catch (err) {
      console.warn("Escrow claim check failed:", err);
      return { ok: false, reason: "Unable to verify escrow status." };
    }
  }

  async function logPvpWinPending(prizeAmount, opponentDisplayName) {
    if (!window.logTransaction) return false;

    try {
      await window.logTransaction({
        type: "pvp_win_pending",
        pokemon_name: myPokemon.name,
        pokemon_rarity: myPokemon.rarity,
        pokemon_sprite: myPokemon.sprite,
        pokemon_level: myPokemon.level,
        amount: prizeAmount,
        currency: "PKCHP",
        opponent_name: opponentDisplayName,
        exp_gained: room.exp_reward || 0,
        metadata: {
          room_code: room.room_code,
          room_id: roomId,
          bet_amount: room.bet_amount,
        },
      });
      return true;
    } catch (err) {
      console.warn("PVP win pending log failed:", err);
      return false;
    }
  }

  async function createPvpWinNotification(prizeAmount, opponentDisplayName) {
    if (!supabase || !CURRENT_USER_ID) return false;

    // Use bet_amount * 2 as fallback if prizeAmount is 0 or invalid
    const displayAmount = prizeAmount > 0 ? prizeAmount : room.bet_amount * 2;

    try {
      const { error } = await supabase.from("notifications").insert({
        user_id: CURRENT_USER_ID,
        type: "pvp_win",
        message: `You win in PVP vs ${opponentDisplayName}! Claim your reward.`,
        pokemon_name: myPokemon.name,
        pokemon_sprite: myPokemon.sprite,
        amount: displayAmount,
        from_wallet: isHost ? room.guest_wallet : room.host_wallet,
        room_code: room.room_code,
        metadata: {
          room_code: room.room_code,
          room_id: roomId,
          opponent_name: opponentDisplayName,
          exp_reward: room.exp_reward || 0,
          battle_mode: battleMode,
          bet_amount: room.bet_amount,
        },
        is_read: false,
      });

      if (error) {
        console.error("Failed to create PVP win notification:", error);
        return false;
      }

      console.log(
        "✅ PVP win notification created with amount:",
        displayAmount,
      );
      return true;
    } catch (err) {
      console.warn("PVP win notification creation failed:", err);
      return false;
    }
  }

  // INITIALIZE

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
    pvpRoomCode.textContent = room.room_code;

    battleMode =
      room.battle_mode ||
      localStorage.getItem("PVP_BATTLE_MODE") ||
      (Array.isArray(room.host_pokemon) ? "team" : "single");
    localStorage.setItem("PVP_BATTLE_MODE", battleMode);

    const hostTeam = normalizeTeam(room.host_pokemon);
    const guestTeam = normalizeTeam(room.guest_pokemon);

    initialMyTeam = isHost ? hostTeam : guestTeam;
    initialOpponentTeam = isHost ? guestTeam : hostTeam;

    if (isHost) {
      myTeam = hostTeam;
      opponentTeam = guestTeam;
    } else {
      myTeam = guestTeam;
      opponentTeam = hostTeam;
    }

    myPokemon = getActiveMon(myTeam);
    opponentPokemon = getActiveMon(opponentTeam);

    if (!myPokemon || !opponentPokemon) {
      alert("Battle data error!");
      clearRoomData();
      window.location.href = "pvp-lobby.html";
      return;
    }

    myHP = myPokemon.current_hp ?? myPokemon.hp;
    myMaxHP = myPokemon.hp;
    opponentHP = opponentPokemon.current_hp ?? opponentPokemon.hp;
    opponentMaxHP = opponentPokemon.hp;
    lastMyPokemonId = myPokemon.id;
    lastOpponentPokemonId = opponentPokemon.id;

    if (isHost) {
      const updatePayload = {
        host_current_hp: myHP,
        guest_current_hp: opponentHP,
        current_turn: room.host_id,
        status: "battling",
        started_at: new Date().toISOString(),
        turn_started_at: new Date().toISOString(),
      };

      if (battleMode === "team") {
        updatePayload.host_pokemon = hostTeam;
        updatePayload.guest_pokemon = guestTeam;
      }

      await supabase
        .from("pvp_battle_rooms")
        .update(updatePayload)
        .eq("id", roomId);
    }

    renderBattleUI();
    await loadMoves();
    subscribeToRoom();

    isMyTurn = isHost;
    updateTurnUI();

    log("?? PVP Battle started!", "#ffd86b");
    log(`${myPokemon.name} vs ${opponentPokemon.name}`, "#fff");

    console.log("? PVP Battle initialized");
  }

  // RENDER BATTLE UI

  function renderBattleUI() {
    playerPokemonSprite.src = myPokemon.sprite;
    playerCardName.textContent = myPokemon.name;
    renderCard(playerCardInfo, myPokemon, myHP, myMaxHP);

    opponentPokemonSprite.src = opponentPokemon.sprite;
    opponentCardName.textContent = opponentPokemon.name;
    renderCard(opponentCardInfo, opponentPokemon, opponentHP, opponentMaxHP);
  }

  function renderCard(container, pokemon, currentHP, maxHP) {
    const hpPercent = Math.max(0, (currentHP / maxHP) * 100);
    let hpColor = "#22c55e";
    if (hpPercent < 50) hpColor = "#f59e0b";
    if (hpPercent < 25) hpColor = "#ef4444";

    container.innerHTML = `
      <div>Lv. ${pokemon.level || 1}</div>
      <div>HP: ${Math.max(0, currentHP)}/${maxHP}</div>
      <div class="hp-bar-container">
        <div class="hp-bar-fill" style="width: ${hpPercent}%; background: ${hpColor};"></div>
      </div>
    `;
  }

  // LOAD MOVES

  async function loadMoves() {
    try {
      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${myPokemon.name.toLowerCase()}`,
      );
      const data = await response.json();

      const allMoves = data.moves.slice(0, 20);
      const shuffled = allMoves.sort(() => 0.5 - Math.random());
      const selectedMoves = shuffled.slice(0, 4);

      myMoves = selectedMoves.map((m) => ({
        name: m.move.name.replace(/-/g, " "),
        power: Math.floor(Math.random() * 40) + 40,
        type: "normal",
      }));

      renderMoves();
    } catch (err) {
      console.error("Failed to load moves:", err);
      myMoves = [
        { name: "Tackle", power: 40, type: "normal" },
        { name: "Scratch", power: 45, type: "normal" },
        { name: "Pound", power: 40, type: "normal" },
        { name: "Quick Attack", power: 50, type: "normal" },
      ];
      renderMoves();
    }
  }

  function renderMoves() {
    movesContainer.innerHTML = "";

    myMoves.forEach((move, index) => {
      const btn = document.createElement("button");
      btn.className = "move-btn";
      btn.innerHTML = `${move.name.toUpperCase()}<span style="font-size:0.7rem;opacity:0.7;display:block;">PWR: ${
        move.power
      }</span>`;
      btn.disabled = !isMyTurn;
      btn.addEventListener("click", () => executeMove(move, index));
      movesContainer.appendChild(btn);
    });
  }

  // EXECUTE MOVE

  async function executeMove(move, index) {
    if (!isMyTurn || !battleActive) return;

    movesContainer
      .querySelectorAll(".move-btn")
      .forEach((b) => (b.disabled = true));
    stopTurnTimer();

    const baseDamage = move.power;
    const attackStat = myPokemon.attack || 50;
    const defenseStat = opponentPokemon.defense || 50;
    const randomFactor = Math.random() * 0.3 + 0.85;

    const damage = Math.floor(
      ((baseDamage * (attackStat / defenseStat)) / 2) * randomFactor,
    );

    log(`${myPokemon.name} used ${move.name}!`, "#22c55e");

    playerPokemonSprite.classList.add("hit-effect");
    setTimeout(() => playerPokemonSprite.classList.remove("hit-effect"), 300);

    setTimeout(() => {
      opponentPokemonSprite.classList.add("damage-flash");
      setTimeout(
        () => opponentPokemonSprite.classList.remove("damage-flash"),
        350,
      );
      log(`${opponentPokemon.name} took ${damage} damage!`, "#ef4444");
    }, 300);

    const newOpponentHP = Math.max(0, opponentHP - damage);
    opponentHP = newOpponentHP;

    let updatedOpponentTeam = opponentTeam;
    let opponentFainted = false;
    let nextOpponent = opponentPokemon;
    const faintedName = opponentPokemon.name;

    if (battleMode === "team") {
      updatedOpponentTeam = [...opponentTeam];
      if (updatedOpponentTeam.length) {
        updatedOpponentTeam[0] = {
          ...updatedOpponentTeam[0],
          current_hp: newOpponentHP,
        };
      }
      if (newOpponentHP <= 0) {
        opponentFainted = true;
        updatedOpponentTeam = updatedOpponentTeam.slice(1);
        nextOpponent = getActiveMon(updatedOpponentTeam);
      }
    }

    const updateData = {
      last_move: {
        by: CURRENT_USER_ID,
        move_name: move.name,
        damage: damage,
        timestamp: new Date().toISOString(),
      },
      turn_number: (room.turn_number || 0) + 1,
      turn_started_at: new Date().toISOString(),
    };

    if (isHost) {
      updateData.guest_current_hp =
        battleMode === "team"
          ? nextOpponent
            ? (nextOpponent.current_hp ?? nextOpponent.hp)
            : 0
          : newOpponentHP;
      updateData.current_turn = room.guest_id;
      if (battleMode === "team") {
        updateData.guest_pokemon = updatedOpponentTeam;
      }
    } else {
      updateData.host_current_hp =
        battleMode === "team"
          ? nextOpponent
            ? (nextOpponent.current_hp ?? nextOpponent.hp)
            : 0
          : newOpponentHP;
      updateData.current_turn = room.host_id;
      if (battleMode === "team") {
        updateData.host_pokemon = updatedOpponentTeam;
      }
    }

    await supabase.from("pvp_battle_rooms").update(updateData).eq("id", roomId);

    if (battleMode === "team") {
      opponentTeam = updatedOpponentTeam;
      opponentPokemon = nextOpponent;
      if (opponentFainted) {
        log(`${faintedName} fainted!`, "#22c55e");
        if (nextOpponent) {
          opponentHP = nextOpponent.current_hp ?? nextOpponent.hp;
          opponentMaxHP = nextOpponent.hp;
          opponentPokemonSprite.src = nextOpponent.sprite;
          opponentCardName.textContent = nextOpponent.name;
          log(`Opponent sent out ${nextOpponent.name}!`, "#3b82f6");
        }
      }
    }

    if (opponentPokemon) {
      renderCard(opponentCardInfo, opponentPokemon, opponentHP, opponentMaxHP);
    }

    if (
      battleMode === "team" ? opponentTeam.length === 0 : newOpponentHP <= 0
    ) {
      handleVictory();
    } else {
      isMyTurn = false;
      updateTurnUI();
    }
  }

  // SUBSCRIBE TO ROOM UPDATES

  function subscribeToRoom() {
    roomSubscription = supabase
      .channel(`pvp-battle-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pvp_battle_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          handleRoomUpdate(payload.new);
        },
      )
      .subscribe();
  }

  async function handleRoomUpdate(updatedRoom) {
    room = updatedRoom;

    if (battleMode === "team") {
      const hostTeam = normalizeTeam(updatedRoom.host_pokemon);
      const guestTeam = normalizeTeam(updatedRoom.guest_pokemon);

      if (isHost) {
        myTeam = hostTeam;
        opponentTeam = guestTeam;
      } else {
        myTeam = guestTeam;
        opponentTeam = hostTeam;
      }

      const nextMy = getActiveMon(myTeam);
      const nextOpp = getActiveMon(opponentTeam);

      if (!nextMy && battleActive) {
        handleDefeat();
        return;
      }

      if (!nextOpp && battleActive) {
        handleVictory();
        return;
      }

      if (nextMy && nextMy.id !== lastMyPokemonId) {
        myPokemon = nextMy;
        lastMyPokemonId = nextMy.id;
        myMaxHP = nextMy.hp;
        playerPokemonSprite.src = nextMy.sprite;
        playerCardName.textContent = nextMy.name;
        await loadMoves();
        log(`Go, ${nextMy.name}!`, "#3b82f6");
      }

      if (nextOpp && nextOpp.id !== lastOpponentPokemonId) {
        opponentPokemon = nextOpp;
        lastOpponentPokemonId = nextOpp.id;
        opponentMaxHP = nextOpp.hp;
        opponentPokemonSprite.src = nextOpp.sprite;
        opponentCardName.textContent = nextOpp.name;
        log(`Opponent sent out ${nextOpp.name}!`, "#ef4444");
      }

      myHP = nextMy.current_hp ?? nextMy.hp;
      opponentHP = nextOpp.current_hp ?? nextOpp.hp;
    } else {
      if (isHost) {
        myHP = updatedRoom.host_current_hp;
        opponentHP = updatedRoom.guest_current_hp;
      } else {
        myHP = updatedRoom.guest_current_hp;
        opponentHP = updatedRoom.host_current_hp;
      }
    }

    renderCard(playerCardInfo, myPokemon, myHP, myMaxHP);
    renderCard(opponentCardInfo, opponentPokemon, opponentHP, opponentMaxHP);

    if (updatedRoom.last_move && updatedRoom.last_move.by !== CURRENT_USER_ID) {
      processOpponentMove(updatedRoom.last_move);
    }

    if (myHP <= 0 && battleActive) {
      if (battleMode === "team") {
        return;
      }
      handleDefeat();
      return;
    }

    if (updatedRoom.current_turn === CURRENT_USER_ID && battleActive) {
      isMyTurn = true;
      updateTurnUI();
    }

    if (
      updatedRoom.status === "finished" &&
      updatedRoom.winner_id !== CURRENT_USER_ID &&
      battleActive
    ) {
      handleDefeat();
    }

    if (updatedRoom.status === "cancelled" && battleActive) {
      await handleOpponentLeft();
    }
  }

  function processOpponentMove(moveData) {
    log(`${opponentPokemon.name} used ${moveData.move_name}!`, "#ef4444");

    opponentPokemonSprite.classList.add("hit-effect");
    setTimeout(() => opponentPokemonSprite.classList.remove("hit-effect"), 300);

    setTimeout(() => {
      playerPokemonSprite.classList.add("damage-flash");
      setTimeout(
        () => playerPokemonSprite.classList.remove("damage-flash"),
        350,
      );
      log(`${myPokemon.name} took ${moveData.damage} damage!`, "#3b82f6");
    }, 300);
  }

  // TURN MANAGEMENT

  function updateTurnUI() {
    if (!battleActive) return;

    if (isMyTurn) {
      turnIndicator.className = "turn-indicator show your-turn";
      turnIndicator.querySelector(".turn-text").textContent = "YOUR TURN";
      movesContainer.style.display = "flex";
      movesContainer.style.flexDirection = "column";
      movesContainer.style.gap = "12px";
      waitingTurn.classList.remove("show");
      movesContainer
        .querySelectorAll(".move-btn")
        .forEach((b) => (b.disabled = false));
      startTurnTimer();
    } else {
      turnIndicator.className = "turn-indicator show opponent-turn";
      turnIndicator.querySelector(".turn-text").textContent = "OPPONENT'S TURN";
      movesContainer.style.display = "none";
      waitingTurn.classList.add("show");
      stopTurnTimer();
    }

    setTimeout(() => turnIndicator.classList.remove("show"), 2000);
  }

  function startTurnTimer() {
    turnTimeLeft = 30;
    turnTimerValue.textContent = turnTimeLeft;
    turnTimer.classList.remove("warning");

    turnTimerInterval = setInterval(() => {
      turnTimeLeft--;
      turnTimerValue.textContent = turnTimeLeft;

      if (turnTimeLeft <= 10) turnTimer.classList.add("warning");

      if (turnTimeLeft <= 0) {
        const randomMove = myMoves[Math.floor(Math.random() * myMoves.length)];
        executeMove(randomMove, 0);
      }
    }, 1000);
  }

  function stopTurnTimer() {
    if (turnTimerInterval) {
      clearInterval(turnTimerInterval);
      turnTimerInterval = null;
    }
  }

  // BATTLE END HANDLERS

  async function handleVictory() {
    battleActive = false;
    stopTurnTimer();

    log("🎉 " + opponentPokemon.name + " fainted!", "#22c55e");
    log("🏆 YOU WIN!", "#ffd86b");

    await supabase
      .from("pvp_battle_rooms")
      .update({
        status: "finished",
        winner_id: CURRENT_USER_ID,
        loser_id: isHost ? room.guest_id : room.host_id,
        finished_at: new Date().toISOString(),
      })
      .eq("id", roomId);

    // Calculate prize amount
    const prizeAmount = room.bet_amount * 2;

    wonAmount.textContent = prizeAmount;
    wonExp.textContent = room.exp_reward || 50;
    opponentLostPokemon.textContent =
      battleMode === "team" ? "Opponent Team" : opponentPokemon.name;

    victoryModal.classList.add("show");

    // Winner confirms themselves on-chain (loser will also confirm)
    try {
      log("Confirming winner on blockchain...", "#ffd86b");
      await confirmEscrowWinner(room.room_code, CURRENT_WALLET);
      log("Winner confirmed on-chain!", "#22c55e");
    } catch (err) {
      console.warn(
        "Winner confirmation failed (may need to confirm from notifications):",
        err,
      );
    }

    // Create notification for claiming later
    try {
      const opponentDisplayName = getDisplayName(
        isHost ? room.guest_username : room.host_username,
        isHost ? room.guest_wallet : room.host_wallet,
      );

      await createPvpWinNotification(prizeAmount, opponentDisplayName);
    } catch (err) {
      console.warn("PVP win notification failed:", err);
    }
  }

  async function handleDefeat() {
    battleActive = false;
    stopTurnTimer();

    log("💀 " + myPokemon.name + " fainted!", "#ef4444");
    log("😢 YOU LOSE...", "#ef4444");

    // Loser confirms the winner on-chain (acknowledges defeat)
    const winnerWallet = isHost ? room.guest_wallet : room.host_wallet;
    try {
      log("Acknowledging defeat on blockchain...", "#f59e0b");
      await confirmEscrowWinner(room.room_code, winnerWallet);
      log("Defeat acknowledged on-chain.", "#f59e0b");
    } catch (err) {
      console.warn("Defeat acknowledgement failed:", err);
    }

    lostAmount.textContent = room.bet_amount;
    lostPokemonSprite.src = myPokemon.sprite;
    lostPokemonName.textContent =
      battleMode === "team" ? "Your Team" : myPokemon.name;

    defeatModal.classList.add("show");
  }

  async function handleOpponentLeft() {
    battleActive = false;
    stopTurnTimer();

    log("?? Opponent disconnected!", "#f59e0b");
    log("?? You win by forfeit!", "#22c55e");

    // Calculate prize amount with fallback
    let prizeAmount = room.bet_amount * 2;
    try {
      const escrowAmount = await getEscrowPrizeAmount(room.room_code);
      if (escrowAmount > 0) {
        prizeAmount = escrowAmount;
      }
    } catch (err) {
      console.warn("Could not fetch escrow amount, using bet_amount * 2:", err);
    }

    forfeitAmount.textContent = prizeAmount;
    opponentLeftModal.classList.add("show");

    // Create notification for forfeit win
    try {
      const opponentDisplayName = getDisplayName(
        isHost ? room.guest_username : room.host_username,
        isHost ? room.guest_wallet : room.host_wallet,
      );
      await createPvpWinNotification(prizeAmount, opponentDisplayName);
    } catch (err) {
      console.warn("Forfeit notification creation failed:", err);
    }
  }

  // CLAIM VICTORY — XP + token payout (on-chain escrow only)

  if (claimVictoryBtn) {
    claimVictoryBtn.addEventListener("click", async () => {
      console.log("🎯 Claim Victory button clicked!");

      claimVictoryBtn.disabled = true;
      claimVictoryBtn.textContent = "CLAIMING...";
      showTxModal("CLAIMING REWARDS", "Processing your victory rewards...");

      try {
        const loserId = isHost ? room.guest_id : room.host_id;
        const loserPokemon = isHost ? room.guest_pokemon : room.host_pokemon;
        const loserWallet = isHost ? room.guest_wallet : room.host_wallet;
        const expReward = room.exp_reward || 50;
        const rewardAmount = room.bet_amount * 2;

        console.log("📊 Claim data:", {
          loserId,
          expReward,
          betAmount: room.bet_amount,
          rewardAmount,
          roomCode: room.room_code,
        });

        const loserTeam =
          battleMode === "team"
            ? initialOpponentTeam
            : normalizeTeam(loserPokemon);
        const winnerTeam = battleMode === "team" ? initialMyTeam : [myPokemon];

        // Step 1: Delete loser's Pokemon
        txMessage.textContent =
          battleMode === "team"
            ? "Deleting opponent's team..."
            : "Deleting opponent's Pokemon...";
        console.log("🗑️ Deleting loser team:", loserTeam);
        await deleteTeam(loserTeam);

        // Step 2: Update winner's Pokemon EXP
        txMessage.textContent =
          battleMode === "team"
            ? "Adding EXP to your team..."
            : "Adding EXP to your Pokemon...";
        console.log("✨ Awarding EXP to winner team:", winnerTeam);
        await awardExpToTeam(winnerTeam, expReward);

        // Step 3: Claim from escrow contract
        txMessage.textContent =
          "Claiming PKCHP from escrow... (Confirm in MetaMask)";
        console.log("💰 Calling claimPrize on escrow contract...");
        console.log("   Room code:", room.room_code);

        await claimEscrowPrize(room.room_code);
        console.log("✅ Prize claimed from escrow!");

        const actualPrizeAmount =
          (await getEscrowPrizeAmount(room.room_code)) || rewardAmount;

        // Step 4: Log transaction
        txMessage.textContent = "Logging transaction...";
        const opponentDisplayName = getDisplayName(
          isHost ? room.guest_username : room.host_username,
          loserWallet,
        );

        if (window.logTransaction) {
          console.log("📝 Logging transaction...");
          await window.logTransaction({
            type: "pvp_win",
            pokemon_name: myPokemon.name,
            pokemon_rarity: myPokemon.rarity,
            pokemon_sprite: myPokemon.sprite,
            pokemon_level: myPokemon.level,
            amount: actualPrizeAmount,
            currency: "PKCHP",
            opponent_name: opponentDisplayName,
            exp_gained: expReward,
          });
        }

        // Step 5: Mark the notification as claimed
        txMessage.textContent = "Finalizing...";
        try {
          await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", CURRENT_USER_ID)
            .eq("type", "pvp_win")
            .eq("room_code", room.room_code);
          console.log("✅ Notification marked as claimed");
        } catch (notifErr) {
          console.warn("Notification update error (non-critical):", notifErr);
        }

        // Step 6: Record in battle history (non-critical)
        try {
          console.log("📜 Recording battle history...");
          await supabase.from("pvp_battle_history").insert({
            room_id: roomId,
            player1_id: room.host_id,
            player2_id: room.guest_id,
            winner_id: CURRENT_USER_ID,
            loser_id: loserId,
            bet_amount: room.bet_amount,
            lost_pokemon_name: loserPokemon?.name || "Unknown",
            total_turns: room.turn_number,
          });
        } catch (historyErr) {
          console.warn(
            "Battle history insert failed (non-critical):",
            historyErr,
          );
        }

        console.log("✅ Claim successful!");
        hideTxModal();

        showRewardNotice(
          "REWARD CLAIMED",
          `You won ${actualPrizeAmount} PKCHP and ${expReward} EXP!`,
        );

        const finishAndReturn = () => {
          rewardNoticeModal.classList.remove("show");
          clearRoomData();
          window.location.href = "pvp-lobby.html";
        };

        rewardNoticeOk.onclick = finishAndReturn;
        setTimeout(finishAndReturn, 3500);
      } catch (err) {
        console.error("❌ Claim error:", err);
        hideTxModal();

        let errorMsg = err.message || "Please try again.";
        if (
          errorMsg.includes("user rejected") ||
          errorMsg.includes("User denied")
        ) {
          errorMsg = "Transaction rejected. Please try again.";
        } else if (errorMsg.includes("Battle not complete")) {
          errorMsg =
            "Battle not finalized yet. Wait for opponent to confirm or try from Notifications.";
        } else if (errorMsg.includes("Only winner can claim")) {
          errorMsg = "Only the winner can claim the prize.";
        }

        alert("Claim failed: " + errorMsg);
        claimVictoryBtn.disabled = false;
        claimVictoryBtn.textContent = "CLAIM REWARDS";
      }
    });
  } else {
    console.error("❌ claimVictoryBtn not found in DOM!");
  }

  // RETURN AFTER DEFEAT - escrow holds funds for winner

  returnBtn.addEventListener("click", async () => {
    returnBtn.disabled = true;
    showTxModal("PROCESSING", "Finalizing battle...");

    try {
      const losingTeam = battleMode === "team" ? initialMyTeam : [myPokemon];
      // Step 1: Delete the lost Pokemon
      txMessage.textContent =
        battleMode === "team"
          ? "Removing your team..."
          : "Removing your Pokemon...";
      await deleteTeam(losingTeam);

      // Step 2: Log transaction
      txMessage.textContent = "Recording battle...";
      const winnerDisplayName = getDisplayName(
        isHost ? room.guest_username : room.host_username,
        isHost ? room.guest_wallet : room.host_wallet,
      );

      if (window.logTransaction) {
        await window.logTransaction({
          type: "pvp_loss",
          pokemon_name: myPokemon.name,
          pokemon_rarity: myPokemon.rarity,
          pokemon_sprite: myPokemon.sprite,
          pokemon_level: myPokemon.level,
          amount: room.bet_amount,
          currency: "PKCHP",
          opponent_name: winnerDisplayName,
        });
      }

      hideTxModal();
      clearRoomData();
      window.location.href = "pvp-lobby.html";
    } catch (err) {
      console.error("Return error:", err);
      hideTxModal();
      clearRoomData();
      window.location.href = "pvp-lobby.html";
    }
  });

  // CLAIM FORFEIT — opponent left mid-match (on-chain escrow only)

  claimForfeitBtn.addEventListener("click", async () => {
    claimForfeitBtn.disabled = true;
    claimForfeitBtn.textContent = "CLAIMING...";
    showTxModal("CLAIMING FORFEIT", "Processing forfeit rewards...");

    try {
      console.log("🎯 Claim Forfeit button clicked!");
      console.log("   Room code:", room.room_code);
      console.log("   Winner wallet:", CURRENT_WALLET);

      const rewardAmount = room.bet_amount * 2;

      // Step 1: Confirm winner on blockchain (opponent forfeited)
      txMessage.textContent = "Confirming forfeit win... (Confirm in MetaMask)";
      console.log("🔗 Calling confirmWinner on escrow contract...");

      try {
        await confirmEscrowWinner(room.room_code, CURRENT_WALLET);
        console.log("✅ Winner confirmed on blockchain!");
      } catch (confirmErr) {
        // May already be confirmed or can use timeout claim
        console.warn("Confirm error (may need timeout claim):", confirmErr);
      }

      // Step 2: Claim prize from escrow
      txMessage.textContent =
        "Claiming PKCHP from escrow... (Confirm in MetaMask)";
      console.log("💰 Calling claimPrize on escrow contract...");

      await claimEscrowPrize(room.room_code);
      console.log("✅ Prize claimed from escrow!");

      const actualPrizeAmount =
        (await getEscrowPrizeAmount(room.room_code)) || rewardAmount;

      // Step 3: Log forfeit win
      txMessage.textContent = "Logging transaction...";
      const opponentDisplayName = getDisplayName(
        isHost ? room.guest_username : room.host_username,
        isHost ? room.guest_wallet : room.host_wallet,
      );

      if (window.logTransaction) {
        await window.logTransaction({
          type: "pvp_win",
          pokemon_name: myPokemon.name,
          pokemon_rarity: myPokemon.rarity,
          pokemon_sprite: myPokemon.sprite,
          pokemon_level: myPokemon.level,
          amount: actualPrizeAmount,
          currency: "PKCHP",
          opponent_name: opponentDisplayName,
          exp_gained: 0,
        });
      }

      // Step 4: Mark notification as claimed
      txMessage.textContent = "Finalizing...";
      try {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", CURRENT_USER_ID)
          .eq("type", "pvp_win")
          .eq("room_code", room.room_code);
        console.log("✅ Notification marked as claimed");
      } catch (notifErr) {
        console.warn("Notification update error (non-critical):", notifErr);
      }

      console.log("✅ Forfeit claim successful!");
      hideTxModal();

      showRewardNotice(
        "FORFEIT CLAIMED",
        `You won ${actualPrizeAmount} PKCHP by forfeit!`,
      );

      const finishAndReturn = () => {
        rewardNoticeModal.classList.remove("show");
        clearRoomData();
        window.location.href = "pvp-lobby.html";
      };

      rewardNoticeOk.onclick = finishAndReturn;
      setTimeout(finishAndReturn, 3500);
    } catch (err) {
      console.error("❌ Forfeit claim error:", err);
      hideTxModal();

      let errorMsg = err.message || "Please try again.";
      if (
        errorMsg.includes("user rejected") ||
        errorMsg.includes("User denied")
      ) {
        errorMsg = "Transaction rejected. Please try again.";
      } else if (errorMsg.includes("Battle not complete")) {
        errorMsg =
          "Battle not finalized. Wait for timeout or try from Notifications.";
      }

      alert("Forfeit claim failed: " + errorMsg);
      claimForfeitBtn.disabled = false;
      claimForfeitBtn.textContent = "CLAIM FORFEIT";
    }
  });

  // UTILITY

  function log(message, color = "#fff") {
    const p = document.createElement("p");
    p.innerHTML = message;
    p.style.borderLeftColor = color;
    battleLog.appendChild(p);
    battleLog.scrollTop = battleLog.scrollHeight;
  }

  function showTxModal(title, message) {
    txTitle.textContent = title;
    txMessage.textContent = message;
    txModal.classList.add("show");
  }

  function hideTxModal() {
    txModal.classList.remove("show");
  }

  function showRewardNotice(title, message) {
    rewardNoticeTitle.textContent = title;
    rewardNoticeMessage.textContent = message;
    rewardNoticeModal.classList.add("show");
  }

  function clearRoomData() {
    localStorage.removeItem("PVP_ROOM_ID");
    localStorage.removeItem("PVP_ROOM_CODE");
    localStorage.removeItem("PVP_IS_HOST");
    localStorage.removeItem("PVP_BATTLE_MODE");
  }

  window.addEventListener("beforeunload", () => {
    if (roomSubscription) roomSubscription.unsubscribe();
    stopTurnTimer();
  });

  await init();
});
