/* eslint-env mocha */

const { Physics } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const AABB = require('prismarine-physics/lib/aabb')
const expect = require('expect')

// A crouching player whose box a few moves have left with its far sides rounded apart from its lower corner, as a
// vanilla 1.16.5 client had it: maxX = 0.6612812962489902 where minX + 0.6F is 0.6612812962489903. The server then
// sends the player's pose (crouching, unchanged). From 1.14 the client takes the pose (Entity.onSyncedDataUpdated); up
// to 1.16 it also rebuilds the box from its lower corner at the pose's size (refreshDimensions), which the vanilla
// client left at maxX = 0.6612812962489903. From 1.17 the box follows the position, and before 1.14 there is no pose.
function syncedPlayer (version, pose, carriedPose) {
  const mcData = require('minecraft-data')(version)
  const physics = Physics(mcData, { getBlock: () => null })
  const position = new Vec3(0.36128128432806134, 102, 1669.361281284328)
  const box = new AABB(0.06128127240713241, 102, 1669.061281272407, 0.6612812962489902, 103.5, 1669.661281296249)
  const entity = { position, pose: carriedPose, physicsBox: { box, position: position.clone() } }
  physics.syncPose(entity, pose)
  return entity
}

describe('the pose the server sets for the player', () => {
  for (const version of ['1.8.8', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', '1.17.1', '1.20.4', '1.21.11', '26.1']) {
    const poses = !['1.8.8', '1.12.2', '1.13.2'].includes(version)
    const reanchors = ['1.14.4', '1.15.2', '1.16.5'].includes(version)
    it(`${version}: ${poses ? 'is taken' : 'is ignored'}${reanchors ? ', the box rebuilt from its lower corner' : ''}`, () => {
      const entity = syncedPlayer(version, 'crouching', 'crouching')
      expect(entity.pose).toBe('crouching')
      const box = entity.physicsBox.box
      expect([box.minX, box.minY, box.minZ]).toEqual([0.06128127240713241, 102, 1669.061281272407])
      expect([box.maxX, box.maxY, box.maxZ]).toEqual([reanchors ? 0.6612812962489903 : 0.6612812962489902, 103.5, 1669.661281296249])

      const standing = syncedPlayer(version, 'standing', 'crouching')
      expect(standing.pose).toBe(poses ? 'standing' : 'crouching')
      expect(standing.physicsBox.box.maxY).toBe(reanchors ? 102 + Math.fround(1.8) : 103.5)
    })
  }

  // With no box carried from the tick before (just placed, say), the box is the one the position makes at the current
  // pose, rebuilt from its lower corner: up to 1.16 its far sides are minX + 0.6F, not the position plus 0.3F
  for (const version of ['1.14.4', '1.16.5']) {
    it(`${version}: builds the box from the position when none is carried`, () => {
      const physics = Physics(require('minecraft-data')(version), { getBlock: () => null })
      const position = new Vec3(0.36128128432806134, 102, 1669.361281284328)
      const entity = { position, pose: 'standing' }
      physics.syncPose(entity, 'crouching')
      const minX = position.x - Math.fround(0.3)
      expect(entity.physicsBox.position).toEqual(position)
      expect([entity.physicsBox.box.minX, entity.physicsBox.box.maxX, entity.physicsBox.box.maxY]).toEqual([minX, minX + Math.fround(0.6), 102 + Math.fround(1.5)])
    })
  }
})
