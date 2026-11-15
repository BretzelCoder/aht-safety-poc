/* aht-safety-poc : textes anglais du guide (STATIC.en, clés guide.*).
   @concern guide
   Code repris tel quel de index.html (spec 003). La dernière ligne porte l'empreinte de version (node scripts/stamps.mjs). */
'use strict';
Object.assign(STATIC.en, {
    'guide.prise': `
      <p>Three autonomous haul trucks run the shovel → ramp → crusher → return cycle, in mixed traffic with light vehicles. The simulation is paused while this guide is open. The physics is simplified but consistent: every number on screen is computed by the model.</p>
      <h3>The map</h3>
      <dl>
        <dt><span class="sw" style="background:#e5574b"></span>Red band</dt><dd>SIL stop zone: distance needed to stop under maximum braking. An obstacle inside it triggers CONTROLLED_STOP.</dd>
        <dt><span class="sw" style="background:#e3a23a"></span>Amber band</dt><dd>Caution zone, computed at comfortable deceleration: slow down to 15 km/h.</dd>
        <dt><span class="sw" style="background:#3cc3d6"></span>Cyan line</dt><dd>Movement authority granted by the FMS; the truck never goes beyond it. Dashed red: lease expired.</dd>
        <dt>Squares I1 / I2</dt><dd>Intersections; the colour shows who holds the token (purple: a light vehicle).</dd>
        <dt><span class="sw" style="background:#5fd38d"></span><span class="sw" style="background:#6d97f0"></span>Cones</dt><dd>LiDAR (green, wide, sensitive to dust) and radar (blue, narrow, insensitive to dust).</dd>
        <dt>Ramp</dt><dd>Driven down loaded (the sizing case for braking), driven up empty.</dd>
      </dl>
      <h3>The pickup (you)</h3>
      <p>It plays the unpredictable human driver: it obeys neither the FMS nor the trucks. Click on the map, then <b>W/↑</b> forward, <b>S/↓</b> brake or reverse, <b>A/←</b> and <b>D/→</b> steer. With the <b>V2X beacon</b>, the FMS sees it and reserves the intersections for it; without the beacon, only the trucks' sensors detect it.</p>
      <h3>The controls</h3>
      <dl>
        <dt>Scenarios</dt><dd>A: equipped pickup, the FMS revokes the truck's I1 token. B: unequipped pickup, only perception protects. C: B in dust, radar fallback. D: stop sent once in BEST_EFFORT with 50 % loss. E: saturated CAN bus with a mis-prioritised brake command. A scenario is armed and starts as soon as a loaded truck leaves the shovel. F and G start at once: F freezes level 1 of the fastest truck (level 2 must stop it on its own), G sends a defective setpoint (level 2 must reject it). A to E and the reset button set the computer's kernel back to PREEMPT_RT.</dd>
        <dt>Selected truck</dt><dd>Faults, mass, CAN bus and DDS apply to the chosen truck (tabs AHT-01 to 03 on the left, or click on the map). EMERGENCY_BRAKE is latched: you must click “Re-arm”.</dd>
        <dt>CAN bus</dt><dd>Arbitration: the lowest identifier wins. A well-prioritised brake command stays fast even on a loaded bus; it is the low-priority messages that wait.</dd>
        <dt>DDS</dt><dd>With periodic publishing, the controller detects silence (Deadline, Liveliness) and goes to a safe state. Event-driven, a lost command goes unnoticed.</dd>
        <dt>Autonomy · level 1</dt><dd>This card (left column) chooses the kernel of the autonomy computer: PREEMPT_RT (bounded latency) or general-purpose, with illustrative latencies. It freezes or restarts level 1 of the selected truck and makes it send a defective setpoint (overspeed, beyond the authority, stale timestamp, replay, invalid integrity), once or “continuously”.</dd>
      </dl>
      <h3>The panels</h3>
      <p>On the left, under the scenarios: the supervisor state and the state actually applied by the controller (they diverge when a command is lost), with the reasons. On the right: the stop zone calculation with its terms, sensor and link health, CAN/DDS oscilloscope, fault code log. The oscilloscope has a second tab, “Levels 1 ↔ 2”: on the left what level 1 claims, on the right what level 2 measures, then the latest setpoints exchanged with their verdict. The ⓘ button opens the “Architecture” tab of this guide.</p>`,
    'guide.visite': `
      <ol>
        <li><b>Reading the map.</b> Each truck projects an amber (caution) and a red (SIL stop) band along its path. The cyan line is its movement authority granted by the FMS; squares I1/I2 show who holds the token.</li>
        <li><b>The effect of mass.</b> Select the truck on the ramp: the table compares empty and loaded, on the flat and downhill. Switch the road to “watered”: the empty distance increases (adhesion limit), the loaded distance barely changes (brake capacity limit).</li>
        <li><b>Mixed traffic.</b> Scenario A then B. In A, the FMS revokes the truck's I1 token before its sensors even see the pickup. In B, perception and trajectory prediction slow the truck early enough to let the pickup through; drive the pickup yourself to force a stop inside the red zone.</li>
        <li><b>Fail-Operational.</b> Scenario C: LiDAR blinded, the radar takes over, speed drops to 15 km/h, the mission continues.</li>
        <li><b>DDS QoS.</b> Scenario D, several times: when the stop event is lost, the log reports a command not applied. Switch back to “periodic”: no more silent loss, at the cost of availability if the network loses a lot.</li>
        <li><b>CAN and mine network.</b> Scenario E and the oscilloscope; then cut the mine network: the trucks use up their authority and stop, without harsh braking.</li>
        <li><b>Level 1 proposes, level 2 disposes.</b> Scenario F: the autonomy computer of the fastest truck freezes. Open “Levels 1 ↔ 2”: once the heartbeat deadline has passed, level 2 alone switches to CONTROLLED_STOP at maximum braking, and the “Freeze” line of level 1 gives the detection delay, then the distance travelled. Restart level 1: the stop is only released after a stable heartbeat. With the general-purpose kernel, detection is slower: the setpoints already in flight still arrive before the silence starts to count.</li>
        <li><b>A wrong setpoint never reaches the brakes.</b> Scenario G, then the “Autonomy · level 1” card to choose the defect: level 2 rejects the setpoint with its code, the last accepted setpoint stays in force and the truck carries on. Sent continuously, a run of consecutive rejections counts as a loss of level 1.</li>
        <li><b>The price of a general-purpose kernel.</b> Choose the “general-purpose” kernel: the computing term of t_lat grows (illustrative values, read from the model), the stop zone gets longer on screen by the same amount and the truck really travels that extra distance.</li>
      </ol>`,
    'guide.modele': `
      <ol>
        <li><b>Mass enters the stopping distance through brake capacity.</b> A formula of the form <code>a_brake·μ</code> makes the distance independent of mass. The simulator keeps the two limits separate: <code>a_eff = min(F_brake/m, μ·g·cosθ) − g·sinθ</code>. Empty, adhesion is the limit and mass cancels out; loaded, brake capacity is.</li>
        <li><b>SIL zone and associated braking.</b> The red zone is computed at maximum deceleration, so an intrusion triggers maximum modulated braking (without wheel lock), the only braking able to stop within the zone. The amber zone is computed at comfortable deceleration.</li>
        <li><b>CAN bus load is not a runtime safety criterion.</b> The 40 % threshold is a design budget (response-time analysis). What matters at runtime is the brake command latency against its deadline: emergency braking around 85 % load only appears if the command is mis-prioritised, through the brake ECU watchdog.</li>
        <li><b>Neither RELIABLE nor BEST_EFFORT in event mode for a safety command.</b> The state is published periodically with Deadline and Liveliness, and the receiver goes to a safe state on silence. RELIABLE guarantees delivery but not timeliness under loss. This is the black-channel principle (IEC 61784-3: CRC, counter, safety-side timeout, independent of the transport).</li>
        <li><b>ROS 2 / DDS do not carry the SIL.</b> The autonomy stack remains uncertified; the safety function lives in an independent supervisor (“doer / checker” pattern) and in the actuator watchdogs. The planner avoids the zones, the supervisor checks them.</li>
        <li><b>Loss of the FMS link.</b> The truck never drives beyond its authorised travel zone. Without renewal, it stops within the zone already granted: a planned stop, not an emergency reaction.</li>
        <li><b>The unequipped vehicle is a degraded case.</b> In operation, every vehicle entering the autonomous zone carries a terminal and projects its own zone; access is controlled. On-board perception is the last-resort barrier (ISO 21815 family, collision avoidance).</li>
        <li><b>Standards.</b> IEC 61508 is the parent standard; ISO 13849 covers the safety-related parts of control systems; for earth-moving machinery one also reasons with ISO 19014 (in MPLr rather than SIL), ISO 17757 (autonomous machines) and ISO 23725 (FMS ↔ AHS interface). The acronym “SIL / HIL” is ambiguous: write SiL for Software-in-the-Loop.</li>
        <li><b>Re-arming.</b> The emergency state is latched and requires an acknowledgement: automatic resumption after an exception is a real failure mode (see the WA incident in the sources).</li>
        <li><b>Level 1 proposes, level 2 allows or blocks.</b> The autonomy computer is considered unsafe by design: its setpoints (requested speed, timestamp, sequence counter, checksum) go through an independent safety controller, which rechecks them with its own position measurement. Nothing reaches the brakes without its agreement. The heartbeat is watched: a silent level 1, or one that is wrong all the time, leads to a controlled stop at maximum braking decided by level 2 alone.</li>
        <li><b>Why this stop is not latched while the emergency is.</b> Losing level 1 is a failure of the autonomy computer, not a dangerous event in itself: the controlled stop is enough, and level 2 releases it once the heartbeat is stable again, after the usual short hold of the state; the “Levels 1 ↔ 2” tab counts down to the real release. The emergency state stays latched: automatic resumption after a real event is a failure mode. A level 1 that comes back never releases a latched emergency brake.</li>
        <li><b>The kernel profile is a worst case, not a measurement.</b> A general-purpose kernel gives no latency bound; PREEMPT_RT does. The simulator measures no kernel: each profile is an illustrative bound on the computing time of level 1, which enters t_lat (the zone gets longer) and delays by the same amount what level 1 passes to level 2 (the truck really travels the extra distance). Choosing the kernel never causes a heartbeat loss: its bound stays under the deadline. It does delay the detection of a frozen level 1, because the setpoints already in flight still arrive before the silence starts to count.</li>
      </ol>`,
    'guide.archi': `
      <h3>Two computers, two roles</h3>
      <p>Level 1 proposes, level 2 allows or blocks. The autonomy computer (level 1) perceives, plans and carries out the FMS movement authorities; it is considered unsafe by design. The safety controller (level 2) rechecks every setpoint with its own measurements, watches the heartbeat of level 1 and alone decides on the safe stop. This is the “doer / checker” pattern of the guide, made visible.</p>
      <div class="archi" role="img" aria-label="Illustrative diagram: level 1 (hardware, Linux in a real-time or standard variant, DDS / ROS 2, applications) sends its setpoints to level 2 (safety microcontroller, RTOS or bare metal, safety software), which answers with a verdict.">
        <div class="acol l1">
          <h4>Level 1 · autonomy</h4>
          <div class="ly">Applications<small>perception, planning, execution of the FMS movement authorities</small></div>
          <div class="ly">Middleware<small>DDS / ROS 2</small></div>
          <div class="ly vars">Linux (kernel and distribution)<div class="cells"><div>Real-time<small>PREEMPT_RT: bounded latency</small></div><div>Standard<small>general-purpose kernel: no latency bound</small></div></div></div>
          <div class="ly">Hardware<small>on-board computer</small></div>
        </div>
        <div class="amid"><div>setpoint · timestamp · sequence · integrity →</div><div>← verdict: accepted or rejected</div></div>
        <div class="acol l2">
          <h4>Level 2 · safety</h4>
          <div class="ly">Safety software<small>rechecks every setpoint with its own measurements; watches the heartbeat</small></div>
          <div class="ly">Certifiable RTOS or bare metal</div>
          <div class="ly">Safety microcontroller<small>dual channel</small></div>
        </div>
      </div>
      <h3>Level 1: a software stack on an on-board computer</h3>
      <p>Hardware, Linux (kernel and distribution), DDS / ROS 2 middleware, then the applications. Linux exists in a real-time or a standard variant, as in the “Autonomy · level 1” card: a PREEMPT_RT kernel bounds the scheduling latency, a general-purpose kernel gives no such bound. The latencies of the card are illustrative.</p>
      <h3>Level 2: small, simple, verifiable</h3>
      <p>A safety microcontroller running a certifiable RTOS or bare-metal code, with two channels that compute and compare. Little code, few dependencies, no ROS 2: this is what makes it possible to build a safety argument.</p>
      <h3>Reference frameworks</h3>
      <p>IEC 61508 (functional safety), ISO 13849 (safety-related parts of control systems) and ISO 17757 (autonomous mining and earth-moving machinery) are cited as reference frameworks. The simulator claims no conformity with any of them.</p>
      <p class="help">Illustrative diagram, not the description of any manufacturer's real system: real architectures differ.</p>
    `,
    'guide.limites': `
      <h3>Model limitations</h3>
      <ul>
        <li>Perfect path following (no lateral Ackermann control); reversing manoeuvres under the shovel are not simulated.</li>
        <li>Perception without false positives, constant-velocity prediction over 6 s; a single forward radar of ±18° (a real truck also has corner radars).</li>
        <li>Plausible but generic orders of magnitude: 160 → 400 t, braking 1.15 MN, traction 2.6 MW, rolling resistance 2 %. The zone ignores rolling resistance (conservative margin).</li>
        <li>CAN: response time approximated by <code>C + U·20 ms / (1 − U)</code> for synchronised bursty traffic; DDS: RELIABLE retransmission every 30 ms.</li>
        <li>The pickup is drawn ×1.5 for readability; collisions use its real size.</li>
        <li>Levels 1 and 2: the measurements of level 2 (position, speed, brakes) are exact copies of the simulated state, with no noise and no failure. Level 2 never fails and its two channels are not simulated (they only appear in the architecture diagram).</li>
        <li>The checksum of the setpoints is a home-made calculation, not a real CRC nor a standardised end-to-end protocol. Sensor diagnostics (LiDAR, radar, GNSS) reach level 2 without going through level 1.</li>
        <li>The two kernel profiles are two illustrative bounds on the computing time, not measurements of a real kernel. Only the difference from PREEMPT_RT is simulated, as a delay on the outputs of level 1; the computing time itself is a term of the t_lat budget.</li>
        <li>The architecture of the diagram (software stack, safety microcontroller) is illustrative: it is not the description of any manufacturer's real system. The standards cited (IEC 61508, ISO 13849, ISO 17757) are reference frameworks, with no claim of conformity.</li>
      </ul>
      <h3>Sources</h3>
      <ul>
        <li><a href="https://www.iso.org/standard/76769.html">ISO 23725:2024, FMS / AHS interoperability</a></li>
        <li><a href="https://www.iso.org/standard/77302.html">ISO 21815-1:2022, collision warning and avoidance</a></li>
        <li><a href="https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10140871">Hitachi patent, travel-permitted zones set by the fleet server</a></li>
        <li><a href="https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9672743">Traffic control patent: stopping within the permitted section on communication loss</a></li>
        <li><a href="https://worksafe.wa.gov.au/publications/mines-safety-significant-incident-report-no-286-near-miss-following-unplanned-movement">WorkSafe WA, incident no. 286: unplanned movement of AHTs</a></li>
      </ul>`
});
AHT.inscrire('js/i18n-en-guide.js', '11a61d9b');
