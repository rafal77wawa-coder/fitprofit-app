# FitProfit — VanityStyle Sp. z o.o.

Mobilna aplikacja React do zarządzania kartami sportowymi FitProfit/FitSport.  
pełnymi zasadami punktowania, redesign w stylu **VanityStyle NEXT**.

---

## Uruchomienie

```bash
# 1. Zainstaluj zależności
npm install

# 2. Uruchom dev server
npm run dev
# → http://localhost:5173

# 3. Build produkcyjny
npm run build
```

**Wymagania:** Node.js 18+

---

## Stack

| Technologia | Wersja |
|---|---|
| React | 18.3 |
| Vite | 5.4 |
| Czysty CSS-in-JS | — |
| Google Fonts (Inter) | CDN |

Brak zewnętrznych bibliotek UI — wszystkie komponenty własne.

---

## Funkcje aplikacji

### Zakładki

| Zakładka | Opis |
|---|---|
| **Główna** | Sticky hero z punktami dnia · krokomierz · board aktywności |
| **Ranking** | Indywidualny (wszyscy) + Firmowy (moja firma) |
| **Aktywności** | Feed z pełnym systemem komentarzy + moderacją |
| **Karta** | Karta FitProfit · QR check-in · historia · nagrody |
| **Ustawienia** | Przypomnienia o ćwiczeniu · integracje · regulamin |

---

## Zasady punktowania (help.activy.pl)

| Kategoria | Punkty | Bonus | Limit/dzień |
|---|---|---|---|
| Na nogach | 6 pkt/km · min 1.5 km | +10 za 1. i 2. aktywność dnia | 100 pkt |
| Na kołach | 2 pkt/km · min 1.5 km | +10 bonus · **+25 dojazd do pracy** | 100 pkt |
| Ćwiczenia | MET 5–9 pkt/10 min | Zdjęcie wymagane (EXIF weryfikacja) | 100 pkt |
| Kroki | 1.6 pkt/1000 kroków | +10 za 7 500 kroków | 100 pkt |

**Passa:** +50 pkt po 3 / 7 / 14 / 21 dniach z rzędu  
**Anti-duplikat:** Na nogach > Kroki → kroki suppressed

---

## Punkty z karty VanityStyle (QR check-in)

| Typ obiektu | Punkty |
|---|---|
| Siłownia / CrossFit / Zajęcia grupowe | 20 pkt |
| Pływalnia / Squash | 22 pkt |
| Joga / Pilates | 18 pkt |
| SPA / Sauna | 12 pkt |
| Strefa VS Online | 8 pkt |

---

## Integracje

Strava · Garmin Connect · Polar Flow · Apple Health · Google Fit

---

## Nagrody (wymiana punktów)

| Nagroda | Koszt |
|---|---|
| Kupon QlturaProfit | 800 pkt |
| Voucher -50% Prezent Marzeń | 400 pkt |
| -40% na DOZ.pl | 600 pkt |
| Bon Decathlon 50 zł | 1 200 pkt |

---

## Weryfikacja zdjęć (aktywności ręczne)

Każda aktywność dodana ręcznie wymaga zdjęcia z tego samego dnia.  
System odczytuje metadane **EXIF DateTimeOriginal** z pliku JPEG i porównuje z datą dzisiejszą.

| Status | Znaczenie |
|---|---|
| ✅ EXIF zweryfikowane | Data EXIF = dzisiaj |
| 🟡 Data z pliku | Brak EXIF, `lastModified` = dzisiaj |
| ❌ Zdjęcie zbyt stare | Data ≠ dzisiaj |
| ⚠️ Brak daty w pliku | Nie można zweryfikować |

---

## Krokomierz

- Pełny donut ring z animacją SVG
- Kolory: zielony → niebieski (7 500 bonus) → złoty (cel 10 000)
- Tygodniowy wykres słupkowy z szarą linią celu
- ⭐ nad słupkiem = cel 10 000 osiągnięty danego dnia

---

## Przypomnienia o ćwiczeniu

Codzienne powiadomienie o ustawionej godzinie.  
Po wykonaniu 5-minutowego ćwiczenia biurowego: +25 pkt bonus.  
Timer kołowy z 10 zestawami ćwiczeń „Masz prawo do…"

---

## Design System — VanityStyle NEXT

```
bg:    #F5F5F5  (tło aplikacji)
card:  #FFFFFF  (białe karty)
navy:  #181C33  (primary)
blue:  #0C5093  (FitProfit accent)
text:  #111313
grey:  #9FA1A6
```

Font: **Inter** (400/500/600/700/800/900)  
Frame: 375 × 812 px (iPhone standard)

---

## Struktura projektu

```
fitprofit/
├── src/
│   ├── App.jsx       ← cała aplikacja (komponenty + logika + dane)
│   └── main.jsx      ← React entry point
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
└── README.md
```

---

*VanityStyle Sp. z o.o. · support@vanitystyle.pl · v2.0 · 2025*
