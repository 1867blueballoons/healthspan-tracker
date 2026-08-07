// Healthspan Metrics Google Sheet
// SAVE THIS
// const SPREADSHEET_ID = '1EfWXl1Qs7z9i3DtTirZlToIKdBwBgiie6etpaoPObig'; // <-- Double check this!
// Code.gs - Backend v2.0 (Bulk Fetch)
const SPREADSHEET_ID = '1EfWXl1Qs7z9i3DtTirZlToIKdBwBgiie6etpaoPObig'; 

function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets().map(s => s.getName());
    
    // We now return an object where the keys are date strings
    let responseData = { availableSheets: sheets, status: "success", dataByDate: {} };
    
    const initDate = (dateStr) => {
      if (!responseData.dataByDate[dateStr]) {
        responseData.dataByDate[dateStr] = { metrics: null, hayfever: null, symptoms: [] };
      }
    };

    // Fetch Supplement Logging (Base Metrics)
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

    // Fetch HayFever
    if (sheets.includes("HayFever")) {
      const data = ss.getSheetByName("HayFever").getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0]) {
          let dateStr = new Date(data[i][0]).toDateString();
          initDate(dateStr);
          responseData.dataByDate[dateStr].hayfever = data[i];
        }
      }
    }

    // Fetch General Symptoms
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

// ... Keep your existing doPost(e) function exactly as it is! ...

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

    // 1. Supplement_Tracking_Log (Now includes Energy and Feedback)
    if (data.ambient_temp_celsius || data.sleep_debt_manual || data.subjective_energy || data.daily_feedback) {
      upsertRow("Supplement_Tracking_Log", entryDate, 
        (sheet, row) => {
          if (data.ambient_temp_celsius) sheet.getRange(row, 7).setValue(data.ambient_temp_celsius);
          if (data.subjective_energy) sheet.getRange(row, 12).setValue(data.subjective_energy); // Col L (Index 11)
          if (data.daily_feedback) sheet.getRange(row, 14).setValue(data.daily_feedback);       // Col N (Index 13)
          if (data.sleep_debt_manual) sheet.getRange(row, 16).setValue(data.sleep_debt_manual);
        },
        (sheet) => {
          let newRow = new Array(16).fill("");
          newRow[0] = entryDate; 
          newRow[6] = data.ambient_temp_celsius; 
          newRow[11] = data.subjective_energy;
          newRow[13] = data.daily_feedback;
          newRow[15] = data.sleep_debt_manual;
          sheet.appendRow(newRow);
        }
      );
    }

    // 2. HayFever
    if (data.postcode_prefix || data.hayfever_symptoms) {
      upsertRow("HayFever", entryDate,
        (sheet, row) => {
          sheet.getRange(row, 1, 1, 7).setValues([[entryDate, data.postcode_prefix, data.pollen_count_level, data.hayfever_symptoms, data.hayfever_duration_mins, data.allergy_interventions_with_success, timestamp]]);
        },
        (sheet) => sheet.appendRow([entryDate, data.postcode_prefix, data.pollen_count_level, data.hayfever_symptoms, data.hayfever_duration_mins, data.allergy_interventions_with_success, timestamp])
      );
    }

    // 3. General Symptoms
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
          symSheet.appendRow([entryDate, sym.description, sym.cause, sym.duration, timestamp, sym.comment]);
        }
      });
    }

    return ContentService.createTextOutput(JSON.stringify({"status": "success"})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": error.message})).setMimeType(ContentService.MimeType.JSON);
  }
}