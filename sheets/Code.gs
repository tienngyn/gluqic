/**
 * gluciq – nimmt Einträge vom iPhone-Kurzbefehl an und schreibt sie in diese Tabelle.
 *
 * Einrichtung (einmal, am Computer):
 *   1. In der Tabelle: Erweiterungen → Apps Script, diesen Code einfügen.
 *   2. TOKEN unten durch deinen geheimen Code ersetzen (derselbe wie im Kurzbefehl).
 *   3. Bereitstellen → Neue Bereitstellung → Typ „Web-App“,
 *      Ausführen als: „Ich“, Zugriff: „Jeder“. Die Web-App-URL kommt in den Kurzbefehl.
 *
 * Der Kurzbefehl sendet JSON per POST:
 *   Eintrag:  {"token": "...", "bg": 124, "carbs": 60, "weighed": "Gewogen", "units": 6, "minutesAgo": 0}
 *             (jedes Feld darf leer sein; ohne Kohlenhydrate ist eine Dosis eine Korrektur)
 *   Dexcom:   {"token": "...", "type": "glucose", "data": "2026-11-05T12:00:00+01:00;124\n..."}
 *             (Werte aus Apple Health, eine Zeile pro Messung; doppelte werden übersprungen)
 */

const TOKEN = 'HIER_DEIN_CODE';
const TZ = 'Europe/Berlin';
const ENTRIES = 'Einträge';
const SENSOR = 'Dexcom';
const ENTRY_HEADER = ['Zeit', 'Blutzucker (mg/dL)', 'Kohlenhydrate (g)', 'Gewogen', 'NovoRapid (IE)', 'Notiz'];
const SENSOR_HEADER = ['Zeit', 'Blutzucker (mg/dL)'];

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return reply('Fehler: ungültige Daten');
  }
  if (body.token !== TOKEN) return reply('Fehler: falscher Code');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return reply(body.type === 'glucose' ? addSensorReadings(String(body.data || '')) : addEntry(body));
  } finally {
    lock.releaseLock();
  }
}

/** Zum Testen im Browser: zeigt, ob die Web-App läuft. */
function doGet() {
  return reply('gluciq läuft');
}

function addEntry(b) {
  // 0 heißt „nichts“: so geht es auch, wenn das iPhone kein leeres Feld zulässt.
  const bg = toNumber(b.bg) || null;
  const carbs = toNumber(b.carbs) || null;
  const units = toNumber(b.units) || null;
  if (bg == null && carbs == null && units == null) return 'Nichts eingetragen';
  if (bg != null && (bg < 20 || bg > 600)) return 'Fehler: Blutzucker ' + bg + ' bitte prüfen';
  if (carbs != null && (carbs < 0 || carbs > 400)) return 'Fehler: Kohlenhydrate ' + carbs + ' bitte prüfen';
  if (units != null && (units < 0 || units > 50)) return 'Fehler: Einheiten ' + units + ' bitte prüfen';

  const minutesAgo = toNumber(b.minutesAgo) || 0;
  const time = new Date(Date.now() - minutesAgo * 60000);
  const weighed = carbs ? (/gewogen|ja|true/i.test(String(b.weighed || '')) ? 'ja' : 'nein') : '';
  const sheet = sheetFor(ENTRIES, ENTRY_HEADER);
  sheet.appendRow([time, blank(bg), blank(carbs), weighed, blank(units), String(b.note || '')]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd.MM.yyyy HH:mm');

  const parts = [];
  if (bg != null) parts.push(de(bg) + ' mg/dL');
  if (carbs != null) parts.push(de(carbs) + ' g');
  if (units != null) parts.push(de(units) + ' IE' + (carbs ? '' : ' Korrektur'));
  return 'Gespeichert: ' + parts.join(' · ');
}

function addSensorReadings(data) {
  const sheet = sheetFor(SENSOR, SENSOR_HEADER);
  const existing = new Set();
  const last = sheet.getLastRow();
  if (last > 1) {
    sheet
      .getRange(2, 1, last - 1, 1)
      .getValues()
      .forEach(function (r) {
        if (r[0] instanceof Date) existing.add(minuteKey(r[0]));
      });
  }
  const rows = [];
  data.split(/\r?\n/).forEach(function (line) {
    const parts = line.split(';');
    if (parts.length < 2) return;
    const time = new Date(parts[0].trim());
    const value = toNumber(parts[1]);
    if (isNaN(time.getTime()) || value == null || value < 20 || value > 600) return;
    const key = minuteKey(time);
    if (existing.has(key)) return;
    existing.add(key);
    rows.push([time, Math.round(value)]);
  });
  if (!rows.length) return 'Dexcom: nichts Neues';
  rows.sort(function (a, b) {
    return a[0] - b[0];
  });
  const start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, 2).setValues(rows);
  sheet.getRange(start, 1, rows.length, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  return 'Dexcom: ' + rows.length + ' neue Werte';
}

/** Holt den Tab oder legt ihn an. Der erste, leere Tab der Tabelle wird zu „Einträge“. */
function sheetFor(name, header) {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSpreadsheetTimeZone() !== TZ) ss.setSpreadsheetTimeZone(TZ);
  let sheet = ss.getSheetByName(name);
  if (!sheet && name === ENTRIES) {
    const first = ss.getSheets()[0];
    if (first.getLastRow() <= 1 && String(first.getRange(1, 1).getValue()) === 'Zeit') sheet = first.setName(name);
  }
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
  return sheet;
}

function toNumber(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const de = (n) => String(n).replace('.', ',');
const blank = (v) => (v == null ? '' : v);
const minuteKey = (d) => Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm');

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
