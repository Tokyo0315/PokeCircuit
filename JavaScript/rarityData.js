// Pokemon Rarity Data - Fetched from Supabase
// This replaces the hardcoded arrays with database queries

// Cache for fetched data
let COMMON_POKEMON = [];
let RARE_POKEMON = [];
let EPIC_POKEMON = [];
let MYTHICAL_POKEMON = [];
let DIVINE_POKEMON = [];

let rarityDataLoaded = false;

// Fetch all rarity data from Supabase
async function loadRarityData() {
  if (rarityDataLoaded) {
    return window.rarityData;
  }

  if (!window.supabase) {
    console.error("Supabase not initialized. Cannot load rarity data.");
    return null;
  }

  try {
    const { data, error } = await window.supabase
      .from("pokemon_rarity")
      .select("name, gen, rarity")
      .order("name");

    if (error) {
      console.error("Error fetching rarity data:", error);
      return null;
    }

    // Group by rarity
    COMMON_POKEMON = data.filter((p) => p.rarity === "Common");
    RARE_POKEMON = data.filter((p) => p.rarity === "Rare");
    EPIC_POKEMON = data.filter((p) => p.rarity === "Epic");
    MYTHICAL_POKEMON = data.filter((p) => p.rarity === "Mythical");
    DIVINE_POKEMON = data.filter((p) => p.rarity === "Divine");

    rarityDataLoaded = true;

    // Update global reference
    window.rarityData = {
      common: COMMON_POKEMON,
      rare: RARE_POKEMON,
      epic: EPIC_POKEMON,
      mythical: MYTHICAL_POKEMON,
      divine: DIVINE_POKEMON,
    };

    console.log("Rarity data loaded from Supabase:", {
      common: COMMON_POKEMON.length,
      rare: RARE_POKEMON.length,
      epic: EPIC_POKEMON.length,
      mythical: MYTHICAL_POKEMON.length,
      divine: DIVINE_POKEMON.length,
    });

    return window.rarityData;
  } catch (err) {
    console.error("Failed to load rarity data:", err);
    return null;
  }
}

// Helper functions to get specific rarity arrays
async function getCommonPokemon() {
  if (!rarityDataLoaded) await loadRarityData();
  return COMMON_POKEMON;
}

async function getRarePokemon() {
  if (!rarityDataLoaded) await loadRarityData();
  return RARE_POKEMON;
}

async function getEpicPokemon() {
  if (!rarityDataLoaded) await loadRarityData();
  return EPIC_POKEMON;
}

async function getMythicalPokemon() {
  if (!rarityDataLoaded) await loadRarityData();
  return MYTHICAL_POKEMON;
}

async function getDivinePokemon() {
  if (!rarityDataLoaded) await loadRarityData();
  return DIVINE_POKEMON;
}

// Make functions available globally
window.loadRarityData = loadRarityData;
window.getCommonPokemon = getCommonPokemon;
window.getRarePokemon = getRarePokemon;
window.getEpicPokemon = getEpicPokemon;
window.getMythicalPokemon = getMythicalPokemon;
window.getDivinePokemon = getDivinePokemon;

// Initialize empty rarityData (will be populated after loadRarityData is called)
window.rarityData = {
  common: COMMON_POKEMON,
  rare: RARE_POKEMON,
  epic: EPIC_POKEMON,
  mythical: MYTHICAL_POKEMON,
  divine: DIVINE_POKEMON,
};
