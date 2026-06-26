# 🌦 Laika prognoze — modeļu salīdzinājums

Bezmaksas meteoroloģiskās prognozes vietne, kas vienlaikus attēlo **16 pasaules vadošo laikapstākļu modeļu** prognozes un ļauj tos salīdzināt.

🔗 **[Atvērt vietni](https://artuursg.github.io/METEO/)**

---

## Funkcionalitāte

- **Temperatūras grafiks** — visi 16 modeļi vienā grafikā, iespēja ieslēgt/atslēgt katru
- **Nokrišņu grafiks** — joslu un līniju grafiks, ECMWF / ICON / MET Norway izvēle
- **Vēja grafiks** — ātrums 10m augstumā, modeļu salīdzinājums
- **Prognozes tabula** — dienas kopsavilkums, modeļu izvēle
- **Pilsētu meklēšana** — jebkura pasaules pilsēta ar koordinātu precizitāti
- **Gaiša/tumša tēma** — automātiski saglabājas

## Modeļi

| # | Modelis | Organizācija | Izšķirtspēja | Dienas |
|---|---------|-------------|-------------|--------|
| 1 | ECMWF IFS | ECMWF (ES) | 9 km | 10 |
| 2 | ECMWF AIFS | ECMWF — AI modelis | 25 km | 10 |
| 3 | GFS | NOAA (ASV) | 13 km | 16 |
| 4 | ICON | DWD (Vācija) | 11 km | 7 |
| 5 | ICON-EU | DWD (Vācija) | 7 km | 5 |
| 6 | ICON-D2 | DWD (Vācija) | 2 km | 2 |
| 7 | GEM | MSC (Kanāda) | 15 km | 10 |
| 8 | ACCESS-G | BOM (Austrālija) | 12 km | 10 |
| 9 | UKMO | Met Office (LB) | 10 km | 7 |
| 10 | MET Norway | MET Norway | 1 km | 10 |
| 11 | Météo-France | Météo-France | 1.5 km | 4 |
| 12 | JMA | JMA (Japāna) | 13 km | 11 |
| 13 | ARPAE COSMO | ARPAE (Itālija) | 2.8 km | 5 |
| 14 | CMA GRAPES | CMA (Ķīna) | 15 km | 10 |
| 15 | HARMONIE NL | KNMI (Nīderlande) | 2.5 km | 2 |
| 16 | HARMONIE DK | DMI (Dānija) | 2 km | 3 |

## Tehnoloģijas

- **HTML / CSS / JavaScript** — bez framework, bez build rīkiem
- **[Chart.js 4.4.1](https://www.chartjs.org/)** — interaktīvie grafiki
- **[Open-Meteo API](https://open-meteo.com/)** — bezmaksas meteoroloģiskie dati (CC BY 4.0)
- **GitHub Pages** — bezmaksas hostings

## Lokāla palaišana

```bash
git clone https://github.com/ArtuursG/METEO.git
cd METEO
# Atvērt ar Live Server (VS Code) vai jebkuru lokālu serveri
```

> ⚠️ Tieši ar `file://` protokolu var nedarboties — izmanto lokālo serveri.

---

Dati: [Open-Meteo](https://open-meteo.com) · Licence: CC BY 4.0
