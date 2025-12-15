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
    window.CURRENT_USER_ID = user.id;

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
