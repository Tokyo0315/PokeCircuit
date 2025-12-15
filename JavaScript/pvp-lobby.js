// ============================================================
// POKECIRCUIT ARENA - PVP LOBBY SYSTEM
// With Escrow-based Pre-paid Betting
// Both players deposit PKCHP upfront, winner gets both
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

  // Contract addresses
  const PKCHP_ADDRESS =
    window.PKCHP_ADDRESS || "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";
  const PVP_ESCROW_ADDRESS =
    window.PVP_ESCROW_ADDRESS || "0xD0f6fD85dC0B869cD999929989bECC5b115377D1"; // TODO: Add after deployment

  // Contract ABIs
  const PKCHP_ABI = [
    {
      inputs: [
        { internalType: "address", name: "spender", type: "address" },
        { internalType: "uint256", name: "amount", type: "uint256" },
      ],
      name: "approve",
      outputs: [{ internalType: "bool", name: "", type: "bool" }],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [
        { internalType: "address", name: "owner", type: "address" },
        { internalType: "address", name: "spender", type: "address" },
      ],
      name: "allowance",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [{ internalType: "address", name: "account", type: "address" }],
      name: "balanceOf",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function",
    },
    {
      inputs: [],
      name: "decimals",
      outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
      stateMutability: "view",
      type: "function",
    },
  ];

  const PVP_ESCROW_ABI = [
    {
      inputs: [
        { internalType: "string", name: "_roomCode", type: "string" },
        { internalType: "uint256", name: "_betAmount", type: "uint256" },
      ],
      name: "createRoom",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "string", name: "_roomCode", type: "string" }],
      name: "joinRoom",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "string", name: "_roomCode", type: "string" }],
      name: "cancelRoom",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      inputs: [{ internalType: "string", name: "_roomCode", type: "string" }],
      name: "getRoom",
      outputs: [
        { internalType: "address", name: "host", type: "address" },
        { internalType: "address", name: "guest", type: "address" },
        { internalType: "uint256", name: "betAmount", type: "uint256" },
        { internalType: "bool", name: "hostDeposited", type: "bool" },
        { internalType: "bool", name: "guestDeposited", type: "bool" },
        { internalType: "bool", name: "isActive", type: "bool" },
        { internalType: "bool", name: "isFinished", type: "bool" },
        { internalType: "address", name: "winner", type: "address" },
      ],
      stateMutability: "view",
      type: "function",
    },
  ];

  // ============================================================
  // DOM ELEMENTS
  // ============================================================

  const createBetOptions = document.getElementById("createBetOptions");
  const createRoomBtn = document.getElementById("createRoomBtn");

  const roomCodeInput = document.getElementById("roomCodeInput");
  const joinRoomBtn = document.getElementById("joinRoomBtn");

  const roomCreatedModal = document.getElementById("roomCreatedModal");
  const displayRoomCode = document.getElementById("displayRoomCode");
  const displayBetAmount = document.getElementById("displayBetAmount");
  const copyCodeBtn = document.getElementById("copyCodeBtn");
  const cancelRoomBtn = document.getElementById("cancelRoomBtn");

  const joiningModal = document.getElementById("joiningModal");
  const joiningMessage = document.getElementById("joiningMessage");

  const confirmJoinModal = document.getElementById("confirmJoinModal");
  const opponentName = document.getElementById("opponentName");
  const opponentWallet = document.getElementById("opponentWallet");
  const confirmBetAmount = document.getElementById("confirmBetAmount");
  const declineJoinBtn = document.getElementById("declineJoinBtn");
  const acceptJoinBtn = document.getElementById("acceptJoinBtn");

  const errorModal = document.getElementById("errorModal");
  const errorMessage = document.getElementById("errorMessage");
  const errorOkBtn = document.getElementById("errorOkBtn");

  // ============================================================
  // STATE
  // ============================================================

  let selectedBet = null;
  let currentRoomId = null;
  let currentRoomCode = null;
  let roomSubscription = null;
  let pendingRoom = null;
  let pkchpBalance = 0;

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function showModal(modal) {
    modal.classList.add("show");
  }

  function hideModal(modal) {
    modal.classList.remove("show");
  }

  function showError(message) {
    errorMessage.textContent = message;
    showModal(errorModal);
  }

  function shortenWallet(wallet) {
    if (!wallet) return "Unknown";
    if (wallet.length <= 13) return wallet;
    return wallet.slice(0, 6) + "..." + wallet.slice(-4);
  }

  function getDisplayName(username, wallet) {
    if (username && username !== "Trainer" && username.length > 0) {
      if (username.length > 15) {
        return username.slice(0, 12) + "...";
      }
      return username;
    }
    return shortenWallet(wallet);
  }

  // ============================================================
  // LOAD BALANCE
  // ============================================================

  async function loadBalance() {
    try {
      const wallet = CURRENT_WALLET;
      if (!wallet || !window.ethereum) {
        pkchpBalance = 0;
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(PKCHP_ADDRESS, PKCHP_ABI, provider);

      const raw = await contract.balanceOf(wallet);
      const dec = await contract.decimals();
      pkchpBalance = Math.floor(Number(ethers.formatUnits(raw, dec)));
    } catch (err) {
      console.error("Balance load error:", err);
      pkchpBalance = 0;
    }

    document.querySelectorAll(".pc-pokechip-amount").forEach((el) => {
      el.textContent = pkchpBalance.toLocaleString();
    });
  }

  // ============================================================
  // APPROVE PKCHP FOR ESCROW CONTRACT
  // ============================================================

  async function approveEscrow(amount) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS) return true;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const pkchpContract = new ethers.Contract(
        PKCHP_ADDRESS,
        PKCHP_ABI,
        signer
      );

      const currentAllowance = await pkchpContract.allowance(
        CURRENT_WALLET,
        PVP_ESCROW_ADDRESS
      );
      const amountWei = ethers.parseUnits(amount.toString(), 18);

      if (currentAllowance >= amountWei) {
        console.log("Already approved");
        return true;
      }

      const tx = await pkchpContract.approve(PVP_ESCROW_ADDRESS, amountWei);
      await tx.wait();
      console.log("✓ PKCHP approved for escrow");
      return true;
    } catch (err) {
      console.error("Approve failed:", err);
      return false;
    }
  }

  // ============================================================
  // DEPOSIT TO ESCROW (CREATE ROOM)
  // ============================================================

  async function depositToEscrow(roomCode, amount) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS) {
      console.log("Escrow not configured, using database-only mode");
      return true;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        signer
      );

      const tx = await escrowContract.createRoom(roomCode, amount);
      await tx.wait();
      console.log("✓ Deposited to escrow for room:", roomCode);
      return true;
    } catch (err) {
      console.error("Escrow deposit failed:", err);
      throw err;
    }
  }

  // ============================================================
  // JOIN ESCROW ROOM
  // ============================================================

  async function joinEscrowRoom(roomCode) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS) {
      console.log("Escrow not configured, using database-only mode");
      return true;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        signer
      );

      const tx = await escrowContract.joinRoom(roomCode);
      await tx.wait();
      console.log("✓ Joined escrow room:", roomCode);
      return true;
    } catch (err) {
      console.error("Escrow join failed:", err);
      throw err;
    }
  }

  // ============================================================
  // CANCEL ESCROW ROOM (REFUND)
  // ============================================================

  async function cancelEscrowRoom(roomCode) {
    if (!window.ethereum || !PVP_ESCROW_ADDRESS) return true;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(
        PVP_ESCROW_ADDRESS,
        PVP_ESCROW_ABI,
        signer
      );

      const tx = await escrowContract.cancelRoom(roomCode);
      await tx.wait();
      console.log("✓ Cancelled escrow room, refund issued");
      return true;
    } catch (err) {
      console.error("Escrow cancel failed:", err);
      return false;
    }
  }

  // ============================================================
  // BET SELECTION
  // ============================================================

  createBetOptions.addEventListener("click", (e) => {
    const btn = e.target.closest(".bet-btn");
    if (!btn) return;

    createBetOptions
      .querySelectorAll(".bet-btn")
      .forEach((b) => b.classList.remove("selected"));

    btn.classList.add("selected");
    selectedBet = parseInt(btn.dataset.bet);

    if (pkchpBalance < selectedBet) {
      showError(
        `Insufficient PKCHP! You need ${selectedBet} PKCHP but only have ${pkchpBalance}.`
      );
      btn.classList.remove("selected");
      selectedBet = null;
      createRoomBtn.disabled = true;
      return;
    }

    createRoomBtn.disabled = false;
  });

  // ============================================================
  // ROOM CODE INPUT
  // ============================================================

  roomCodeInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    joinRoomBtn.disabled = e.target.value.length !== 5;
  });

  // ============================================================
  // CREATE ROOM - WITH ESCROW DEPOSIT
  // ============================================================

  createRoomBtn.addEventListener("click", async () => {
    if (!selectedBet) {
      showError("Please select a bet amount!");
      return;
    }

    createRoomBtn.disabled = true;
    createRoomBtn.innerHTML = '<span class="btn-icon">⏳</span> APPROVING...';

    try {
      // Step 1: Approve PKCHP for escrow
      if (PVP_ESCROW_ADDRESS) {
        const approved = await approveEscrow(selectedBet);
        if (!approved) {
          throw new Error("Failed to approve PKCHP spending");
        }
      }

      createRoomBtn.innerHTML =
        '<span class="btn-icon">⏳</span> DEPOSITING...';

      // Generate unique room code
      let roomCode = generateRoomCode();
      let attempts = 0;

      while (attempts < 10) {
        const { data: existing } = await supabase
          .from("pvp_battle_rooms")
          .select("id")
          .eq("room_code", roomCode)
          .eq("status", "waiting")
          .single();

        if (!existing) break;
        roomCode = generateRoomCode();
        attempts++;
      }

      // Step 2: Deposit to escrow contract
      if (PVP_ESCROW_ADDRESS) {
        await depositToEscrow(roomCode, selectedBet);
      }

      createRoomBtn.innerHTML =
        '<span class="btn-icon">⏳</span> CREATING ROOM...';

      // Step 3: Create room in database
      const { data: userData } = await supabase
        .from("users")
        .select("username")
        .eq("id", CURRENT_USER_ID)
        .single();

      const displayName = getDisplayName(userData?.username, CURRENT_WALLET);

      const { data: room, error } = await supabase
        .from("pvp_battle_rooms")
        .insert({
          room_code: roomCode,
          host_id: CURRENT_USER_ID,
          host_wallet: CURRENT_WALLET,
          host_username: displayName,
          bet_amount: selectedBet,
          exp_reward: Math.floor(selectedBet / 2) + 25,
          status: "waiting",
        })
        .select()
        .single();

      if (error) throw error;

      currentRoomId = room.id;
      currentRoomCode = roomCode;

      displayRoomCode.textContent = roomCode;
      displayBetAmount.textContent = `${selectedBet} PKCHP`;
      showModal(roomCreatedModal);

      // Log the deposit transaction
      if (window.logTransaction) {
        await window.logTransaction({
          type: "pvp_bet",
          amount: -selectedBet,
          currency: "PKCHP",
          metadata: { room_code: roomCode, action: "create" },
        });
      }

      subscribeToRoom(room.id);

      // Refresh balance
      await loadBalance();
    } catch (err) {
      console.error("Create room error:", err);
      showError("Failed to create room: " + err.message);
    }

    createRoomBtn.disabled = false;
    createRoomBtn.innerHTML =
      '<span class="btn-icon">⚡</span> CREATE BATTLE ROOM';
  });

  // ============================================================
  // SUBSCRIBE TO ROOM UPDATES
  // ============================================================

  function subscribeToRoom(roomId) {
    if (roomSubscription) {
      roomSubscription.unsubscribe();
    }

    roomSubscription = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pvp_battle_rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          console.log("Room updated:", payload.new);
          handleRoomUpdate(payload.new);
        }
      )
      .subscribe();
  }

  function handleRoomUpdate(room) {
    if (room.guest_id && room.status === "waiting") {
      console.log("Guest joined! Redirecting to Pokemon selection...");
      hideModal(roomCreatedModal);

      localStorage.setItem("PVP_ROOM_ID", room.id);
      localStorage.setItem("PVP_ROOM_CODE", room.room_code);
      localStorage.setItem("PVP_IS_HOST", "true");

      window.location.href = "pvp-select.html";
    }

    if (room.status === "cancelled") {
      hideModal(roomCreatedModal);
      showError("Room was cancelled.");
      cleanupSubscription();
    }
  }

  // ============================================================
  // COPY ROOM CODE
  // ============================================================

  copyCodeBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      copyCodeBtn.textContent = "✓";
      setTimeout(() => {
        copyCodeBtn.textContent = "📋";
      }, 2000);
    } catch (err) {
      const input = document.createElement("input");
      input.value = currentRoomCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      copyCodeBtn.textContent = "✓";
      setTimeout(() => {
        copyCodeBtn.textContent = "📋";
      }, 2000);
    }
  });

  // ============================================================
  // CANCEL ROOM - WITH ESCROW REFUND
  // ============================================================

  cancelRoomBtn.addEventListener("click", async () => {
    if (!currentRoomId) return;

    cancelRoomBtn.disabled = true;
    cancelRoomBtn.textContent = "CANCELLING...";

    try {
      // Cancel escrow and get refund
      if (PVP_ESCROW_ADDRESS && currentRoomCode) {
        await cancelEscrowRoom(currentRoomCode);
      }

      // Update database
      await supabase
        .from("pvp_battle_rooms")
        .update({ status: "cancelled" })
        .eq("id", currentRoomId);

      cleanupSubscription();
      hideModal(roomCreatedModal);

      // Refresh balance
      await loadBalance();

      currentRoomId = null;
      currentRoomCode = null;
    } catch (err) {
      console.error("Cancel room error:", err);
      showError("Failed to cancel: " + err.message);
    }

    cancelRoomBtn.disabled = false;
    cancelRoomBtn.textContent = "❌ CANCEL ROOM";
  });

  // ============================================================
  // JOIN ROOM
  // ============================================================

  joinRoomBtn.addEventListener("click", async () => {
    const code = roomCodeInput.value.toUpperCase().trim();

    if (code.length !== 5) {
      showError("Please enter a valid 5-character room code.");
      return;
    }

    joinRoomBtn.disabled = true;
    showModal(joiningModal);
    joiningMessage.textContent = "Looking for room...";

    try {
      const { data: room, error } = await supabase
        .from("pvp_battle_rooms")
        .select("*")
        .eq("room_code", code)
        .eq("status", "waiting")
        .is("guest_id", null)
        .single();

      if (error || !room) {
        hideModal(joiningModal);
        showError(
          "Room not found or already full. Check the code and try again."
        );
        joinRoomBtn.disabled = false;
        return;
      }

      if (room.host_id === CURRENT_USER_ID) {
        hideModal(joiningModal);
        showError("You can't join your own room!");
        joinRoomBtn.disabled = false;
        return;
      }

      if (pkchpBalance < room.bet_amount) {
        hideModal(joiningModal);
        showError(
          `Insufficient PKCHP! This room requires ${room.bet_amount} PKCHP but you only have ${pkchpBalance}.`
        );
        joinRoomBtn.disabled = false;
        return;
      }

      hideModal(joiningModal);
      pendingRoom = room;

      opponentName.textContent = getDisplayName(
        room.host_username,
        room.host_wallet
      );
      opponentWallet.textContent = shortenWallet(room.host_wallet);
      confirmBetAmount.textContent = `${room.bet_amount} PKCHP`;

      showModal(confirmJoinModal);
    } catch (err) {
      console.error("Join room error:", err);
      hideModal(joiningModal);
      showError("Failed to join room: " + err.message);
    }

    joinRoomBtn.disabled = false;
  });

  // ============================================================
  // CONFIRM/DECLINE JOIN
  // ============================================================

  declineJoinBtn.addEventListener("click", () => {
    hideModal(confirmJoinModal);
    pendingRoom = null;
    roomCodeInput.value = "";
    joinRoomBtn.disabled = true;
  });

  // ============================================================
  // ACCEPT JOIN - WITH ESCROW DEPOSIT
  // ============================================================

  acceptJoinBtn.addEventListener("click", async () => {
    if (!pendingRoom) return;

    acceptJoinBtn.disabled = true;
    acceptJoinBtn.textContent = "APPROVING...";

    try {
      // Step 1: Approve PKCHP for escrow
      if (PVP_ESCROW_ADDRESS) {
        const approved = await approveEscrow(pendingRoom.bet_amount);
        if (!approved) {
          throw new Error("Failed to approve PKCHP spending");
        }
      }

      acceptJoinBtn.textContent = "DEPOSITING...";

      // Step 2: Deposit to escrow
      if (PVP_ESCROW_ADDRESS) {
        await joinEscrowRoom(pendingRoom.room_code);
      }

      acceptJoinBtn.textContent = "JOINING...";

      // Step 3: Update database
      const { data: userData } = await supabase
        .from("users")
        .select("username")
        .eq("id", CURRENT_USER_ID)
        .single();

      const displayName = getDisplayName(userData?.username, CURRENT_WALLET);

      const { error } = await supabase
        .from("pvp_battle_rooms")
        .update({
          guest_id: CURRENT_USER_ID,
          guest_wallet: CURRENT_WALLET,
          guest_username: displayName,
        })
        .eq("id", pendingRoom.id)
        .eq("status", "waiting")
        .is("guest_id", null);

      if (error) throw error;

      // Log the deposit transaction
      if (window.logTransaction) {
        await window.logTransaction({
          type: "pvp_bet",
          amount: -pendingRoom.bet_amount,
          currency: "PKCHP",
          metadata: { room_code: pendingRoom.room_code, action: "join" },
        });
      }

      localStorage.setItem("PVP_ROOM_ID", pendingRoom.id);
      localStorage.setItem("PVP_ROOM_CODE", pendingRoom.room_code);
      localStorage.setItem("PVP_IS_HOST", "false");

      hideModal(confirmJoinModal);
      window.location.href = "pvp-select.html";
    } catch (err) {
      console.error("Accept join error:", err);
      showError("Failed to join room: " + err.message);
    }

    acceptJoinBtn.disabled = false;
    acceptJoinBtn.textContent = "⚔️ ACCEPT & DEPOSIT";
  });

  // ============================================================
  // ERROR MODAL OK
  // ============================================================

  errorOkBtn.addEventListener("click", () => {
    hideModal(errorModal);
  });

  // ============================================================
  // CLEANUP
  // ============================================================

  function cleanupSubscription() {
    if (roomSubscription) {
      roomSubscription.unsubscribe();
      roomSubscription = null;
    }
  }

  window.addEventListener("beforeunload", () => {
    cleanupSubscription();
  });

  // ============================================================
  // INITIALIZE
  // ============================================================

  await loadBalance();
  console.log("✓ PVP Lobby loaded with Escrow support");
});
