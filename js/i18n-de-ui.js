/* aht-safety-poc : textes statiques allemands de l'interface (STATIC.de, clés ui.* et autres hors guide).
   @concern i18n
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
Object.assign(STATIC.de, {
    'ui.h1': 'Autonomer Bergbau-Muldenkipper <span>· Prinzipsimulator</span>',
    'ui.kTime': 'Simulierte Zeit', 'ui.kCol': 'Kollisionen', 'ui.kCycles': 'Entladene Mulden', 'ui.kTons': 'Transportierte Tonnen',
    'ui.guide': 'Anleitung und Erklärungen', 'ui.ctrlAria': 'Bedienung', 'ui.reset': 'Zurücksetzen',
    'ui.scenH': 'Szenarien <span style="text-transform:none;letter-spacing:0;font-weight:500">· Mauszeiger = Details</span>',
    'ui.scA': 'A · Mit V2X', 'ui.scAt': 'Das FMS sieht den Pick-up: Dem Muldenkipper wird das I1-Token entzogen, geplanter Halt vor der Kreuzung.',
    'ui.scB': 'B · Ohne V2X', 'ui.scBt': 'Für das FMS unsichtbar: Nur die bordeigene Wahrnehmung (LiDAR + Radar) schützt.',
    'ui.scC': 'C · + Staub', 'ui.scCt': 'LiDAR geblendet: Rückfall auf Radar, reduzierte Geschwindigkeit (Fail-Operational).',
    'ui.scD': 'D · DDS-Verluste', 'ui.scDt': 'Der Haltebefehl kann verloren gehen. Wiederholen, dann auf „periodischer Zustand“ umschalten.',
    'ui.scE': 'E · CAN überlastet', 'ui.scEt': 'Last 75 %: Brems-Deadline überschritten → kontrollierter Halt. Auf 90 % erhöhen: Watchdog → Notbremsung.',
    'ui.scF': 'F · Ebene 1 eingefroren', 'ui.scFt': 'Der Autonomierechner des schnellsten Lkw sendet nicht mehr: Ebene 2 muss ihn allein anhalten.',
    'ui.scG': 'G · Sollwert falsch', 'ui.scGt': 'Ebene 1 sendet einen fehlerhaften Sollwert (in der Karte „Autonomie · Ebene 1“ gewählt): Ebene 2 lehnt ihn ab.',
    'ui.l1H': 'Autonomie · Ebene 1', 'ui.kernAria': 'Kernel des Autonomierechners', 'ui.freezeT': 'Der Autonomierechner des ausgewählten Lkw sendet nicht mehr (oder startet neu).',
    'ui.defAria': 'Fehler des gesendeten Sollwerts', 'ui.defOver': 'Geschwindigkeitsüberschreitung', 'ui.defBeyond': 'Über die Bewegungsfreigabe hinaus', 'ui.defStale': 'Veralteter Zeitstempel', 'ui.defReplay': 'Wiedereinspielung', 'ui.defInteg': 'Ungültige Integrität',
    'ui.defSend': 'Senden', 'ui.defSendT': 'Ebene 1 des ausgewählten Lkw sendet einen Sollwert mit diesem Fehler.', 'ui.defRepeat': 'Dauerhaft',
    'ui.l1Help': 'Illustrative Latenzen.',
    'ui.faultsH': 'Störungen des Muldenkippers', 'ui.fLidarT': 'LiDAR-Ausfall', 'ui.fRadarT': 'Radar-Ausfall', 'ui.fGnssT': 'Verlust der GNSS-RTK-Ortung',
    'ui.massAria': 'Masse des Muldenkippers', 'ui.massAuto': 'Normaler Zyklus (leer ↔ beladen)', 'ui.massEmpty': 'Leer erzwingen, 160 t', 'ui.massLoaded': 'Beladen erzwingen, 400 t',
    'ui.estop': 'Not-Halt', 'ui.estopT': 'Vom Bediener ausgelöster Fern-Not-Halt',
    'ui.ack': 'Quittieren', 'ui.ackT': 'Hebt die EMERGENCY_BRAKE-Verriegelung des ausgewählten Muldenkippers auf.',
    'ui.mapAria': 'Minenkarte. Klicken, um den Pick-up per Tastatur zu fahren (WASD oder Pfeiltasten); auf einen Muldenkipper klicken, um ihn auszuwählen.',
    'ui.you': 'Pick-up (Sie)', 'ui.kbdT': 'W/↑ vorwärts · S/↓ bremsen, rückwärts · A/← und D/→ lenken', 'ui.lvHome': 'Neu platzieren',
    'ui.layersAria': 'Ebenen', 'ui.lBubbles': 'Zonen', 'ui.lAuth': 'Freigaben', 'ui.lSensors': 'Sensoren', 'ui.lLinks': 'Erkennungen',
    'ui.stripAria': 'Umgebung und Netze', 'ui.envH': 'Minenumgebung', 'ui.muLbl': 'Fahrbahn (Haftreibung μ)',
    'ui.muDry': 'Trocken, μ = 0,60', 'ui.muWet': 'Bewässert, μ = 0,35', 'ui.muMud': 'Schlammig, μ = 0,20', 'ui.rampLbl': 'Rampenneigung',
    'ui.dust': 'Staub an I1', 'ui.dustT': 'Staubwolke um Kreuzung I1: blendet das LiDAR, nicht das Radar.',
    'ui.fmsT': 'Trennt das Minen-WLAN / LTE: FMS-Freigaben werden nicht mehr erneuert.',
    'ui.canH': 'CAN-Bus J1939 · 250 kbit/s', 'ui.canTraffic': 'Hintergrundlast', 'ui.misprio': 'Bremse mit niedriger Priorität', 'ui.babble': 'Plappernder Knoten (babbling idiot)',
    'ui.ddsH': 'DDS · Sicherheits-Topic', 'ui.ddsLbl': 'Publikationsmuster', 'ui.ddsPer': 'Periodisch + Deadline/Liveliness', 'ui.ddsRel': 'Ereignis, RELIABLE', 'ui.ddsBe': 'Ereignis, BEST_EFFORT', 'ui.loss': 'Paketverlust',
    'ui.sideAria': 'Telemetrie', 'ui.bubbleH': 'Haltezone, Live-Berechnung', 'ui.sensH': 'Sensoren und Verbindungen', 'ui.scopeH': 'Oszilloskop · 15 s', 'ui.tabL12': 'Ebenen 1 ↔ 2', 'ui.tabsAria': 'Telemetrieansicht', 'ui.logH': 'Ereignisprotokoll (DM1 / QoS / FMS)',
    'ui.gtPrise': 'Erste Schritte', 'ui.gtVisite': 'Geführte Tour', 'ui.gtModele': 'Modellierungsentscheidungen', 'ui.gtArchi': 'Architektur', 'ui.gtLimites': 'Grenzen und Quellen', 'ui.archiAria': 'Software- und Hardware-Stack der beiden Ebenen', 'ui.archiT': 'Architektur der beiden Ebenen in der Anleitung öffnen',
    'ui.gClose': 'Schließen', 'ui.gCloseAria': 'Anleitung schließen',
});
AHT.inscrire('js/i18n-de-ui.js', '96b07bfc');
