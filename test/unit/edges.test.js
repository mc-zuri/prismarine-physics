// Edge cases on every supported version, each scenario built to show one vanilla change: soul speed's attribute,
// sprinting while gliding, the inset of the blocks inside the player, water entry under 1.21.4's skipped fall check,
// the legacy sneaking box, glancing collisions, the eyes' fluid offset, bubble column surfaces and shallow lava.
/* eslint-env mocha */
const { boundaryTest } = require('../helpers/versions')
const { world } = require('../helpers/world')
const { player, run, snapshot } = require('../helpers/player')

const fields = ['pos', 'vel', 'onGround', 'isInWater', 'isInLava', 'isInWeb', 'sprinting', 'swimming']
const go = (data, options, ticks, blocks, worldOptions) => snapshot(run(data, world(data, blocks, worldOptions), player(data, options), ticks), fields)
const row = (name, x, y, from, to) => Object.fromEntries(Array.from({ length: to - from }, (_, i) => [`${x},${y},${from + i}`, name]))

const SCENARIOS = {
  soulSpeedAttribute: {
    title: 'walking on soul sand with a movement efficiency of 0.5',
    run: data => {
      const attribute = data.attributesArray?.find(a => a.name === 'movementEfficiency')
      const attributes = attribute ? { [attribute.resource]: { value: 0.5, modifiers: [] } } : undefined
      return go(data, { keys: { forward: true }, attributes }, 4, {}, { floor: 'soul_sand' })
    },
    boundaries: ['1.14.4', '1.15.2', '1.17.1', '1.21.1'],
    values: {
      '1.8.8': { pos: [0.5, 63.875, 0.822047661727707], vel: [0, -0.0784000015258789, 0.00914907036558825], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.14.4': { pos: [0.5, 63.875, 0.8220476981022062], vel: [0, -0.0784000015258789, 0.009149071563385387], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.15.2': { pos: [0.5, 63.875, 0.7840955380983652], vel: [0, -0.0784000015258789, 0.024147871909558145], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.17.1': { pos: [0.5, 63.875, 0.7840955380983651], vel: [0, -0.0784000015258789, 0.024147871909558145], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.21.1': { pos: [0.5, 63.875, 0.8446366434339803], vel: [0, -0.0784000015258789, 0.05107592025824505], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false }
    }
  },
  sprintWhileGliding: {
    title: 'pressing sprint and forward while gliding',
    run: data => go(data, { pos: [0.5, 100, 0.5], vel: [0, -0.1, 0.6], onGround: false, elytraFlying: true, elytraEquipped: true, keys: { forward: true, sprint: true } }, 2),
    boundaries: ['1.13.2', '1.20.1'],
    values: {
      '1.8.8': { pos: [0.5, 99.78316911396301, 1.7145494416501772], vel: [-8.704404486296403e-18, -0.11099088397705083, 0.6098574358251344], onGround: false, isInWater: false, isInLava: false, isInWeb: false, sprinting: true, swimming: false },
      '1.13.2': { pos: [0.5, 99.78316911396301, 1.7145494416501772], vel: [0, -0.11099088397705083, 0.6098574358251344], onGround: false, isInWater: false, isInLava: false, isInWeb: false, sprinting: true, swimming: false },
      '1.20.1': { pos: [0.5, 99.78316911396301, 1.7145494416501772], vel: [0, -0.11099088397705083, 0.6098574358251344], onGround: false, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false }
    }
  },
  cobwebInset: {
    title: 'walking along a cobweb 5e-4 inside the player box',
    run: data => go(data, { pos: [0.7005, 64, 0.5], keys: { forward: true } }, 3, { ...row('cobweb', 1, 64, -2, 6), ...row('cobweb', 1, 65, -2, 6) }),
    boundaries: ['1.14.4', '1.17.1', '1.19.3'],
    values: {
      '1.8.8': { pos: [0.7004999999999999, 64, 0.8356362637622368], vel: [0, -0.0784000015258789, 0.08983244738071554], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.14.4': { pos: [0.7004999999999999, 64, 0.8356363039273393], vel: [0, -0.0784000015258789, 0.08983245817338027], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.17.1': { pos: [0.7005, 64, 0.8356363039273395], vel: [0, -0.0784000015258789, 0.08983245817338027], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.19.3': { pos: [0.7005, 64, 0.6407770062088818], vel: [0, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: true, sprinting: false, swimming: false }
    }
  },
  waterEntry: {
    title: 'falling into water just before crossing its surface',
    run: data => go(data, { pos: [4.5, 101.30543845175121, 1549.5], vel: [0, -0.6517088341626173, 0], onGround: false }, 1, {}, { fill: p => p.y === 100 ? 'water' : null, floorY: 100 }),
    boundaries: ['1.13.2', '1.21.4', '1.21.5'],
    values: {
      '1.8.8': { pos: [4.5, 100.6537296175886, 1549.5], vel: [0, -0.7170746714356033, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.13.2': { pos: [4.5, 100.6537296175886, 1549.5], vel: [0, -0.7170746714356033, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.21.4': { pos: [4.5, 100.6537296175886, 1549.5], vel: [0, -0.7170746714356033, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.21.5': { pos: [4.5, 100.6537296175886, 1549.5], vel: [0, -0.7170746714356033, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: false, swimming: false }
    }
  },
  sneakUnderSlab: {
    title: 'sneaking forward under a ceiling 1.5 blocks high',
    run: data => go(data, { keys: { forward: true, sneak: true }, crouching: true, isCrouching: true, pose: 'crouching' }, 12, row({ name: 'stone_slab', properties: { type: 'top' }, metadata: 8 }, 0, 65, 2, 5)),
    boundaries: ['1.14.4', '1.17.1'],
    values: {
      '1.8.8': { pos: [0.5, 64, 1.165070402613111], vel: [0, -0.0784000015258789, 0.03532145663078116], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.14.4': { pos: [0.5, 64, 1.1650705104777856], vel: [0, -0.0784000015258789, 0.03532146252556848], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.17.1': { pos: [0.5, 64, 1.1650705104777854], vel: [0, -0.0784000015258789, 0.03532146252556848], onGround: true, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false }
    }
  },
  glancingWall: {
    title: 'sprinting along a wall 5 degrees into it',
    run: data => snapshot(run(data, world(data, { ...row('stone', 1, 64, -2, 12), ...row('stone', 1, 65, -2, 12) }), player(data, { pos: [0.7, 64, 0.5], yaw: -5, keys: { forward: true, sprint: true }, sprinting: true }), 6), ['pos', 'vel', 'sprinting']),
    boundaries: ['1.13.2', '1.14.4', '1.18.2', '1.19.4', '26.3'],
    values: {
      '1.8.8': { pos: [0.7891312810402624, 64, 0.699999988079071], vel: [0.010026647079029052, -0.0784000015258789, 0], sprinting: false },
      '1.13.2': { pos: [0.7, 64, 1.519016753194923], vel: [0, -0.0784000015258789, 0.11463226610343227], sprinting: false },
      '1.14.4': { pos: [0.7, 64, 1.5190168866541927], vel: [0, -0.0784000015258789, 0.11463228465539942], sprinting: false },
      '1.18.2': { pos: [0.7, 64, 1.7063718776558023], vel: [0, -0.0784000015258789, 0.14672484601064775], sprinting: true },
      '1.19.4': { pos: [0.7, 64, 1.7063718725164203], vel: [0, -0.0784000015258789, 0.14672484586358256], sprinting: true },
      26.3: { pos: [0.7, 64, 1.7063718725164203], vel: [-0, -0.0784000015258789, 0.14672484586358256], sprinting: true }
    }
  },
  eyeAtSurface: {
    title: 'sprinting in water whose surface is between the eyes and 0.11 below them',
    run: data => go(data, { pos: [0.5, 64, 0.5], keys: { forward: true, sprint: true } }, 3, {}, { fill: p => p.y === 64 ? 'water' : p.y === 65 ? { name: 'water', properties: { level: '3' }, metadata: 3 } : null, floorY: 64 }),
    boundaries: ['1.13.2', '1.14.4', '1.16.5', '1.21.1'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.6027040020592213], vel: [0, -0.02, 0.038259201509857205], onGround: true, isInWater: true, isInLava: false, isInWeb: false, sprinting: true, swimming: false },
      '1.13.2': { pos: [0.5, 64, 0.6099559995283484], vel: [0, 0, 0.04780439812298418], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: true, swimming: true },
      '1.14.4': { pos: [0.5, 64, 0.6099559979065954], vel: [0, 0, 0.04780439741791192], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: true, swimming: true },
      '1.16.5': { pos: [0.5, 64, 0.6062319992958903], vel: [0, 0, 0.04621679807438254], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: true, swimming: true },
      '1.21.1': { pos: [0.5, 64, 0.6027040005444289], vel: [0, -0.005, 0.038259200945568075], onGround: true, isInWater: true, isInLava: false, isInWeb: false, sprinting: false, swimming: false }
    }
  },
  bubbleUnderRail: {
    title: 'rising in a bubble column under a rail',
    run: data => go(data, { pos: [0.5, 64.2, 0.5], onGround: false }, 3, { '0,64,0': { name: 'bubble_column', properties: { drag: 'false' }, otherwise: 'water' }, '0,65,0': 'rail' }, { fill: p => p.y === 64 ? 'water' : null }),
    boundaries: ['1.13.2', '1.21.3', '1.21.5'],
    values: {
      '1.8.8': { pos: [0.5, 64.14399999976159, 0.5], vel: [0, -0.04880000061988831, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.13.2': { pos: [0.5, 64.32040000251531, 0.5], vel: [0, 0.10492000307798388, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.21.3': { pos: [0.5, 64.35400000065566, 0.5], vel: [0, 0.13420000170469285, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: false, swimming: false },
      '1.21.5': { pos: [0.5, 64.46600000113249, 0.5], vel: [0, 0.23180000294446948, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, sprinting: false, swimming: false }
    }
  },
  aboveShallowLava: {
    title: 'hovering 0.3 above the bottom of lava 0.22 deep',
    run: data => go(data, { pos: [0.5, 64.3, 0.5], onGround: false }, 1, {}, { fill: p => p.y === 64 ? { name: 'lava', properties: { level: '6' }, metadata: 6 } : null }),
    boundaries: ['1.14.4', '1.16.5'],
    values: {
      '1.8.8': { pos: [0.5, 64.3, 0.5], vel: [0, -0.02, 0], onGround: false, isInWater: false, isInLava: true, isInWeb: false, sprinting: false, swimming: false },
      '1.14.4': { pos: [0.5, 64.3, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false, isInWater: false, isInLava: true, isInWeb: false, sprinting: false, swimming: false },
      '1.16.5': { pos: [0.5, 64.3, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, sprinting: false, swimming: false }
    }
  }
}

if (typeof describe === 'function') {
  describe('edges', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.boundaries) boundaryTest(scenario.title, scenario.run, scenario)
    }
  })
}

module.exports = SCENARIOS
