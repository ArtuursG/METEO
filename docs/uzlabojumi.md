# prognoze.lv uzlabojumu plāns

Saraksts darbam turpmāk (arī VS Code). Atzīmēts `[x]`, ja izdarīts zarā
`redizains`. Skices: [`docs/skices/`](skices/).

Vadlīnijas visam sarakstam:

- Saglabāt esošo stilu: siltie neitrālie toņi, plānas līnijas, IBM Plex Mono skaitļiem.
  Bez gradientiem, "stikla" paneļiem, emocijzīmēm un mārketinga vārdiem.
- Teksti īsi un konkrēti, kā vietējam sinoptiķim. Bez garās domuzīmes.
- Neviens jauns datu avots, ja to pašu var izrēķināt no jau ielādētajiem datiem.
- Katrai izmaiņai jāstrādā gaišajā un tumšajā tēmā, telefonā un datorā.

## 1. Radars: labojumi

- [ ] Radara kadri atjaunojas ik 5 minūtes, kamēr cilne atvērta. Pie kartes redzams,
      cik sen bija jaunākais kadrs.
- [ ] Visi kadri ielādējas iepriekš, tāpēc animācija nemirgo.
- [ ] Noņemta nowcast loģika un etiķete "Prognoze". RainViewer bezmaksas versijā kopš
      2026. gada 1. janvāra nowcast vairs nav (arī maksimālais tuvinājums 7).
- [ ] Staciju etiķetes vairs nepārklājas: tuvākās un ekstrēmās paliek, pārējās kļūst par
      krāsainiem punktiem līdz tuvināšanai.

## 2. Radars: izkārtojums

- [ ] Laika skala atrodas uz kartes apakšā (arī pilnekrānā).
- [ ] Viena pogu josla uz kartes: Nokrišņi, LVC, LVĢMC un "uz kartes: T° / ceļš / vējš /
      nokrišņi". Leaflet slāņu izvēlne un atsevišķā rīkjosla virs kartes noņemtas.
- [ ] Pamatkarte seko tēmai, caurspīdīgums vienā pogā.
- [ ] Nokrišņu krāsu leģenda.

## 3. Staciju tabula

- [ ] Viena tabula ar filtru Visas / LVC / LVĢMC cilņu vietā.
- [ ] Sākumā 10 tuvākās stacijas, poga "Rādīt visas", meklēšana pēc nosaukuma,
      filtrs "tikai kartē redzamās".
- [ ] Klikšķis uz rindas iezīmē staciju kartē. Uz detaļu lapu ved stacijas nosaukums.
- [ ] Temperatūra krāsainā laukumā, nokrišņiem josla, ceļa stāvoklis kā birka,
      vējam virziena bultiņa, 24 h min/max vienā joslā.
- [ ] Kolonnas "Laiks" vietā laiks virsrakstā, atzīmētas tikai novecojušās stacijas.
- [ ] Kārtošana ar bultiņām, lietojama ar tastatūru.
- [ ] Telefonā saraksts ar kartītēm, nevis plata tabula.

## 4. Sākums ("Šodien")

- [ ] Viena teikuma kopsavilkums: kad līs, cik silts, rīt siltāks vai vēsāks.
      Rēķina pēc noteikumiem no visu modeļu datiem (mediāna un cik modeļu piekrīt).
- [ ] Cik modeļi vienisprātis, blakus kopsavilkumam.
- [ ] Tuvākās LVĢMC stacijas mērījums (ja stacija ir tuvāk par ~25 km).
- [ ] Stundu josla nākamajām stundām: laiks, ikona, temperatūra, lietus varbūtība.
- [ ] Dienu saraksts ar min/max joslām. Gaišākā josla rāda modeļu izkliedi.
- [ ] Saglabātās vietas kā pogas zem meklēšanas.
- [ ] Sešu rādītāju kartīšu vietā viens kompakts bloks. Kartīte "Modeļi: 14" noņemta.
- [ ] Brīdinājumu kļūdas stāvoklis aizņem vienu pelēku rindu.

## 5. Grafiki

- [ ] Pēc noklusējuma: modeļu mediāna, izkliedes josla un divi modeļi.
      Pārējie zem "+N modeļi". Izvēle saglabājas pārlūkā.
- [ ] Noņemta leģenda, kas atkārto modeļu pogas.
- [ ] Prognozes perioda izvēle kompaktāka.

## 6. Navigācija

- [ ] 10 ciļņu vietā 5: Šodien, Grafiki, Radars, Vide, Vairāk.
      Grafikiem un "Vairāk" ir otrā līmeņa pārslēdzējs.
- [ ] Telefonā navigācija ekrāna apakšā.
- [ ] Pēdējā atvērtā sadaļa saglabājas adresē, saites `#tab-radar` turpina strādāt.

## 7. Ātrums

- [ ] Ārējās bibliotēkas neaizkavē lapas parādīšanos (`defer`).

## 8. Kods

- [ ] Viena laika skalas komponente radaram un mākoņu kartei.
- [ ] Radara funkcijas vairs netiek pārrakstītas vairākos failos.
- [ ] `.timeline` stili vienā vietā.
- [ ] Jaunie teksti `i18n.js`, nevis iekļauti kodā.

## Vēlāk

- EUMETNET OPERA radars (CC BY 4.0, 1 km / 5 min). Dati nāk kā faili, nevis kartes
  flīzes, tāpēc vajadzētu apstrādi GitHub Actions.
- LibreWXR: RainViewer saderīgs serveris, bet to jāuztur pašam.
- Ceļa stāvokļa vēsture LVC stacijām stacijas logā (vajag papildu pieprasījumu).

## Kā palaist lokāli

Lapa ir statiska, būvēšana nav vajadzīga.

```sh
git fetch origin redizains
git checkout redizains
npx serve .            # vai VS Code paplašinājums "Live Server"
```

Testi: `npm test` un `python -m unittest discover -s test -p "*_test.py"`.
