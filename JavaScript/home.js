// ======================================================
//  GLOBAL STORAGE KEYS
// ======================================================
const CURRENT_USER_ID_KEY = "CURRENT_USER_ID";
const CURRENT_WALLET_ADDRESS_KEY = "CURRENT_WALLET_ADDRESS";

// ======================================================
//  PKCHP SMART CONTRACT CONFIG
// ======================================================
const PKCHP_ADDRESS = "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";

const PKCHP_ABI = [
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

// ======================================================
//  FORCE WALLET DETECTION
// ======================================================
async function detectAndStoreWalletAddress() {
  if (!window.ethereum) return null;

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || accounts.length === 0) return null;

    const wallet = accounts[0];
    localStorage.setItem(CURRENT_WALLET_ADDRESS_KEY, wallet);
    console.log("Wallet stored:", wallet);
    return wallet;
  } catch (err) {
    console.error("Wallet detection error:", err);
    return null;
  }
}

// ======================================================
//  MAIN INITIALIZER
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  const walletChip = document.querySelector(".pc-wallet-chip");
  const ethDisplay = document.querySelector(".pc-eth-balance");
  const usdDisplay = document.querySelector(".pc-usd-balance");
  const chainDisplay = document.querySelector(".pc-chain-name");
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");
  const pkchpDisplay = document.querySelector(".pc-pokechip-amount");
  const logoutButtons = document.querySelectorAll(".pc-logout-btn");
  const trainerNameEls = document.querySelectorAll("[data-trainer-name]");
  const trainerBadges = document.querySelectorAll(".pc-trainer-badge");

  const formatTrainerName = (name) => {
    const cleaned = (name || "").trim();
    if (!cleaned) return "Trainer";
    if (cleaned.length > 15) return cleaned.slice(0, 12) + "...";
    return cleaned;
  };

  const setNavbarTrainerName = (name) => {
    const displayName = formatTrainerName(name);
    trainerNameEls.forEach((el) => {
      el.textContent = displayName;
      el.title = name || "Trainer";
    });
  };

  setNavbarTrainerName(localStorage.getItem("trainerUsername"));

  let trainerModalBackdrop = null;
  let trainerModalInput = null;
  let trainerModalError = null;
  let trainerModalSave = null;

  const showTrainerModalError = (message) => {
    if (!trainerModalError) return;
    if (message) {
      trainerModalError.textContent = message;
      trainerModalError.classList.remove("d-none");
    } else {
      trainerModalError.textContent = "";
      trainerModalError.classList.add("d-none");
    }
  };

  const closeTrainerModal = () => {
    if (trainerModalBackdrop) trainerModalBackdrop.classList.add("d-none");
    showTrainerModalError("");
    if (trainerModalInput) trainerModalInput.value = "";
    if (trainerModalSave) {
      trainerModalSave.disabled = false;
      trainerModalSave.textContent = "Save";
    }
  };

  const openTrainerModal = (currentName) => {
    if (!trainerModalBackdrop) return;
    trainerModalInput.value = currentName || "";
    trainerModalInput.disabled = false;
    trainerModalInput.readOnly = false;
    trainerModalBackdrop.classList.remove("d-none");
    showTrainerModalError("");
    setTimeout(() => trainerModalInput.focus(), 0);
  };

  const createTrainerModal = () => {
    if (document.getElementById("trainerModalBackdrop")) return;

    const backdrop = document.createElement("div");
    backdrop.id = "trainerModalBackdrop";
    backdrop.className = "buy-modal-backdrop d-none";

    backdrop.innerHTML = `
      <div class="buy-modal trainer-modal">
        <div class="buy-modal-header">
          <span class="buy-modal-title">Update Trainer Username</span>
          <button type="button" class="buy-modal-close" id="trainerModalClose">&times;</button>
        </div>
        <div class="buy-modal-body trainer-modal-body">
          <div class="buy-modal-right w-100">
            <label class="form-label text-light mb-1">Trainer Username</label>
            <input type="text" id="trainerModalInput" class="form-control text-white"
              minlength="3" maxlength="16" placeholder="Enter your trainer name">
            <small class="text-muted">3-16 characters</small>
            <div id="trainerModalError" class="trainer-modal-error d-none"></div>
          </div>
        </div>
        <div class="buy-modal-footer">
          <button type="button" class="btn btn-sm btn-secondary" id="trainerModalCancel">Cancel</button>
          <button type="button" class="btn btn-sm btn-warning" id="trainerModalSave">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    trainerModalBackdrop = backdrop;
    trainerModalInput = backdrop.querySelector("#trainerModalInput");
    trainerModalError = backdrop.querySelector("#trainerModalError");
    trainerModalSave = backdrop.querySelector("#trainerModalSave");
    const closeBtn = backdrop.querySelector("#trainerModalClose");
    const cancelBtn = backdrop.querySelector("#trainerModalCancel");

    if (closeBtn) closeBtn.addEventListener("click", closeTrainerModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeTrainerModal);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeTrainerModal();
    });

    if (trainerModalSave) {
      trainerModalSave.addEventListener("click", async () => {
        const currentName = localStorage.getItem("trainerUsername") || "";
        const trimmed = (trainerModalInput.value || "").trim();

        if (!trimmed) {
          showTrainerModalError("Please enter a trainer username.");
          return;
        }

        if (trimmed.length < 3) {
          showTrainerModalError("Username must be at least 3 characters.");
          return;
        }

        if (trimmed.length > 16) {
          showTrainerModalError("Username cannot exceed 16 characters.");
          return;
        }

        if (trimmed === currentName) {
          closeTrainerModal();
          return;
        }

        trainerModalSave.disabled = true;
        trainerModalSave.textContent = "Saving...";
        showTrainerModalError("");

        try {
          const updated = await updateTrainerUsername(trimmed);
          localStorage.setItem("trainerUsername", updated.username);
          setNavbarTrainerName(updated.username);
          closeTrainerModal();
        } catch (err) {
          console.error("Username update error:", err);
          const message = (err?.message || "").toLowerCase();
          if (message.includes("duplicate") || message.includes("unique")) {
            showTrainerModalError(
              "This username is already taken. Please choose another."
            );
          } else {
            showTrainerModalError("Username update failed. Try again.");
          }
          trainerModalSave.disabled = false;
          trainerModalSave.textContent = "Save";
        }
      });
    }

    trainerModalInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        trainerModalSave.click();
      } else if (event.key === "Escape") {
        closeTrainerModal();
      }
    });
  };

  createTrainerModal();

  async function updateTrainerUsername(nextName) {
    if (!window.supabase) {
      throw new Error("Database not available");
    }

    const userId = localStorage.getItem(CURRENT_USER_ID_KEY);
    if (!userId) {
      throw new Error("No user session found");
    }

    const { data, error } = await supabase
      .from("users")
      .update({ username: nextName })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  if (trainerBadges && trainerBadges.length) {
    trainerBadges.forEach((badge) => {
      badge.addEventListener("click", async () => {
        const currentName = localStorage.getItem("trainerUsername") || "";
        openTrainerModal(currentName);
      });
    });
  }

  // ======================================================
  // MOBILE NAV
  // ======================================================
  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      navMenu.classList.toggle("active");
    });
  }

  // ======================================================
  // LOGOUT HANDLER
  // ======================================================
  if (logoutButtons && logoutButtons.length) {
    logoutButtons.forEach((btn) =>
      btn.addEventListener("click", () => {
        localStorage.removeItem(CURRENT_WALLET_ADDRESS_KEY);
        localStorage.removeItem(CURRENT_USER_ID_KEY);
        localStorage.removeItem("trainerUsername");
        window.location.href = "index.html";
      })
    );
  }

  // ======================================================
  // PKCHP — ON-CHAIN READ
  // ======================================================
  async function loadPKCHP(wallet) {
    if (!window.ethereum) return 0;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(PKCHP_ADDRESS, PKCHP_ABI, provider);

      const rawBal = await contract.balanceOf(wallet);
      const decimals = await contract.decimals();

      return Number(ethers.formatUnits(rawBal, decimals));
    } catch (err) {
      console.error("PKCHP fetch error:", err);
      return 0;
    }
  }

  async function updatePKCHP() {
    const wallet = localStorage.getItem(CURRENT_WALLET_ADDRESS_KEY);

    if (!wallet) {
      if (pkchpDisplay) pkchpDisplay.textContent = "0";
      return;
    }

    const bal = await loadPKCHP(wallet);
    if (pkchpDisplay)
      pkchpDisplay.textContent = Math.floor(bal).toLocaleString();
  }

  window.addEventListener("focus", updatePKCHP);

  // ======================================================
  // SUPABASE USER HANDLING
  // ======================================================
  async function ensureUser(wallet) {
    const lower = wallet.toLowerCase();

    let { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("wallet_address", lower)
      .maybeSingle();

    if (existing) return existing;

    const { data: inserted } = await supabase
      .from("users")
      .insert([{ wallet_address: lower, username: lower }])
      .select()
      .single();

    return inserted;
  }

  // FIXED: user_wallet table only has user_id, created_at, updated_at
  async function ensureWalletTable(userId) {
    let { data } = await supabase
      .from("user_wallet")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) return data;

    // Only insert user_id - no pokechip_balance column exists
    const { data: inserted, error } = await supabase
      .from("user_wallet")
      .insert([{ user_id: userId }])
      .select()
      .single();

    if (error) {
      console.warn("user_wallet insert error:", error);
      return null;
    }

    return inserted;
  }

  // ======================================================
  // METAMASK LOGIN FLOW
  // ======================================================
  let savedWallet = localStorage.getItem(CURRENT_WALLET_ADDRESS_KEY);

  if (!savedWallet) savedWallet = await detectAndStoreWalletAddress();

  if (!savedWallet) {
    if (walletChip) walletChip.textContent = "No Wallet";
    return;
  }

  // Shorten wallet display
  if (walletChip) {
    walletChip.textContent =
      savedWallet.substring(0, 6) +
      "..." +
      savedWallet.substring(savedWallet.length - 4);
  }

  try {
    const user = await ensureUser(savedWallet);
    localStorage.setItem(CURRENT_USER_ID_KEY, user.id);
    localStorage.setItem("trainerUsername", user.username || "");
    window.CURRENT_USER_ID = user.id;
    setNavbarTrainerName(user.username || "");

    await ensureWalletTable(user.id);
    await updatePKCHP();
  } catch (err) {
    console.error("Supabase link error:", err);
  }

  // ======================================================
  // ETH BALANCE DISPLAY
  // ======================================================
  try {
    if (!window.ethereum) return;

    const chainId = await window.ethereum.request({
      method: "eth_chainId",
    });

    let chainName =
      chainId === "0xaa36a7"
        ? "Sepolia Testnet"
        : chainId === "0x1"
        ? "Ethereum Mainnet"
        : "Unknown";

    if (chainDisplay) chainDisplay.textContent = chainName;

    const balanceHex = await window.ethereum.request({
      method: "eth_getBalance",
      params: [savedWallet, "latest"],
    });

    const balanceEth = Number(BigInt(balanceHex)) / 1e18;
    if (ethDisplay) ethDisplay.textContent = `${balanceEth.toFixed(4)} ETH`;

    // Fetch ETH price
    try {
      const priceRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      );
      const priceData = await priceRes.json();
      const usdVal = balanceEth * priceData.ethereum.usd;

      if (usdDisplay) {
        usdDisplay.textContent = usdVal.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        });
      }
    } catch (priceErr) {
      console.warn("Price fetch error:", priceErr);
    }
  } catch (err) {
    console.error("ETH fetch error:", err);
  }
});
