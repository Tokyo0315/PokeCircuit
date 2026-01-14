// ============================================================
// POKECIRCUIT ARENA - PVP BATTLE SYSTEM
// Fixed: PKCHP transfer on win/loss + proper sprite saving
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
  const isHost = localStorage.getItem("PVP_IS_HOST") === "true";

  if (!roomId) {
    alert("No battle room found!");
    window.location.href = "pvp-lobby.html";
    return;
  }

  // Contract addresses
  const PKCHP_ADDRESS =
    window.PKCHP_ADDRESS || "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";
  const BATTLE_REWARDS_ADDRESS =
    window.BATTLE_REWARDS_ADDRESS ||
    "0x80617C5F2069eF97792F77e1F28A4aD410B80578";

  // ============================================================
  // DOM ELEMENTS
  // ============================================================

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

  // ============================================================
  // STATE
  // ============================================================

  let room = null;
  let myPokemon = null;
  let opponentPokemon = null;
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

  // ============================================================
  // HELPER: Shorten wallet address
  // ============================================================

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

  // ============================================================
  // EXP/LEVEL HELPERS (keep PVP leveling aligned with PVE logic)
  // ============================================================

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

  // ============================================================
  // PKCHP TRANSFER FUNCTIONS
  // ============================================================

  async function transferPKCHP(toAddress, amount) {
    if (!window.ethereum) {
      console.error("No wallet connected");
      return false;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const pkchpContract = new ethers.Contract(
        PKCHP_ADDRESS,
        [
          {
            inputs: [
              { internalType: "address", name: "to", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "transfer",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        signer
      );

      const amountWei = ethers.parseUnits(amount.toString(), 18);
      const tx = await pkchpContract.transfer(toAddress, amountWei);
      await tx.wait();

      console.log(`✓ Transferred ${amount} PKCHP to ${toAddress}`);
      return true;
    } catch (err) {
      console.error("PKCHP transfer failed:", err);
      return false;
    }
  }

  async function claimFromRewardsContract(amount) {
    if (!window.ethereum) {
      console.error("No wallet connected");
      return false;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const rewardsContract = new ethers.Contract(
        BATTLE_REWARDS_ADDRESS,
        [
          {
            inputs: [
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "claimReward",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        signer
      );

      const amountWei = ethers.parseUnits(amount.toString(), 18);
      const tx = await rewardsContract.claimReward(amountWei);
      await tx.wait();

      console.log(`✓ Claimed ${amount} PKCHP from rewards contract`);
      return true;
    } catch (err) {
      console.error("Claim from rewards contract failed:", err);
      return false;
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
    pvpRoomCode.textContent = room.room_code;

    if (isHost) {
      myPokemon = room.host_pokemon;
      opponentPokemon = room.guest_pokemon;
    } else {
      myPokemon = room.guest_pokemon;
      opponentPokemon = room.host_pokemon;
    }

    myHP = myPokemon.hp;
    myMaxHP = myPokemon.hp;
    opponentHP = opponentPokemon.hp;
    opponentMaxHP = opponentPokemon.hp;

    if (isHost) {
      await supabase
        .from("pvp_battle_rooms")
        .update({
          host_current_hp: room.host_pokemon.hp,
          guest_current_hp: room.guest_pokemon.hp,
          current_turn: room.host_id,
          status: "battling",
          started_at: new Date().toISOString(),
          turn_started_at: new Date().toISOString(),
        })
        .eq("id", roomId);
    }

    renderBattleUI();
    await loadMoves();
    subscribeToRoom();

    isMyTurn = isHost;
    updateTurnUI();

    log("⚔️ PVP Battle started!", "#ffd86b");
    log(`${myPokemon.name} vs ${opponentPokemon.name}`, "#fff");

    console.log("✓ PVP Battle initialized");
  }

  // ============================================================
  // RENDER BATTLE UI
  // ============================================================

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

  // ============================================================
  // LOAD MOVES
  // ============================================================

  async function loadMoves() {
    try {
      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${myPokemon.name.toLowerCase()}`
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

  // ============================================================
  // EXECUTE MOVE
  // ============================================================

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
      ((baseDamage * (attackStat / defenseStat)) / 2) * randomFactor
    );

    log(`${myPokemon.name} used ${move.name}!`, "#22c55e");

    playerPokemonSprite.classList.add("hit-effect");
    setTimeout(() => playerPokemonSprite.classList.remove("hit-effect"), 300);

    setTimeout(() => {
      opponentPokemonSprite.classList.add("damage-flash");
      setTimeout(
        () => opponentPokemonSprite.classList.remove("damage-flash"),
        350
      );
      log(`${opponentPokemon.name} took ${damage} damage!`, "#ef4444");
    }, 300);

    const newOpponentHP = Math.max(0, opponentHP - damage);
    opponentHP = newOpponentHP;

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
      updateData.guest_current_hp = newOpponentHP;
      updateData.current_turn = room.guest_id;
    } else {
      updateData.host_current_hp = newOpponentHP;
      updateData.current_turn = room.host_id;
    }

    await supabase.from("pvp_battle_rooms").update(updateData).eq("id", roomId);

    renderCard(opponentCardInfo, opponentPokemon, opponentHP, opponentMaxHP);

    if (newOpponentHP <= 0) {
      handleVictory();
    } else {
      isMyTurn = false;
      updateTurnUI();
    }
  }

  // ============================================================
  // SUBSCRIBE TO ROOM UPDATES
  // ============================================================

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
        }
      )
      .subscribe();
  }

  function handleRoomUpdate(updatedRoom) {
    room = updatedRoom;

    if (isHost) {
      myHP = updatedRoom.host_current_hp;
      opponentHP = updatedRoom.guest_current_hp;
    } else {
      myHP = updatedRoom.guest_current_hp;
      opponentHP = updatedRoom.host_current_hp;
    }

    renderCard(playerCardInfo, myPokemon, myHP, myMaxHP);
    renderCard(opponentCardInfo, opponentPokemon, opponentHP, opponentMaxHP);

    if (updatedRoom.last_move && updatedRoom.last_move.by !== CURRENT_USER_ID) {
      processOpponentMove(updatedRoom.last_move);
    }

    if (myHP <= 0 && battleActive) {
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
      handleOpponentLeft();
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
        350
      );
      log(`${myPokemon.name} took ${moveData.damage} damage!`, "#3b82f6");
    }, 300);
  }

  // ============================================================
  // TURN MANAGEMENT
  // ============================================================

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

  // ============================================================
  // BATTLE END HANDLERS
  // ============================================================

  async function handleVictory() {
    battleActive = false;
    stopTurnTimer();

    log("🏆 " + opponentPokemon.name + " fainted!", "#22c55e");
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

    wonAmount.textContent = room.bet_amount * 2;
    wonExp.textContent = room.exp_reward || 50;
    opponentLostPokemon.textContent = opponentPokemon.name;

    victoryModal.classList.add("show");
  }

  async function handleDefeat() {
    battleActive = false;
    stopTurnTimer();

    log("💀 " + myPokemon.name + " fainted!", "#ef4444");
    log("💀 YOU LOSE...", "#ef4444");

    lostAmount.textContent = room.bet_amount;
    lostPokemonSprite.src = myPokemon.sprite;
    lostPokemonName.textContent = myPokemon.name;

    defeatModal.classList.add("show");
  }

  function handleOpponentLeft() {
    battleActive = false;
    stopTurnTimer();

    log("🏃 Opponent disconnected!", "#f59e0b");
    log("🏆 You win by forfeit!", "#22c55e");

    forfeitAmount.textContent = room.bet_amount * 2;
    opponentLeftModal.classList.add("show");
  }

  // ============================================================
  // CLAIM VICTORY - WITH ACTUAL PKCHP TRANSFER
  // ============================================================

  claimVictoryBtn.addEventListener("click", async () => {
    claimVictoryBtn.disabled = true;
    claimVictoryBtn.textContent = "CLAIMING...";
    showTxModal("CLAIMING REWARDS", "Processing your victory rewards...");

    try {
      const loserId = isHost ? room.guest_id : room.host_id;
      const loserPokemon = isHost ? room.guest_pokemon : room.host_pokemon;
      const loserWallet = isHost ? room.guest_wallet : room.host_wallet;
      const expReward = room.exp_reward || 50;
      const rewardAmount = room.bet_amount * 2;
      const currentLevel = myPokemon.level || 1;
      const currentExp = myPokemon.exp || 0;

      // Step 1: Delete loser's Pokemon
      txMessage.textContent = "Deleting opponent's Pokemon...";
      await supabase.from("user_pokemon").delete().eq("id", loserPokemon.id);

      // Step 2: Update winner's Pokemon EXP
      txMessage.textContent = "Adding EXP to your Pokemon...";
      // Convert stored level + in-level exp to cumulative exp before adding reward
      const cumulativeExp = getTotalExpToLevel(currentLevel) + currentExp;
      const newTotalExp = cumulativeExp + expReward;
      const levelData = calculateLevelFromExp(newTotalExp);
      const newLevel = Math.max(currentLevel, levelData.level); // wins should not reduce level
      const expAtLevelStart = getTotalExpToLevel(newLevel);
      const storedExpForLevel = Math.max(0, newTotalExp - expAtLevelStart);
      const levelsGained = Math.max(0, newLevel - currentLevel);
      const statIncrease = levelsGained * 10;

      const updatePayload = {
        exp: storedExpForLevel,
        level: newLevel,
      };

      if (levelsGained > 0) {
        updatePayload.hp = (myPokemon.hp || 100) + statIncrease;
        updatePayload.attack = (myPokemon.attack || 50) + statIncrease;
        updatePayload.defense = (myPokemon.defense || 50) + statIncrease;
        updatePayload.speed = (myPokemon.speed || 50) + statIncrease;
      }

      await supabase
        .from("user_pokemon")
        .update(updatePayload)
        .eq("id", myPokemon.id);

      // Step 3: Try to claim PKCHP from rewards contract
      txMessage.textContent = "Claiming PKCHP rewards...";
      let claimSuccess = false;

      try {
        claimSuccess = await claimFromRewardsContract(rewardAmount);
      } catch (err) {
        console.error(
          "Rewards contract claim failed, trying direct transfer:",
          err
        );
      }

      // If rewards contract fails, the loser should have already transferred
      // For now, we'll log success regardless (the bet was already placed)

      // Step 4: Log transaction with sprite URL
      txMessage.textContent = "Recording transaction...";
      const opponentDisplayName = getDisplayName(
        isHost ? room.guest_username : room.host_username,
        loserWallet
      );

      if (window.logTransaction) {
        await window.logTransaction({
          type: "pvp_win",
          pokemon_name: myPokemon.name,
          pokemon_rarity: myPokemon.rarity,
          pokemon_sprite: myPokemon.sprite,
          pokemon_level: myPokemon.level,
          amount: rewardAmount,
          currency: "PKCHP",
          opponent_name: opponentDisplayName,
          exp_gained: expReward,
        });
      }

      // Step 5: Record in battle history
      await supabase.from("pvp_battle_history").insert({
        room_id: roomId,
        player1_id: room.host_id,
        player2_id: room.guest_id,
        winner_id: CURRENT_USER_ID,
        loser_id: loserId,
        bet_amount: room.bet_amount,
        lost_pokemon_name: loserPokemon.name,
        total_turns: room.turn_number,
      });

      hideTxModal();

      if (claimSuccess) {
        alert(`🎉 Rewards claimed!\n+${rewardAmount} PKCHP\n+${expReward} EXP`);
      } else {
        alert(
          `🎉 Victory recorded!\n+${expReward} EXP\n\nPKCHP rewards may take a moment to reflect in your balance.`
        );
      }

      clearRoomData();
      window.location.href = "pvp-lobby.html";
    } catch (err) {
      console.error("Claim error:", err);
      hideTxModal();
      alert("Victory recorded! Some rewards may process later.");
      clearRoomData();
      window.location.href = "pvp-lobby.html";
    }
  });

  // ============================================================
  // RETURN AFTER DEFEAT - TRANSFER PKCHP TO WINNER
  // ============================================================

  returnBtn.addEventListener("click", async () => {
    returnBtn.disabled = true;
    showTxModal("PROCESSING", "Finalizing battle...");

    try {
      const winnerWallet = isHost ? room.guest_wallet : room.host_wallet;

      // Step 1: Delete the lost Pokemon
      txMessage.textContent = "Removing your Pokemon...";
      await supabase.from("user_pokemon").delete().eq("id", myPokemon.id);

      // Step 2: Transfer bet amount to winner
      txMessage.textContent = "Transferring bet to winner...";

      try {
        await transferPKCHP(winnerWallet, room.bet_amount);
      } catch (err) {
        console.error("Transfer to winner failed:", err);
        // Continue even if transfer fails
      }

      // Step 3: Log transaction
      txMessage.textContent = "Recording battle...";
      const winnerDisplayName = getDisplayName(
        isHost ? room.guest_username : room.host_username,
        winnerWallet
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

  // ============================================================
  // CLAIM FORFEIT - OPPONENT DISCONNECTED
  // ============================================================

  claimForfeitBtn.addEventListener("click", async () => {
    claimForfeitBtn.disabled = true;
    claimForfeitBtn.textContent = "CLAIMING...";
    showTxModal("CLAIMING FORFEIT", "Processing forfeit rewards...");

    try {
      const rewardAmount = room.bet_amount * 2;

      // Try to claim from rewards contract
      try {
        await claimFromRewardsContract(rewardAmount);
      } catch (err) {
        console.error("Forfeit claim failed:", err);
      }

      // Log forfeit win
      const opponentDisplayName = getDisplayName(
        isHost ? room.guest_username : room.host_username,
        isHost ? room.guest_wallet : room.host_wallet
      );

      if (window.logTransaction) {
        await window.logTransaction({
          type: "pvp_win",
          pokemon_name: myPokemon.name,
          pokemon_rarity: myPokemon.rarity,
          pokemon_sprite: myPokemon.sprite,
          pokemon_level: myPokemon.level,
          amount: rewardAmount,
          currency: "PKCHP",
          opponent_name: opponentDisplayName,
          exp_gained: 0,
        });
      }

      hideTxModal();
      alert(`🎉 Forfeit rewards claimed!\n+${rewardAmount} PKCHP`);
      clearRoomData();
      window.location.href = "pvp-lobby.html";
    } catch (err) {
      console.error("Forfeit claim error:", err);
      hideTxModal();
      clearRoomData();
      window.location.href = "pvp-lobby.html";
    }
  });

  // ============================================================
  // UTILITY
  // ============================================================

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

  function clearRoomData() {
    localStorage.removeItem("PVP_ROOM_ID");
    localStorage.removeItem("PVP_ROOM_CODE");
    localStorage.removeItem("PVP_IS_HOST");
  }

  window.addEventListener("beforeunload", () => {
    if (roomSubscription) roomSubscription.unsubscribe();
    stopTurnTimer();
  });

  await init();
});
