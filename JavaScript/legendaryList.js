// Legendary Pokemon List - Fetched from Supabase

let legendaryList = [];
let legendaryDataLoaded = false;

// Fetch legendary Pokemon from Supabase
async function loadLegendaryList() {
  if (legendaryDataLoaded) {
    return legendaryList;
  }

  if (!window.supabase) {
    console.error("Supabase not initialized. Cannot load legendary list.");
    return [];
  }

  try {
    const { data, error } = await window.supabase
      .from("pokemon_legendary")
      .select("name, gen")
      .order("gen");

    if (error) {
      console.error("Error fetching legendary list:", error);
      return [];
    }

    // Extract just the names for backward compatibility
    legendaryList = data.map((p) => p.name);
    legendaryDataLoaded = true;

    // Update global reference
    window.legendaryList = legendaryList;

    console.log("Legendary list loaded from Supabase:", legendaryList.length, "Pokemon");

    return legendaryList;
  } catch (err) {
    console.error("Failed to load legendary list:", err);
    return [];
  }
}

// Make function available globally
window.loadLegendaryList = loadLegendaryList;

// Initialize empty legendaryList (will be populated after loadLegendaryList is called)
window.legendaryList = legendaryList;
