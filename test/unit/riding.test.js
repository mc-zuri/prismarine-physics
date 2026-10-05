// Vehicles, other entities and pistons on every supported version: the vehicle the player drives or sits on, the
// mobs and boats around it, and the piston heads that push it, each scenario pinned to the versions where vanilla's
// result changes.
/* eslint-env mocha */
const { Vec3 } = require('vec3')
const { boundaryTest } = require('../helpers/versions')
const { world } = require('../helpers/world')
const { player, run, snapshot } = require('../helpers/player')

const boatType = data => data.entitiesByName.oak_boat ? 'oak_boat' : 'boat'
const vehicleFields = vehicle => ({ pos: [vehicle.pos.x, vehicle.pos.y, vehicle.pos.z], vel: [vehicle.vel.x, vehicle.vel.y, vehicle.vel.z], yaw: vehicle.yaw })
function ride (data, vehicle, options, ticks, blocks, worldOptions, each) {
  const state = player(data, { onGround: false, ...options })
  state.vehicle = { vel: new Vec3(0, 0, 0), yaw: 0, pitch: 0, onGround: true, deltaRotation: 0, landFriction: 0, input: { left: false, right: false, up: false, down: false }, ...vehicle }
  run(data, world(data, blocks, worldOptions), state, ticks, each)
  // (a sneaking passenger may have got off: no vehicle left)
  return { player: snapshot(state, ['pos', 'vel', 'sprinting', 'crouching']), vehicle: state.vehicle ? vehicleFields(state.vehicle) : null, standing: state.vehicle?.standing ?? null }
}
const water = (top = 65) => ({ fill: p => p.y >= 60 && p.y < top ? 'water' : null, floorY: 60 })

const SCENARIOS = {
  boatPaddle: {
    title: 'paddling a boat forward on water',
    run: data => ride(data, { type: boatType(data), pos: new Vec3(0.5, 64.6, 0.5), input: { left: false, right: false, up: true, down: false } }, { pos: [0.5, 64.8, 0.5], keys: { forward: true } }, 5, {}, water()),
    boundaries: ['1.9.4', '1.14.4', '1.17.1', '1.20.2', '1.20.6'],
    values: {
      '1.8.8': { player: { pos: [0.9, 63.949999999999996, 0.5], vel: [0, -0.02, 0.015680000419616702], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.6, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 64.0940795076209, 1.0257639718679492], vel: [0, -0.0784000015258789, 0.017836000725567347], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.54407949569998, 1.0257639718679492], vel: [0, -0.012862008823809503, 0.16380398857006467], yaw: 0 }, standing: null },
      '1.14.4': { player: { pos: [0.5, 64.0940795076209, 1.0257639718679492], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.54407949569998, 1.0257639718679492], vel: [0, -0.012862008823809503, 0.16380398857006467], yaw: 0 }, standing: null },
      '1.17.1': { player: { pos: [0.5, 64.0940795076209, 1.0257639718679494], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.54407949569998, 1.0257639718679494], vel: [0, -0.012862008823809503, 0.16380398857006467], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 64.13157947185812, 1.0257639718679494], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.54407949569998, 1.0257639718679494], vel: [0, -0.012862008823809503, 0.16380398857006467], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 64.13157949470686, 1.0257639718679494], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.54407949470685, 1.0257639718679494], vel: [0, -0.012862008983629884, 0.16380398857006467], yaw: 0 }, standing: null }
    }
  },
  minecartSeat: {
    title: 'sitting in a minecart',
    run: data => ride(data, { type: data.entitiesByName.minecart ? 'minecart' : 'MinecartRideable', pos: new Vec3(0.5, 64, 0.5) }, { pos: [0.5, 64.5, 0.5] }, 1),
    boundaries: ['1.9.4', '1.11.2', '1.20.2', '1.20.6'],
    values: {
      '1.8.8': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 64.5, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.11.2': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 63.58749997615814, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 63.5875, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null }
    }
  },
  horseWalk: {
    title: 'riding a horse forward',
    run: data => ride(data, { type: data.entitiesByName.horse ? 'horse' : 'EntityHorse', pos: new Vec3(0.5, 64, 0.5), movementSpeed: Math.fround(0.225), jumpStrength: Math.fround(0.7), steered: true, riderInput: { xxa: 0, zza: 1 } }, { pos: [0.5, 65.85, 0.5], keys: { forward: true } }, 4),
    boundaries: ['1.9.4', '1.11.2', '1.13.2', '1.14.4', '1.17.1', '1.20.2', '1.20.6', '1.21.5'],
    values: {
      '1.8.8': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0.017836000725567347], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 65.38584062504455, 0.6791395184147822], vel: [0, -0.30431682745754424, 0.0622774489706229], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.11.2': { player: { pos: [0.5, 64.8500000178814, 1.6214301870161552], vel: [0, -0.0784000015258789, 0.017836000725567347], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 1.6214301870161552], vel: [0, -0.0784000015258789, 0.22192535445527053], yaw: 0 }, standing: null },
      '1.13.2': { player: { pos: [0.5, 64.8500000178814, 1.6214302585816105], vel: [0, -0.0784000015258789, 0.017836000725567347], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 1.6214302585816105], vel: [0, -0.0784000015258789, 0.22192536902212456], yaw: 0 }, standing: null },
      '1.14.4': { player: { pos: [0.5, 64.8500000178814, 1.6214304185828956], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 1.6214304185828956], vel: [0, -0.0784000015258789, 0.22192540341187691], yaw: 0 }, standing: null },
      '1.17.1': { player: { pos: [0.5, 64.8500000178814, 1.6214304185828958], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 1.6214304185828958], vel: [0, -0.0784000015258789, 0.22192540341187691], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 64.84375, 1.6214304185828958], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 1.6214304185828958], vel: [0, -0.0784000015258789, 0.22192540341187691], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 64.84375002384186, 1.6214304185828958], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 1.6214304185828958], vel: [0, -0.0784000015258789, 0.22192540341187691], yaw: 0 }, standing: null },
      '1.21.5': { player: { pos: [0.5, 64.84375002384186, 1.6351470575750857], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 1.6351470575750857], vel: [0, -0.0784000015258789, 0.22543689670206352], yaw: 0 }, standing: null }
    }
  },
  horseRearing: {
    title: 'a horse rearing on its own under a rider',
    run: data => ride(data, { type: data.entitiesByName.horse ? 'horse' : 'EntityHorse', pos: new Vec3(0.5, 64, 0.5), vel: new Vec3(0, -0.0784000015258789, 0), movementSpeed: Math.fround(0.225), jumpStrength: Math.fround(0.7), steered: true, riderInput: { xxa: 0, zza: 1 }, rearingRequested: true }, { pos: [0.5, 64.85, 0.5], keys: { forward: true } }, 3),
    boundaries: ['1.9.4', '1.11.2', '1.14.4', '1.20.2', '1.20.6'],
    values: {
      '1.8.8': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0.017836000725567347], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 64.61636799395751, 0.610702763276543], vel: [0, -0.230527368912964, 0.048836754905780974], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], yaw: 0 }, standing: null },
      '1.11.2': { player: { pos: [0.5, 64.9580000281334, -0.0040000081062316895], vel: [0, -0.0784000015258789, 0.017836000725567347], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], yaw: 0 }, standing: true },
      '1.14.4': { player: { pos: [0.5, 64.9580000281334, -0.0040000081062316895], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], yaw: 0 }, standing: true },
      '1.20.2': { player: { pos: [0.5, 64.95175004005432, -0.0040000081062316895], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], yaw: 0 }, standing: true },
      '1.20.6': { player: { pos: [0.5, 64.9517500281334, -0.0040000200271606], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, -0.0784000015258789, 0], yaw: 0 }, standing: true }
    }
  },
  horseChargedJump: {
    title: 'releasing a charged horse jump',
    run: data => ride(data, { type: data.entitiesByName.horse ? 'horse' : 'EntityHorse', pos: new Vec3(0.5, 64, 0.5), movementSpeed: Math.fround(0.225), jumpStrength: Math.fround(0.7), steered: true, riderInput: { xxa: 0, zza: 0 } }, { pos: [0.5, 64.85, 0.5] }, 14, {}, {}, (tick, state) => { state.control.jump = tick < 10 }),
    boundaries: ['1.9.4', '1.11.2', '1.19.4', '1.20.2', '1.20.6', '1.21.5'],
    values: {
      '1.8.8': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 65.02442408821369, 0.5], vel: [0, -0.22768848754498797, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.11.2': { player: { pos: [0.5, 66.74848428532206, -0.0040000081062316895], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 65.79048425718867, 0.5], vel: [0, 0.40673555150620155, 0], yaw: 0 }, standing: true },
      '1.19.4': { player: { pos: [0.5, 66.64048427507007, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 65.79048425718867, 0.5], vel: [0, 0.40673555150620155, 0], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 66.63423425718867, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 65.79048425718867, 0.5], vel: [0, 0.40673555150620155, 0], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 66.63423428103053, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 65.79048425718867, 0.5], vel: [0, 0.40673555150620155, 0], yaw: 0 }, standing: null },
      '1.21.5': { player: { pos: [0.5, 66.7763980265589, -0.0040000200271606], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 65.82464799842549, 0.5], vel: [0, 0.42830705833532334, 0], yaw: 0 }, standing: true }
    }
  },
  unsteeredPig: {
    title: 'a pig carrying a passenger without a carrot on a stick',
    run: data => ride(data, { type: data.entitiesByName.pig ? 'pig' : 'Pig', pos: new Vec3(0.5, 64, 0.5), vel: new Vec3(0.2, 0, 0), movementSpeed: 0.25, jumpStrength: 0.42, steered: false }, { pos: [0.5, 64.9, 0.5] }, 3),
    boundaries: ['1.9.4', '1.11.2', '1.20.2', '1.20.6'],
    values: {
      '1.8.8': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0.2, 0, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 64.66636799395752, 0.5], vel: [0, -0.230527368912964, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0.2, 0, 0], yaw: 0 }, standing: null },
      '1.11.2': { player: { pos: [0.5, 64.32499998211861, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0.2, 0, 0], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 64.26874995231628, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0.2, 0, 0], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 64.26874997615815, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0.2, 0, 0], yaw: 0 }, standing: null }
    }
  },
  passengerPushOut: {
    title: 'a minecart passenger whose box is inside a block',
    run: data => {
      const state = player(data, { pos: [0.5, 100.5875, 0.5], onGround: true })
      state.vehicle = { type: data.entitiesByName.minecart ? 'minecart' : 'MinecartRideable', pos: new Vec3(0.5, 101, 0.5) }
      run(data, world(data, { '-1,100,0': 'stone', '0,100,0': 'stone', '1,100,0': 'stone' }, { floorY: 0 }), state, 1)
      return snapshot(state)
    },
    boundaries: ['1.9.4', '1.11.2', '1.14.4', '1.20.2', '1.20.6', '1.21.4', '26.3'],
    values: {
      '1.8.8': { pos: [0.5, 100.65, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false },
      '1.9.4': { pos: [0.5, 100.5875, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false },
      '1.11.2': { pos: [0.5, 100.65, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false },
      '1.14.4': { pos: [0.5, 100.65, 0.5], vel: [0, -0.0784000015258789, 0.05460000634193421], onGround: false },
      '1.20.2': { pos: [0.5, 100.58749997615814, 0.5], vel: [0, -0.0784000015258789, 0.05460000634193421], onGround: false },
      '1.20.6': { pos: [0.5, 100.5875, 0.5], vel: [0, -0.0784000015258789, 0.05460000634193421], onGround: false },
      '1.21.4': { pos: [0.5, 100.5875, 0.5], vel: [0, -0.0784000015258789, 0.09100000262260438], onGround: false },
      26.3: { pos: [0.5, 100.5875, 0.5], vel: [0, -0.0784000015258789, 0], onGround: false }
    }
  },
  boatSprint: {
    title: 'pressing sprint in a boat',
    run: data => ride(data, { type: boatType(data), pos: new Vec3(0.5, 64.6, 0.5), input: { left: false, right: false, up: true, down: false } }, { pos: [0.5, 64.8, 0.5], keys: { forward: true, sprint: true }, food: 20 }, 3, {}, water()),
    boundaries: ['1.9.4', '1.14.4', '1.17.1', '1.18.2', '1.19.4', '1.20.2', '1.20.6'],
    values: {
      '1.8.8': { player: { pos: [0.9, 63.949999999999996, 0.5], vel: [0, -0.02, 0.015680000419616702], sprinting: true, crouching: false }, vehicle: { pos: [0.5, 64.6, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 64.12040610194255, 0.7243999913603067], vel: [0, -0.0784000015258789, 0.023186799248230416], sprinting: true, crouching: false }, vehicle: { pos: [0.5, 64.57040609002162, 0.7243999913603067], vel: [0, -0.012794972426264959, 0.10839999490678319], yaw: 0 }, standing: null },
      '1.14.4': { player: { pos: [0.5, 64.12040610194255, 0.7243999913603067], vel: [0, -0.0784000015258789, 0.023186799936810092], sprinting: true, crouching: false }, vehicle: { pos: [0.5, 64.57040609002162, 0.7243999913603067], vel: [0, -0.012794972426264959, 0.10839999490678319], yaw: 0 }, standing: null },
      '1.17.1': { player: { pos: [0.5, 64.12040610194255, 0.7243999913603069], vel: [0, -0.0784000015258789, 0.023186799936810092], sprinting: true, crouching: false }, vehicle: { pos: [0.5, 64.57040609002162, 0.7243999913603069], vel: [0, -0.012794972426264959, 0.10839999490678319], yaw: 0 }, standing: null },
      '1.18.2': { player: { pos: [0.5, 64.12040610194255, 0.7243999913603069], vel: [0, -0.0784000015258789, 0.023186801597917115], sprinting: true, crouching: false }, vehicle: { pos: [0.5, 64.57040609002162, 0.7243999913603069], vel: [0, -0.012794972426264959, 0.10839999490678319], yaw: 0 }, standing: null },
      '1.19.4': { player: { pos: [0.5, 64.12040610194255, 0.7243999913603069], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.57040609002162, 0.7243999913603069], vel: [0, -0.012794972426264959, 0.10839999490678319], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 64.15790606617976, 0.7243999913603069], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.57040609002162, 0.7243999913603069], vel: [0, -0.012794972426264959, 0.10839999490678319], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 64.15790608941022, 0.7243999913603069], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.57040608941021, 0.7243999913603069], vel: [0, -0.012794972673732833, 0.10839999490678319], yaw: 0 }, standing: null }
    }
  },
  sneakInMinecart: {
    title: 'holding sneak in a minecart with the shift key down',
    run: data => ride(data, { type: data.entitiesByName.minecart ? 'minecart' : 'MinecartRideable', pos: new Vec3(0.5, 64, 0.5) }, { pos: [0.5, 64.5, 0.5], keys: { sneak: true }, isCrouching: true }, 2),
    boundaries: ['1.9.4', '1.11.2', '1.16.5', '1.17.1', '1.20.2', '1.20.6'],
    values: {
      '1.8.8': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.9.4': { player: { pos: [0.5, 64.42159999847412, 0.5], vel: [0, -0.1552320045166016, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.11.2': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.16.5': { player: { pos: [0.5, 64.42159999847412, 0.5], vel: [0, -0.1552320045166016, 0], sprinting: false, crouching: true }, vehicle: null, standing: null },
      '1.17.1': { player: { pos: [0.5, 63.65, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 63.58749997615814, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 63.5875, 0.5], vel: [0, -0.0784000015258789, 0], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64, 0.5], vel: [0, 0, 0], yaw: 0 }, standing: null }
    }
  },
  cowPush: {
    title: 'walking into a cow',
    run: data => {
      const state = player(data, { keys: { forward: true } })
      state.entities = [{ id: 7, type: data.entitiesByName.cow ? 'cow' : 'Cow', pos: new Vec3(0.5, 64, 1.2), vel: new Vec3(0, 0, 0) }]
      run(data, world(data), state, 4)
      return { player: snapshot(state), cow: [state.entities[0].vel.x, state.entities[0].vel.y, state.entities[0].vel.z] }
    },
    boundaries: ['1.9.4', '1.14.4', '1.17.1'],
    values: {
      '1.8.8': { player: { pos: [0.5, 64, 1.023468701129372], vel: [0, -0.0784000015258789, 0.10255652271466542], onGround: true }, cow: [0, 0, 0] },
      '1.9.4': { player: { pos: [0.5, 64, 0.8373533050037747], vel: [0, -0.0784000015258789, 0.031853664613755064], onGround: true }, cow: [0, 0, 0.1410781013064392] },
      '1.14.4': { player: { pos: [0.5, 64, 0.8373533737512586], vel: [0, -0.0784000015258789, 0.03185368127789539], onGround: true }, cow: [0, 0, 0.14107809615369127] },
      '1.17.1': { player: { pos: [0.5, 64, 0.8373533735927821], vel: [0, -0.0784000015258789, 0.03185368284161608], onGround: true }, cow: [0, 0, 0.14107809452053144] }
    }
  },
  solidBoat: {
    title: 'walking into an unoccupied boat',
    run: data => {
      const state = player(data, { keys: { forward: true } })
      state.entities = [{ id: 8, type: boatType(data), pos: new Vec3(0.5, 64, 1.6), vel: new Vec3(0, 0, 0) }]
      run(data, world(data), state, 5)
      return { player: snapshot(state), boat: [state.entities[0].vel.x, state.entities[0].vel.y, state.entities[0].vel.z] }
    },
    boundaries: ['1.9.4', '1.14.4', '1.17.1'],
    values: {
      '1.8.8': { player: { pos: [0.5, 64.5625, 1.224025213830457], vel: [0, -0.0784000015258789, 0.10950386865395455], onGround: true }, boat: [0, 0, 0] },
      '1.9.4': { player: { pos: [0.5, 64.5625, 1.0901179107139687], vel: [0, -0.0784000015258789, 0.10209776915028151], onGround: true }, boat: [0, 0, 0.05000000622134231] },
      '1.14.4': { player: { pos: [0.5, 64.5625, 1.0901180034214462], vel: [0, -0.0784000015258789, 0.1020977837619762], onGround: true }, boat: [0, 0, 0.05000000555361555] },
      '1.17.1': { player: { pos: [0.5, 64.5625, 1.090118016299464], vel: [0, -0.0784000015258789, 0.10209778447422924], onGround: true }, boat: [0, 0, 0.050000000745058074] }
    }
  },
  occupiedBoat: {
    title: 'walking into a boat someone sits in',
    run: data => {
      const state = player(data, { keys: { forward: true } })
      state.entities = [{ id: 8, type: boatType(data), pos: new Vec3(0.5, 64, 1.6), vel: new Vec3(0, 0, 0), receivesPush: false }]
      run(data, world(data), state, 5)
      return { player: snapshot(state), boat: [state.entities[0].vel.x, state.entities[0].vel.y, state.entities[0].vel.z] }
    },
    boundaries: ['1.9.4', '1.14.4', '1.17.1'],
    values: {
      '1.8.8': { player: { pos: [0.5, 64.5625, 1.224025213830457], vel: [0, -0.0784000015258789, 0.10950386865395455], onGround: true }, boat: [0, 0, 0] },
      '1.9.4': { player: { pos: [0.5, 64.5625, 1.0901179107139687], vel: [0, -0.0784000015258789, 0.10209776915028151], onGround: true }, boat: [0, 0, 0] },
      '1.14.4': { player: { pos: [0.5, 64.5625, 1.0901180034214462], vel: [0, -0.0784000015258789, 0.1020977837619762], onGround: true }, boat: [0, 0, 0] },
      '1.17.1': { player: { pos: [0.5, 64.5625, 1.090118016299464], vel: [0, -0.0784000015258789, 0.10209778447422924], onGround: true }, boat: [0, 0, 0] }
    }
  },
  pistonPush: {
    title: 'a piston head pushing the player',
    run: data => {
      const state = player(data)
      state.pistons = [{ x: -1 + 1, y: 64, z: 0, dir: [1, 0, 0], extending: true, progress: 0 }]
      run(data, world(data), state, 3)
      return snapshot(state)
    },
    boundaries: ['1.9.4'],
    values: {
      '1.8.8': { pos: [1.625, 64, 0.5], vel: [0, -0.0784000015258789, 0], onGround: true },
      '1.9.4': { pos: [1.310000011920929, 64, 0.5], vel: [0, -0.0784000015258789, 0], onGround: true }
    }
  },
  camelDash: {
    title: 'a camel dashing',
    from: '1.20.1',
    run: data => ride(data, { type: 'camel', pos: new Vec3(0.5, 64, 0.5), movementSpeed: Math.fround(0.09), jumpStrength: Math.fround(0.42), steered: true, riderInput: { xxa: 0, zza: 1 } }, { pos: [0.5, 66.4, 0.5], keys: { forward: true } }, 14, {}, {}, (tick, state) => { state.control.jump = tick > 1 && tick < 8 }),
    boundaries: ['1.20.2', '1.20.6', '1.21.5'],
    values: {
      '1.20.1': { player: { pos: [0.5, 66.05607201431229, 6.485116537580053], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.63107206199601, 5.985116537580053], vel: [0, -0.1149671190460248, 0.522328488525051], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 66.03107203815415, 6.485116537580053], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.63107206199601, 5.985116537580053], vel: [0, -0.1149671190460248, 0.522328488525051], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 66.03107206199601, 6.485116537580053], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.63107206199601, 5.985116537580053], vel: [0, -0.1149671190460248, 0.522328488525051], yaw: 0 }, standing: null },
      '1.21.5': { player: { pos: [0.5, 66.04828218958414, 6.652037382988821], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 64.64828218958414, 6.152037382988821], vel: [0, -0.1100509664158583, 0.5664193290347888], yaw: 0 }, standing: null }
    }
  },
  striderOnLava: {
    title: 'a strider walking on lava',
    from: '1.16.5',
    run: data => ride(data, { type: 'strider', pos: new Vec3(0.5, 63.5, 0.5), vel: new Vec3(0, -0.0784000015258789, 0), movementSpeed: Math.fround(0.175), stepHeight: 0.6, steered: true, riderInput: { xxa: 0, zza: 1 } }, { pos: [0.5, 65.1, 0.5], keys: { forward: true } }, 4, {}, { fill: p => p.y === 63 ? 'lava' : null, floorY: 63 }),
    boundaries: ['1.20.2', '1.20.6', '1.21.5'],
    values: {
      '1.16.5': { player: { pos: [0.5, 64.61883221477271, 1.1093645739052567], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 63.5, 1.1093645739052567], vel: [0, -0.0784000015258789, 0.10376964350593387], yaw: 0 }, standing: null },
      '1.20.2': { player: { pos: [0.5, 64.5588321685791, 1.1093645739052567], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 63.5, 1.1093645739052567], vel: [0, -0.0784000015258789, 0.10376964350593387], yaw: 0 }, standing: null },
      '1.20.6': { player: { pos: [0.5, 64.5588322147727, 1.1093645739052567], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 63.5, 1.1093645739052567], vel: [0, -0.0784000015258789, 0.10376964350593387], yaw: 0 }, standing: null },
      '1.21.5': { player: { pos: [0.5, 64.55793309360743, 1.115711592941271], vel: [0, -0.0784000015258789, 0.017836000462502232], sprinting: false, crouching: false }, vehicle: { pos: [0.5, 63.5, 1.115711592941271], vel: [0, -0.0784000015258789, 0.10546696631594392], yaw: 0 }, standing: null }
    }
  }
}

if (typeof describe === 'function') {
  describe('riding and entities', () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.boundaries) boundaryTest(scenario.title, scenario.run, scenario)
    }
  })
}

module.exports = SCENARIOS
