# gluciq mit Google Sheets – Einrichtung

Dreimal hinten aufs iPhone tippen → Blutzucker, Kohlenhydrate, NovoRapid eingeben → landet in der Tabelle **„gluciq – Einträge“** in deinem Google Drive. Claude liest die Tabelle und wertet sie aus.

Du brauchst einmal ca. 15 Minuten. Schritt 1 geht am besten am Computer.

---

## 1. Skript in die Tabelle einfügen (Computer, ca. 5 min)

1. Öffne die Tabelle **„gluciq – Einträge“** in Google Drive.
2. Menü **Erweiterungen → Apps Script**.
3. Lösche alles im Editor und füge den Inhalt von **Code.gs** ein (die Datei mit deinem Code darin, die Claude dir geschickt hat).
4. Oben auf **Speichern** (Disketten-Symbol).
5. Oben rechts **Bereitstellen → Neue Bereitstellung**.
   - Zahnrad neben „Typ auswählen“ → **Web-App**
   - Ausführen als: **Ich**
   - Zugriff: **Jeder**
   - **Bereitstellen** → Google fragt nach Berechtigungen → dein Konto wählen → „Erweitert“ → „gluciq (unsicher) öffnen“ → **Zulassen**.
     (Das erscheint, weil das Skript von dir selbst ist und nicht von Google geprüft wurde.)
6. Kopiere die **Web-App-URL** (endet auf `/exec`) und schick sie dir aufs iPhone, z. B. per Notiz.

Test: Öffne die URL im Browser. Dort sollte „gluciq läuft“ stehen.

> „Zugriff: Jeder“ heißt nur: Die URL nimmt Daten an, ohne dass du angemeldet bist. Ohne deinen geheimen Code schreibt sie aber nichts, und lesen kann darüber niemand etwas.

---

## 2. Kurzbefehl „Eintragen“ (iPhone, ca. 5 min)

App **Kurzbefehle** → **+** → Name: **Eintragen**. Füge diese Aktionen in dieser Reihenfolge hinzu:

1. **Nach Eingabe fragen** – Eingabetyp: *Zahl*, Frage: `Blutzucker (mg/dL)`
2. **Variable festlegen** – Name: `BZ` (Eingabe: *Bereitgestellte Eingabe*)
3. **Nach Eingabe fragen** – Eingabetyp: *Zahl*, Frage: `Kohlenhydrate (g)`
4. **Variable festlegen** – Name: `KH`
5. **Aus Menü auswählen** – Frage: `Kohlenhydrate?`, Optionen: `Geschätzt` und `Gewogen`
   - unter *Geschätzt*: **Text** `Geschätzt` → **Variable festlegen** `Art`
   - unter *Gewogen*: **Text** `Gewogen` → **Variable festlegen** `Art`
6. **Nach Eingabe fragen** – Eingabetyp: *Zahl*, **Dezimalzahlen erlauben** an, Frage: `NovoRapid (IE)`
7. **Variable festlegen** – Name: `IE`
8. **Inhalte von URL abrufen**
   - URL: deine Web-App-URL
   - Methode: **POST**
   - Anfragetext: **JSON**, Felder (alle Typ *Text*):
     - `token` → dein geheimer Code (steht in Code.gs bei `TOKEN`)
     - `bg` → Variable `BZ`
     - `carbs` → Variable `KH`
     - `weighed` → Variable `Art`
     - `units` → Variable `IE`
9. **Mitteilung anzeigen** – Text: *Inhalte der URL*

**Leere Felder:** Was du nicht hast, lässt du leer oder gibst `0` ein. Nur den Blutzucker eintragen (z. B. 3 h nach dem Essen) geht genauso. NovoRapid ohne Kohlenhydrate zählt als Korrektur.

Testen: Kurzbefehl einmal ausführen → oben erscheint „Gespeichert: …“, und in der Tabelle steht eine neue Zeile.

---

## 3. Dreimal hinten tippen

**Einstellungen → Bedienungshilfen → Tippen → Auf Rückseite tippen → Dreimal tippen → „Eintragen“**.

---

## 4. Dexcom-Werte automatisch aus Apple Health (optional, ca. 5 min)

Damit Claude sieht, wo du 3 h nach dem Essen und in der Nacht warst, ohne dass du nachträglich Werte eintippen musst. Voraussetzung: Die Dexcom-App schreibt in Apple Health (Dexcom-App → Einstellungen → Apple Health).

Kurzbefehle → **Automation** → **+** → **Tageszeit** → **7:00**, täglich, **Sofort ausführen**. Danach eine zweite mit **19:00** anlegen (oder diese duplizieren). Aktionen:

1. **Health-Samples suchen** – Typ: *Blutzucker*; Filter: *Startdatum liegt in den letzten 1 Tagen*; sortieren nach *Startdatum*; Limit aus
2. **Wiederholen mit jedem** (Health-Samples), darin:
   - **Datum formatieren** – Datum: *Wiederholungsobjekt → Startdatum*, Format: **ISO 8601**, Zeit einschließen an
   - **Text** – `Formatiertes Datum;Wiederholungsobjekt → Wert` (beide als Variablen, dazwischen ein Semikolon)
3. **Text kombinieren** – *Wiederholungsergebnisse*, Trennzeichen: **Neue Zeile**
4. **Inhalte von URL abrufen** – URL: deine Web-App-URL, Methode: **POST**, Anfragetext: **JSON**:
   - `token` → dein geheimer Code
   - `type` → `glucose`
   - `data` → *Kombinierter Text*

Die Werte landen im Tab **„Dexcom“**. Doppelte Werte werden übersprungen. Die Health-App sollte Blutzucker in **mg/dL** anzeigen.

---

## So wertet Claude aus

- **Mahlzeit:** Wert ca. 3 h danach (2,5–4 h) gegen den Startwert. Innerhalb von ±40 mg/dL → **passt**. Mehr als 40 höher oder eine Korrektur 20 min – 3 h danach → **zu wenig Insulin**. Mehr als 40 tiefer oder unter 70 innerhalb von 4 h → **zu viel Insulin**.
- **Zählt nicht für den Faktor:** Start unter 70 oder über 180, eine zweite Mahlzeit innerhalb von 3 h, unter 10 g Kohlenhydrate.
- **KE-Faktor pro Tageszeit** (morgens 5–11, mittags 11–16, abends 16–22, spät): ab 3 passenden Mahlzeiten der Median ihrer Verhältnisse (g pro IE), ab 6 ziemlich sicher. Nur die letzten 4 Wochen.
- **Korrektur:** Senkung pro IE aus Korrekturen ohne Essen 3 h davor und danach (ab 4).
- **Tresiba:** Nächte ohne Essen und NovoRapid ab 21 Uhr, Veränderung 1–6 Uhr (ab 3 Nächten).

Das beschreibt nur deine Daten. Besprich den Faktor mit deinem Diabetologen, bevor du danach spritzt.
