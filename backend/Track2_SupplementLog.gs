// HealthSpan Metrics Google Sheet
/**
 * Builds the Custom Menu
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Log Management')
    .addItem('▶️ Run Standard 7-Day Sync', 'syncTrackingLog')
    .addItem('⛳ Upload Golf Audit (JSON)', 'showGolfAuditUploadDialog')
    .addToUi();
}

/**
 * Launches the native HTML file upload modal
 */
function showGolfAuditUploadDialog() {
  const html = HtmlService.createHtmlOutputFromFile('upload_form')
    .setWidth(420)
    .setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, 'Upload Golf Tracker Data');
}

/**
 * Triggers the UI Prompt for the user to specify how many days to backfill
 */
function promptHistoricalBackfill() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Historical Backfill',
    'How many days back would you like to refresh? (e.g., 30)\nThis will update Oura and Weather data without overwriting your manual notes.',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() == ui.Button.OK) {
    const days = parseInt(response.getResponseText(), 10);
    if (isNaN(days) || days <= 0) {
      ui.alert('Error', 'Please enter a valid positive number.', ui.ButtonSet.OK);
      return;
    }
    executeSync_(days);
    ui.alert('Success', `Successfully backfilled the last ${days} days.`, ui.ButtonSet.OK);
  }
}

/**
 * The standard nightly 7-Day Sync 
 */
function syncTrackingLog() {
  executeSync_(7);
  
  Logger.log("Successfully completed full sync. Manually update sleep debt and other fields.");
}

/**
 * Sets up a time-driven trigger to run the sync automatically every night.
 */
function setupNightlyTrigger() {
  const ui = SpreadsheetApp.getUi();
  
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncTrackingLog') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  ScriptApp.newTrigger('syncTrackingLog')
    .timeBased()
    .everyDays(1)
    .atHour(2) 
    .create();
    
  ui.alert('Automated', 'Nightly Auto-Sync is now enabled. It will run every night between 2:00 AM and 3:00 AM.', ui.ButtonSet.OK);
}

/**
 * CORE ENGINE: Safely updates automated columns including HRV and RHR.
 * FORTIFIED: Uses Primary Key Hash Map lookup to prevent duplicate rows and blank date injections.
 */
function executeSync_(daysLookback) {
  const ssTarget = SpreadsheetApp.getActiveSpreadsheet();
  const sheetTarget = ssTarget.getSheetByName('Supplement_Tracking_Log');
  
  if (!sheetTarget) throw new Error("Supplement_Tracking_Log sheet not found.");
  
  // 1. Pre-flight cleanup of any orphaned blank rows
  cleanEmptyDateRows_(sheetTarget);

  const currentDate = new Date();
  const pastDate = new Date();
  pastDate.setDate(currentDate.getDate() - daysLookback);
  
  const sourceFileId = getTargetSpreadsheetId_("Oura Recovery Pipeline");
  const ssSource = SpreadsheetApp.openById(sourceFileId);
  
  const readinessData = getMappedData_(ssSource.getSheetByName('Readiness Pipeline'));
  const tagsData = getMappedData_(ssSource.getSheetByName('Oura_Tags'));
  const trainingData = getMappedData_(ssSource.getSheetByName('Training Logs'));
  
  const tagsByDate = processTags_(tagsData);
  const activitiesByDate = processActivities_(trainingData);
  
  // 2. Build Primary Key (Date) Hash Map for O(1) Index Lookup
  const targetData = sheetTarget.getDataRange().getValues();
  const rowIndexMap = {};
  
  for (let i = 1; i < targetData.length; i++) {
    const formattedCellDate = formatDate_(targetData[i][0]);
    if (formattedCellDate) {
      rowIndexMap[formattedCellDate] = i + 1; // 1-based row index in Sheet
    }
  }
  
  // 3. Chronological Loop
  for (let d = new Date(pastDate); d <= currentDate; d.setDate(d.getDate() + 1)) {
    const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    let phase = "Pre-Protocol";
    if (d >= new Date('2026-07-13T00:00:00')) phase = "Phase 1";
    if (d >= new Date('2026-07-26T00:00:00')) phase = "Phase 2";
    
    const dailyBiometrics = readinessData.find(row => formatDate_(row['date'] || row['day']) === dateStr) || {};
    const readinessScore = dailyBiometrics['readiness score'] || dailyBiometrics['score'] || dailyBiometrics['readiness'] || "";
    
    let sleepEfficiency = dailyBiometrics['efficiency (%)'] || dailyBiometrics['efficiency %'] || dailyBiometrics['efficiency'] || "";
    if (sleepEfficiency !== "") {
      sleepEfficiency = parseInt(sleepEfficiency.toString().replace(/[^0-9]/g, ''), 10);
    }
    
    const avgHrv = dailyBiometrics['average hrv'] || dailyBiometrics['hrv'] || dailyBiometrics['rmssd'] || "";
    const lowestRhr = dailyBiometrics['lowest resting hr'] || dailyBiometrics['lowest heart rate'] || dailyBiometrics['rhr'] || dailyBiometrics['lowest resting heart rate'] || "";
    
    const dailyTags = tagsByDate[dateStr] || { ENV: "", SUP: "", SYM: "" };
    const dailyActivities = activitiesByDate[dateStr] || "";
    
    const existingRowIndex = rowIndexMap[dateStr];
    
    if (existingRowIndex) {
      // EXACT IN-PLACE OVERWRITE
      sheetTarget.getRange(existingRowIndex, 1, 1, 4).setValues([[dateStr, phase, readinessScore, sleepEfficiency]]); 
      sheetTarget.getRange(existingRowIndex, 5, 1, 2).setValues([[avgHrv, lowestRhr]]); 
      sheetTarget.getRange(existingRowIndex, 8, 1, 4).setValues([[dailyTags.ENV, dailyTags.SUP, dailyTags.SYM, dailyActivities]]); 
    } else {
      // NEW DATE INSERTION
      sheetTarget.insertRowBefore(2);
      const newRow = [
        dateStr, phase, readinessScore, sleepEfficiency, 
        avgHrv, lowestRhr, 
        "", 
        dailyTags.ENV, dailyTags.SUP, dailyTags.SYM, dailyActivities, 
        "", "", "", "", "" 
      ];
      sheetTarget.getRange(2, 1, 1, newRow.length).setValues([newRow]);
      
      // Shift active map pointers down by 1
      Object.keys(rowIndexMap).forEach(key => {
        rowIndexMap[key] = rowIndexMap[key] + 1;
      });
      rowIndexMap[dateStr] = 2; 
      
      SpreadsheetApp.flush(); 
    }
  }
  
  // 4. Enforce Column Formatting
  const maxRows = sheetTarget.getLastRow();
  if (maxRows > 1) {
    sheetTarget.getRange(2, 1, maxRows - 1, 1).setNumberFormat('yyyy-MM-dd'); 
    sheetTarget.getRange(2, 3, maxRows - 1, 1).setNumberFormat('0');          
    sheetTarget.getRange(2, 4, maxRows - 1, 1).setNumberFormat('0');          
    sheetTarget.getRange(2, 5, maxRows - 1, 2).setNumberFormat('0'); 
  }
}

/**
 * HELPER: Scans the sheet and deletes corrupt rows where Primary Key (Column A) is missing.
 */
function cleanEmptyDateRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
  for (let i = dates.length - 1; i >= 0; i--) {
    const val = dates[i][0];
    if (val === "" || val === null || val === undefined) {
      sheet.deleteRow(i + 2);
    }
  }
}

/**
 * HELPER: Groups raw training rows by Date and extracts unique activities.
 */
function processActivities_(trainingData) {
  const grouped = {};
  trainingData.forEach(row => {
    const dateStr = formatDate_(row['date'] || row['activity date']);
    if (!dateStr) return;
    
    const activity = row['activity type'] || row['activity'] || row['type'] || "";
    if (activity) {
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(activity);
    }
  });
  
  for (const date in grouped) {
    grouped[date] = [...new Set(grouped[date])].join(', ');
  }
  return grouped;
}

/**
 * HELPER: Dynamically locates the target workbook in the same Drive folder.
 */
function getTargetSpreadsheetId_(targetFileName) {
  const currentFileId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const folder = DriveApp.getFileById(currentFileId).getParents().next();
  const targetFiles = folder.getFilesByName(targetFileName);
  if (targetFiles.hasNext()) return targetFiles.next().getId();
  throw new Error(`Could not find a file named '${targetFileName}' in the same folder.`);
}

/**
 * HELPER: Converts a 2D array into an object array with lowercase, trimmed keys.
 */
function getMappedData_(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const headers = data[0].map(h => h.toString().toLowerCase().replace(/\s+/g, ' ').trim());
  const mapped = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
    mapped.push(obj);
  }
  return mapped;
}

/**
 * HELPER: Groups raw tag rows by Date and Type into comma-separated strings.
 */
function processTags_(tagsData) {
  const grouped = {};
  tagsData.forEach(row => {
    const dateStr = formatDate_(row['date']);
    if (!dateStr) return;
    
    if (!grouped[dateStr]) grouped[dateStr] = { ENV: [], SUP: [], SYM: [] };
    
    const tagName = row['tag name'] || row['name'] || "";
    const tagType = row['tag type'] || row['type'] || "";
    
    if (tagName && tagType) {
      if (tagType.toUpperCase().includes('ENV')) grouped[dateStr].ENV.push(tagName);
      else if (tagType.toUpperCase().includes('SUP')) grouped[dateStr].SUP.push(tagName);
      else if (tagType.toUpperCase().includes('SYM')) grouped[dateStr].SYM.push(tagName);
    }
  });
  
  for (const date in grouped) {
    grouped[date].ENV = grouped[date].ENV.join(', ');
    grouped[date].SUP = grouped[date].SUP.join(', ');
    grouped[date].SYM = grouped[date].SYM.join(', ');
  }
  return grouped;
}

/**
 * HELPER: Safely formats any date object or string into yyyy-MM-dd.
 */
function formatDate_(val) {
  if (!val) return null;
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } catch (e) {}
  return null;
}

/**
 * Ingests Golf Audit JSON payloads and validates focus score against MDM Taxonomy.
 */
function ingestGolfAuditJSON(jsonString) {
  const ssTarget = SpreadsheetApp.getActiveSpreadsheet();
  const sheetTarget = ssTarget.getSheetByName('Supplement_Tracking_Log');
  
  try {
    const payload = JSON.parse(jsonString);
    const targetDate = payload.workspaceDate;
    
    if (!targetDate) {
      throw new Error("Could not find a valid workspaceDate in the JSON payload.");
    }
    
    const focusScore = payload.synthesis && payload.synthesis.focus ? payload.synthesis.focus : "";
    
    const mdmFileId = getTargetSpreadsheetId_("Master Data Dictionary");
    const mdmSheet = SpreadsheetApp.openById(mdmFileId).getSheetByName('Taxonomy_Dictionary');
    if (!mdmSheet) throw new Error("Could not find 'Taxonomy_Dictionary' tab in the Master Data Dictionary.");
    
    const mdmData = getMappedData_(mdmSheet);
    
    const validGolfTags = mdmData
      .filter(row => {
        const category = (row['category'] || "").toString().toLowerCase().trim();
        const status = (row['status'] || "").toString().toLowerCase().trim();
        return category === 'golf focus' && status === 'active';
      })
      .map(row => row['tag name']);
      
    if (validGolfTags.length === 0) {
       throw new Error("No active 'Golf Focus' tags found in the MDM. Ensure the Status is set to 'Active'.");
    }

    let finalFocus = "";
    if (validGolfTags.includes(focusScore)) {
      finalFocus = focusScore;
    } else if (focusScore !== "Not Recorded" && focusScore !== "") {
      Logger.log(`MDM Warning: The focus score "${focusScore}" is not an active tag in the Master Data Dictionary.`);
    }
    
    const data = sheetTarget.getDataRange().getValues();
    let targetRowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (formatDate_(data[i][0]) === targetDate) {
        targetRowIndex = i + 1;
        break;
      }
    }
    
    if (targetRowIndex === -1) {
      throw new Error(`Date ${targetDate} not found in the Tracking Log. The row must exist before golf data can be injected.`);
    }
    
    sheetTarget.getRange(targetRowIndex, 11).setValue(finalFocus);
    
    return finalFocus ? `Successfully injected: "${finalFocus}"` : `No MDM-compliant Golf Focus tag found.`;
    
  } catch (e) {
    throw new Error(e.message);
  }
}



/**
 * HELPER: Applies range protection to prevent manual edits on display columns.
 */
function protectDisplayColumn_(sheet, colIndex) {
  const range = sheet.getRange(1, colIndex, sheet.getMaxRows(), 1);
  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  
  let isProtected = false;
  for (let i = 0; i < protections.length; i++) {
    if (protections[i].getRange().getColumn() === colIndex) {
      isProtected = true;
      break;
    }
  }

  if (!isProtected) {
    const protection = range.protect().setDescription('Automated Read-Only Display Column');
    protection.removeEditors(protection.getEditors());
    if (protection.canDomainEdit()) {
      protection.setDomainEdit(false);
    }
  }
}
