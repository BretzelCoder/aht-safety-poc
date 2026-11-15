/* aht-safety-poc : textes statiques anglais de l'interface (STATIC.en, clés ui.* et autres hors guide).
   @concern i18n
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
Object.assign(STATIC.en, {
    'ui.h1': 'Autonomous mining haul truck <span>· principles simulator</span>',
    'ui.kTime': 'simulated time', 'ui.kCol': 'collisions', 'ui.kCycles': 'loads dumped', 'ui.kTons': 'tonnes hauled',
    'ui.guide': 'Guide and explanations', 'ui.ctrlAria': 'Controls', 'ui.reset': 'Reset',
    'ui.scenH': 'Scenarios <span style="text-transform:none;letter-spacing:0;font-weight:500">· hover for details</span>',
    'ui.scA': 'A · V2X-equipped', 'ui.scAt': 'The FMS sees the pickup: I1 token revoked from the truck, planned stop before the intersection.',
    'ui.scB': 'B · Unequipped', 'ui.scBt': 'Invisible to the FMS: only on-board perception (LiDAR + radar) protects.',
    'ui.scC': 'C · + Dust', 'ui.scCt': 'LiDAR blinded: radar fallback, reduced speed (Fail-Operational).',
    'ui.scD': 'D · DDS losses', 'ui.scDt': 'The stop command can be lost. Replay, then switch to “periodic state”.',
    'ui.scE': 'E · Saturated CAN', 'ui.scEt': 'Load 75 %: brake deadline missed → controlled stop. Raise to 90 %: watchdog → emergency.',
    'ui.scF': 'F · Level 1 frozen', 'ui.scFt': 'The autonomy computer of the fastest truck stops sending: level 2 must stop it on its own.',
    'ui.scG': 'G · Bad setpoint', 'ui.scGt': 'Level 1 sends a defective setpoint (chosen in the “Autonomy · level 1” card): level 2 rejects it.',
    'ui.l1H': 'Autonomy · level 1', 'ui.kernAria': 'Kernel of the autonomy computer', 'ui.freezeT': 'The autonomy computer of the selected truck stops sending (or restarts).',
    'ui.defAria': 'Defect of the setpoint sent', 'ui.defOver': 'Overspeed', 'ui.defBeyond': 'Beyond the authority', 'ui.defStale': 'Stale timestamp', 'ui.defReplay': 'Replay', 'ui.defInteg': 'Invalid integrity',
    'ui.defSend': 'Send', 'ui.defSendT': 'Level 1 of the selected truck sends a setpoint with this defect.', 'ui.defRepeat': 'Continuous',
    'ui.l1Help': 'Illustrative latencies.',
    'ui.faultsH': 'Truck faults', 'ui.fLidarT': 'LiDAR failure', 'ui.fRadarT': 'Radar failure', 'ui.fGnssT': 'Loss of GNSS RTK positioning',
    'ui.massAria': 'Truck mass', 'ui.massAuto': 'Normal cycle (empty ↔ loaded)', 'ui.massEmpty': 'Force empty, 160 t', 'ui.massLoaded': 'Force loaded, 400 t',
    'ui.estop': 'Emergency stop', 'ui.estopT': 'Remote emergency stop triggered by the operator',
    'ui.ack': 'Re-arm', 'ui.ackT': 'Clears the EMERGENCY_BRAKE latch of the selected truck.',
    'ui.mapAria': 'Mine map. Click to drive the pickup with the keyboard (WASD or arrow keys); click a truck to select it.',
    'ui.you': 'Pickup (you)', 'ui.kbdT': 'W/↑ forward · S/↓ brake, reverse · A/← and D/→ steer', 'ui.lvHome': 'Reposition',
    'ui.layersAria': 'Layers', 'ui.lBubbles': 'Zones', 'ui.lAuth': 'Authorities', 'ui.lSensors': 'Sensors', 'ui.lLinks': 'Detections',
    'ui.stripAria': 'Environment and networks', 'ui.envH': 'Mine environment', 'ui.muLbl': 'Haul road (adhesion μ)',
    'ui.muDry': 'Dry, μ = 0.60', 'ui.muWet': 'Watered, μ = 0.35', 'ui.muMud': 'Muddy, μ = 0.20', 'ui.rampLbl': 'Ramp grade',
    'ui.dust': 'Dust on I1', 'ui.dustT': 'Dust cloud around intersection I1: blinds the LiDAR, not the radar.',
    'ui.fmsT': 'Cuts the mine Wi-Fi / LTE: FMS authorities are no longer renewed.',
    'ui.canH': 'CAN bus J1939 · 250 kbit/s', 'ui.canTraffic': 'Background traffic', 'ui.misprio': 'Brake at low priority', 'ui.babble': 'Babbling node (babbling idiot)',
    'ui.ddsH': 'DDS · safety topic', 'ui.ddsLbl': 'Publication pattern', 'ui.ddsPer': 'Periodic + Deadline/Liveliness', 'ui.ddsRel': 'Event, RELIABLE', 'ui.ddsBe': 'Event, BEST_EFFORT', 'ui.loss': 'Packet loss',
    'ui.sideAria': 'Telemetry', 'ui.bubbleH': 'Stop zone, live calculation', 'ui.sensH': 'Sensors and links', 'ui.scopeH': 'Oscilloscope · 15 s', 'ui.tabL12': 'Levels 1 ↔ 2', 'ui.tabsAria': 'Telemetry view', 'ui.logH': 'Event log (DM1 / QoS / FMS)',
    'ui.gtPrise': 'Getting started', 'ui.gtVisite': 'Guided tour', 'ui.gtModele': 'Modelling choices', 'ui.gtArchi': 'Architecture', 'ui.gtLimites': 'Limitations and sources', 'ui.archiAria': 'Software and hardware stack of the two levels', 'ui.archiT': 'Open the architecture of the two levels in the guide',
    'ui.gClose': 'Close', 'ui.gCloseAria': 'Close the guide',
});
AHT.inscrire('js/i18n-en-ui.js', '09665389');
