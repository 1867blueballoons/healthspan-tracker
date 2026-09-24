/**
 * Pollen & Environmental Telemetry Engine
 * Modular extractor for Open-Meteo Aerobiological Data
 */

const DEFAULT_LOCATION = "Wilmslow";

/**
 * Resolves location name to European coordinates using Open-Meteo Geocoding API.
 */
export async function getCoordinates(locationName) {
    const cleanName = (locationName || DEFAULT_LOCATION).trim();
    if (!cleanName) throw new Error("No location provided");
    
    const cacheKey = 'geo_' + cleanName.toLowerCase();
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);

    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanName)}&count=1&language=en&format=json`);
    if (!res.ok) throw new Error("Geocoding service unavailable");
    
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error(`Location '${cleanName}' not found`);
    
    const coords = { 
        lat: data.results[0].latitude, 
        lon: data.results[0].longitude,
        name: data.results[0].name,
        country: data.results[0].country
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(coords));
    return coords;
}

/**
 * Validates whether the returned payload contains valid hourly pollen numbers.
 */
export function hasValidPollenValues(hourly) {
    if (!hourly) return false;
    const keys = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'ragweed_pollen'];
    return keys.some(key => Array.isArray(hourly[key]) && hourly[key].some(val => val !== null && val !== undefined));
}

/**
 * Classifies raw allergen grain counts into ordinal categories and numeric index (0-3).
 */
export function getLevel(val, modThresh, highThresh) {
    return val >= highThresh ? "High" : val >= modThresh ? "Moderate" : "Low";
}

/**
 * Main Extraction Function: Fetches and processes aerobiological pollen vectors for a target date and location.
 * @param {string} locationName - Target location string (e.g., "Wilmslow", "Paris")
 * @param {string} targetDateIso - Target date string in ISO format (YYYY-MM-DD)
 * @returns {Promise<Object>} Processed pollen metrics object matching SQLite & Google Sheets schemas.
 */
export async function fetchPollenMetrics(locationName, targetDateIso) {
    const { lat, lon, name } = await getCoordinates(locationName);
    
    if (lat < 30 || lat > 72 || lon < -25 || lon > 45) {
        throw new Error("Pollen model is restricted to European regions.");
    }

    const dateStr = targetDateIso || new Date().toISOString().split('T')[0];
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen&start_date=${dateStr}&end_date=${dateStr}&timezone=Europe%2FLondon`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("Air Quality API unavailable");
    
    const data = await response.json();
    if (!data.hourly || !hasValidPollenValues(data.hourly)) {
        throw new Error("No pollen telemetry available for this location/date");
    }

    let maxTree = 0, maxGrass = 0, maxWeed = 0;
    let hourlyTotals = [];
    let maxHourlyTotal = 1;

    for (let i = 0; i < 24; i++) {
        let tree = (data.hourly.alder_pollen?.[i] || 0) + (data.hourly.birch_pollen?.[i] || 0);
        let grass = (data.hourly.grass_pollen?.[i] || 0);
        let weed = (data.hourly.mugwort_pollen?.[i] || 0) + (data.hourly.ragweed_pollen?.[i] || 0);
        
        if (tree > maxTree) maxTree = tree;
        if (grass > maxGrass) maxGrass = grass;
        if (weed > maxWeed) maxWeed = weed;
        
        let hTotal = tree + grass + weed;
        hourlyTotals.push(hTotal);
        if (hTotal > maxHourlyTotal) maxHourlyTotal = hTotal;
    }

    const treeLvl = getLevel(maxTree, 15, 90);
    const grassLvl = getLevel(maxGrass, 10, 50);
    const weedLvl = getLevel(maxWeed, 10, 50);
    const levels = [treeLvl, grassLvl, weedLvl];
    
    let overall = levels.includes("High") ? "High" : levels.includes("Moderate") ? "Moderate" : "Low";
    
    // Numeric Mapping: 0: Low, 1: Low, 2: Moderate, 3: High
    let pollenNumeric = overall === "High" ? 3 : overall === "Moderate" ? 2 : 1;
    
    const specificsStr = `Tree: ${treeLvl} | Grass: ${grassLvl} | Weed: ${weedLvl}`;

    return {
        location: name,
        latitude: lat,
        longitude: lon,
        date: dateStr,
        overallLevel: overall,
        pollenNumeric: pollenNumeric,
        treeLevel: treeLvl,
        grassLevel: grassLvl,
        weedLevel: weedLvl,
        maxTreeGrains: maxTree,
        maxGrassGrains: maxGrass,
        maxWeedGrains: maxWeed,
        specificsString: specificsStr,
        hourlyTotals: hourlyTotals,
        maxHourlyTotal: maxHourlyTotal,
        minHourlyTotal: Math.min(...hourlyTotals)
    };
}