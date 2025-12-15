const POKE_API_BASE = "https://pokeapi.co/api/v2";

// Capitalize helper: "grass" -> "Grass"
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Reusable function to get a Pokémon by id or name
async function fetchPokemon(idOrName) {
  const response = await fetch(`${POKE_API_BASE}/pokemon/${idOrName}`);

  if (!response.ok) {
    throw new Error(`Pokemon not found: ${idOrName}`);
  }

  const data = await response.json();

  // stats by name 
  const hpStat = data.stats.find((s) => s.stat.name === "hp")?.base_stat ?? 0;
  const atkStat =
    data.stats.find((s) => s.stat.name === "attack")?.base_stat ?? 0;
  const defStat =
    data.stats.find((s) => s.stat.name === "defense")?.base_stat ?? 0;
  const spdStat =
    data.stats.find((s) => s.stat.name === "speed")?.base_stat ?? 0;

  return {
    id: data.id,
    name: capitalize(data.name),
    sprite:
      data.sprites.other?.["official-artwork"]?.front_default ||
      data.sprites.front_default,
    types: data.types.map((t) => capitalize(t.type.name)),
    hp: hpStat,
    attack: atkStat,
    defense: defStat,
    speed: spdStat,
  };
}
