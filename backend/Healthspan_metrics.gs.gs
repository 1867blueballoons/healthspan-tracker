// Healthspan Metrics Google Sheet
// Code.gs - Backend v2.6 (Split Pollen DB & Dual-Write, No Blank Rows)
const SPREADSHEET_ID = '1EfWXl1Qs7z9i3DtTirZlToIKdBwBgiie6etpaoPObig'; 

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets().map(s => s.getName());
    
    let responseData = { availableSheets: sheets, status: "success", dataByDate: {} };
    
    const initDate = (dateStr) => {
      if (!responseData.dataByDate[dateStr]) {
        responseData.dataByDate[dateStr] = { metrics: null, hayfever: new Array(10).fill(""), symptoms: [] };
      }
    };

    // 1. Fetch Supplement Logging (Base Metrics)
    if (sheets.includes("Supplement_Tracking_Log")) {
      const data = ss.getSheetByName("Supplement_Tracking_Log").getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
          let dateStr = new Date(data[i][0]).toDateString();
          initDate(dateStr);
          let row = data[i];
          if (row[15] instanceof Date) {
            let h = row[15].getHours().toString().padStart(2, '0');
            let m = row[15].getMinutes().toString().padStart(2, '0');
            row[15] = `${h}:${m}`;
          }
          responseData.dataByDate[dateStr].metrics = row;
        }
      }
    }

    // 2. Fetch HayFever (User Inputs + Duplicated Loc/Lvl)
    if (sheets.includes("HayFever")) {
      const data = ss.getSheetByName("HayFever").getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
          let dateStr = new Date(data[i][0]).toDateString();
          initDate(dateStr);
          responseData.dataByDate[dateStr].hayfever[0] = data[i][0];
          responseData.dataByDate[dateStr].hayfever[1] = data[i][1] || ""; // Location
          responseData.dataByDate[dateStr].hayfever[2] = data[i][2] || ""; // Level
          responseData.dataByDate[dateStr].hayfever[3] = data[i][3] || ""; // Symptoms
          responseData.dataByDate[dateStr].hayfever[4] = data[i][4] || ""; // Duration
          responseData.dataByDate[dateStr].hayfever[5] = data[i][5] || ""; // Interventions
        }
      }
    }

    // 3. Fetch Pollen Metrics (API Data)
    if (sheets.includes("Pollen_Metrics")) {
      const data = ss.getSheetByName("Pollen_Metrics").getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
          let dateStr = new Date(data[i][0]).toDateString();
          initDate(dateStr);
          // If HayFever was blank for Loc/Lvl, grab from here just in case
          if (!responseData.dataByDate[dateStr].hayfever[1]) responseData.dataByDate[dateStr].hayfever[1] = data[i][1] || "";
          if (!responseData.dataByDate[dateStr].hayfever[2]) responseData.dataByDate[dateStr].hayfever[2] = data[i][2] || "";
          
          responseData.dataByDate[dateStr].hayfever[7] = data[i][3] || ""; // Specifics
          responseData.dataByDate[dateStr].hayfever[8] = data[i][4] || ""; // Hourly Graph Data
        }
      }
    }

    // 4. Fetch General Symptoms
    if (sheets.includes("GeneralSymptoms")) {
      const data = ss.getSheetByName("GeneralSymptoms").getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
          let dateStr = new Date(data[i][0]).toDateString();
          initDate(dateStr);
          responseData.dataByDate[dateStr].symptoms.push(data[i]);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify(responseData)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message, status: "failed" })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const timestamp = new Date();
    const entryDate = data.record_date;

    const upsertRow = (sheetName, entryDate, updateCallback, insertCallback) => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;
      const dataRange = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 0; i < dataRange.length; i++) {
        if (dataRange[i][0] && new Date(dataRange[i][0]).toDateString() === new Date(entryDate).toDateString()) {
          rowIndex = i + 1; break;
        }
      }
      if (rowIndex > -1) updateCallback(sheet, rowIndex);
      else insertCallback(sheet);
    };

    // 1. Supplement_Tracking_Log
    if (data.ambient_temp_celsius || data.sleep_debt_manual || data.subjective_energy || data.daily_feedback || data.golf_focus) {
      upsertRow("Supplement_Tracking_Log", entryDate, 
        (sheet, row) => {
          if (data.ambient_temp_celsius) sheet.getRange(row, 7).setValue(data.ambient_temp_celsius);
          if (data.subjective_energy) sheet.getRange(row, 12).setValue(data.subjective_energy); 
          if (data.golf_focus !== undefined) sheet.getRange(row, 13).setValue(data.golf_focus);              
          if (data.daily_feedback) sheet.getRange(row, 14).setValue(data.daily_feedback);       
          if (data.sleep_debt_manual) sheet.getRange(row, 16).setValue(data.sleep_debt_manual); 
        },
        (sheet) => {
          let newRow = new Array(17).fill(""); 
          newRow[0] = entryDate; 
          newRow[6] = data.ambient_temp_celsius; 
          newRow[11] = data.subjective_energy;
          newRow[12] = data.golf_focus;
          newRow[13] = data.daily_feedback;
          newRow[15] = data.sleep_debt_manual;
          sheet.appendRow(newRow);
        }
      );
    }

    // 2. HayFever (User Inputs + Duplicated Loc/Lvl)
    if (data.hayfever_symptoms !== undefined) {
      upsertRow("HayFever", entryDate,
        (sheet, row) => {
          sheet.getRange(row, 1, 1, 7).setValues([[entryDate, data.postcode_prefix, data.pollen_count_level, data.hayfever_symptoms, data.hayfever_duration_mins, data.allergy_interventions_with_success, timestamp]]);
        },
        (sheet) => {
          // Only append a new row if the user ACTUALLY logged a symptom, duration, or intervention
          if(data.hayfever_symptoms || data.hayfever_duration_mins || data.allergy_interventions_with_success) {
            sheet.appendRow([entryDate, data.postcode_prefix, data.pollen_count_level, data.hayfever_symptoms, data.hayfever_duration_mins, data.allergy_interventions_with_success, timestamp]);
          }
        }
      );
    }

    // 3. Pollen_Metrics (Open-Meteo Data)
    if (data.postcode_prefix || data.pollen_count_level) {
      upsertRow("Pollen_Metrics", entryDate,
        (sheet, row) => {
          sheet.getRange(row, 1, 1, 6).setValues([[entryDate, data.postcode_prefix, data.pollen_count_level, data.specific_pollens, data.hourly_pollen_data, timestamp]]);
        },
        (sheet) => sheet.appendRow([entryDate, data.postcode_prefix, data.pollen_count_level, data.specific_pollens, data.hourly_pollen_data, timestamp])
      );
    }

    // 4. General Symptoms
    const symSheet = ss.getSheetByName("GeneralSymptoms");
    if (symSheet && data.general_symptoms_array) {
      const symData = symSheet.getDataRange().getValues();
      for (let i = symData.length - 1; i > 0; i--) {
        if (symData[i][0] && new Date(symData[i][0]).toDateString() === new Date(entryDate).toDateString()) {
          symSheet.deleteRow(i + 1);
        }
      }
      data.general_symptoms_array.forEach(sym => {
        if (sym.description || sym.cause) {
          symSheet.appendRow([entryDate, sym.description, sym.cause, sym.duration, timestamp, sym.comment, sym.tag]);
        }
      });
    }

    return ContentService.createTextOutput(JSON.stringify({"status": "success"})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": error.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ONE-OFF UTILITY: Backfills pollen and 24-hr graph data from May 1st to Today.
 * Updates BOTH HayFever (only if row exists) and Pollen_Metrics simultaneously.
 */
function runHayfeverBackfill() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const hfSheet = ss.getSheetByName("HayFever");
  let pmSheet = ss.getSheetByName("Pollen_Metrics");
  if (!pmSheet) {
    pmSheet = ss.insertSheet("Pollen_Metrics");
    pmSheet.appendRow(["Date", "Location", "Overall Level", "Specific Pollens", "Hourly Graph Data", "Timestamp"]);
  }
  
  const lat = 53.326; 
  const lon = -2.227; 
  const locName = "Wilmslow";
  
  const startDate = "2026-05-01";
  const endDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  // 1. Fetch entire historical dataset in one request
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen&start_date=${startDate}&end_date=${endDate}&timezone=Europe%2FLondon`;
  
  const response = UrlFetchApp.fetch(url);
  const json = JSON.parse(response.getContentText());
  const times = json.hourly.time;
  
  // 2. Chunk hourly data into Daily aggregations
  let daysData = {};
  for(let i = 0; i < times.length; i++) {
    let day = times[i].split("T")[0];
    if(!daysData[day]) daysData[day] = { treeMax: 0, grassMax: 0, weedMax: 0, hourlyTotals: [] };
    
    let tree = (json.hourly.alder_pollen[i] || 0) + (json.hourly.birch_pollen[i] || 0);
    let grass = (json.hourly.grass_pollen[i] || 0);
    let weed = (json.hourly.mugwort_pollen[i] || 0) + (json.hourly.ragweed_pollen[i] || 0);
    
    if(tree > daysData[day].treeMax) daysData[day].treeMax = tree;
    if(grass > daysData[day].grassMax) daysData[day].grassMax = grass;
    if(weed > daysData[day].weedMax) daysData[day].weedMax = weed;
    
    daysData[day].hourlyTotals.push(tree + grass + weed);
  }
  
  const getLevel = (val, modThresh, highThresh) => {
    if (val >= highThresh) return "High";
    if (val >= modThresh) return "Moderate";
    return "Low";
  };
  
  // 3. Map Existing Sheet Dates
  const hfDataRange = hfSheet.getDataRange().getValues();
  let hfExistingDates = {};
  for(let i = 1; i < hfDataRange.length; i++) {
    if(hfDataRange[i][0]) hfExistingDates[new Date(hfDataRange[i][0]).toDateString()] = i + 1;
  }
  
  const pmDataRange = pmSheet.getDataRange().getValues();
  let pmExistingDates = {};
  for(let i = 1; i < pmDataRange.length; i++) {
    if(pmDataRange[i][0]) pmExistingDates[new Date(pmDataRange[i][0]).toDateString()] = i + 1;
  }
  
  // 4. Inject or Create Rows
  for(const [day, metrics] of Object.entries(daysData)) {
    const dateStr = new Date(day).toDateString();
    
    const treeLvl = getLevel(metrics.treeMax, 15, 90);
    const grassLvl = getLevel(metrics.grassMax, 10, 50);
    const weedLvl = getLevel(metrics.weedMax, 10, 50);
    
    const levels = [treeLvl, grassLvl, weedLvl];
    let overall = levels.includes("High") ? "High" : levels.includes("Moderate") ? "Moderate" : "Low";
    const specStr = `Tree: ${treeLvl} | Grass: ${grassLvl} | Weed: ${weedLvl}`;
    const hourlyJson = JSON.stringify(metrics.hourlyTotals);
    const stamp = new Date();
    
    // Write to HayFever (ONLY if the row already exists so we don't make blank noise rows)
    if(hfExistingDates[dateStr]) {
        let r = hfExistingDates[dateStr];
        hfSheet.getRange(r, 2).setValue(locName);
        hfSheet.getRange(r, 3).setValue(overall);
        hfSheet.getRange(r, 7).setValue(stamp);
    }
    
    // Write to Pollen_Metrics
    if(pmExistingDates[dateStr]) {
        let r = pmExistingDates[dateStr];
        pmSheet.getRange(r, 2, 1, 5).setValues([[locName, overall, specStr, hourlyJson, stamp]]);
    } else {
        pmSheet.appendRow([day, locName, overall, specStr, hourlyJson, stamp]);
    }
  }
  
  Logger.log("Historical Backfill Complete across sheets (skipped blank HayFever rows)!");
}