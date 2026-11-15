/* aht-safety-poc : textes allemands du guide (STATIC.de, clés guide.*).
   @concern guide
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
Object.assign(STATIC.de, {
    'guide.prise': `
      <p>Drei autonome Muldenkipper fahren den Zyklus Bagger → Rampe → Brecher → Rückfahrt, im Mischverkehr mit Leichtfahrzeugen. Solange diese Anleitung geöffnet ist, ist die Simulation pausiert. Die Physik ist vereinfacht, aber konsistent: Jede angezeigte Zahl wird vom Modell berechnet.</p>
      <h3>Die Karte</h3>
      <dl>
        <dt><span class="sw" style="background:#e5574b"></span>Rotes Band</dt><dd>SIL-Haltezone: Strecke bis zum Stillstand bei maximaler Bremsung. Ein Hindernis darin löst CONTROLLED_STOP aus.</dd>
        <dt><span class="sw" style="background:#e3a23a"></span>Bernsteinfarbenes Band</dt><dd>Vorsichtszone, berechnet mit komfortabler Verzögerung: Abbremsen auf 15 km/h.</dd>
        <dt><span class="sw" style="background:#3cc3d6"></span>Cyanfarbene Linie</dt><dd>Vom FMS erteilte Fahrfreigabe; der Muldenkipper fährt nie darüber hinaus. Rot gestrichelt: Lease abgelaufen.</dd>
        <dt>Quadrate I1 / I2</dt><dd>Kreuzungen; die Farbe zeigt, wer das Token hält (violett: ein Leichtfahrzeug).</dd>
        <dt><span class="sw" style="background:#5fd38d"></span><span class="sw" style="background:#6d97f0"></span>Kegel</dt><dd>LiDAR (grün, breit, staubempfindlich) und Radar (blau, schmal, staubunempfindlich).</dd>
        <dt>Rampe</dt><dd>Beladen bergab befahren (Auslegungsfall für die Bremse), leer bergauf.</dd>
      </dl>
      <h3>Der Pick-up (Sie)</h3>
      <p>Er spielt den unberechenbaren menschlichen Fahrer: Er gehorcht weder dem FMS noch den Muldenkippern. Klicken Sie auf die Karte, dann <b>W/↑</b> vorwärts, <b>S/↓</b> bremsen oder rückwärts, <b>A/←</b> und <b>D/→</b> lenken. Mit dem <b>V2X-Sender</b> sieht ihn das FMS und reserviert ihm die Kreuzungen; ohne Sender erkennen ihn nur die Sensoren der Muldenkipper.</p>
      <h3>Die Bedienelemente</h3>
      <dl>
        <dt>Szenarien</dt><dd>A: Pick-up mit V2X, das FMS entzieht dem Muldenkipper das I1-Token. B: Pick-up ohne V2X, nur die Wahrnehmung schützt. C: B im Staub, Rückfall auf Radar. D: Haltebefehl einmalig in BEST_EFFORT mit 50 % Verlust gesendet. E: überlasteter CAN-Bus mit falsch priorisiertem Bremsbefehl. Ein Szenario wird scharfgeschaltet und startet, sobald ein beladener Muldenkipper den Bagger verlässt. F und G starten sofort: F friert Ebene 1 des schnellsten Lkw ein (Ebene 2 muss ihn allein anhalten), G sendet einen fehlerhaften Sollwert (Ebene 2 muss ihn ablehnen). A bis E und die Schaltfläche Zurücksetzen setzen den Kernel des Rechners auf PREEMPT_RT zurück.</dd>
        <dt>Ausgewählter Muldenkipper</dt><dd>Störungen, Masse, CAN-Bus und DDS gelten für den gewählten Muldenkipper (Reiter AHT-01 bis 03 links oder Klick auf die Karte). EMERGENCY_BRAKE ist verriegelt: Klicken Sie auf „Quittieren“.</dd>
        <dt>CAN-Bus</dt><dd>Arbitrierung: Der niedrigste Identifier gewinnt. Ein richtig priorisierter Bremsbefehl bleibt auch bei hoher Buslast schnell; warten müssen die Nachrichten niedriger Priorität.</dd>
        <dt>DDS</dt><dd>Bei periodischer Publikation erkennt der Controller Funkstille (Deadline, Liveliness) und geht in den sicheren Zustand. Ereignisgesteuert bleibt ein verlorener Befehl unbemerkt.</dd>
        <dt>Autonomie · Ebene 1</dt><dd>Diese Karte (linke Spalte) wählt den Kernel des Autonomierechners: PREEMPT_RT (begrenzte Latenz) oder Allzweck, mit illustrativen Latenzen. Sie friert Ebene 1 des ausgewählten Lkw ein oder startet sie neu und lässt sie einen fehlerhaften Sollwert senden (Geschwindigkeitsüberschreitung, über die Bewegungsfreigabe hinaus, veralteter Zeitstempel, Wiedereinspielung, ungültige Integrität), einmal oder „dauerhaft“.</dd>
      </dl>
      <h3>Die Anzeigen</h3>
      <p>Links unter den Szenarien: Zustand des Supervisors und tatsächlich vom Controller angewendeter Zustand (sie weichen ab, wenn ein Befehl verloren geht), mit den Gründen. Rechts: Berechnung der Haltezone mit ihren Termen, Zustand von Sensoren und Verbindungen, CAN/DDS-Oszilloskop, Fehlercode-Protokoll. Das Oszilloskop hat einen zweiten Reiter, „Ebenen 1 ↔ 2“: links, was Ebene 1 angibt, rechts, was Ebene 2 misst, darunter die letzten ausgetauschten Sollwerte mit ihrem Urteil. Die Schaltfläche ⓘ öffnet den Reiter „Architektur“ dieser Anleitung.</p>`,
    'guide.visite': `
      <ol>
        <li><b>Die Karte lesen.</b> Jeder Muldenkipper projiziert entlang seiner Bahn ein bernsteinfarbenes (Vorsicht) und ein rotes (SIL-Halt) Band. Die cyanfarbene Linie ist seine vom FMS erteilte Fahrfreigabe; die Quadrate I1/I2 zeigen, wer das Token hält.</li>
        <li><b>Der Einfluss der Masse.</b> Wählen Sie den Muldenkipper auf der Rampe: Die Tabelle vergleicht leer und beladen, in der Ebene und bergab. Stellen Sie die Fahrbahn auf „bewässert“: Der Weg leer nimmt zu (Haftgrenze), der Weg beladen kaum (Grenze der Bremskapazität).</li>
        <li><b>Mischverkehr.</b> Szenario A, dann B. In A entzieht das FMS dem Muldenkipper das I1-Token, noch bevor seine Sensoren den Pick-up sehen. In B lassen Wahrnehmung und Bahnprädiktion den Muldenkipper früh genug abbremsen, um den Pick-up durchzulassen; fahren Sie den Pick-up selbst, um einen Halt in der roten Zone zu erzwingen.</li>
        <li><b>Fail-Operational.</b> Szenario C: LiDAR geblendet, das Radar übernimmt, die Geschwindigkeit fällt auf 15 km/h, die Mission geht weiter.</li>
        <li><b>DDS-QoS.</b> Szenario D, mehrmals: Geht das Halt-Ereignis verloren, meldet das Protokoll einen nicht angewendeten Befehl. Zurück auf „periodisch“: kein stiller Verlust mehr, auf Kosten der Verfügbarkeit, wenn das Netz viel verliert.</li>
        <li><b>CAN und Minennetz.</b> Szenario E und das Oszilloskop; dann das Minennetz trennen: Die Muldenkipper fahren ihre Freigabe zu Ende und halten an, ohne harte Bremsung.</li>
        <li><b>Ebene 1 schlägt vor, Ebene 2 entscheidet.</b> Szenario F: Der Autonomierechner des schnellsten Lkw friert ein. Öffnen Sie „Ebenen 1 ↔ 2“: Nach der Frist des Herzschlags schaltet Ebene 2 allein auf CONTROLLED_STOP mit maximaler Bremsung, und die Zeile „Einfr.“ der Ebene 1 zeigt die Erkennungszeit, dann die zurückgelegte Strecke. Starten Sie Ebene 1 neu: Der Halt wird erst nach einem stabilen Herzschlag aufgehoben. Mit dem Allzweck-Kernel erfolgt die Erkennung später: Die bereits unterwegs befindlichen Sollwerte treffen noch ein, bevor die Stille zu zählen beginnt.</li>
        <li><b>Ein falscher Sollwert erreicht nie die Bremsen.</b> Szenario G, dann die Karte „Autonomie · Ebene 1“ zur Wahl des Fehlers: Ebene 2 lehnt den Sollwert mit seinem Code ab, der zuletzt akzeptierte Sollwert bleibt gültig und der Lkw fährt weiter. Dauerhaft gesendet, zählt eine Serie aufeinanderfolgender Ablehnungen wie ein Verlust von Ebene 1.</li>
        <li><b>Der Preis eines Allzweck-Kernels.</b> Wählen Sie den Kernel „Allzweck“: Der Rechenterm von t_lat steigt (illustrative Werte, aus dem Modell gelesen), die Haltezone wird auf dem Bildschirm entsprechend länger und der Lkw legt diese Strecke tatsächlich zusätzlich zurück.</li>
      </ol>`,
    'guide.modele': `
      <ol>
        <li><b>Die Masse geht über die Bremskapazität in den Anhalteweg ein.</b> Eine Formel der Art <code>a_Brems·μ</code> macht den Weg massenunabhängig. Der Simulator trennt die beiden Grenzen: <code>a_eff = min(F_Brems/m, μ·g·cosθ) − g·sinθ</code>. Leer begrenzt die Haftung und die Masse kürzt sich heraus; beladen begrenzt die Bremskapazität.</li>
        <li><b>SIL-Zone und zugehörige Bremsung.</b> Die rote Zone wird mit maximaler Verzögerung berechnet; ein Eindringen löst daher eine modulierte Maximalbremsung (ohne Blockieren der Räder) aus, die einzige, die innerhalb der Zone zum Stehen kommt. Die bernsteinfarbene Zone wird mit komfortabler Verzögerung berechnet.</li>
        <li><b>Die CAN-Buslast ist im Betrieb kein Sicherheitskriterium.</b> Die 40-%-Schwelle ist ein Auslegungsbudget (Antwortzeitanalyse). Im Betrieb zählt die Latenz des Bremsbefehls gegenüber seiner Deadline: Eine Notbremsung bei etwa 85 % Last tritt nur auf, wenn der Befehl falsch priorisiert ist, über den Watchdog des Brems-ECU.</li>
        <li><b>Weder RELIABLE noch BEST_EFFORT im Ereignismodus für einen Sicherheitsbefehl.</b> Der Zustand wird periodisch mit Deadline und Liveliness publiziert, und der Empfänger geht bei Funkstille in den sicheren Zustand. RELIABLE garantiert die Zustellung, aber nicht die Rechtzeitigkeit bei Verlusten. Das ist das Black-Channel-Prinzip (IEC 61784-3: CRC, Zähler, Timeout auf der Sicherheitsseite, unabhängig vom Transport).</li>
        <li><b>ROS 2 / DDS tragen kein SIL.</b> Der Autonomie-Stack bleibt unzertifiziert; die Sicherheitsfunktion liegt in einem unabhängigen Supervisor (Muster „Doer / Checker“) und in den Watchdogs der Aktoren. Der Planer meidet die Zonen, der Supervisor prüft sie.</li>
        <li><b>Verlust der FMS-Verbindung.</b> Der Muldenkipper fährt nie über seine freigegebene Fahrzone hinaus. Ohne Erneuerung hält er innerhalb der bereits erteilten Zone an: ein geplanter Halt, keine Notfallreaktion.</li>
        <li><b>Das Fahrzeug ohne V2X ist ein degradierter Fall.</b> Im Betrieb trägt jedes Fahrzeug, das in die autonome Zone einfährt, ein Terminal und projiziert seine eigene Zone; der Zugang ist kontrolliert. Die bordeigene Wahrnehmung ist die letzte Barriere (Normenreihe ISO 21815, Kollisionsvermeidung).</li>
        <li><b>Normen.</b> IEC 61508 ist die Grundnorm; ISO 13849 behandelt sicherheitsbezogene Teile von Steuerungen; für Erdbaumaschinen argumentiert man auch mit ISO 19014 (in MPLr statt SIL), ISO 17757 (autonome Maschinen) und ISO 23725 (Schnittstelle FMS ↔ AHS). Das Kürzel „SIL / HIL“ ist mehrdeutig: SiL für Software-in-the-Loop schreiben.</li>
        <li><b>Quittierung.</b> Der Notfallzustand ist verriegelt und erfordert eine Quittierung: Ein automatisches Wiederanlaufen nach einer Ausnahme ist ein realer Fehlermodus (siehe den WA-Vorfall in den Quellen).</li>
        <li><b>Ebene 1 schlägt vor, Ebene 2 erlaubt oder blockiert.</b> Der Autonomierechner gilt als von Grund auf nicht sicher: Seine Sollwerte (geforderte Geschwindigkeit, Zeitstempel, Sequenzzähler, Prüfsumme) laufen über einen unabhängigen Sicherheitscontroller, der sie mit einer eigenen Positionsmessung erneut prüft. Nichts erreicht die Bremsen ohne seine Zustimmung. Der Herzschlag wird überwacht: Eine stumme oder ständig irrende Ebene 1 führt zu einem kontrollierten Halt mit maximaler Bremsung, den Ebene 2 allein beschließt.</li>
        <li><b>Warum dieser Halt nicht verriegelt ist, der Notfall aber schon.</b> Der Verlust von Ebene 1 ist ein Ausfall des Autonomierechners, kein gefährliches Ereignis an sich: Der kontrollierte Halt genügt, und Ebene 2 hebt ihn auf, sobald der Herzschlag wieder stabil ist, nach dem üblichen kurzen Halten des Zustands; der Reiter „Ebenen 1 ↔ 2“ zählt bis zur tatsächlichen Aufhebung herunter. Der Notfallzustand bleibt verriegelt: Eine automatische Wiederaufnahme nach einem echten Ereignis ist ein Fehlermodus. Eine zurückgekehrte Ebene 1 hebt nie eine verriegelte Notbremsung auf.</li>
        <li><b>Das Kernel-Profil ist ein ungünstigster Fall, keine Messung.</b> Ein Allzweck-Kernel bietet keine Latenzgrenze, PREEMPT_RT schon. Der Simulator misst keinen Kernel: Jedes Profil ist eine illustrative Grenze der Rechenzeit von Ebene 1. Sie geht in t_lat ein (die Haltezone wird länger) und verzögert in gleichem Maß, was Ebene 1 an Ebene 2 übermittelt (der Lkw legt die Strecke tatsächlich zusätzlich zurück). Die Wahl des Kernels verursacht nie einen Herzschlagverlust: Seine Grenze bleibt unter der Frist. Sie verzögert aber die Erkennung eines eingefrorenen Ebene 1, weil die bereits unterwegs befindlichen Sollwerte noch eintreffen, bevor die Stille zu zählen beginnt.</li>
      </ol>`,
    'guide.archi': `
      <h3>Zwei Rechner, zwei Rollen</h3>
      <p>Ebene 1 schlägt vor, Ebene 2 erlaubt oder blockiert. Der Autonomierechner (Ebene 1) nimmt wahr, plant und führt die Bewegungsfreigaben des FMS aus; er gilt als von Grund auf nicht sicher. Der Sicherheitscontroller (Ebene 2) prüft jeden Sollwert mit eigenen Messungen erneut, überwacht den Herzschlag von Ebene 1 und entscheidet allein über den sicheren Halt. Das ist das Muster „Doer / Checker“ der Anleitung, sichtbar gemacht.</p>
      <div class="archi" role="img" aria-label="Illustratives Schema: Ebene 1 (Hardware, Linux in Echtzeit- oder Standardvariante, DDS / ROS 2, Anwendungen) sendet ihre Sollwerte an Ebene 2 (Sicherheits-Mikrocontroller, RTOS oder Bare Metal, Sicherheitssoftware), die mit einem Urteil antwortet.">
        <div class="acol l1">
          <h4>Ebene 1 · Autonomie</h4>
          <div class="ly">Anwendungen<small>Wahrnehmung, Planung, Ausführung der FMS-Bewegungsfreigaben</small></div>
          <div class="ly">Middleware<small>DDS / ROS 2</small></div>
          <div class="ly vars">Linux (Kernel und Distribution)<div class="cells"><div>Echtzeit<small>PREEMPT_RT: begrenzte Latenz</small></div><div>Standard<small>Allzweck-Kernel: keine Latenzgrenze</small></div></div></div>
          <div class="ly">Hardware<small>Bordrechner</small></div>
        </div>
        <div class="amid"><div>Sollwert · Zeitstempel · Sequenz · Integrität →</div><div>← Urteil: akzeptiert oder abgelehnt</div></div>
        <div class="acol l2">
          <h4>Ebene 2 · Sicherheit</h4>
          <div class="ly">Sicherheitssoftware<small>prüft jeden Sollwert mit eigenen Messungen erneut; überwacht den Herzschlag</small></div>
          <div class="ly">Zertifizierbares RTOS oder Bare Metal</div>
          <div class="ly">Sicherheits-Mikrocontroller<small>zweikanalig</small></div>
        </div>
      </div>
      <h3>Ebene 1: ein Software-Stack auf einem Bordrechner</h3>
      <p>Hardware, Linux (Kernel und Distribution), Middleware DDS / ROS 2, darüber die Anwendungen. Linux gibt es in einer Echtzeit- und in einer Standardvariante, wie in der Karte „Autonomie · Ebene 1“: Ein PREEMPT_RT-Kernel begrenzt die Scheduling-Latenz, ein Allzweck-Kernel bietet diese Grenze nicht. Die Latenzen der Karte sind illustrativ.</p>
      <h3>Ebene 2: klein, einfach, überprüfbar</h3>
      <p>Ein Sicherheits-Mikrocontroller, der ein zertifizierbares RTOS oder Bare-Metal-Code ausführt, zweikanalig: zwei Kanäle, die rechnen und sich vergleichen. Wenig Code, wenige Abhängigkeiten, kein ROS 2: Nur so lässt sich eine Sicherheitsargumentation aufbauen.</p>
      <h3>Bezugsrahmen</h3>
      <p>IEC 61508 (Funktionale Sicherheit), ISO 13849 (sicherheitsbezogene Teile von Steuerungen) und ISO 17757 (autonome Maschinen im Bergbau und Erdbau) werden als Bezugsrahmen genannt. Der Simulator erhebt keinen Anspruch auf Konformität mit einer dieser Normen.</p>
      <p class="help">Illustratives Schema, keine Beschreibung des realen Systems eines Herstellers: Reale Architekturen unterscheiden sich.</p>
    `,
    'guide.limites': `
      <h3>Grenzen des Modells</h3>
      <ul>
        <li>Perfekte Bahnführung (keine laterale Ackermann-Regelung); Rückwärtsmanöver unter dem Bagger werden nicht simuliert.</li>
        <li>Wahrnehmung ohne Falsch-Positive, Prädiktion mit konstanter Geschwindigkeit über 6 s; ein einziges Frontradar mit ±18° (ein echter Muldenkipper hat auch Eckradare).</li>
        <li>Plausible, aber generische Größenordnungen: 160 → 400 t, Bremskraft 1,15 MN, Traktion 2,6 MW, Rollwiderstand 2 %. Die Zone vernachlässigt den Rollwiderstand (konservative Reserve).</li>
        <li>CAN: Antwortzeit angenähert durch <code>C + U·20 ms / (1 − U)</code> für synchronisierten Burst-Verkehr; DDS: RELIABLE-Wiederholung alle 30 ms.</li>
        <li>Der Pick-up ist zur Lesbarkeit ×1,5 gezeichnet; Kollisionen verwenden seine reale Größe.</li>
        <li>Ebenen 1 und 2: Die Messungen von Ebene 2 (Position, Geschwindigkeit, Bremsen) sind exakte Kopien des simulierten Zustands, ohne Rauschen und ohne Ausfall. Ebene 2 fällt nie aus, und ihre zwei Kanäle werden nicht simuliert (sie erscheinen nur im Architekturschema).</li>
        <li>Die Prüfsumme der Sollwerte ist eine eigene Rechnung, kein echtes CRC und kein genormtes Ende-zu-Ende-Protokoll. Die Sensordiagnosen (LiDAR, Radar, GNSS) erreichen Ebene 2, ohne über Ebene 1 zu laufen.</li>
        <li>Die beiden Kernel-Profile sind zwei illustrative Grenzen der Rechenzeit, keine Messungen eines echten Kernels. Nur die Differenz zu PREEMPT_RT wird als Verzögerung der Ausgaben von Ebene 1 simuliert; die Rechenzeit selbst ist ein Term des Budgets t_lat.</li>
        <li>Die Architektur des Schemas (Software-Stack, Sicherheits-Mikrocontroller) ist illustrativ: Sie beschreibt nicht das reale System eines Herstellers. Die genannten Normen (IEC 61508, ISO 13849, ISO 17757) sind Bezugsrahmen ohne Konformitätsanspruch.</li>
      </ul>
      <h3>Quellen</h3>
      <ul>
        <li><a href="https://www.iso.org/standard/76769.html">ISO 23725:2024, Interoperabilität FMS / AHS</a></li>
        <li><a href="https://www.iso.org/standard/77302.html">ISO 21815-1:2022, Kollisionswarnung und -vermeidung</a></li>
        <li><a href="https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10140871">Hitachi-Patent, vom Flottenserver freigegebene Fahrzonen</a></li>
        <li><a href="https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9672743">Patent zur Verkehrssteuerung: Halt im freigegebenen Abschnitt bei Verbindungsabbruch</a></li>
        <li><a href="https://worksafe.wa.gov.au/publications/mines-safety-significant-incident-report-no-286-near-miss-following-unplanned-movement">WorkSafe WA, Vorfall Nr. 286: unerwartetes Wiederanfahren von AHT</a></li>
      </ul>`
});
AHT.inscrire('js/i18n-de-guide.js', '34519e3c');
