/**
 * gluciq – nimmt Einträge vom iPhone-Kurzbefehl an, schreibt sie in diese Tabelle
 * und schlägt (Phase 2) eine NovoRapid-Dosis nach deinem festgelegten System vor.
 *
 * Einrichtung (einmal, am Computer):
 *   1. In der Tabelle: Erweiterungen → Apps Script, diesen Code einfügen.
 *   2. TOKEN unten durch deinen geheimen Code ersetzen (derselbe wie im Kurzbefehl).
 *   3. Bereitstellen → Neue Bereitstellung → Typ „Web-App“,
 *      Ausführen als: „Ich“, Zugriff: „Jeder“. Die Web-App-URL kommt in den Kurzbefehl.
 *   Nach einer Änderung am Code: Bereitstellen → Bereitstellungen verwalten → Bearbeiten →
 *   Version „Neue Version“ → Bereitstellen (die URL bleibt gleich).
 *
 * Der Kurzbefehl sendet JSON per POST:
 *   Vorschlag: {"token", "action": "suggest", "bg": 150, "carbs": 45}
 *              → {"enabled": "ja"|"nein", "units": 6.5, "text": "..."} (speichert nichts)
 *   Eintrag:   {"token", "bg": 124, "carbs": 60, "weighed": "Gewogen", "units": 6, "suggested": 6.5}
 *              (jedes Feld darf leer sein; ohne Kohlenhydrate ist eine Dosis eine Korrektur)
 *   Dexcom:    {"token", "type": "glucose", "data": "2026-11-05T12:00:00+01:00;124\n..."}
 *              (Werte aus Apple Health, eine Zeile pro Messung; doppelte werden übersprungen)
 *
 * Die Dosis rechnet nur dieser Code, nach einer festen Formel:
 *   Mahlzeit   = Kohlenhydrate ÷ KE-Faktor der Tageszeit (g pro IE)
 *   Korrektur  = (Blutzucker − Zielwert) ÷ Korrekturfaktor
 *   Vorschlag  = Mahlzeit + Korrektur − noch aktives NovoRapid
 *   dann: unter „Kein Insulin unter“ → 0 · nie unter 0 · auf 0,5 IE abrunden · höchstens Höchstdosis
 * Ein Vorschlag kommt erst, wenn im Tab „Mein System“ alles ausgefüllt ist und „Vorschlag aktiv“ auf „ja“ steht.
 */

const TOKEN = 'HIER_DEIN_CODE';
const TZ = 'Europe/Berlin';
const ENTRIES = 'Einträge';
const SENSOR = 'Dexcom';
const SYSTEM = 'Mein System';
const ENTRY_HEADER = ['Zeit', 'Blutzucker (mg/dL)', 'Kohlenhydrate (g)', 'Gewogen', 'NovoRapid (IE)', 'Notiz', 'Vorschlag (IE)'];
const SENSOR_HEADER = ['Zeit', 'Blutzucker (mg/dL)'];
const DOSE_STEP = 0.5;
const PEAK_MIN = 75; // NovoRapid

/** Zeilen im Tab „Mein System“: Schlüssel, Bezeichnung, Startwert, Erklärung. */
const SYSTEM_ROWS = [
  ['active', 'Vorschlag aktiv', 'nein', 'Erst auf „ja“ stellen, wenn du die Werte mit deinem Arzt festgelegt hast.'],
  ['target', 'Zielwert (mg/dL)', 110, ''],
  ['morning', 'KE-Faktor morgens 5–11 Uhr (g pro IE)', '', 'z. B. 8 = 1 IE für 8 g'],
  ['midday', 'KE-Faktor mittags 11–16 Uhr (g pro IE)', '', ''],
  ['evening', 'KE-Faktor abends 16–22 Uhr (g pro IE)', '', ''],
  ['late', 'KE-Faktor spät 22–5 Uhr (g pro IE)', '', 'leer = kein Vorschlag zu dieser Zeit'],
  ['cf', 'Korrekturfaktor (mg/dL pro IE)', '', 'so weit senkt dich 1 IE'],
  ['max', 'Höchstdosis pro Spritze (IE)', '', 'mehr schlägt gluciq nie vor'],
  ['min', 'Kein Insulin unter (mg/dL)', 70, ''],
  ['duration', 'Wirkdauer NovoRapid (Stunden)', 4.5, 'für das noch aktive Insulin'],
];

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return reply('Fehler: ungültige Daten');
  }
  if (body.token !== TOKEN) return body.action === 'suggest' ? json(off('Fehler: falscher Code')) : reply('Fehler: falscher Code');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    readSystem(); // legt „Mein System“ beim ersten Aufruf an
    if (body.action === 'suggest') return json(suggest(body, new Date()));
    return reply(body.type === 'glucose' ? addSensorReadings(String(body.data || '')) : addEntry(body));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ohne Parameter: zeigt im Browser, ob die Web-App läuft.
 * Mit ?token=…&days=28: gibt Einträge, Dexcom-Werte und „Mein System“ der letzten Tage als JSON zurück
 * (für die tägliche Auswertung durch Claude). Ohne richtigen Code gibt es keine Daten.
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.token) return reply('gluciq läuft');
  if (p.token !== TOKEN) return json({ error: 'falscher Code' });
  const days = Math.min(90, Math.max(1, toNumber(p.days) || 28));
  return json(exportData(new Date(Date.now() - days * 86400000)));
}

function exportData(since) {
  const ss = SpreadsheetApp.getActive();
  const rows = (name, cols) => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues().filter((r) => r[0] instanceof Date && r[0] >= since);
  };
  const iso = (d) => Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const num = (v) => toNumber(v);
  return {
    timeZone: TZ,
    generated: iso(new Date()),
    entries: rows(ENTRIES, 7).map((r) => ({
      t: iso(r[0]),
      bg: num(r[1]),
      carbs: num(r[2]),
      weighed: r[3] === 'ja' ? true : r[3] === 'nein' ? false : null,
      units: num(r[4]),
      note: String(r[5] || ''),
      suggested: num(r[6]),
    })),
    sensor: rows(SENSOR, 2).map((r) => [iso(r[0]), num(r[1])]),
    system: readSystem(),
  };
}

// ---------------------------------------------------------------- Phase 2: Vorschlag

const off = (text) => ({ enabled: 'nein', units: 0, text: text });
const ASK = 'Wie viel NovoRapid hast du gespritzt? (IE)';

function suggest(b, now) {
  const s = readSystem();
  if (!/^ja$/i.test(String(s.active || '').trim())) return off(ASK);
  const slot = slotFor(now);
  const ratio = toNumber(s[slot]);
  const missing = [];
  if (!(toNumber(s.target) >= 70 && toNumber(s.target) <= 200)) missing.push('Zielwert');
  if (!(toNumber(s.cf) >= 5 && toNumber(s.cf) <= 400)) missing.push('Korrekturfaktor');
  if (!(toNumber(s.max) > 0 && toNumber(s.max) <= 50)) missing.push('Höchstdosis');
  if (missing.length) return off('Kein Vorschlag: in „Mein System“ fehlt ' + missing.join(', ') + '.\n\n' + ASK);

  const bg = toNumber(b.bg) || null;
  const carbs = toNumber(b.carbs) || 0;
  if (bg == null) return off('Ohne Blutzucker kein Vorschlag.\n\n' + ASK);
  if (bg < 20 || bg > 600) return off('Blutzucker ' + bg + ' bitte prüfen.\n\n' + ASK);
  if (carbs < 0 || carbs > 400) return off('Kohlenhydrate ' + carbs + ' bitte prüfen.\n\n' + ASK);
  if (carbs > 0 && !(ratio >= 1 && ratio <= 150)) {
    return off('Für diese Tageszeit steht noch kein KE-Faktor in „Mein System“.\n\n' + ASK);
  }

  const r = calculate({
    bg: bg,
    carbs: carbs,
    ratio: ratio,
    target: toNumber(s.target),
    cf: toNumber(s.cf),
    max: toNumber(s.max),
    min: toNumber(s.min) || 70,
    iob: activeInsulin(now, toNumber(s.duration) || 4.5),
  });
  return { enabled: 'ja', units: r.units, text: r.text };
}

/** Die feste Formel. Rein: keine Tabelle, keine Uhr. */
function calculate(p) {
  const meal = p.carbs > 0 ? p.carbs / p.ratio : 0;
  const correction = (p.bg - p.target) / p.cf;
  const raw = meal + correction - p.iob;
  const lines = [];
  if (p.carbs > 0) lines.push('Essen: ' + de(p.carbs) + ' g ÷ ' + de(p.ratio) + ' = ' + de(round(meal, 1)) + ' IE');
  lines.push('Korrektur: (' + de(p.bg) + ' − ' + de(p.target) + ') ÷ ' + de(p.cf) + ' = ' + signed(correction) + ' IE');
  if (p.iob >= 0.05) lines.push('Noch aktiv: −' + de(round(p.iob, 1)) + ' IE');

  if (p.bg < p.min) {
    return {
      units: 0,
      text:
        'Kein Insulin – unter ' + de(p.min) + ' mg/dL.\nErst 15–20 g schnelle Kohlenhydrate, nach 15 min nochmal messen.',
    };
  }
  let units = raw <= 0 ? 0 : Math.floor(raw / DOSE_STEP + 1e-9) * DOSE_STEP;
  const notes = [];
  if (units > p.max) {
    units = p.max;
    notes.push('Auf deine Höchstdosis von ' + de(p.max) + ' IE begrenzt.');
  }
  if (raw <= 0 && p.carbs > 0) notes.push('Das aktive Insulin deckt das Essen schon ab.');
  if (p.iob >= 1) notes.push('Das noch aktive Insulin ist schon abgezogen – nicht zusätzlich nachspritzen.');
  if (p.bg > 250) notes.push('Über 250 mg/dL: denk daran, Ketone zu prüfen.');
  const head = units > 0 ? 'Vorschlag: ' + de(units) + ' IE' : 'Vorschlag: kein Insulin';
  return { units: units, text: [head, lines.join('\n')].concat(notes).join('\n\n') };
}

/** NovoRapid aus „Einträge“, das jetzt noch wirkt (OpenAPS-Kurve, wie in der App). */
function activeInsulin(now, durationHours) {
  const sheet = sheetFor(ENTRIES, ENTRY_HEADER);
  if (sheet.getLastRow() < 2) return 0;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  let total = 0;
  rows.forEach(function (r) {
    const units = toNumber(r[4]);
    if (!(r[0] instanceof Date) || !units) return;
    total += units * iobFraction((now.getTime() - r[0].getTime()) / 60000, durationHours * 60, PEAK_MIN);
  });
  return round(total, 2);
}

function iobFraction(t, end, peak) {
  if (t < 0) return 0; // Einträge in der Zukunft zählen nicht
  if (t === 0) return 1;
  if (t >= end) return 0;
  const tau = (peak * (1 - peak / end)) / (1 - (2 * peak) / end);
  const a = (2 * tau) / end;
  const S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));
  const f = 1 - S * (1 - a) * ((t * t / (tau * end * (1 - a)) - t / tau - 1) * Math.exp(-t / tau) + 1);
  return Math.min(1, Math.max(0, f));
}

function slotFor(now) {
  const h = Number(Utilities.formatDate(now, TZ, 'H'));
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'midday';
  if (h >= 16 && h < 22) return 'evening';
  return 'late';
}

/** Liest „Mein System“ (legt den Tab beim ersten Mal an). Zuordnung über die Bezeichnung in Spalte A. */
function readSystem() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SYSTEM);
  if (!sheet) {
    sheet = ss.insertSheet(SYSTEM);
    sheet.getRange(1, 1, 1, 3).setValues([['Einstellung', 'Wert', 'Hinweis']]).setFontWeight('bold');
    sheet.getRange(2, 1, SYSTEM_ROWS.length, 3).setValues(SYSTEM_ROWS.map((r) => [r[1], r[2], r[3]]));
    sheet.setFrozenRows(1);
  }
  const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [];
  const out = {};
  SYSTEM_ROWS.forEach(function (row) {
    const hit = values.find((v) => String(v[0]).trim() === row[1]);
    out[row[0]] = hit ? hit[1] : '';
  });
  return out;
}

// ---------------------------------------------------------------- Einträge

function addEntry(b) {
  // 0 heißt „nichts“: so geht es auch, wenn das iPhone kein leeres Feld zulässt.
  const bg = toNumber(b.bg) || null;
  const carbs = toNumber(b.carbs) || null;
  const units = toNumber(b.units) || null;
  const suggested = toNumber(b.suggested);
  if (bg == null && carbs == null && units == null) return 'Nichts eingetragen';
  if (bg != null && (bg < 20 || bg > 600)) return 'Fehler: Blutzucker ' + bg + ' bitte prüfen';
  if (carbs != null && (carbs < 0 || carbs > 400)) return 'Fehler: Kohlenhydrate ' + carbs + ' bitte prüfen';
  if (units != null && (units < 0 || units > 50)) return 'Fehler: Einheiten ' + units + ' bitte prüfen';

  const minutesAgo = toNumber(b.minutesAgo) || 0;
  const time = new Date(Date.now() - minutesAgo * 60000);
  const weighed = carbs ? (/gewogen|ja|true/i.test(String(b.weighed || '')) ? 'ja' : 'nein') : '';
  const sheet = sheetFor(ENTRIES, ENTRY_HEADER);
  sheet.appendRow([time, blank(bg), blank(carbs), weighed, blank(units), String(b.note || ''), blank(suggested)]);
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

/** Holt den Tab oder legt ihn an. Der erste, leere Tab der Tabelle wird zu „Einträge“. Fehlende Spaltenköpfe werden ergänzt. */
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
  }
  if (sheet.getLastColumn() < header.length) sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  return sheet;
}

// ---------------------------------------------------------------- Hilfen

function toNumber(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const round = (n, d) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
const de = (n) => String(n).replace('.', ',');
const signed = (n) => (n >= 0 ? '+' : '−') + de(round(Math.abs(n), 1));
const blank = (v) => (v == null ? '' : v);
const minuteKey = (d) => Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm');

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
