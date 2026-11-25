# Antrenor TV: design

Data: 2026-11-25
Schițe aprobate: https://claude.ai/artifact/PEnznzb9Ya9jxZ6y2SoaPe (copie locală: `2026-11-25-schite-ecrane.html`, alături de acest document; stilul figurinei e în scriptul ei)

## 1. Ce este și de ce

O aplicație pentru televizorul LG (webOS) a utilizatorului. Îl ghidează prin antrenamentele de forță din programul lui personal (documentul „instrucțiuni exerciții fizice – creștere masă musculară”). Se folosește ca un antrenor pe ecranul mare:

- arată exercițiul curent printr-o figurină animată, ca să se vadă cum se execută corect;
- arată seria, repetările țintă și sfatul de execuție;
- cronometrează pauzele;
- **ține evidența repetărilor făcute la fiecare serie**, ca utilizatorul să vadă progresul de la o săptămână la alta.

De ce: utilizatorul (50 de ani, 64 kg, 164 cm) se antrenează acasă cu greutatea corpului și două gantere fixe de 10 kg. Documentul lui spune că partea cea mai importantă este **progresul** (de exemplu de la 10 la 12–15 flotări). Utilizatorul a cerut explicit ca aplicația să țină evidența repetărilor. Antrenamentul se face departe de telefon, cu ochii pe TV, controlat cu telecomanda.

## 2. Obiective, non-obiective, anti-obiective

**Obiective (v1)**
- Un antrenament complet (încălzire, exerciții, serii, pauze, final) se poate parcurge numai din telecomandă (săgeți + OK), fără telefon.
- După fiecare serie se notează repetările din cel mult 1–2 apăsări în cazul obișnuit.
- Data viitoare, la fiecare exercițiu se vede ce s-a făcut ultima dată.
- Aplicația știe singură ce antrenament urmează (A sau B).
- Ecranul final compară cu antrenamentul anterior de același tip.
- Istoricul nu se pierde dacă se resetează televizorul sau se șterg datele browserului.

**Non-obiective (v1)**
- Evidența alimentației, a greutății corporale sau a zilelor de recuperare.
- Editarea programului din aplicație. Programul e fix, în cod; modificările se fac cerându-mi mie.
- Aplicația webOS instalată cu pictogramă proprie (faza 2, vezi §4).
- Antrenor vocal, muzică, conturi pentru mai mulți utilizatori.
- Grafice de progres pe termen lung (pot veni mai târziu; datele salvate trebuie să le permită).

**Anti-obiective** (ar face aplicația un eșec chiar dacă „merge”)
- Obligă utilizatorul să ia telefonul sau tastatura în timpul antrenamentului.
- Textul nu se citește de la 2–3 metri (de pe saltea).
- Se pierde istoricul.
- Animațiile arată o execuție greșită (de exemplu spatele rotunjit la îndreptări). Mai bine o animație simplă și corectă decât una spectaculoasă.
- Aplicația dă sfaturi medicale sau nutriționale în afara documentului.

## 3. Constrângeri

- **Dispozitiv:** televizor LG **UA74003LB** (seria UA74, model 2025, deci webOS 25 cu un Chromium recent; de confirmat la prima rulare). Ținta de cod e JavaScript modern fără pas de build (ES2017, fără module ES), ca să meargă și pe un webOS mai vechi (5+) dacă estimarea e greșită.
- **claude.ai nu se poate deschide pe TV:** verificarea Cloudflare „Verify you are human” nu trece în browserul televizorului (testat de utilizator). Nimic din aplicație nu poate depinde de claude.ai.
- **Control:** telecomanda LG. Săgețile și OK ajung ca evenimente `keydown` (ArrowUp/Down/Left/Right, Enter / keyCode 13). Butonul Back are keyCode 461 pe webOS. Magic Remote are și un cursor, deci tot ce e focalizabil trebuie să fie și clicabil.
- **Distanță de citire:** 2–3 m. Proporțiile din schițe au fost validate de utilizator: țintă ~8% din lățimea ecranului, nume exercițiu ~4,6%, text secundar ≥1,5%.
- **Echipament:** gantere fixe de 10 kg. Progresul se face prin repetări, serii, tempo, pauze, unilateral, nu prin greutate.
- **Limba interfeței:** română.
- **Animații:** desenate de noi (figurine stilizate, vedere din lateral, ca în schiță). Imaginile din documentul utilizatorului provin de pe site-uri terțe și **nu** se folosesc.

## 4. Abordări (alese în conversație)

| | Abordare | Plusuri | Minusuri |
|---|---|---|---|
| 1 | Pagină web deschisă din browserul TV | Fără instalare; se testează și pe laptop; istoric online | Pornește din browser, fără pictogramă proprie |
| 2 | Aplicație webOS instalată în Developer Mode | Pictogramă, arată ca o aplicație | Cont de dezvoltator LG, calculator pentru instalare, modul dezvoltator expiră și trebuie prelungit; istoric doar pe TV |
| **3** | **Întâi 1, apoi o aplicație webOS care doar deschide pagina** | Folosibilă imediat; nimic nu se pierde la trecerea în faza 2 | Faza 2 e muncă în plus, dacă se dorește |

**Ales de utilizator: varianta 3.** Faza 1 (acest document) este pagina web.

### Găzduire și salvarea istoricului (aleasă de utilizator după testul pe TV)

Prima propunere (Artifact claude.ai cu bază de date) a căzut, pentru că claude.ai nu trece de verificarea Cloudflare pe TV. Variantele noi:

| | Variantă | Plusuri | Minusuri |
|---|---|---|---|
| 1 | Totul în Google: Apps Script servește pagina și scrie în Google Sheets | Un singur cont (Google) | Adresă lungă; pagina rulează în cadrul Google |
| **2** | **Pagina pe GitHub Pages, istoricul în Google Sheets prin Apps Script** | Adresă scurtă, pagină curată și rapidă | Cont GitHub în plus |
| 3 | Istoric doar în browserul TV | Cel mai simplu | Istoricul se pierde la reset (încalcă un obiectiv) |

**Ales de utilizator: varianta 2.**

- **Pagina:** fișiere statice (HTML/CSS/JS) într-un repository GitHub al utilizatorului, publicate cu GitHub Pages (`https://<utilizator>.github.io/antrenor-tv/`). Utilizatorul își face cont GitHub, dacă nu are; eu scriu și public codul.
- **Istoricul:** un Google Sheet în Drive-ul utilizatorului, cu un script Apps Script atașat, publicat ca aplicație web („Execute as: Me”, „Who has access: Anyone”). Scriptul primește seriile și returnează istoricul. Pagina îl apelează cu `fetch`.
  - Scriere: `POST` cu corp `text/plain` (JSON în interior), ca să nu declanșeze preflight CORS.
  - Citire: `GET` care returnează JSON.
  - Scriptul verifică o **cheie secretă** din configurația paginii (lungă, aleatoare) și respinge cererile fără ea. Asta împiedică scrierile întâmplătoare.
- **Copie locală și coadă:** fiecare serie se scrie întâi în `localStorage`, apoi se trimite. Ce nu a ajuns (TV fără internet) se retrimite la următoarea pornire. Scrierile sunt idempotente: fiecare serie are un id unic, iar scriptul ignoră duplicatele. La pornire istoricul se ia din Sheet; dacă Sheet-ul nu răspunde în 5 s, se folosește copia locală și apare discret „Fără conexiune, salvez pe televizor”.
- **Configurarea Google** se face o singură dată, ghidată: utilizatorul creează Sheet-ul, lipește scriptul primit de la mine, apasă Deploy și îmi dă adresa. Pot pregăti eu Sheet-ul prin conectorul Google Drive / Sheets, dacă e de folos.
- **Faza 2** (aplicație webOS cu pictogramă) rămâne posibilă: un pachet webOS care deschide adresa GitHub Pages.

## 5. Programul (date, din documentul utilizatorului)

### Exercițiile folosite în v1

| id | Nume (afișat) | Ținta | Unitate | Sfat de execuție (afișat) |
|---|---|---|---|---|
| goblet-squat | Genuflexiuni cu gantera | 3 × 12–15 | repetări | Ține gantera la piept, coboară controlat, genunchii în direcția vârfurilor. |
| pushup | Flotări | 3 × 8–15 | repetări | Corpul drept de la cap la călcâie. Dacă e greu, cu genunchii pe sol. |
| db-row | Ramat cu două gantere | 3 × 10–15 | repetări | Trage coatele spre spate, strânge omoplații, spatele neutru. |
| overhead-press | Împins cu ganterele deasupra capului | 3 × 8–12 | repetări | Amplitudine confortabilă, nu forța articulațiile. |
| biceps-curl | Flexii biceps | 3 × 10–15 | repetări | Mișcare controlată, fără balansarea corpului. |
| plank | Plank | 3 × 30–45 | secunde | Corpul drept, abdomenul strâns, nu lăsa șoldurile să cadă. |
| rdl | Îndreptări românești | 3 × 10–15 | repetări | Împinge șoldurile înapoi, spatele neutru, ganterele aproape de picioare. |
| reverse-lunge | Fandări înapoi | 3 × 10 / picior | repetări pe picior | Pas mare înapoi, genunchiul din față deasupra gleznei. Se pot face și fără gantere. |
| floor-press | Împins cu ganterele din culcat | 3 × 10–15 | repetări | Coatele coboară până ating ușor podeaua, apoi împinge. |
| lateral-raise | Ridicări laterale | 3 × 12–15 | repetări | Ridică până la nivelul umerilor, coatele ușor îndoite. Dacă 10 kg e prea greu, câte o ganteră pe rând. |
| dead-bug | Dead Bug | 3 × 10–12 / parte | repetări pe parte | Spatele lipit de podea, mișcare lentă braț–picior opus. |

Celelalte 4 exerciții din document (flotări cu priză apropiată, ramat cu o ganteră, ridicări pe vârfuri, reverse crunch) nu apar în programul săptămânal, deci **nu intră în v1** (decizia mea). Datele lor se pot pune în cod pentru mai târziu, fără animații.

### Antrenamentele
- **A:** goblet-squat, pushup, db-row, overhead-press, biceps-curl, plank
- **B:** rdl, reverse-lunge, floor-press, lateral-raise, biceps-curl, dead-bug

### Ce antrenament urmează (decizia mea)
Documentul spune: luni / miercuri / vineri, săptămâna A–B–A, apoi B–A–B. Asta e echivalent cu **alternare simplă A, B, A, B…** la fiecare antrenament făcut. Aplicația ia tipul ultimului antrenament încheiat și propune pe celălalt. Primul antrenament din istoric e A. Avantaj: dacă se sare o zi, alternanța rămâne corectă.

Zilele: luni, miercuri și vineri sunt „zi de antrenament”. În celelalte zile ecranul de pornire arată „Azi: recuperare. Mers 25–35 min și stretching ușor”, cu un buton secundar „Fă totuși antrenamentul [A/B]”.

### Regulile din document pe care le aplică aplicația
- **Încălzire 5–8 min:** ecran cu timer de 6 minute (decizia mea) și o listă text de mișcări ușoare (mers pe loc, rotiri de brațe, balansări de șold, genuflexiuni fără greutate). Fără animații în v1. OK = sari peste.
- **Pauză 60–120 s între serii:** implicit 90 s; ▲▼ = ±15 s în timpul pauzei, cu limite 60–120 (decizia mea). Bip cu 3 s înainte de final și la final.
- **Primele două săptămâni cu 2 serii:** în primele 14 zile de la primul antrenament salvat, toate exercițiile au 2 serii (decizia mea, pentru că așa recomandă documentul). Apoi numărul din tabel.
- **Sugestie de progres (deciziile mele):**
  - Se declanșează când, la ultimul antrenament de același tip, toate seriile unui exercițiu au atins capătul de sus al țintei (pentru ținte fixe, ca fandările „10 / picior”, chiar ținta; la plank 45 s).
  - Pe ecranul exercițiului apare o linie, de exemplu: „Ai atins 15 la toate seriile. Încearcă azi coborârea lentă, în 3 secunde.”
  - Metodele se propun în ordine, câte una: coborâre lentă 3 s → pauză 1–2 s în poziția grea → o serie în plus. Se trece la următoarea doar când pragul e atins din nou cu metoda curentă.
  - „O serie în plus” chiar adaugă seria a 4-a pentru acel exercițiu.
  - La plank, după cele trei metode, ținta crește cu 5 s (până la 60 s).
  - Metoda curentă per exercițiu se salvează (vezi §8). Fiecare serie salvează și metoda folosită, ca rezultatele să fie comparabile.

## 6. Fluxul și ecranele (aprobate în schițe)

Toate ecranele au 16:9, temă închisă, și se dimensionează proporțional cu lățimea ecranului.

1. **Pornire:** data, săptămâna, „Antrenamentul A/B”, lista exercițiilor (nume, țintă, ultima dată: repetările pe serii), durata estimată, butonul „Începe încălzirea”. Indicator mic de sincronizare. OK pornește încălzirea, iar la prima apăsare se cere și ecranul complet.
2. **Încălzire:** timer 6:00 și lista de mișcări. La final sau la OK trece la exercițiul 1.
3. **Exercițiu:** în stânga animația (rulează în buclă), în dreapta „Exercițiul n din 6”, nume, „Seria k din N” cu puncte de progres, ținta, „Ultima dată: …”, sfatul de execuție și, dacă e cazul, sugestia de progres. Jos legenda tastelor. OK = am terminat seria. ◀ ▶ = exercițiul anterior / următor.
   - **Plank (secunde):** la OK pornește un cronometru de lucru care crește de la 0, cu marcaj la 30 și 45 s. Al doilea OK îl oprește și valoarea devine propunerea pe ecranul de notare.
4. **Notare:** „Câte repetări ai făcut?” cu numărul mare. Valoarea inițială e cea de la aceeași serie data trecută; dacă nu există, capătul de jos al țintei; la plank, timpul cronometrat. ▲▼ ±1. OK salvează și pornește pauza. Back = înapoi la exercițiu fără salvare.
   - La exercițiile „pe picior / pe parte” se notează un singur număr (pe picior / pe parte), iar eticheta spune asta.
5. **Pauză:** inel și numărătoare mare, „Urmează: …”. OK = sari peste. ▲▼ = ±15 s. După ultima serie a unui exercițiu, pauza duce la exercițiul următor. După ultima serie a ultimului exercițiu, duce direct la final, fără pauză.
6. **Final:** durata, care antrenament urmează, totalul de repetări față de data trecută (același tip) și tabelul pe exerciții: azi / data trecută / diferență. Antrenamentul se marchează încheiat aici.

**Antrenament întrerupt:** fiecare serie se salvează imediat. Dacă pagina se închide la mijloc, la redeschidere în aceeași zi pornirea oferă „Continuă antrenamentul B (exercițiul 3, seria 2)” sau „Începe din nou”. Un antrenament neterminat dintr-o zi anterioară se închide automat cu ce s-a salvat și contează pentru alternanță (decizia mea).

**Tastele în rezumat:** OK confirmă acțiunea principală a ecranului; ▲▼ schimbă valori; ◀ ▶ navighează între exerciții; Back (461) / Escape duce un pas înapoi, iar de pe ecranul exercițiului întreabă „Ieși din antrenament? OK = da”.

## 7. Animațiile

- Figurine în stilul din schiță: linii groase rotunjite, cap plin, ganterele în culoarea de accent, vedere din lateral, podea vizibilă. Desenate procedural (SVG sau canvas, cinematică simplă pe articulații și unghiuri interpolate între poziții-cheie), nu cadre desenate de mână.
- Un ciclu de repetare ≈ 3 s (coborâre ~1,5 s, urcare ~1,5 s), în buclă.
- **Execuția trebuie să fie corectă biomecanic** (vezi anti-obiective): spate neutru la ramat și îndreptări, genunchii nu trec mult de vârfuri la goblet squat etc.
- 11 animații (exercițiile din v1). Dead bug și plank se văd din lateral, culcat.
- Cu `prefers-reduced-motion` se afișează poziția de mijloc, statică.

## 8. Datele salvate

În Google Sheet (foi separate), oglindite în `localStorage`:

- foaia **Serii** (o linie pe serie; ușor de citit pe telefon): `id` (unic, generat pe TV), `data_ora`, `antrenament_id`, `tip` (A/B), `exercitiu_id`, `exercitiu` (numele afișat), `seria`, `valoare`, `unitate` (repetari/secunde), `metoda` (0 niciuna, 1 coborâre lentă, 2 pauză, 3 serie în plus).
- foaia **Antrenamente**: `antrenament_id`, `tip`, `inceput`, `sfarsit` (gol dacă e neterminat).
- foaia **Stare**: un singur rând JSON cu `{ firstWorkoutAt, progression: { <exerciseId>: { level: 0|1|2|3, extraSets: 0|1, plankTarget? } } }`. `firstWorkoutAt` servește regula primelor două săptămâni.

Fără greutate, pentru că ganterele sunt fixe. Structura permite mai târziu grafice și analiza de către Claude, dacă utilizatorul exportă sau partajează tabelul.

## 9. Ce rămâne la latitudinea constructorului

- Organizarea codului, bibliotecile (sau niciuna), dacă se folosește SVG sau canvas pentru figurine.
- Sunetul bipului (Web Audio, pornit după prima apăsare).
- Cererea de wake lock / ecran complet: se încearcă, iar refuzul se tolerează.
- Codul exact al scriptului Apps Script și cum se generează cheia secretă.
- Detaliile vizuale în spiritul schițelor aprobate.
- Testarea: pe desktop cu tastatura, care emulează telecomanda.
