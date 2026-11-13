import { describe, expect, it } from 'vitest'
import { pendingUpdates } from '../src/broadcast'
import type { VersionEntry } from '../src/types'

const release = (id: string): VersionEntry => ({ id, type: 'release', releaseTime: '2026-01-01T00:00:00+00:00' })
const snapshot = (id: string): VersionEntry => ({ id, type: 'snapshot', releaseTime: '2026-01-01T00:00:00+00:00' })
const all = { broadcastRelease: true, broadcastSnapshot: true }

describe('version broadcast', () => {
  it('announces nothing when versions are unchanged', () => {
    expect(pendingUpdates({ release: '26.3', snapshot: '26.4-snapshot-8' }, { release: release('26.3'), snapshot: snapshot('26.4-snapshot-8') }, all)).toEqual([])
  })

  it('announces a new snapshot', () => {
    expect(pendingUpdates({ release: '26.3', snapshot: '26.4-snapshot-7' }, { release: release('26.3'), snapshot: snapshot('26.4-snapshot-8') }, all).map((v) => v.id)).toEqual(['26.4-snapshot-8'])
  })

  it('announces a new release once even though it is also the latest snapshot', () => {
    const updates = pendingUpdates({ release: '26.3', snapshot: '26.4-rc-1' }, { release: release('26.4'), snapshot: snapshot('26.4') }, all)
    expect(updates.map((v) => `${v.type}:${v.id}`)).toEqual(['release:26.4'])
  })

  it('respects the per-type switches', () => {
    const latest = { release: release('26.4'), snapshot: snapshot('26.5-snapshot-1') }
    const seen = { release: '26.3', snapshot: '26.4' }
    expect(pendingUpdates(seen, latest, { broadcastRelease: false, broadcastSnapshot: true }).map((v) => v.id)).toEqual(['26.5-snapshot-1'])
    expect(pendingUpdates(seen, latest, { broadcastRelease: true, broadcastSnapshot: false }).map((v) => v.id)).toEqual(['26.4'])
  })
})
