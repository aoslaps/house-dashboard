/* ============================================================================
 * HOUSE DATA  —  single source of truth for the dashboard
 * ----------------------------------------------------------------------------
 * This is the file you'll spend most of your time in. Everything the dashboard
 * renders (floor plan, side panel, charts, KPIs) is computed from here.
 *
 * Loaded as a plain <script>, so it works when you just double-click
 * index.html (no dev server needed) AND on GitHub Pages / Netlify.
 * ---------------------------------------------------------------------------- */

window.HOUSE = {

  meta: {
    address: "2905 N State Road 9, Columbia City, IN",
    // How to weight "Overall % complete":
    //   "area"   -> a big room counts more than a closet (uses sq ft)   [honest default]
    //   "budget" -> weight by $ budget (best proxy for effort/cost)
    //   "equal"  -> every room counts the same (easy, but misleading)
    progressWeighting: "area",
    areaAccuracyNote: "Areas are approximate from architectural model ('somewhat accurate.sh3d'). Verify in the field before ordering materials.",
    panelAnchor: { x: 1.291, y: -0.9, z: 6.855 }, // Sited at centroid of basement-mech room.
    furnaceAnchor: { x: 1.55, y: -1.18, z: 3.27 }, // Approximate furnace equipment location in basement.
  },

  /* -------------------------------------------------------------------------
   * ROOMS
   * Each room:
   *   id           string  matches the SVG shape id. lowercase-hyphenated.
   *   name         string  display label
   *   type         string  bedroom|bath|kitchen|living|flex|utility|storage|
   *                        circulation|exterior|garage|basement
   *   area         number  square feet (from Sweet Home 3D)
   *   floor        string  "main" | "basement"  (basement is a separate plan)
   *   countsAsFinished bool included in finished/heated sq ft? (garage=false, etc)
   *   phase        string  "existing" (built) | "proposed" (drawn, not built)
   *   status       string  not-started | in-progress | blocked | complete
   *   percent      number  0–100  (per-room completion)
   *   budget       number  planned $ (0 if unknown)
   *   spent        number  actual $ so far
   *   tasks        array   { label, done }
   *   photos       array   paths under assets/photos/  (e.g. "assets/photos/br1-1.jpg")
   *   circuits     array   breaker ids that feed this room (mirror of data below)
   *   notes        string
   * ------------------------------------------------------------------------- */
  rooms: [
    {
      id: "garage", name: "Garage (AELIO Labs)", type: "garage",
      area: 798.99, floor: "main", countsAsFinished: false, phase: "existing",
      status: "in-progress", percent: 60, budget: 0, spent: 0,
      tasks: [
        { label: "Mini-split installed (Senville LETO 24K)", done: true },
        { label: "Workbenches + butcher block", done: true },
        { label: "Subpanel install", done: false },
      ],
      photos: [], circuits: ["A08"],
      notes: "Doubles as the shop. Unheated for sq-ft purposes even though conditioned by the mini-split — still functions as a garage.",
    },
    {
      id: "livingroom", name: "Living Room", type: "living",
      area: 301.51, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [],
      photos: [], circuits: ["A12"],
      notes: "Open to kitchen + dining. The real living hub of the house.",
    },
    {
      id: "flex2", name: "Flex 2", type: "flex",
      area: 264.92, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [],
      photos: [], circuits: [],
      notes: "Northeast flex space.",
    },
    {
      id: "greatroom", name: "Great Room", type: "living",
      area: 237.69, floor: "main", countsAsFinished: true, phase: "existing",
      status: "complete", percent: 100, budget: 0, spent: 0,
      tasks: [{ label: "Habitable", done: true }],
      photos: [], circuits: ["B02"],
      notes: "Old sewing room, newer drywall, two exterior doors, no closet — you're sleeping here. Not a legal bedroom (no closet/egress window).",
    },
    {
      id: "kitchen", name: "Kitchen", type: "kitchen",
      area: 193.72, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [{ label: "Scope island + appliances", done: false }],
      photos: [], circuits: ["A14", "A16"],
      notes: "~15' island, dishwasher. Biggest single line item.",
    },
    {
      id: "bed4", name: "Bedroom 4", type: "bedroom",
      area: 169.58, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["B06"], notes: "",
    },
    {
      id: "bed2", name: "Bedroom 2", type: "bedroom",
      area: 145.82, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["B04"], notes: "",
    },
    {
      id: "bed1", name: "Bedroom 1", type: "bedroom",
      area: 145.37, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["B04"], notes: "",
    },
    {
      id: "office", name: "Office", type: "flex",
      area: 145.01, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["A12"], notes: "",
    },
    {
      id: "bed3", name: "Bedroom 3", type: "bedroom",
      area: 142.65, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["B06"], notes: "",
    },
    {
      id: "flex1", name: "Flex 1", type: "flex",
      area: 129.72, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["A12"],
      notes: "Off the front hall, one wall of windows + exterior door. Reads sunroom-ish but only glazed on one side.",
    },
    {
      id: "laundry", name: "Laundry (relocate?)", type: "utility",
      area: 98.95, floor: "main", countsAsFinished: true, phase: "existing",
      status: "blocked", percent: 0, budget: 0, spent: 0,
      tasks: [
        { label: "Price stacked washer/dryer", done: false },
        { label: "Plan relocation off the circulation path", done: false },
      ],
      photos: [], circuits: ["B08"],
      notes: "Bad spot — you walk THROUGH it to reach a bedroom wing. Candidate to relocate into a closet; consider marking a 'proposed' version.",
    },
    {
      id: "fronthall", name: "Front Hall", type: "circulation",
      area: 98.52, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["A02"], notes: "",
    },
    {
      id: "ba2", name: "Bathroom 2", type: "bath",
      area: 73.50, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["B10"], notes: "",
    },
    {
      id: "hall1", name: "Hall 1", type: "circulation",
      area: 63.35, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["A02"], notes: "",
    },
    {
      id: "ba1", name: "Bathroom 1", type: "bath",
      area: 59.63, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: ["B10"], notes: "",
    },
    {
      id: "hall2", name: "Hall 2", type: "circulation",
      area: 55.88, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [], notes: "",
    },
    {
      id: "basementstairs", name: "Basement Stairs", type: "circulation",
      area: 33.05, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [], notes: "",
    },
    {
      id: "entryporch", name: "Entry Porch", type: "exterior",
      area: 25.20, floor: "main", countsAsFinished: false, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [],
      notes: "Enclosed but unheated — stays out of finished sq ft.",
    },
    {
      id: "hall3", name: "Hall 3", type: "circulation",
      area: 21.96, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [], notes: "",
    },
    {
      id: "br2closet", name: "BR2 Closet", type: "storage",
      area: 16.16, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [], notes: "",
    },
    {
      id: "br1closet", name: "BR1 Closet", type: "storage",
      area: 15.23, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [], notes: "",
    },
    {
      id: "br3closet", name: "BR3 Closet", type: "storage",
      area: 10.29, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [], notes: "",
    },
    {
      id: "hallcloset", name: "Hall Closet", type: "storage",
      area: 5.08, floor: "main", countsAsFinished: true, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [],
      notes: "Tiny closet off the front hall by the garage.",
    },

    /* ---- BASEMENT (separate plan/level) ---- */
    {
      id: "basement-mech", name: "Basement — Mechanical", type: "basement",
      area: 443, floor: "basement", countsAsFinished: false, phase: "existing",
      status: "blocked", percent: 0, budget: 0, spent: 0,
      tasks: [{ label: "Panel code violation — licensed electrician", done: false }],
      photos: [], circuits: ["MAIN"],
      notes: "Furnace + panel side of the old stone foundation wall. Unfinished — excluded from sq ft.",
    },
    {
      id: "basement-storage", name: "Basement — Storage", type: "basement",
      area: 590, floor: "basement", countsAsFinished: false, phase: "existing",
      status: "not-started", percent: 0, budget: 0, spent: 0,
      tasks: [], photos: [], circuits: [],
      notes: "Storage side of the stone wall. Unfinished.",
    },
  ],

  /* -------------------------------------------------------------------------
   * CIRCUITS  —  the electrical layer.
   * Circuits reference rooms by id.
   * ------------------------------------------------------------------------- */
  circuits: [
    { id: "A02", breaker: 2,  panel: "main", amps: 15, description: "Hall + front lighting",     rooms: ["fronthall", "hall1", "flex1"], placeholder: true,  verified: false },
    { id: "A08", breaker: 8,  panel: "main", amps: 30, description: "Garage / shop",              rooms: ["garage"],                       placeholder: false, verified: true },
    { id: "A12", breaker: 12, panel: "main", amps: 20, description: "Living room receptacles",     rooms: ["livingroom", "flex1", "office"], placeholder: true,  verified: false },
    { id: "A14", breaker: 14, panel: "main", amps: 20, description: "Kitchen small appliance",    rooms: ["kitchen"],                      placeholder: true,  verified: false },
    { id: "A16", breaker: 16, panel: "main", amps: 20, description: "Kitchen small appliance",    rooms: ["kitchen"],                      placeholder: true,  verified: false },
    { id: "B02", breaker: 2,  panel: "sub",  amps: 15, description: "Great room",                 rooms: ["greatroom"],                    placeholder: true,  verified: false },
    { id: "B04", breaker: 4,  panel: "sub",  amps: 15, description: "Bedrooms 1 & 2",             rooms: ["bed1", "bed2"],                 placeholder: true,  verified: false },
    { id: "B06", breaker: 6,  panel: "sub",  amps: 15, description: "Bedrooms 3 & 4",             rooms: ["bed3", "bed4"],                 placeholder: true,  verified: false },
    { id: "B08", breaker: 8,  panel: "sub",  amps: 20, description: "Laundry",                     rooms: ["laundry"],                      placeholder: true,  verified: false },
    { id: "B10", breaker: 10, panel: "sub",  amps: 20, description: "Bath GFCI",                   rooms: ["ba1", "ba2"],                   placeholder: true,  verified: false },
  ],

  /* -------------------------------------------------------------------------
   * REGISTERS  —  the HVAC layer (Phase 7c).
   * Supply and return registers reference rooms by id.
   * anchor: { x, y, z } in 3D space, or null to default to room centroid.
   * ------------------------------------------------------------------------- */
  registers: [
    { id: "reg-1", room: "greatroom",  kind: "supply", size: "4x10", cfm: 100,  anchor: { x:  2.8, y: 0.02, z: 9.5 }, verified: false },
    { id: "reg-2", room: "greatroom",  kind: "supply", size: "4x10", cfm: 100,  anchor: { x: -0.2, y: 0.02, z: 8.5 }, verified: false },
    { id: "reg-3", room: "livingroom", kind: "supply", size: "4x10", cfm: 120,  anchor: { x: -3.5, y: 0.02, z: 8.0 }, verified: false },
    { id: "reg-4", room: "livingroom", kind: "supply", size: "4x10", cfm: 120,  anchor: { x: -6.0, y: 0.02, z: 5.5 }, verified: false },
    { id: "reg-5", room: "kitchen",    kind: "supply", size: "4x10", cfm: 90,   anchor: { x:  2.5, y: 0.02, z: 3.5 }, verified: false },
    { id: "reg-6", room: "flex1",      kind: "supply", size: "4x10", cfm: 80,   anchor: { x:  2.5, y: 0.02, z: 0.8 }, verified: false },
    { id: "reg-7", room: "bed2",       kind: "supply", size: "4x10", cfm: 75,   anchor: { x:  5.5, y: 0.02, z: 1.0 }, verified: false },
    { id: "reg-8", room: "bed4",       kind: "supply", size: "4x10", cfm: 75,   anchor: { x: 10.0, y: 0.02, z: 4.5 }, verified: false },
  ],
};
