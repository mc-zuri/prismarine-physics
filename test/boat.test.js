/* eslint-env mocha */

const { Physics } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const expect = require('expect')

// A boat on still water (sources at y = 99 and 100, their surface at 100 + 8/9), ticked as the client ticks the boat
// it controls (Boat.tick: status, floatBoat, controlBoat from the rider's keys, move). The values are the vanilla
// client's.
function pond (version) {
  const mcData = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const world = {
    getBlock: (pos) => {
      const name = pos.y < 99 ? 'dirt' : pos.y <= 100 ? 'water' : 'air'
      const block = new Block(mcData.blocksByName[name].id, 0, 0)
      block.position = pos.floored()
      return block
    }
  }
  return { physics: Physics(mcData, world), world }
}

function boatAt (pos, vel, yaw) {
  return { pos: new Vec3(...pos), vel: new Vec3(...vel), yaw, deltaRotation: 0, status: 'in_water', waterLevel: 0, landFriction: 0, lastYd: vel[1], controlledByPlayer: true, controls: {} }
}

function run (version, start, keys) {
  const { physics, world } = pond(version)
  const boat = boatAt(start.pos, start.vel, start.yaw)
  return keys.map(controls => {
    boat.controls = controls
    physics.simulateBoat(boat, world)
    return { pos: boat.pos.toArray(), vel: boat.vel.toArray(), yaw: boat.yaw, deltaRotation: boat.deltaRotation }
  })
}

describe('a boat on still water', () => {
  const forward = { forward: true }
  for (const [version, yaw] of [['1.12.2', 270], ['1.21.11', -90]]) {
    it(`${version}: floats and paddles forward`, () => {
      const ticks = run(version, { pos: [0.5, 100.523260515014, 2125.5], vel: [0, version === '1.12.2' ? -4.440000679617473e-9 : -4.440001475855548e-9, 0], yaw }, [{}, forward, forward, forward])
      expect(ticks.map(tick => tick.pos[0])).toEqual([0.5, 0.5399999991059303, 0.6159999964535237, version === '1.12.2' ? 0.7243999913603067 : 0.7243999913603069])
      expect(ticks.map(tick => tick.vel[0])).toEqual([0, 0.03999999910593033, 0.07599999734759333, 0.10839999490678319])
      expect(ticks[0].pos[1]).toBe(100.52326051029182)
      expect(ticks[0].vel[1]).toBe(version === '1.12.2' ? -4.722174984372884e-9 : -4.722175614077506e-9)
    })
  }

  // from 1.14 a move of 1.0E-7 or less squared is dropped: the boat floats without moving
  it('1.20.4: keeps still under a tiny motion', () => {
    const ticks = run('1.20.4', { pos: [0.5, 100.52334181621595, 2125.5], vel: [0, -0.000025473708472461068, 0], yaw: -90 }, [{}, {}, {}])
    expect(ticks.map(tick => tick.pos[1])).toEqual([100.52334181621595, 100.52334181621595, 100.52334181621595])
    expect(ticks.map(tick => tick.vel[1])).toEqual([-0.0000257775412316006, -0.00002600541580095525, -0.00002617632172797514])
  })

  it('1.21.11: turns left by its rotation rate', () => {
    const left = { left: true }
    const ticks = run('1.21.11', { pos: [0.5, 100.523260515014, 2125.5], vel: [0, -4.440001475855548e-9, 0], yaw: -90 }, [{}, left, left, left])
    expect(ticks.map(tick => tick.yaw)).toEqual([-90, -91, Math.fround(-92.9), Math.fround(-95.61)])
    expect(ticks.map(tick => tick.deltaRotation)).toEqual([0, -1, Math.fround(-1.9), Math.fround(-2.71)])
    expect(ticks[3].pos).toEqual([0.5280118767906147, 100.52326049837288, 2125.498795135176])
    expect(ticks[3].vel).toEqual([0.013519704301653834, -3.3311530409085854e-9, -0.0007865874518609471])
  })
})

// On land the boat slides by the friction of the blocks under it (getGroundFriction), halved for the next tick while a
// player paddles it
describe('a boat on stone', () => {
  it('1.21.11: paddles forward by the ground friction', () => {
    const mcData = require('minecraft-data')('1.21.11')
    const Block = require('prismarine-block')('1.21.11')
    const world = { getBlock: (pos) => { const block = new Block(mcData.blocksByName[pos.y < 101 ? 'stone' : 'air'].id, 0, 0); block.position = pos.floored(); return block } }
    const physics = Physics(mcData, world)
    const boat = { pos: new Vec3(30.5, 101, 2125.5), vel: new Vec3(0, 0, 0), yaw: -90, deltaRotation: 0, status: 'on_land', waterLevel: 0, landFriction: Math.fround(0.3), lastYd: 0, controlledByPlayer: true, controls: {} }
    const xs = []
    for (const controls of [{}, { forward: true }, { forward: true }, { forward: true }]) {
      boat.controls = controls
      physics.simulateBoat(boat, world)
      xs.push(boat.pos.x)
    }
    expect(xs).toEqual([30.5, 30.53999999910593, 30.60399999624491, 30.682399991345406])
    expect(boat.status).toBe('on_land')
  })
})
