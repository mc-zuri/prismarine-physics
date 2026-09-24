import assert from 'node:assert'
import {
  applyPoseActions, contractPoseBox, HORIZONTAL_POSE_HEIGHT, poseChanged, poseHeightOf, poseIntent, raisePoseActions,
  SNEAK_HEIGHT, stepSwimAmount, swimAction, updatePoseClearance, type PoseFacts, type SwimFacts
} from '../../../../lib/bedrock/movement/pose.ts'
import type { BoxLike } from '../../../../lib/bedrock/math/box.ts'
import type { BedrockState } from '../../../../lib/bedrock/types.ts'

const f = Math.fround
const BOX = { minX: 0.2, minY: 0, minZ: 0.2, maxX: 0.8, maxY: 1.8, maxZ: 0.8 }
const open = () => ({ stand: true, sneak: true, crawl: true })
const ceiling = (y: number) => (box: BoxLike): BoxLike[] => [{ minX: 0, minY: y, minZ: 0, maxX: 1, maxY: y + 1, maxZ: 1 }].filter(c => c.minY < box.maxY)

describe('bedrock movement/pose', () => {
  it('sizes the box for the pose', () => {
    assert.strictEqual(poseHeightOf(false, false), 1.8)
    assert.strictEqual(poseHeightOf(true, false), SNEAK_HEIGHT)
    assert.strictEqual(poseHeightOf(true, true), HORIZONTAL_POSE_HEIGHT)
    assert.strictEqual(poseHeightOf(false, false, 2), 2)
  })

  it('contracts a box on every face, collapsing a face pair that crosses', () => {
    assert.deepStrictEqual(contractPoseBox(BOX, 0.1), { minX: f(0.3), minY: f(0.1), minZ: f(0.3), maxX: f(0.7), maxY: f(1.7), maxZ: f(0.7) })
    const thin = contractPoseBox({ minX: 0, minY: 0, minZ: 0, maxX: 0.01, maxY: 0.01, maxZ: 0.01 }, 0.1)
    assert.strictEqual(thin.minX, thin.maxX)
    assert.strictEqual(thin.minY, thin.maxY)
    assert.strictEqual(thin.minZ, thin.maxZ)
  })

  it('clears the room for each pose the ceiling blocks, trying the lower ones only when blocked', () => {
    assert.deepStrictEqual(updatePoseClearance(BOX, open(), SNEAK_HEIGHT, ceiling(3)), open())
    assert.deepStrictEqual(updatePoseClearance(BOX, open(), SNEAK_HEIGHT, ceiling(1.6)), { stand: false, sneak: true, crawl: true })
    assert.deepStrictEqual(updatePoseClearance(BOX, open(), SNEAK_HEIGHT, ceiling(1)), { stand: false, sneak: false, crawl: true })
    assert.deepStrictEqual(updatePoseClearance(BOX, open(), SNEAK_HEIGHT, ceiling(0.5)), { stand: false, sneak: false, crawl: false })
    const room = { stand: false, sneak: false, crawl: false }
    assert.strictEqual(updatePoseClearance(BOX, room, SNEAK_HEIGHT, ceiling(3)), room, 'only clears')
    assert.deepStrictEqual(room, { stand: false, sneak: false, crawl: false })
  })

  it('needs a strict overlap on every axis to block', () => {
    const beside = (): BoxLike[] => [{ minX: 0.8, minY: 0, minZ: 0, maxX: 1.8, maxY: 3, maxZ: 1 }]
    assert.deepStrictEqual(updatePoseClearance(BOX, open(), SNEAK_HEIGHT, beside), open())
  })

  it('steps the swim pose amount a tenth at a time within [0, 1]', () => {
    assert.strictEqual(stepSwimAmount(0, true), f(0.1))
    assert.strictEqual(stepSwimAmount(0.95, true), 1)
    assert.strictEqual(stepSwimAmount(0.5, false), f(0.5 - f(0.1)))
    assert.strictEqual(stepSwimAmount(0.05, false), 0)
    assert.strictEqual(stepSwimAmount(NaN, true), 1)
    assert.strictEqual(stepSwimAmount(NaN, false), 0)
  })

  describe('swimming', () => {
    const request = { isSprinting: true, stopSprinting: false, sprintCanceled: false, start: false, stop: false }
    const base = (over: Partial<SwimFacts> = {}): SwimFacts => ({
      swimming: false,
      eyeInWater: true,
      flying: false,
      breathingInAir: false,
      aboveCentreIsAir: false,
      inWater: true,
      view: { x: 0, y: 0.5, z: 0.86 },
      move: { x: 0, z: 1 },
      sprint: request,
      hungerLimited: false,
      room: open(),
      ...over
    })

    it('starts for a sprinter whose eye is under water, submerged or looking down', () => {
      assert.strictEqual(swimAction(base()), 'startSwimming', 'submerged')
      assert.strictEqual(swimAction(base({ aboveCentreIsAir: true, view: { x: 0, y: 0.1, z: 1 } })), 'startSwimming', 'looking down')
      assert.strictEqual(swimAction(base({ aboveCentreIsAir: true })), null, 'at the surface looking up')
      assert.strictEqual(swimAction(base({ breathingInAir: true })), null)
    })

    it('does not start without a sprint, out of water or flying', () => {
      assert.strictEqual(swimAction(base({ sprint: { ...request, isSprinting: false } })), null)
      assert.strictEqual(swimAction(base({ sprint: { ...request, stopSprinting: true } })), null)
      assert.strictEqual(swimAction(base({ eyeInWater: false })), null)
      assert.strictEqual(swimAction(base({ flying: true })), null)
    })

    it('keeps a swimmer moving forward under water', () => {
      assert.strictEqual(swimAction(base({ swimming: true })), null)
    })

    it('stops a swimmer that slows, starves, cancels, leaves the water or surfaces looking up', () => {
      assert.strictEqual(swimAction(base({ swimming: true, move: { x: 0, z: 0.5 } })), 'stopSwimming')
      assert.strictEqual(swimAction(base({ swimming: true, hungerLimited: true })), 'stopSwimming')
      assert.strictEqual(swimAction(base({ swimming: true, sprint: { ...request, sprintCanceled: true } })), 'stopSwimming')
      assert.strictEqual(swimAction(base({ swimming: true, inWater: false })), 'stopSwimming')
      assert.strictEqual(swimAction(base({ swimming: true, breathingInAir: true, view: { x: 0, y: 0.8, z: 0.6 } })), 'stopSwimming')
      assert.strictEqual(swimAction(base({ swimming: true, breathingInAir: true, view: { x: 0, y: 0.3, z: 0.95 } })), null, 'surfaced, looking level')
      assert.strictEqual(swimAction(base({ swimming: true, breathingInAir: true, view: { x: 0, y: -0.8, z: 0.6 } })), null, 'surfaced, looking down')
    })

    it('stops only with room to stand', () => {
      assert.strictEqual(swimAction(base({ swimming: true, inWater: false, room: { stand: false, sneak: true, crawl: true } })), null)
    })
  })

  describe('sneaking and crawling', () => {
    const facts = (over: Partial<PoseFacts> = {}): PoseFacts => ({
      sneakDown: false,
      unblockedToStand: true,
      unblockedToSneak: true,
      unblockedToCrawl: true,
      move: { x: 0, z: 0 },
      ...over
    })

    it('sneaks on the key and stands up when it is released', () => {
      assert.deepStrictEqual(poseIntent({}, facts({ sneakDown: true })), { sneak: true })
      assert.deepStrictEqual(poseIntent({ sneaking: true }, facts({ sneakDown: true })), {})
      assert.deepStrictEqual(poseIntent({ sneaking: true }, facts()), { sneak: false })
      assert.deepStrictEqual(poseIntent({}, facts()), {})
    })

    it('treats the sneak key as released while flying', () => {
      assert.deepStrictEqual(poseIntent({ sneaking: true }, facts({ sneakDown: true, flyIntent: true })), { sneak: false })
    })

    it('ends a crawl with room to stand, or when it must stand', () => {
      assert.deepStrictEqual(poseIntent({ crawling: true }, facts()), { crawl: false })
      const cramped = facts({ unblockedToStand: false, unblockedToSneak: false, spectator: true })
      assert.deepStrictEqual(poseIntent({ crawling: true, sneaking: true }, cramped), { crawl: false, sneak: false })
      assert.deepStrictEqual(poseIntent({ crawling: true }, facts({ unblockedToStand: false, spinAttack: true })), { crawl: false })
      assert.deepStrictEqual(poseIntent({ crawling: true }, facts({ unblockedToStand: false, passenger: true })), { crawl: false })
      assert.deepStrictEqual(poseIntent({ crawling: true }, facts({ unblockedToStand: false, glideIntent: true })), { crawl: false })
    })

    it('under a low ceiling: a crawl becomes a sneak, and a swimmer barely moving sneaks', () => {
      const low = { unblockedToStand: false }
      assert.deepStrictEqual(poseIntent({ crawling: true }, facts(low)), { sneak: true, crawl: false })
      assert.deepStrictEqual(poseIntent({}, facts(low)), { sneak: true })
      assert.deepStrictEqual(poseIntent({ swimming: true }, facts({ ...low, move: { x: 0.3, z: 0.3 } })), { swim: false, sneak: true })
      assert.deepStrictEqual(poseIntent({ swimming: true }, facts({ ...low, move: { x: 0, z: 1 } })), {})
    })

    it('with room only to crawl: crawls on land, swims in water', () => {
      const tight = { unblockedToStand: false, unblockedToSneak: false }
      assert.deepStrictEqual(poseIntent({}, facts(tight)), { crawl: true })
      assert.deepStrictEqual(poseIntent({}, facts({ ...tight, wasInWater: true })), { crawl: false, swim: true })
      assert.deepStrictEqual(poseIntent({ swimming: true }, facts(tight)), { crawl: true, swim: false })
      assert.deepStrictEqual(poseIntent({ swimming: true }, facts({ ...tight, wasInWater: true })), {}, 'a swimmer stays swimming')
      assert.deepStrictEqual(poseIntent({ swimming: true }, facts({ ...tight, wasInWater: true, sneakDown: true })), { sneak: true })
    })

    it('with no room at all, or crawling unsupported, only the sneak key decides', () => {
      const none = { unblockedToStand: false, unblockedToSneak: false, unblockedToCrawl: false }
      assert.deepStrictEqual(poseIntent({}, facts(none)), {})
      assert.deepStrictEqual(poseIntent({}, facts({ ...none, sneakDown: true })), { sneak: true })
      assert.deepStrictEqual(poseIntent({}, facts({ unblockedToStand: false, unblockedToSneak: false, crawlSupported: false })), {})
    })

    it('raises one action per pose that changes, and applies them start before stop', () => {
      const st: BedrockState = { sneaking: true }
      const actions = new Set<string>()
      raisePoseActions(st, { sneak: true, crawl: true, swim: true }, actions)
      assert.deepStrictEqual([...actions], ['startSwimming', 'startCrawling'])
      raisePoseActions({ swimming: true, crawling: true }, { swim: false, crawl: false, sneak: true }, actions)
      assert.deepStrictEqual([...actions], ['startSwimming', 'startCrawling', 'stopSwimming', 'stopCrawling', 'startSneaking'])
      raisePoseActions({ sneaking: true }, { sneak: false }, actions)
      applyPoseActions(st, actions)
      assert.deepStrictEqual([st.swimming, st.crawling, st.sneaking], [false, false, false])
      applyPoseActions(st, new Set(['startSwimming', 'startCrawling', 'startSneaking']))
      assert.deepStrictEqual([st.swimming, st.crawling, st.sneaking], [true, true, true])
    })

    it('knows a pose action from other actions', () => {
      assert.ok(poseChanged(new Set(['startGliding'])))
      assert.ok(!poseChanged(new Set(['startSprinting', 'handledTeleport'])))
    })
  })
})
