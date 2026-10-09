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

- [x] Radara kadri atjaunojas ik 5 minūtes, kamēr cilne atvērta. Pie kartes redzams,
      cik sen bija jaunākais kadrs.
- [x] Visi kadri ielādējas iepriekš, tāpēc animācija nemirgo.
- [x] Noņemta nowcast loģika un etiķete "Prognoze". RainViewer bezmaksas versijā kopš
      2026. gada 1. janvāra nowcast vairs nav (arī maksimālais tuvinājums 7).
- [x] Staciju etiķetes vairs nepārklājas: tuvākās un ekstrēmās paliek, pārējās kļūst par
      krāsainiem punktiem līdz tuvināšanai.

## 2. Radars: izkārtojums

- [x] Laika skala atrodas uz kartes apakšā (arī pilnekrānā).
- [x] Viena pogu josla uz kartes: Nokrišņi, LVC, LVĢMC un "uz kartes: T° / ceļš / vējš /
      nokrišņi". Leaflet slāņu izvēlne un atsevišķā rīkjosla virs kartes noņemtas.
- [x] Pamatkarte seko tēmai, caurspīdīgums vienā pogā.
- [x] Nokrišņu krāsu leģenda.

## 3. Staciju tabula

- [x] Viena tabula ar filtru Visas / LVC / LVĢMC cilņu vietā.
- [x] Sākumā 10 tuvākās stacijas, poga "Rādīt visas", meklēšana pēc nosaukuma,
      filtrs "tikai kartē redzamās".
- [x] Klikšķis uz rindas iezīmē staciju kartē. Uz detaļu lapu ved stacijas nosaukums.
- [x] Temperatūra krāsainā laukumā, nokrišņiem josla, ceļa stāvoklis kā birka,
      vējam virziena bultiņa, 24 h min/max vienā joslā.
- [x] Kolonnas "Laiks" vietā laiks virsrakstā, atzīmētas tikai novecojušās stacijas.
- [x] Kārtošana ar bultiņām, lietojama ar tastatūru.
- [x] Telefonā saraksts ar kartītēm, nevis plata tabula.
- [x] Stacijas lapās tāds pats "tagad" bloks kā sākumā, karte seko gaišajai/tumšajai tēmai,
      LVĢMC min/max ir par pēdējām 24 h, ceļu stacijām spiediena (LVC to nemēra) vietā saķere.

## 4. Sākums ("Šodien")

- [x] ~~Viena teikuma kopsavilkums~~ (vēlāk noņemts, sk. 9. sadaļu).
      Rēķina pēc noteikumiem no visu modeļu datiem (mediāna un cik modeļu piekrīt).
- [x] Cik modeļi vienisprātis.
- [x] Tuvākās LVĢMC stacijas mērījums (ja stacija ir tuvāk par ~25 km).
- [x] Stundu josla nākamajām stundām: laiks, ikona, temperatūra, lietus varbūtība.
- [x] Dienu saraksts ar min/max joslām. Gaišākā josla rāda modeļu izkliedi.
- [x] Saglabātās vietas kā pogas zem meklēšanas.
- [x] Sešu rādītāju kartīšu vietā viens kompakts bloks. Kartīte "Modeļi: 14" noņemta.
- [x] Brīdinājumu kļūdas stāvoklis aizņem vienu pelēku rindu.

## 5. Grafiki

- [x] Pēc noklusējuma: modeļu mediāna, izkliedes josla un divi modeļi.
      Pārējie zem "+N modeļi". Izvēle saglabājas pārlūkā.
- [x] Noņemta leģenda, kas atkārto modeļu pogas.
- [x] Prognozes perioda izvēle kompaktāka.

## 6. Navigācija

- [x] 10 ciļņu vietā 5: Šodien, Grafiki, Radars, Vide, Vairāk.
      Grafikiem un "Vairāk" ir otrā līmeņa pārslēdzējs.
- [x] Telefonā navigācija ekrāna apakšā.
- [x] Pēdējā atvērtā sadaļa saglabājas adresē, saites `#tab-radar` turpina strādāt.

## 7. Ātrums

- [x] Ārējās bibliotēkas neaizkavē lapas parādīšanos (`defer`).

## 8. Kods

- [x] Viena laika skalas komponente radaram un mākoņu kartei.
- [x] Radara funkcijas vairs netiek pārrakstītas vairākos failos.
- [x] `.timeline` stili vienā vietā.
- [x] Jaunie teksti `i18n.js`, nevis iekļauti kodā.

## 9. Otrā kārta

- [x] Visus 14 modeļus var izvēlēties arī mākoņu grafikā un dienu tabulā. ECMWF IFS,
      ICON-EU un MET Norway paliek ieteiktie un ir noklusējums arī temperatūrai.
- [x] Modeļu precizitāte pret tuvāko LVĢMC staciju (pēdējās 48 h) grafikā un modeļu sarakstā.
      Tikai informācija, noklusējumu nemaina.
- [x] Šodien blokā rinda par slidenu ceļu (LVC ceļa virsma zem 0° vai tuvu tam).
- [x] Šodien blokā rinda par to, kā prognoze mainījusies kopš iepriekšējā apmeklējuma.
- [x] Temperatūras tendence stacijās (tabula, kartes logs, stacijas lapa).
- [x] Stacijas lapām valodas poga, mierīga atpakaļ saite, saite uz prognozi stacijas vietā.
- [x] Kopējā pārskata labojumi (16 atradumi).
- [x] Īsais prognozes teksts noņemts: lapu lieto sinoptiķi, viņiem pietiek ar datiem.
- [ ] LVC worker jāpublicē no jauna (`cloudflare-worker/lvc-meteo-proxy.js`): LVC tendence,
      gatavais staciju saraksts un publiskie dati. **Vispirms worker, tikai tad zaru apvieno ar main.**

## 10. Svaigi dati, mazāk pieprasījumu un izvietojumu (nākamais solis)

Mērķis: atverot lapu, visi dati ir aktuāli; GitHub Pages publicē tikai pēc koda izmaiņām;
apmeklētāju pieprasījumi ir lēti un paliek bezmaksas limitos (Cloudflare Workers 100k
pieprasījumu dienā, D1 5M nolasītu rindu dienā).

- [x] Prognoze atjaunojas, kamēr lapa atvērta (ik 30 min un atgriežoties pēc 15 min),
      saglabātā prognoze derīga 10 min, stacijas lapas atjaunojas ik 10 min.
- [x] Brīdinājumi, hidro, Kp un jūras dati vairs nav atkarīgi no Pages izvietošanas: tos
      atjauno LVC worker cron (brīdinājumi ik 15 min, Kp un hidro ik 30 min, jūra ik 4 h)
      un glabā D1. Pages publicē tikai koda izmaiņas, grafika vairs nav.
- [x] LVC worker cron saglabā gatavu staciju sarakstu (ar rādījumu ~1 h agrāk).
      Saraksta pieprasījums = 1 rinda, nevis visas tabulas skenēšana.
- [x] Īss kešs (60 s) tikai pret vienlaicīgu pieprasījumu viļņiem.
- [x] Viens worker pieprasījums (`?data=home`) abiem staciju tīkliem, brīdinājumiem un
      modeļu aprēķinu laikiem; nākamais tieši pēc nākamās cron reizes. LVĢMC stacijas
      sagatavo LVC worker cron (pārparsē tikai, kad fails mainījies); atsevišķais LVĢMC
      worker vairs nav vajadzīgs.
- [x] Open-Meteo: "tagad" vērtības un saullēkts mazā ECMWF pieprasījumā (40 -> ~24
      izsaukumi vietai); modeļi pārlādējas tikai, kad iznāk jauns aprēķins (visu dienu
      atvērta lapa ~1900 -> ~300 izsaukumi dienā).
- [ ] Modeļu precizitāti kešot ilgāk (3-6 h), tā mainās lēni.

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
python -m http.server 8000           # vai VS Code paplašinājums "Live Server"
```

Atver http://localhost:8000. Dati nāk no tiem pašiem avotiem kā īstajā lapā.

Testi: `npm test`.
