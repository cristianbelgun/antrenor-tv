# Instalarea aplicației Antrenor TV

Aplicația va fi la adresa **https://dev.cschimia.ro/**.
Ai nevoie de arhiva `antrenor-tv.zip` și de cheia secretă pe care ți le-am trimis. Durează cam 10 minute.

## 1. Urcă arhiva pe hosting

1. Intră în **cPanel**.
2. Mergi la **Domains** și uită-te la rândul pentru `dev.cschimia.ro`. Coloana **Document Root** îți arată folderul subdomeniului, de exemplu `public_html/dev`. Reține-l.
3. Deschide **File Manager** și intră în folderul de la pasul 2.
4. Apasă **Upload** și alege `antrenor-tv.zip`. Așteaptă să se termine, apoi revino în folder.
5. Dă clic dreapta pe `antrenor-tv.zip`, apoi **Extract**, apoi **Extract File(s)**. Fișierele aplicației (`index.html`, `api.php`, `js/` etc.) apar direct în folder. Dacă te întreabă, acceptă suprascrierea: istoricul din `data/history.json` nu e atins.
6. Poți șterge `antrenor-tv.zip` din folder, nu mai e nevoie de el.

## 2. Verifică versiunea PHP

1. În cPanel, deschide **Select PHP Version** sau **MultiPHP Manager**, în funcție de ce îți arată hostingul.
2. Pentru `dev.cschimia.ro` versiunea trebuie să fie **7.4 sau mai nouă**. Orice 8.x e perfect.

## 3. Verifică că merge

Deschide pe telefon sau pe calculator adresa de mai jos, cu cheia ta în loc de `CHEIA`:

```
https://dev.cschimia.ro/api.php?action=all&secret=CHEIA
```

Trebuie să vezi un rând care începe cu `{"ok":true`.

- Dacă vezi `{"ok":false,"error":"unauthorized"}`, cheia nu e scrisă corect.
- Dacă vezi altceva, trimite-mi ce apare și ne uităm împreună.

## 4. Pe televizor

1. Deschide **Web Browser** pe televizorul LG.
2. Scrie adresa `dev.cschimia.ro/` și apasă OK.
3. Adaug-o la favorite (de obicei din meniul browserului, steluța), ca s-o deschizi direct data viitoare.
4. Totul se folosește din telecomandă: **OK**, **săgețile** și **Înapoi**.

Dacă în colțul din dreapta sus apare „Fără conexiune, salvez pe televizor”, aplicația nu ajunge la server. Seriile se păstrează pe televizor și se trimit singure când revine conexiunea.

## 5. Istoricul pe telefon

1. Deschide pe telefon **https://dev.cschimia.ro/istoric.html**.
2. Scrie cheia secretă o singură dată. Telefonul o ține minte.
3. Vezi toate antrenamentele, cele mai noi primele, cu repetările fiecărei serii.

## 6. Muzica ta (opțional)

Aplicația are muzică proprie, generată pe loc. Dacă vrei melodiile tale:

1. În **File Manager**, deschide folderul `muzica`.
2. Apasă **Upload** și alege fișiere `.mp3`, oricâte.
3. La următorul antrenament se redau ele, în ordine aleatorie, în locul muzicii generate.

Ca să revii la muzica generată, șterge toate fișierele `.mp3` din `muzica`. Volumul îl schimbi din **▲▼** în timpul seriei sau al încălzirii.

## Bine de știut

- Istoricul se salvează pe hosting, în fișierul `data/history.json`. Folderul `data` nu e accesibil de pe internet.
- Dacă vrei o copie de siguranță, descarcă din File Manager fișierul `history.json` din când în când.
- **Nu da nimănui cheia secretă.** Cine o are poate citi și scrie istoricul.
