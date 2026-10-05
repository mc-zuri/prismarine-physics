// Narrow vanilla details on every supported version, each scenario chosen to show one change: the radians of the
// yaw before 1.9, a climbable trapdoor, the glide and riding crouch rules, liquid gravity under slow falling.
/* eslint-env mocha */
const { boundaryTest } = require('../helpers/versions')
const { world } = require('../helpers/world')
const { player, run, snapshot } = require('../helpers/player')

const SCENARIOS = {
  yawRadians: {
    // (a yaw where (yaw * PI_F) / 180 and yaw * (PI / 180) pick different Mth table entries)
    title: 'walking at yaw 13.656 for 3 ticks',
    run: data => snapshot(run(data, world(data), player(data, { yaw: Math.fround(13.656), keys: { forward: true } }), 3)),
    boundaries: ['1.9.4', '1.14.4'],
    values: {
      '1.8.8': { pos: [0.4207902063083022, 64, 0.8261480769974039], vel: [-0.021200360007249487, -0.0784000015258789, 0.08729295111460784], onGround: true },
      '1.9.4': { pos: [0.4207902063083022, 64, 0.8261556534701766], vel: [-0.021200360007249487, -0.0784000015258789, 0.08729497896006849], onGround: true },
      '1.14.4': { pos: [0.420790196893075, 64, 0.8261556856848689], vel: [-0.02120036253904451, -0.0784000015258789, 0.08729498760848899], onGround: true }
    }
  },
  trapdoorLadder: {
    title: 'falling into an open trapdoor above a ladder facing the same way',
    run: data => {
      const blocks = {
        '0,64,0': { name: 'ladder', properties: { facing: 'north', waterlogged: 'false' }, metadata: 2 },
        '0,65,0': { name: 'oak_trapdoor', properties: { facing: 'north', open: 'true', half: 'bottom', powered: 'false', waterlogged: 'false' }, metadata: 4 | 1 }
      }
      return snapshot(run(data, world(data, blocks), player(data, { pos: [0.5, 65.3, 0.5], vel: [0, -0.5, 0], onGround: false }), 1))
    },
    boundaries: ['1.12.2', '1.13.2', '1.14.4'],
    values: {
      '1.8.8': { pos: [0.5, 65.1875, 0.5], vel: [0, -0.0784000015258789, 0], onGround: true },
      '1.12.2': { pos: [0.5, 64.8, 0.5], vel: [0, -0.5684000110626221, 0], onGround: false },
      '1.13.2': { pos: [0.5, 65.14999999999999, 0.5], vel: [0, -0.22540000438690183, 0], onGround: false },
      '1.14.4': { pos: [0.5, 65.14999999403953, 0.5], vel: [0, -0.22540001022815717, 0], onGround: false }
    }
  },
  longGlide: {
    title: 'gliding for 20 ticks at pitch 7.3',
    run: data => snapshot(run(data, world(data), player(data, { pos: [0.5, 200, 0.5], vel: [0.1, -0.2, 0.9], onGround: false, pitch: 7.3, elytraFlying: true, elytraEquipped: true }), 20), ['pos', 'vel']),
    boundaries: ['1.13.2', '1.18.2'],
    values: {
      '1.8.8': { pos: [1.2361472009463161, 196.53325527748473, 20.25070639229595], vel: [0.009943840839743649, -0.16257178611539527, 1.0504914201903628] },
      '1.13.2': { pos: [1.236147200946318, 196.53325527748473, 20.25070639229595], vel: [0.009943840839743763, -0.1625717861153952, 1.0504914201903628] },
      '1.18.2': { pos: [1.236147200946318, 196.533073904508, 20.25076482393422], vel: [0.009943840839743763, -0.1625843534695562, 1.0505002717758885] }
    }
  },
  glideSneak: {
    title: 'holding sneak while gliding',
    run: data => snapshot(run(data, world(data), player(data, { pos: [0.5, 100, 0.5], vel: [0, 0, 0.8], onGround: false, elytraFlying: true, elytraEquipped: true, keys: { sneak: true } }), 2), ['isCrouching', 'crouching']),
    boundaries: ['1.20.6'],
    values: {
      '1.8.8': { isCrouching: false, crouching: false },
      '1.20.6': { isCrouching: true, crouching: true }
    }
  },
  passengerShift: {
    title: 'a minecart passenger whose shift key was down last tick',
    run: data => {
      const state = player(data, { pos: [0.5, 64.5, 0.5], onGround: false, isCrouching: true })
      state.vehicle = { type: data.entitiesByName.minecart ? 'minecart' : 'MinecartRideable', pos: state.pos.offset(0, -0.5, 0) }
      run(data, world(data), state, 1)
      return state.crouching
    },
    boundaries: ['1.14.4', '1.20.6'],
    values: {
      '1.8.8': false,
      '1.14.4': true,
      '1.20.6': false
    }
  },
  slowFallingInWater: {
    title: 'sinking in deep water with Slow Falling',
    run: data => snapshot(run(data, world(data, {}, { fill: p => p.y < 70 && p.y >= 60 ? 'water' : null }), player(data, { pos: [0.5, 66, 0.5], onGround: false, slowFalling: 1 }), 3)),
    boundaries: ['1.13.2'],
    values: {
      '1.8.8': { pos: [0.5, 65.94399999976159, 0.5], vel: [0, -0.04880000061988831, 0], onGround: false },
      '1.13.2': { pos: [0.5, 65.99397499996424, 0.5], vel: [0, -0.00304500006467104, 0], onGround: false }
    }
  }
}

if (typeof describe === 'function') {
  describe('details', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.boundaries) boundaryTest(scenario.title, scenario.run, scenario)
    }
  })
}

module.exports = SCENARIOS
