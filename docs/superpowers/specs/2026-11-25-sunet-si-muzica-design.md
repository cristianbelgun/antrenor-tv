# Sunet și muzică: design

Data: 2026-11-25. Se adaugă la `2026-11-25-antrenor-tv-design.md` (aplicația existentă).

## 1. Ce și de ce

Utilizatorul vrea să știe unde se află în antrenament **fără să se uite la ecran** și vrea **muzică energică pe fundal, gen sală**, fără să caute el muzica. Trei părți:

1. **Cronometru sonor:** semnale clare la momentele-cheie.
2. **Ritm cu sunet:** un tic pe secundă când aplicația propune coborârea lentă (3 s) sau pauza în poziția grea. Cerut explicit de utilizator.
3. **Muzică pe fundal:** generată de aplicație. Opțional, mai târziu, MP3-urile lui puse într-un folder pe hosting (varianta 3, aleasă de utilizator).

## 2. Obiective, non-obiective, anti-obiective

**Obiective**
- Toate semnalele de timp se aud și se deosebesc ușor între ele, peste muzică.
- Muzica pornește singură odată cu antrenamentul și se oprește la final sau la ieșire.
- Muzica se poate da mai încet, mai tare sau opri din telecomandă, iar alegerea se ține minte pe televizor.
- Dacă există MP3-uri în folderul `muzica/` de pe hosting, se folosesc ele, în ordine aleatorie. Altfel, muzica generată.

**Non-obiective:** streaming (YouTube, Spotify), voce care vorbește, egalizator sau alegerea pieselor din aplicație, muzică pe pagina de istoric.

**Anti-obiective**
- Muzica acoperă bipurile sau ticul.
- Sunetul sacadează sau aplicația devine lentă pe televizor.
- Muzica pornește la deschiderea paginii, înainte de antrenament.
- Ticul se bate cu ritmul muzicii.

## 3. Constrângeri

- Browserul permite sunet doar după o apăsare pe telecomandă. Contextul audio se creează deja la prima tastă (`ui.ensureAudio`).
- Televizorul are procesor modest: sintetizatorul trebuie să fie ușor (puține oscilatoare simultan, programare cu ~0,2 s înainte, fără procesare grea).
- Toate sunetele trec prin același context audio, cu un nivel separat pentru muzică și unul pentru semnale.
- Restul constrângerilor rămân cele din designul aplicației (Chromium 79+, fără biblioteci externe).

## 4. Abordări (alese în conversație)

| | Variantă | Plusuri | Minusuri |
|---|---|---|---|
| 1 | Muzică generată de aplicație | Fără căutat, fără drepturi de autor, merge fără internet, sincronizată cu ticul | Sună electronic, nu „melodii cunoscute” |
| 2 | MP3-uri fără drepturi de autor pe hosting | Sună ca muzică reală | Cineva trebuie să le caute și să le descarce; devin repetitive |
| **3** | **1 acum, cu folder opțional pentru MP3-uri** | Merge imediat, cu loc pentru melodii proprii | Puțin mai multă muncă |

**Ales de utilizator: 3.**

## 5. Cronometrul sonor (propus de mine, acceptat în conversație)

| Moment | Sunet |
|---|---|
| Pauză: 3, 2, 1 s înainte de final | trei bipuri scurte (880 Hz, 120 ms) |
| Pauză: final, „începe seria” | un bip lung, mai jos (660 Hz, 600 ms) |
| Încălzire: la 1, 2 și 4 min (schimbarea mișcării, după `WARMUP`) | un bip dublu scurt |
| Încălzire: final (6 min) | bipul lung |
| Plank: la 30 s | un bip scurt |
| Plank: când atinge ținta (45 s sau `plankTarget`) | bip dublu, mai înalt (1046 Hz) |

- Înlocuiește bipul unic de la 3 s, care există acum.
- **Atenuare:** cât timp sună un semnal, muzica scade la ~30% și revine în ~0,4 s.

## 6. Ritmul cu sunet (cerut de utilizator)

- Se aude pe ecranul exercițiului doar dacă metoda curentă pentru exercițiu (`progression.level`) este 1 sau 2, și nu la plank.
- **Un tic pe secundă.** Un ciclu înseamnă o repetare. Ordinea fazelor depinde de exercițiu (*decizia mea, ca execuția să fie corectă*): „poziția grea” e jos la exercițiile care pornesc de sus și sus (contracția) la cele care pornesc de jos. Ticul accentuat (mai înalt) marchează începutul repetării.

  | Exerciții | Nivel 1 (4 s) | Nivel 2 (6 s) |
  |---|---|---|
  | **Pornesc de sus:** goblet-squat, pushup, rdl, reverse-lunge, floor-press | jos 3 s · sus 1 s | jos 3 s · ține 2 s · sus 1 s |
  | **Pornesc de jos:** db-row, biceps-curl, lateral-raise, overhead-press | sus 1 s · jos 3 s | sus 1 s · ține 2 s · jos 3 s |
  | **dead-bug** (întindere lentă) | întinde 3 s · revino 1 s | întinde 3 s · ține 2 s · revino 1 s |

- **Ticul nu atenuează muzica** (*decizia mea*). E un sunet scurt, înalt și clar, care se aude peste muzică. Doar semnalele din §5 o atenuează, altfel muzica ar pulsa în fiecare secundă.
- **Figurina urmează ritmul** (*decizia mea*): pe un exercițiu cu nivel 1 sau 2, animația folosește același ciclu (aceleași durate și aceeași ordine a fazelor, cu oprire la „ține”) și pornește odată cu ticul. Altfel ai auzi un ritm și ai vedea altul. La nivel 0 și 3 rămâne animația de acum, de 3,2 s.
- Pe ecran, sub sfatul de execuție, apare discret „Ritm: ” urmat de fazele din tabel, de exemplu „Ritm: jos 3 s · sus 1 s”. *Decizia mea.*
- Ticul se oprește când ieși de pe ecranul exercițiului: la OK (notare), ◀▶ sau Înapoi.
- Cu muzică generată, ticurile cad pe bătăile muzicii (tempo 120 BPM, deci un tic la fiecare 2 bătăi). Cu MP3-uri nu se sincronizează. Ticul se aude oricum peste ele, iar asta e acceptat (*decizia mea*).

## 7. Muzica

### Generată (implicit)
- **Stil:** electronic energic, „fitness”. Tempo fix **120 BPM** (decizia mea: se potrivește exact cu ticul de 1 s).
- **Instrumente** (sintetizate):
  - tobă mare pe fiecare bătaie;
  - hi-hat pe contratimp;
  - clap pe bătăile 2 și 4;
  - bas pe optimi;
  - o melodie simplă de tip arpegiu.
- **Armonie:** progresii de 4 acorduri în tonalități minore, alese aleatoriu la fiecare antrenament.
- **Variație:** la fiecare 8 măsuri se schimbă ceva (intră sau iese melodia, alt model de bas, o pauză de tobe de o măsură), ca să nu sune ca o buclă scurtă.
- **Pe ecranele de pauză:** tobele rămân, melodia iese (*decizia mea*), ca pauza să se simtă diferit de serie.

### MP3-urile utilizatorului (opțional)
- Folder `muzica/` lângă aplicație pe hosting. Fișiere `.mp3`, numite oricum.
- `api.php?action=music&secret=…` întoarce lista `{ok, files:[nume…]}`. Doar fișiere `.mp3` din acel folder, fără subfoldere.
- Dacă lista nu e goală, se redau în ordine aleatorie, una după alta, prin același context audio (pentru volum și atenuare). Dacă lista e goală sau nu răspunde, se folosește muzica generată.
- Ghidul de instalare primește un paragraf: cum urci MP3-uri în `antrenor/muzica/`.

### Comenzi
- **Pe ecranul exercițiului și la încălzire,** ▲▼ schimbă volumul muzicii în trepte de 10%, de la 0 (oprită) la 100%. Pe acele ecrane săgețile nu fac nimic acum. Un indicator „♪ 60%” apare 2 s în colț. *Decizia mea.*
- **În pauză,** ▲▼ rămân pentru ±15 s, ca acum.
- Volumul se ține minte pe televizor (`localStorage`, cheia `at.music`). Implicit 60%.
- Pe ecranul de pornire apare o linie mică „Muzică: 60% · schimbi din ▲▼ în timpul seriei”.

### Când cântă
De la începutul încălzirii până la ecranul final, inclusiv pauzele. Se oprește (cu stingere de ~1 s) la ecranul final, la ieșirea din antrenament și pe ecranul de pornire.

## 8. Alte decizii mele (din verificarea designului)
- **Antrenament reluat** (fără încălzire): muzica pornește odată cu primul ecran de exercițiu.
- **Ecranele de notare, plank și confirmare a ieșirii:** muzica continuă, cu instrumentele ca în serie (la plank) sau ca în pauză (notare și confirmare).
- **Textul nivelului 2** din aplicație spune „1–2 secunde”. Ritmul folosește 2 secunde, iar textul rămâne neschimbat.

## 9. Ce rămâne la constructor
- Cum e organizat codul audio (de exemplu `js/audio.js` cu semnale, tic, muzică), cu cât timp înainte se programează sunetele și sunetul exact al instrumentelor.
- Cum se testează: logica de „când sună ce” se testează fără sunet, ca listă de evenimente programate; restul se ascultă.
