// The player's own movement on every supported version: walking, sprinting, jumping, sneaking and colliding, each
// scenario pinned to the versions where vanilla's result changes (and the change it comes from).
/* eslint-env mocha */
const { boundaryTest } = require('../helpers/versions')
const { world } = require('../helpers/world')
const { player, run, snapshot } = require('../helpers/player')

const f32 = Math.fround
const walk = (data, options, ticks, blocks, worldOptions) => snapshot(run(data, world(data, blocks, worldOptions), player(data, options), ticks))

const SCENARIOS = {
  walkTurned: {
    title: 'walking at yaw 30 for 3 ticks',
    run: data => walk(data, { yaw: 30, keys: { forward: true } }, 3),
    boundaries: ['1.14.4'],
    values: {
      '1.8.8': { pos: [0.3321911574457075, 64, 0.790674884822891], vel: [-0.04491373742661727, -0.0784000015258789, 0.07779861450902584], onGround: true },
      '1.14.4': { pos: [0.3321911405830302, 64, 0.7906749218857414], vel: [-0.044913741953138214, -0.0784000015258789, 0.07779862445393969], onGround: true }
    }
  },
  sprint: {
    title: 'sprinting forward for 6 ticks',
    run: data => walk(data, { keys: { forward: true, sprint: true } }, 6),
    boundaries: ['1.13.2', '1.14.4', '1.17.1', '1.18.2', '1.19.4'],
    values: {
      '1.8.8': { pos: [0.5, 64, 1.7109876024417665], vel: [0, -0.0784000015258789, 0.1472862320394346], onGround: true },
      '1.13.2': { pos: [0.5, 64, 1.710987735660324], vel: [0, -0.0784000015258789, 0.14728624902554027], onGround: true },
      '1.14.4': { pos: [0.5, 64, 1.7109878878562892], vel: [0, -0.0784000015258789, 0.1472862682198859], onGround: true },
      '1.17.1': { pos: [0.5, 64, 1.7109878878562894], vel: [0, -0.0784000015258789, 0.1472862682198859], onGround: true },
      '1.18.2': { pos: [0.5, 64, 1.7109878930153366], vel: [0, -0.0784000015258789, 0.1472862683675138], onGround: true },
      '1.19.4': { pos: [0.5, 64, 1.7109878878562894], vel: [0, -0.0784000015258789, 0.1472862682198859], onGround: true }
    }
  },
  diagonal: {
    title: 'walking forward and left for 3 ticks',
    run: data => walk(data, { keys: { forward: true, left: true } }, 3),
    boundaries: ['1.14.4', '1.17.1', '1.21.5'],
    values: {
      '1.8.8': { pos: [0.7421741466990779, 64, 0.7421741466990779], vel: [0.06481747843708105, -0.0784000015258789, 0.06481747843708105], onGround: true },
      '1.14.4': { pos: [0.7421741807225235, 64, 0.7421741807225235], vel: [0.06481748757767992, -0.0784000015258789, 0.06481748757767992], onGround: true },
      '1.17.1': { pos: [0.7421741856125559, 64, 0.7421741856125559], vel: [0.06481748888648838, -0.0784000015258789, 0.06481748888648838], onGround: true },
      '1.21.5': { pos: [0.7421741610541638, 64, 0.7421741610541638], vel: [0.06481748231347853, -0.0784000015258789, 0.06481748231347853], onGround: true }
    }
  },
  diagonalSneak: {
    title: 'sneaking forward and left for 3 ticks',
    run: data => walk(data, { keys: { forward: true, left: true, sneak: true } }, 3),
    boundaries: ['1.14.4', '1.15.2', '1.17.1', '1.21.5'],
    values: {
      '1.8.8': { pos: [0.600690884552299, 64, 0.600690884552299], vel: [0.026949735663433755, -0.0784000015258789, 0.026949735663433755], onGround: true },
      '1.14.4': { pos: [0.6006908993437048, 64, 0.6006908993437048], vel: [0.02694973963749639, -0.0784000015258789, 0.02694973963749639], onGround: true },
      '1.15.2': { pos: [0.6850828291419662, 64, 0.6850828291419662], vel: [0.038156731988950233, -0.0784000015258789, 0.038156731988950233], onGround: true },
      '1.17.1': { pos: [0.6850828320587721, 64, 0.6850828320587721], vel: [0.03815673237629321, -0.0784000015258789, 0.03815673237629321], onGround: true },
      '1.21.5': { pos: [0.6850828174101854, 64, 0.6850828174101854], vel: [0.03815673043100533, -0.0784000015258789, 0.03815673043100533], onGround: true }
    }
  },
  creepingVelocity: {
    title: 'standing with a horizontal velocity of 0.0029',
    run: data => walk(data, { vel: [0.0029, 0, 0.0029] }, 1),
    boundaries: ['1.21.5'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false },
      '1.21.5': { pos: [0.5029, 64, 0.5029], vel: [0.0015834001839160918, -0.0784000015258789, 0.0015834001839160918], onGround: false }
    }
  },
  slowVelocity: {
    title: 'standing with an x velocity of 0.004',
    run: data => walk(data, { vel: [0.004, 0, 0] }, 1),
    boundaries: ['1.9.4'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false },
      '1.9.4': { pos: [0.504, 64, 0.5], vel: [0.0021840002536773684, -0.0784000015258789, 0], onGround: false }
    }
  },
  iceWalk: {
    title: 'one walking tick on ice',
    run: data => walk(data, { keys: { forward: true } }, 1, {}, { floor: 'ice' }),
    boundaries: ['1.13.2', '1.14.4'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.5224906299263239], vel: [0, -0.0784000015258789, 0.020057144802124727], onGround: false },
      '1.13.2': { pos: [0.5, 64, 0.5224906336516142], vel: [0, -0.0784000015258789, 0.020057148124338786], onGround: false },
      '1.14.4': { pos: [0.5, 64, 0.5224906290974545], vel: [0, -0.0784000015258789, 0.02005714406293894], onGround: false }
    }
  },
  sprintJump: {
    title: 'sprint-jumping for 4 ticks',
    run: data => walk(data, { keys: { forward: true, sprint: true, jump: true } }, 4),
    boundaries: ['1.13.2', '1.14.4', '1.18.2', '1.19.4', '1.20.6'],
    values: {
      '1.8.8': { pos: [0.5, 65.16610926093821, 1.4607774259590711], vel: [0, 0.08307781780646721, 0.19819644470501582], onGround: false },
      '1.13.2': { pos: [0.5, 65.16610926093821, 1.4607774631375103], vel: [0, 0.08307781780646721, 0.19819645083609636], onGround: false },
      '1.14.4': { pos: [0.5, 65.16610926093821, 1.4607775092891133], vel: [0, 0.08307781780646721, 0.19819645962754548], onGround: false },
      '1.18.2': { pos: [0.5, 65.16610926093821, 1.460777519599112], vel: [0, 0.08307781780646721, 0.19819646417582273], onGround: false },
      '1.19.4': { pos: [0.5, 65.16610926093821, 1.4607775092891133], vel: [0, 0.08307781780646721, 0.19819645962754548], onGround: false },
      '1.20.6': { pos: [0.5, 65.16610926093821, 1.4607775018534257], vel: [0, 0.08307781780646721, 0.1981964584013294], onGround: false }
    }
  },
  airSprintStart: {
    title: 'pressing sprint and forward in the air',
    run: data => walk(data, { pos: [0.5, 70, 0.5], onGround: false, keys: { forward: true, sprint: true } }, 1),
    boundaries: ['1.14.4', '1.19.4'],
    values: {
      '1.8.8': { pos: [0.5, 70, 0.5196000002324581], vel: [0, -0.0784000015258789, 0.017836000725567347], onGround: false },
      '1.14.4': { pos: [0.5, 70, 0.5195999999433756], vel: [0, -0.0784000015258789, 0.017836000462502232], onGround: false },
      '1.19.4': { pos: [0.5, 70, 0.5254799991962313], vel: [0, -0.0784000015258789, 0.023186799936810092], onGround: false }
    }
  },
  wholeTurns: {
    title: 'walking at yaw 1000.37 for 2 ticks',
    run: data => walk(data, { yaw: f32(1000.37), keys: { forward: true } }, 2),
    boundaries: ['1.14.4'],
    values: {
      '1.8.8': { pos: [0.6683154485714575, 64, 0.5307872200298466], vel: [0.06544251754277637, -0.0784000015258789, 0.011970340218388763], onGround: true },
      '1.14.4': { pos: [0.6683154691104405, 64, 0.5307872225188115], vel: [0.06544252437753612, -0.0784000015258789, 0.011970340996298675], onGround: true }
    }
  },
  jumpBoost: {
    title: 'jumping with Jump Boost II',
    run: data => walk(data, { keys: { jump: true }, jumpBoost: 2 }, 3),
    boundaries: ['1.14.4', '1.17.1', '1.20.1'],
    values: {
      '1.8.8': { pos: [0.5, 65.58941599916672, 0.5], vel: [0, 0.35301169562194346, 0], onGround: false },
      '1.14.4': { pos: [0.5, 65.58941604298211, 0.5], vel: [0, 0.353011709646798, 0], onGround: false },
      '1.17.1': { pos: [0.5, 65.58941599916672, 0.5], vel: [0, 0.35301169562194346, 0], onGround: false },
      '1.20.1': { pos: [0.5, 65.58941604298211, 0.5], vel: [0, 0.353011709646798, 0], onGround: false }
    }
  },
  sprintJumpTurned: {
    title: 'sprint-jumping at yaw 30',
    run: data => walk(data, { yaw: 30, keys: { forward: true, sprint: true, jump: true } }, 1),
    boundaries: ['1.13.2', '1.14.4', '1.20.6'],
    values: {
      '1.8.8': { pos: [0.3363090753555298, 64.41999998688698, 0.7835419252514839], vel: [-0.08937525523705148, 0.33319999363422365, 0.15481390916935256], onGround: false },
      '1.13.2': { pos: [0.3363090679049492, 64.41999998688698, 0.7835419327020645], vel: [-0.08937525930506895, 0.33319999363422365, 0.15481391323737004], onGround: false },
      '1.14.4': { pos: [0.3363090626298775, 64.41999998688698, 0.7835419490533875], vel: [-0.08937526218525846, 0.33319999363422365, 0.15481392216519338], onGround: false },
      '1.20.6': { pos: [0.33630906561010965, 64.41999998688698, 0.7835419401126907], vel: [-0.08937526055805148, 0.33319999363422365, 0.15481391728357244], onGround: false }
    }
  },
  jumpWhileRising: {
    title: 'jumping on the ground while moving up at 1 block per tick',
    run: data => walk(data, { vel: [0, 1, 0], keys: { jump: true } }, 1),
    boundaries: ['1.21.3'],
    values: {
      '1.8.8': { pos: [0.5, 64.41999998688698, 0.5], vel: [0, 0.33319999363422365, 0], onGround: false },
      '1.21.3': { pos: [0.5, 65, 0.5], vel: [0, 0.9016000175476074, 0], onGround: false }
    }
  },
  bedLanding: {
    title: 'landing on a bed at 0.5 blocks per tick',
    run: data => walk(data, { pos: [0.5, 64.6, 0.5], vel: [0, -0.5, 0], onGround: false }, 2, { '0,64,0': 'red_bed' }),
    boundaries: ['1.12.2', '26.3'],
    values: {
      '1.8.8': { pos: [0.5, 64.5625, 0.5], vel: [0, -0.0784000015258789, 0], onGround: true },
      '1.12.2': { pos: [0.5, 64.80750001761913, 0.5], vel: [0, 0.16170002041387616, 0], onGround: false },
      26.3: { pos: [0.5, 64.85545214123367, 0.5], vel: [0, 0.2086931024707388, 0], onGround: false }
    }
  },
  cobwebEdge: {
    title: 'standing 5e-4 into a cobweb cell',
    run: data => walk(data, { pos: [0.5, 64, 1.3 - 0.0005 + 0.3] }, 2, { '0,64,2': 'cobweb', '0,65,2': 'cobweb' }),
    boundaries: [],
    values: {
      '1.8.8': { pos: [0.5, 64, 1.5995000000000001], vel: [0, -0.0784000015258789, 0], onGround: true }
    }
  },
  creativeCreep: {
    title: 'flying forward at a fly speed of 2e-4',
    run: data => walk(data, { pos: [0.5, 70, 0.5], onGround: false, flying: true, mayFly: true, flySpeed: 2e-4, gameMode: 'creative', keys: { forward: true } }, 3),
    boundaries: ['1.14.4', '1.21.3'],
    values: {
      '1.8.8': { pos: [0.5, 70, 0.5005879999807803], vel: [0, 0, 0.00017835999931032753], onGround: false },
      '1.14.4': { pos: [0.5, 70, 0.5], vel: [0, 0, 0.00017836000410592637], onGround: false },
      '1.21.3': { pos: [0.5, 70, 0.50058799999659], vel: [0, 0, 0.00017836000410592637], onGround: false }
    }
  },
  innerCorner: {
    title: 'walking diagonally into an inner corner',
    run: data => walk(data, { pos: [0.7, 64, 0.7], yaw: -45, keys: { forward: true, sprint: true } }, 4, { '1,64,0': 'stone', '1,65,0': 'stone', '0,64,1': 'stone', '0,65,1': 'stone', '1,64,1': 'stone', '1,65,1': 'stone' }),
    boundaries: ['1.13.2', '1.14.4', '1.18.2', '26.3'],
    values: {
      '1.8.8': { pos: [0.8882732175290584, 64, 0.8221213391701807], vel: [-0.005413384082863182, -0.0784000015258789, 0.05380173372873135], onGround: true },
      '1.13.2': { pos: [0.7, 64, 0.7], vel: [0, -0.0784000015258789, 0], onGround: true },
      '1.14.4': { pos: [0.7, 64, 0.7], vel: [0.07672566675415333, -0.0784000015258789, 0], onGround: true },
      '1.18.2': { pos: [0.7, 64, 0.7], vel: [0, -0.0784000015258789, 0], onGround: true },
      26.3: { pos: [0.7, 64, 0.7], vel: [-0, -0.0784000015258789, -0], onGround: true }
    }
  },
  sneakFromStanding: {
    title: 'pressing sneak and forward from standing',
    run: data => walk(data, { keys: { forward: true, sneak: true } }, 2),
    boundaries: ['1.14.4', '1.15.2'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.5513324000593482], vel: [0, -0.0784000015258789, 0.019958486006908787], onGround: true },
      '1.14.4': { pos: [0.5, 64, 0.5513324075722519], vel: [0, -0.0784000015258789, 0.0199584883769684], onGround: true },
      '1.15.2': { pos: [0.5, 64, 0.6573880118813518], vel: [0, -0.0784000015258789, 0.05404308930496973], onGround: true }
    }
  },
  swiftSneak: {
    title: 'sneak-walking with Swift Sneak III',
    run: data => walk(data, { keys: { forward: true, sneak: true }, crouching: true, isCrouching: true, swiftSneak: 3 }, 3),
    boundaries: ['1.14.4', '1.19', '1.21.1'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.600690884552299], vel: [0, -0.0784000015258789, 0.026949735663433755], onGround: true },
      '1.14.4': { pos: [0.5, 64, 0.6006908993437048], vel: [0, -0.0784000015258789, 0.02694973963749639], onGround: true },
      1.19: { pos: [0.5, 64, 0.7517272279455045], vel: [0, -0.0784000015258789, 0.06737434363003521], onGround: true },
      '1.21.1': { pos: [0.5, 64, 0.6006908993437048], vel: [0, -0.0784000015258789, 0.02694973963749639], onGround: true }
    }
  },
  sprintThenSneak: {
    title: 'sprinting, then pressing sneak',
    run: data => snapshot(run(data, world(data), player(data, { keys: { forward: true, sprint: true } }), 4, (tick, state) => { state.control.sneak = tick >= 2 }), ['pos', 'vel', 'sprinting']),
    boundaries: ['1.9.4', '1.13.2', '1.14.4', '1.15.2', '1.18.2', '1.19.4', '1.21.4', '1.21.5'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.9310012817815311], vel: [0, -0.0784000015258789, 0.05060010464216659], sprinting: false },
      '1.9.4': { pos: [0.5, 64, 0.931001281781531], vel: [0, -0.0784000015258789, 0.05060010464216659], sprinting: false },
      '1.13.2': { pos: [0.5, 64, 0.9310013162649902], vel: [0, -0.0784000015258789, 0.050600106849355966], sprinting: false },
      '1.14.4': { pos: [0.5, 64, 0.9534570875580992], vel: [0, -0.0784000015258789, 0.05804521716977559], sprinting: true },
      '1.15.2': { pos: [0.5, 64, 1.0913293660483467], vel: [0, -0.0784000015258789, 0.08463120684411529], sprinting: true },
      '1.18.2': { pos: [0.5, 64, 1.0913293704418108], vel: [0, -0.0784000015258789, 0.08463120733931799], sprinting: true },
      '1.19.4': { pos: [0.5, 64, 1.0913293660483467], vel: [0, -0.0784000015258789, 0.08463120684411529], sprinting: true },
      '1.21.4': { pos: [0.5, 64, 1.0825093670014252], vel: [0, -0.0784000015258789, 0.0798154868051376], sprinting: false },
      '1.21.5': { pos: [0.5, 64, 1.0913293660483467], vel: [0, -0.0784000015258789, 0.08463120684411529], sprinting: true }
    }
  },
  ladderJump: {
    title: 'holding jump against a free-standing ladder',
    run: data => walk(data, { pos: [0.5, 64, 0.5], keys: { jump: true } }, 3, { '0,64,0': 'ladder', '0,65,0': 'ladder', '0,66,0': 'ladder' }),
    boundaries: ['1.14.4'],
    values: {
      '1.8.8': { pos: [0.5, 65.00133597911214, 0.5], vel: [0, 0.16477328182606651, 0], onGround: false },
      '1.14.4': { pos: [0.5, 64.65519999146463, 0.5], vel: [0, 0.11760000228881837, 0], onGround: false }
    }
  }
}

if (typeof describe === 'function') {
  describe('movement', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.boundaries) boundaryTest(scenario.title, scenario.run, scenario)
    }
  })
}

module.exports = SCENARIOS
