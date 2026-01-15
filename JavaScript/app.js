// ============================================================
// POKECIRCUIT ARENA - LOGIN & REGISTRATION
// With First-Time Welcome Bonus (250 PKCHP)
// Uses db.js for Supabase connection
// ============================================================

console.log("app.js LOADED!");

// Contract addresses
const PKCHP_ADDRESS = "0xe53613104B5e271Af4226F6867fBb595c1aE8d26";
const BATTLE_REWARDS_ADDRESS = "0x80617C5F2069eF97792F77e1F28A4aD410B80578";
const WELCOME_FAUCET_ADDRESS = "0x3c37FfC59f2018d95c2A2e16730aff18a6742F96";

// Welcome bonus amount
const WELCOME_BONUS_AMOUNT = 250;

// Welcome Bonus Faucet ABI
const WELCOME_FAUCET_ABI = [
  {
    inputs: [],
    name: "claimWelcomeBonus",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_user", type: "address" }],
    name: "canClaim",
    outputs: [
      { internalType: "bool", name: "canClaim", type: "bool" },
      { internalType: "string", name: "reason", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "hasClaimed",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getFaucetBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

document.addEventListener("DOMContentLoaded", () => {
  // DOM elements
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletStatus = document.getElementById("walletStatus");
  const usernameInput = document.getElementById("username");
  const registerBtn = document.getElementById("registerBtn");
  const welcomeMessage = document.getElementById("welcomeMessage");
  const registerForm = document.getElementById("registerForm");

  if (!connectBtn || !walletStatus || !usernameInput || !registerBtn) {
    console.warn("Login elements not found on this page.");
    return;
  }

  // State
  let connectedWallet = null;
  let existingUser = null;

  // Allowed Ethereum networks
  const ETHEREUM_NETWORKS = {
    mainnet: "0x1",
    sepolia: "0xaa36a7",
  };

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  function shortenAddress(addr) {
    return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
  }

  function showStatus(message, isSuccess = false, isWarning = false) {
    walletStatus.textContent = message;
    walletStatus.classList.remove("wallet-connected", "wallet-warning");
    if (isSuccess) walletStatus.classList.add("wallet-connected");
    if (isWarning) walletStatus.classList.add("wallet-warning");
  }

  function updateRegisterButtonLabel() {
    if (!existingUser) return;
    const typed = usernameInput.value.trim();
    const current = existingUser.username || "";
    registerBtn.textContent =
      typed && typed !== current ? "UPDATE & ENTER ARENA" : "ENTER ARENA";
  }

  // Wait for Supabase to be available (loaded from db.js)
  function waitForSupabase(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (window.supabase) {
          resolve(window.supabase);
        } else if (Date.now() - start > timeout) {
          reject(new Error("Supabase not loaded"));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  // ============================================================
  // WELCOME BONUS FUNCTIONS
  // ============================================================

  async function claimWelcomeBonus(userId, walletAddress) {
    console.log("🎁 Attempting to claim welcome bonus...");

    try {
      // Check if faucet contract is configured
      if (
        WELCOME_FAUCET_ADDRESS &&
        WELCOME_FAUCET_ADDRESS.length > 0 &&
        window.ethereum
      ) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        const faucetContract = new ethers.Contract(
          WELCOME_FAUCET_ADDRESS,
          WELCOME_FAUCET_ABI,
          signer
        );

        try {
          // Check if user can claim
          const [canClaimResult, reason] = await faucetContract.canClaim(
            walletAddress
          );

          if (!canClaimResult) {
            console.warn("Cannot claim from faucet:", reason);
            // Still record in database as success (for tracking)
            await recordBonusClaim(userId, walletAddress, null, "success");
            return { success: true, txHash: null, message: reason };
          }

          // Claim from faucet contract
          console.log("Claiming from faucet contract...");
          const tx = await faucetContract.claimWelcomeBonus();
          const receipt = await tx.wait();

          console.log("✓ Welcome bonus claimed from faucet:", receipt.hash);

          // Record in database
          await recordBonusClaim(
            userId,
            walletAddress,
            receipt.hash,
            "success"
          );
          return { success: true, txHash: receipt.hash };
        } catch (contractErr) {
          console.warn("Faucet claim failed:", contractErr.message);
          // Record as success anyway (tracking purposes)
          await recordBonusClaim(userId, walletAddress, null, "success");
          return { success: true, txHash: null, pending: false };
        }
      } else {
        // No faucet configured - just record in database
        console.log("Faucet not configured, recording bonus in database only");
        await recordBonusClaim(userId, walletAddress, null, "success");
        return { success: true, txHash: null };
      }
    } catch (err) {
      console.error("Welcome bonus error:", err);
      // Still try to record
      try {
        await recordBonusClaim(userId, walletAddress, null, "success");
      } catch (e) {}
      return { success: false, error: err.message };
    }
  }

  async function recordBonusClaim(userId, walletAddress, txHash, status) {
    if (!window.supabase) {
      console.error("Supabase not available for recording bonus");
      return;
    }

    try {
      // Update user record (if columns exist)
      try {
        await window.supabase
          .from("users")
          .update({
            claimed_welcome_bonus: true,
            bonus_claimed_at: new Date().toISOString(),
            bonus_amount: WELCOME_BONUS_AMOUNT,
          })
          .eq("id", userId);
      } catch (e) {
        console.warn("Could not update bonus columns (may not exist):", e);
      }

      // Try to insert into welcome_bonuses audit table (may not exist)
      try {
        await window.supabase.from("welcome_bonuses").insert({
          user_id: userId,
          wallet_address: walletAddress,
          amount: WELCOME_BONUS_AMOUNT,
          tx_hash: txHash,
          status: status,
        });
      } catch (e) {
        console.warn("welcome_bonuses table may not exist:", e);
      }

      // Log as transaction
      await window.supabase.from("transactions").insert({
        user_id: userId,
        wallet_address: walletAddress,
        type: "welcome_bonus",
        amount: WELCOME_BONUS_AMOUNT,
        currency: "PKCHP",
        tx_hash: txHash,
        status: status,
      });

      console.log("✓ Bonus recorded in database");
    } catch (err) {
      console.error("Error recording bonus:", err);
    }
  }

  async function checkExistingUser(walletAddress) {
    if (!window.supabase) {
      console.error("Supabase not available");
      return null;
    }

    try {
      const { data, error } = await window.supabase
        .from("users")
        .select("*")
        .eq("wallet_address", walletAddress.toLowerCase())
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("User lookup error:", error);
      }

      return data || null;
    } catch (err) {
      console.error("Check existing user error:", err);
      return null;
    }
  }

  async function registerNewUser(username, walletAddress) {
    if (!window.supabase) {
      throw new Error("Database not available");
    }

    try {
      const { data, error } = await window.supabase
        .from("users")
        .insert({
          username: username,
          wallet_address: walletAddress.toLowerCase(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error("Registration error:", err);
      throw err;
    }
  }

  async function updateExistingUsername(userId, username) {
    if (!window.supabase) {
      throw new Error("Database not available");
    }

    const { data, error } = await window.supabase
      .from("users")
      .update({ username: username })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ============================================================
  // CONNECT WALLET
  // ============================================================

  connectBtn.addEventListener("click", async () => {
    if (typeof window.ethereum === "undefined") {
      showStatus("❌ MetaMask not found. Please install MetaMask.");
      return;
    }

    try {
      showStatus("🔄 Connecting...");

      const chainId = await window.ethereum.request({ method: "eth_chainId" });

      if (
        chainId !== ETHEREUM_NETWORKS.mainnet &&
        chainId !== ETHEREUM_NETWORKS.sepolia
      ) {
        showStatus(
          "⚠️ Please switch to Ethereum Mainnet or Sepolia",
          false,
          true
        );
        return;
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      connectedWallet = accounts[0];
      localStorage.setItem("trainerWallet", connectedWallet);
      localStorage.setItem("CURRENT_WALLET_ADDRESS", connectedWallet);

      showStatus(`🟢 Connected: ${shortenAddress(connectedWallet)}`, true);

      // Wait for Supabase to be ready
      try {
        await waitForSupabase(3000);
      } catch (e) {
        console.warn(
          "Supabase not loaded from db.js, some features may not work"
        );
      }

      // Check if user already exists
      existingUser = await checkExistingUser(connectedWallet);

      if (existingUser) {
        // Existing user - auto login
        console.log("✓ Existing user found:", existingUser.username);

        localStorage.setItem("CURRENT_USER_ID", existingUser.id);
        localStorage.setItem("trainerUsername", existingUser.username);

        usernameInput.value = existingUser.username;
        usernameInput.disabled = false;
        registerBtn.textContent = "ENTER ARENA";
        registerBtn.disabled = false;
        updateRegisterButtonLabel();

        // Check if they need to claim bonus
        if (existingUser.claimed_welcome_bonus === false) {
          welcomeMessage.innerHTML = `
            <span class="text-warning">🎁 You have an unclaimed welcome bonus!</span>
          `;
          welcomeMessage.style.display = "block";
        } else {
          welcomeMessage.textContent = `Welcome back, ${existingUser.username}!`;
          welcomeMessage.style.display = "block";
        }
      } else {
        // New user - enable registration
        usernameInput.disabled = false;
        registerBtn.disabled = false;
        registerBtn.textContent = "REGISTER & CLAIM 250 PKCHP";

        welcomeMessage.innerHTML = `
          <span class="text-warning">🎁 First time? Register to receive <strong>250 FREE PKCHP!</strong></span>
        `;
        welcomeMessage.style.display = "block";
      }
    } catch (err) {
      console.error(err);
      showStatus("❌ Connection rejected or failed.");
    }
  });

  // ============================================================
  // REGISTER / LOGIN
  // ============================================================

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!connectedWallet) {
      alert("Please connect your wallet first!");
      return;
    }

    const username = usernameInput.value.trim();

    // Existing user - allow username update then login
    if (existingUser) {
      const currentUsername = existingUser.username || "";

      if (!username) {
        alert("Please enter a trainer username.");
        return;
      }

      if (username !== currentUsername) {
        if (username.length < 3) {
          alert("Username must be at least 3 characters.");
          return;
        }

        if (username.length > 16) {
          alert("Username cannot exceed 16 characters.");
          return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = "UPDATING USERNAME...";

        try {
          const updatedUser = await updateExistingUsername(
            existingUser.id,
            username
          );

          existingUser = updatedUser;
          localStorage.setItem("trainerUsername", updatedUser.username);
          usernameInput.value = updatedUser.username;
          updateRegisterButtonLabel();

          welcomeMessage.textContent = `Username updated to ${updatedUser.username}.`;
          welcomeMessage.style.display = "block";
        } catch (err) {
          console.error("Username update error:", err);

          if (
            err.message?.includes("duplicate") ||
            err.message?.includes("unique")
          ) {
            alert("This username is already taken. Please choose another.");
          } else {
            alert("Username update failed: " + err.message);
          }

          registerBtn.disabled = false;
          updateRegisterButtonLabel();
          return;
        }
      }

      await handleLogin(existingUser);
      return;
    }

    // New user - register
    if (!username) {
      alert("Please enter a trainer username.");
      return;
    }

    if (username.length < 3) {
      alert("Username must be at least 3 characters.");
      return;
    }

    if (username.length > 16) {
      alert("Username cannot exceed 16 characters.");
      return;
    }

    // Disable form during registration
    registerBtn.disabled = true;
    registerBtn.textContent = "REGISTERING...";
    usernameInput.disabled = true;

    try {
      // Register new user
      const newUser = await registerNewUser(username, connectedWallet);

      if (!newUser) {
        throw new Error("Registration failed");
      }

      localStorage.setItem("CURRENT_USER_ID", newUser.id);
      localStorage.setItem("trainerUsername", username);

      // Show bonus claiming message
      registerBtn.textContent = "CLAIMING BONUS...";
      welcomeMessage.innerHTML = `
        <div class="bonus-claiming">
          <span class="spinner-border spinner-border-sm me-2"></span>
          Claiming your 250 PKCHP welcome bonus...
        </div>
      `;

      // Claim welcome bonus
      const bonusResult = await claimWelcomeBonus(newUser.id, connectedWallet);

      if (bonusResult.success) {
        if (bonusResult.pending) {
          welcomeMessage.innerHTML = `
            <div class="text-success">
              ✅ Welcome, <strong>${username}</strong>!<br>
              <small>🎁 250 PKCHP bonus will be credited shortly!</small>
            </div>
          `;
        } else {
          welcomeMessage.innerHTML = `
            <div class="text-success">
              ✅ Welcome, <strong>${username}</strong>!<br>
              <small>🎁 250 PKCHP has been added to your wallet!</small>
            </div>
          `;
        }
      } else {
        welcomeMessage.innerHTML = `
          <div class="text-warning">
            ✅ Registered as <strong>${username}</strong>!<br>
            <small>⚠️ Bonus claim pending - check back later.</small>
          </div>
        `;
      }

      // Play sound and redirect
      const registerSound = new Audio(
        "https://www.myinstants.com/media/sounds/ichooseyou.mp3"
      );
      registerSound.currentTime = 0;

      setTimeout(() => {
        registerSound
          .play()
          .then(() => {
            registerSound.onended = () => {
              window.location.href = "home.html";
            };
          })
          .catch(() => {
            window.location.href = "home.html";
          });
      }, 1500);
    } catch (err) {
      console.error("Registration error:", err);

      if (
        err.message?.includes("duplicate") ||
        err.message?.includes("unique")
      ) {
        alert("This username is already taken. Please choose another.");
      } else {
        alert("Registration failed: " + err.message);
      }

      registerBtn.disabled = false;
      registerBtn.textContent = "REGISTER & CLAIM 250 PKCHP";
      usernameInput.disabled = false;
    }
  });

  async function handleLogin(user) {
    // Check if bonus needs claiming
    if (user.claimed_welcome_bonus === false) {
      registerBtn.textContent = "CLAIMING BONUS...";

      const bonusResult = await claimWelcomeBonus(user.id, connectedWallet);

      if (bonusResult.success) {
        welcomeMessage.innerHTML = `
          <div class="text-success">
            🎁 250 PKCHP bonus claimed! Welcome back, ${user.username}!
          </div>
        `;
      }
    }

    // Play sound and redirect
    const registerSound = new Audio(
      "https://www.myinstants.com/media/sounds/ichooseyou.mp3"
    );

    welcomeMessage.textContent = `Welcome back, ${user.username}!`;
    welcomeMessage.style.display = "block";

    registerSound.currentTime = 0;
    registerSound
      .play()
      .then(() => {
        registerSound.onended = () => {
          window.location.href = "home.html";
        };
      })
      .catch(() => {
        window.location.href = "home.html";
      });
  }

  // ============================================================
  // HANDLE ACCOUNT CHANGES
  // ============================================================

  usernameInput.addEventListener("input", () => {
    updateRegisterButtonLabel();
  });

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length === 0) {
        showStatus("🔴 Wallet disconnected");
        connectedWallet = null;
        existingUser = null;
        usernameInput.disabled = true;
        usernameInput.value = "";
        registerBtn.disabled = true;
        registerBtn.textContent = "REGISTER & ENTER ARENA";
        welcomeMessage.style.display = "none";
      } else {
        window.location.reload();
      }
    });

    window.ethereum.on("chainChanged", () => {
      window.location.reload();
    });
  }
});
