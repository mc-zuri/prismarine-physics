// The world acting on the player on every supported version: blocks underfoot and inside, fluids, climbing, gliding,
// the auto-jump and the world border, each scenario pinned to the versions where vanilla's result changes.
/* eslint-env mocha */
const { boundaryTest } = require('../helpers/versions')
const { world } = require('../helpers/world')
const { player, run, snapshot } = require('../helpers/player')

const fields = ['pos', 'vel', 'onGround', 'isInWater', 'isInLava', 'isInWeb', 'elytraFlying']
const go = (data, options, ticks, blocks, worldOptions, each) => snapshot(run(data, world(data, blocks, worldOptions), player(data, options), ticks, each), fields)
const column = (name, from, to, x = 0, z = 0) => Object.fromEntries(Array.from({ length: to - from }, (_, i) => [`${x},${from + i},${z}`, name]))
const area = (name, y, radius = 3) => {
  const out = {}
  for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) out[`${x},${y},${z}`] = name
  return out
}

const SCENARIOS = {
  soulSandCorner: {
    title: 'walking across the corner of four soul sand blocks',
    run: data => go(data, { pos: [1, 64, 1], yaw: -45, keys: { forward: true } }, 4, { '0,63,0': 'soul_sand', '1,63,0': 'soul_sand', '0,63,1': 'soul_sand', '1,63,1': 'soul_sand' }),
    boundaries: ['1.14.4', '1.15.2', '1.21.11'],
    values: {
      '1.8.8': { pos: [1.204147368578996, 63.875, 1.204147368578996], vel: [0.000968598268099106, -0.0784000015258789, 0.000968598268099106], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [1.2041473914664111, 63.875, 1.2041473914664111], vel: [0.0009685983921950937, -0.0784000015258789, 0.0009685983921950937], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.15.2': { pos: [1.2008858780561797, 63.875, 1.2008858780561797], vel: [0.01707512368624441, -0.0784000015258789, 0.01707512368624441], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.21.11': { pos: [1.2008858780561797, 63.875, 1.2008666247648816], vel: [0.01707512368624441, -0.0784000015258789, 0.017073487173347328], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  tableOnIce: {
    title: 'walking on an enchanting table standing on ice',
    run: data => go(data, { pos: [0.5, 64.75, 0.5], keys: { forward: true } }, 3, { '0,64,0': 'enchanting_table' }, { floor: 'ice' }),
    boundaries: ['1.13.2', '1.14.4', '1.15.2', '1.17.1'],
    values: {
      '1.8.8': { pos: [0.5, 64.75, 0.620726407908751], vel: [0, -0.0784000015258789, 0.05224042755557754], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [0.5, 64.75, 0.6207264217047606], vel: [0, -0.0784000015258789, 0.05224043357389477], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 64.75, 0.6207264042870196], vel: [0, -0.0784000015258789, 0.05224042598191288], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.15.2': { pos: [0.5, 64.75, 0.8356363039273393], vel: [0, -0.0784000015258789, 0.08983245817338027], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.17.1': { pos: [0.5, 64.75, 0.8356363039273395], vel: [0, -0.0784000015258789, 0.08983245817338027], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  overhang: {
    title: 'walking off the edge of an ice block from x = 1.2',
    run: data => go(data, { pos: [1.2, 64, 0.5], yaw: -90, keys: { forward: true } }, 3, { '0,63,0': 'ice' }, { floorY: 0 }),
    boundaries: ['1.14.4', '1.20.1'],
    values: {
      '1.8.8': { pos: [1.5356362637622367, 63.92159999847412, 0.5], vel: [0.08983244738071554, -0.1552320045166016, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [1.5356363039273395, 63.92159999847412, 0.5], vel: [0.08983245817338027, -0.1552320045166016, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.20.1': { pos: [1.4601269296571315, 63.92159999847412, 0.5], vel: [0.07938707542497377, -0.1552320045166016, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  slimeEdge: {
    title: 'landing on the edge of a slime block with the feet over air',
    run: data => go(data, { pos: [1.2, 65.5, 0.5], vel: [0, -0.6, 0], onGround: false }, 4, { '0,63,0': 'slime_block' }, { floorY: 0 }),
    boundaries: ['1.20.1', '26.3'],
    values: {
      '1.8.8': { pos: [1.2, 64, 0.5], vel: [0, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.20.1': { pos: [1.2, 64.63844259883392, 0.5], vel: [0, 0.5472737575086929, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      26.3: { pos: [1.2, 64.65874163749514, 0.5], vel: [0, 0.5671668157838526, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  deepWater: {
    title: 'sinking in deep water',
    run: data => go(data, { pos: [0.5, 66, 0.5], onGround: false }, 3, {}, { fill: p => p.y < 70 && p.y >= 60 ? 'water' : null }),
    boundaries: ['1.13.2'],
    values: {
      '1.8.8': { pos: [0.5, 65.94399999976159, 0.5], vel: [0, -0.04880000061988831, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [0.5, 65.9859999999404, 0.5], vel: [0, -0.012200000154972078, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  depthStrider: {
    title: 'walking on the bottom of water with Depth Strider III',
    run: data => go(data, { keys: { forward: true }, depthStrider: 3 }, 4, {}, { fill: p => p.y >= 64 && p.y < 67 ? 'water' : null }),
    boundaries: ['1.13.2', '1.14.4', '1.17.1'],
    values: {
      '1.8.8': { pos: [0.5, 64, 1.0766677767739294], vel: [0, -0.02, 0.10525597273322027], onGround: true, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [0.5, 64, 1.0766677767739294], vel: [0, -0.005, 0.10525597273322027], onGround: true, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 64, 1.076667768615797], vel: [0, -0.005, 0.10525597125184165], onGround: true, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.17.1': { pos: [0.5, 64, 1.0766677686157968], vel: [0, -0.005, 0.10525597125184165], onGround: true, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  shallowLava: {
    title: 'walking into lava 0.4 deep',
    run: data => go(data, { keys: { forward: true } }, 4, {}, { fill: p => p.y === 64 && p.z >= 1 ? { name: 'lava', properties: { level: '4' }, metadata: 4 } : null }),
    boundaries: ['1.14.4', '1.17.1'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.9450687113754104], vel: [0, -0.02, 0.054716223806586826], onGround: true, isInWater: false, isInLava: true, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 64, 0.9450687620440952], vel: [0, -0.02, 0.054716229058377926], onGround: true, isInWater: false, isInLava: true, isInWeb: false, elytraFlying: undefined },
      '1.17.1': { pos: [0.5, 64, 0.9450687620440953], vel: [0, -0.02, 0.054716229058377926], onGround: true, isInWater: false, isInLava: true, isInWeb: false, elytraFlying: undefined }
    }
  },
  lavaFall: {
    title: 'falling into a lava pool',
    run: data => go(data, { pos: [0.5, 66.5, 0.5], vel: [0, -0.3, 0], onGround: false }, 4, {}, { fill: p => p.y >= 62 && p.y < 65 ? 'lava' : null }),
    boundaries: ['1.14.4', '1.16.5', '26.1'],
    values: {
      '1.8.8': { pos: [0.5, 64.87136299162094, 0.5], vel: [0, -0.5810272969997201, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 64.87136299162094, 0.5], vel: [0, -0.5810272969997201, 0], onGround: false, isInWater: false, isInLava: true, isInWeb: false, elytraFlying: undefined },
      '1.16.5': { pos: [0.5, 64.87136299162094, 0.5], vel: [0, -0.5810272969997201, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      26.1: { pos: [0.5, 64.87136299162094, 0.5], vel: [0, -0.5810272969997201, 0], onGround: false, isInWater: false, isInLava: true, isInWeb: false, elytraFlying: undefined }
    }
  },
  surfaceSprint: {
    title: 'sprint-swimming with the water surface just below the eyes',
    run: data => go(data, { pos: [0.5, 64.0, 0.5], keys: { forward: true, sprint: true } }, 3, {}, { fill: p => p.y >= 64 && p.y < 65 ? 'water' : null, floorY: 64 }),
    boundaries: ['1.13.2', '1.14.4'],
    values: {
      '1.8.8': { pos: [0.5, 64, 0.6027040020592213], vel: [0, -0.02, 0.038259201509857205], onGround: true, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [0.5, 64, 0.6027040020592213], vel: [0, -0.005, 0.038259201509857205], onGround: true, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 64, 0.6027040005444289], vel: [0, -0.005, 0.038259200945568075], onGround: true, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  bubbleUp: {
    title: 'rising in a bubble column',
    run: data => go(data, { pos: [0.5, 65, 0.5], onGround: false }, 4, column({ name: 'bubble_column', properties: { drag: 'false' }, otherwise: 'water' }, 64, 68), { fill: p => p.y >= 64 && p.y < 68 ? 'water' : null }),
    boundaries: ['1.13.2', '1.21.3'],
    values: {
      '1.8.8': { pos: [0.5, 64.8951999991417, 0.5], vel: [0, -0.05904000107765199, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [0.5, 65.55684001259328, 0.5], vel: [0, 0.412632012225628, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.21.3': { pos: [0.5, 65.70260000493525, 0.5], vel: [0, 0.5194800073885918, 0], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  bubbleSide: {
    title: 'moving diagonally past a bubble column the start box touches',
    run: data => go(data, { pos: [0.75, 65, 0.75], yaw: -45, vel: [0.3, 0, 0.3], onGround: false }, 2, { ...column({ name: 'bubble_column', properties: { drag: 'true' }, otherwise: 'water' }, 64, 68, 0, 0) }, { fill: p => p.y >= 64 && p.y < 68 ? 'water' : null }),
    boundaries: ['1.13.2', '1.21.3'],
    values: {
      '1.8.8': { pos: [1.2900000035762786, 64.98, 1.2900000035762786], vel: [0.19200000572204592, -0.03600000023841858, 0.19200000572204592], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [1.2900000035762786, 64.94699999928474, 1.2900000035762786], vel: [0.19200000572204592, -0.11940000227689744, 0.19200000572204592], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.21.3': { pos: [1.2900000035762786, 64.935, 1.2900000035762786], vel: [0.19200000572204592, -0.14700000077486036, 0.19200000572204592], onGround: false, isInWater: true, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  ladderClimb: {
    title: 'climbing a ladder while holding forward',
    run: data => go(data, { pos: [0.5, 64, 0.65], yaw: 0, keys: { forward: true } }, 4, column('ladder', 64, 68), { floorY: 64 }),
    boundaries: ['1.14.4'],
    values: {
      '1.8.8': { pos: [0.5, 64, 1.1211080028874867], vel: [0, -0.0784000015258789, 0.08190001276731529], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 64, 1.1211080232858064], vel: [0, -0.0784000015258789, 0.08190001276731529], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  powderSnowJump: {
    title: 'jumping out of powder snow in leather boots',
    run: data => go(data, { pos: [0.5, 64, 0.5], keys: { jump: true }, leatherBoots: true }, 2, column('powder_snow', 64, 66), { floorY: 64 }),
    boundaries: ['1.17.1', '1.21.5'],
    values: {
      '1.8.8': { pos: [0.5, 64.7531999805212, 0.5], vel: [0, 0.24813599859094576, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.17.1': { pos: [0.5, 64.59639999032021, 0.5], vel: [0, 0.11760000228881837, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: true, elytraFlying: undefined },
      '1.21.5': { pos: [0.5, 64.91979997733831, 0.5], vel: [0, 0.11760000228881837, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: true, elytraFlying: undefined }
    }
  },
  levelGlide: {
    title: 'gliding level at yaw 30, pitch 20',
    run: data => go(data, { pos: [0.5, 100, 0.5], vel: [0.5, 0, 0.5], onGround: false, yaw: 30, pitch: 20, elytraFlying: true, elytraEquipped: true }, 3),
    boundaries: ['1.13.2', '1.18.2'],
    values: {
      '1.8.8': { pos: [1.5013926265943596, 99.8651897081337, 2.03340758691808], vel: [0.2614524492108494, -0.06497053153741784, 0.5134181869032213], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: true },
      '1.13.2': { pos: [1.5013848415150377, 99.8651897081337, 2.0334024119340732], vel: [0.2614488374743873, -0.06497053153741784, 0.513415605523529], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: true },
      '1.18.2': { pos: [1.5013842350882851, 99.86517201934639, 2.0334034623154174], vel: [0.2614484786362943, -0.06497918103450409, 0.5134162270608158], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: true }
    }
  },
  steepGlide: {
    title: 'gliding at pitch 40',
    run: data => go(data, { pos: [0.5, 100, 0.5], vel: [0, 0, 1], onGround: false, pitch: 40, elytraFlying: true, elytraEquipped: true }, 2),
    boundaries: ['1.13.2', '1.18.2'],
    values: {
      '1.8.8': { pos: [0.5, 99.87925900272224, 2.4792629987336303], vel: [-1.2582546144577727e-17, -0.07942648720821421, 0.9869210064200578], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: true },
      '1.13.2': { pos: [0.5, 99.87925900272224, 2.4792629987336303], vel: [0, -0.07942648720821421, 0.9869210064200578], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: true },
      '1.18.2': { pos: [0.5, 99.87924589391201, 2.4792627705875336], vel: [0, -0.07943521219241562, 0.9869208408910153], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: true }
    }
  },
  autoJumpBlock: {
    title: 'walking into a one-block step with the auto-jump on',
    run: data => go(data, { pos: [0.5, 64, 0.5], autoJump: true, keys: { forward: true } }, 8, { '0,64,2': 'stone' }),
    boundaries: ['1.10.2', '1.14.4', '1.17.1'],
    values: {
      '1.8.8': { pos: [0.5, 64, 1.699999988079071], vel: [0, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.10.2': { pos: [0.5, 65.00133597911214, 1.704962575789489], vel: [0, 0.16477328182606651, 0.12788811231471856], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 65.00133597911214, 1.7049627228510738], vel: [0, 0.16477328182606651, 0.12788812442434677], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.17.1': { pos: [0.5, 65.00133597911214, 1.704962722851074], vel: [0, 0.16477328182606651, 0.12788812442434677], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  autoJumpHoney: {
    title: 'walking into a one-block step on honey with the auto-jump on',
    run: data => go(data, { pos: [0.5, 64, 0.5], autoJump: true, keys: { forward: true } }, 8, { '0,64,2': 'stone', '0,63,0': 'honey_block', '0,63,1': 'honey_block' }),
    boundaries: ['1.14.4', '1.15.2', '1.16.5', '1.17.1'],
    values: {
      '1.8.8': { pos: [0.5, 63, 1.4988625424130095], vel: [0, -0.0784000015258789, 0.11488985739843727], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.5, 63, 1.4988626218837264], vel: [0, -0.0784000015258789, 0.11488986972534472], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.15.2': { pos: [0.5, 64.14749999344349, 1.375368005290234], vel: [0, 0.12739999605417238, 0.02738248154327169], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.16.5': { pos: [0.5, 63.9375, 1.375368005290234], vel: [0, -0.0784000015258789, 0.02738248154327169], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.17.1': { pos: [0.5, 63.9375, 1.3753680052902342], vel: [0, -0.0784000015258789, 0.02738248154327169], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  autoJumpDiagonal: {
    title: 'sprinting diagonally into a step with the auto-jump on',
    run: data => go(data, { pos: [0.5, 64, 0.5], yaw: -30, autoJump: true, keys: { forward: true, sprint: true } }, 10, { '1,64,2': 'stone', '0,64,2': 'stone', '1,64,1': 'stone' }),
    boundaries: ['1.10.2', '1.13.2', '1.14.4', '1.17.1', '1.18.2', '1.19.4', '1.20.6'],
    values: {
      '1.8.8': { pos: [1.4724475159314718, 64, 0.699999988079071], vel: [0.058918474221987295, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.10.2': { pos: [1.6976216482688786, 65.02442408821369, 1.0540763686763845], vel: [0.11712743002216577, -0.22768848754498797, 0.09034212146362465], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [1.6976217036351156, 65.02442408821369, 1.0540763686763845], vel: [0.11712743316885496, -0.22768848754498797, 0.09034212146362465], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [0.9044223138295596, 65.02442408821369, 2.5743799787996178], vel: [0.05215808728080515, -0.22768848754498797, 0.20287441277619275], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.17.1': { pos: [0.9044223138295595, 65.02442408821369, 2.574379978799618], vel: [0.05215808728080515, -0.22768848754498797, 0.20287441277619275], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.18.2': { pos: [0.9044223221709315, 65.02442408821369, 2.5743800089717572], vel: [0.0521580901806643, -0.22768848754498797, 0.20287441902175068], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.19.4': { pos: [0.916703249437388, 65.02442408821369, 2.5683107673204613], vel: [0.05399264022884742, -0.22768848754498797, 0.20342064165014548], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.20.6': { pos: [0.916703249437388, 65.02442408821369, 2.568310779037693], vel: [0.05399264022884742, -0.22768848754498797, 0.20342064249102276], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  stepUnderCeiling: {
    title: 'sprint-jumping under a ceiling gap 1.875 high',
    run: data => go(data, { pos: [0.5, 64, 0.5], keys: { forward: true, sprint: true, jump: true } }, 8, { '0,64,2': { name: 'stone_slab', properties: { type: 'bottom' }, metadata: 0 }, '0,66,2': 'stone', '0,66,3': 'stone', '0,65,3': 'stone' }),
    boundaries: ['1.9.4', '26.3'],
    values: {
      '1.8.8': { pos: [0.5, 65.0155550727022, 1.699999988079071], vel: [0, -0.230527368912964, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.9.4': { pos: [0.5, 65.02442408821369, 1.699999988079071], vel: [0, -0.22768848754498797, 0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      26.3: { pos: [0.5, 65.02442408821369, 1.699999988079071], vel: [0, -0.22768848754498797, -0], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  worldBorder: {
    title: 'walking into the world border',
    run: data => go(data, { pos: [29999983.5, 64, 0.5], yaw: 90, keys: { forward: true } }, 6),
    boundaries: ['1.13.2', '1.14.4', '1.18.2', '1.21.5'],
    values: {
      '1.8.8': { pos: [29999982.568470925, 64, 0.5], vel: [-0.11329711997740252, -0.0784000015258789, 6.5528404353829925e-18], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.13.2': { pos: [29999982.568470925, 64, 0.5], vel: [-0.11329711997740252, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.14.4': { pos: [29999982.568470813, 64, 0.5], vel: [-0.11329713520754602, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.18.2': { pos: [29999982.568470813, 64, 0.5], vel: [-0.11329713520754602, -0.0784000015258789, 6.552841365123628e-18], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.21.5': { pos: [29999982.568470813, 64, 0.5], vel: [-0.11329713520754602, -0.0784000015258789, 1.3874898003883745e-17], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  worldBorderWest: {
    title: 'walking into the world border westward',
    run: data => go(data, { pos: [29999983.5, 64, 0.5], yaw: -90, keys: { forward: true } }, 6),
    boundaries: ['26.3'],
    values: {
      '1.8.8': { pos: [29999983.699999988, 64, 0.5], vel: [0, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      26.3: { pos: [29999983.699999988, 64, 0.5], vel: [-0, -0.0784000015258789, 0], onGround: true, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  tinyFlight: {
    title: 'flying with an x movement under 1e-7',
    run: data => go(data, { pos: [0.5, 70, 0.5], vel: [5e-8, 0, 0.1], onGround: false, flying: true, mayFly: true, gameMode: 'creative' }, 1),
    boundaries: ['1.21.5'],
    values: {
      '1.8.8': { pos: [0.5, 70, 0.6], vel: [0, 0, 0.09100000262260438], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined },
      '1.21.5': { pos: [0.50000005, 70, 0.6], vel: [4.5500001311302185e-8, 0, 0.09100000262260438], onGround: false, isInWater: false, isInLava: false, isInWeb: false, elytraFlying: undefined }
    }
  },
  sprintAlongWall: {
    title: 'sprinting into a wall at 5 degrees',
    run: data => snapshot(run(data, world(data, column('stone', 64, 66, 0, 2)), player(data, { yaw: 5, keys: { forward: true, sprint: true }, sprinting: true }), 6), ['pos', 'vel', 'sprinting']),
    boundaries: ['1.13.2', '1.14.4', '1.17.1', '1.18.2', '1.19.4', '26.3'],
    values: {
      '1.8.8': { pos: [0.394481177504015, 64, 1.699999988079071], vel: [-0.012833715035075625, -0.0784000015258789, 0], sprinting: true },
      '1.13.2': { pos: [0.3944811691778551, 64, 1.699999988079071], vel: [-0.01283371609670723, -0.0784000015258789, 0], sprinting: true },
      '1.14.4': { pos: [0.39448115441563997, 64, 1.699999988079071], vel: [-0.012833717949485488, -0.0784000015258789, 0], sprinting: true },
      '1.17.1': { pos: [0.3944811544156399, 64, 1.699999988079071], vel: [-0.012833717949485488, -0.0784000015258789, 0], sprinting: true },
      '1.18.2': { pos: [0.39448115396610883, 64, 1.699999988079071], vel: [-0.012833717962348973, -0.0784000015258789, 0], sprinting: true },
      '1.19.4': { pos: [0.3944811544156399, 64, 1.699999988079071], vel: [-0.012833717949485488, -0.0784000015258789, 0], sprinting: true },
      26.3: { pos: [0.3944811544156399, 64, 1.699999988079071], vel: [-0.012833717949485488, -0.0784000015258789, -0], sprinting: true }
    }
  }
}

if (typeof describe === 'function') {
  describe('environment', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.boundaries) boundaryTest(scenario.title, scenario.run, scenario)
    }
  })
}

module.exports = SCENARIOS
module.exports.area = area
