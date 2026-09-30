import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampRemoteVolume, resolveDevicePreference, createWithDeviceFallback, defaultDeviceId, mediaErrorMessage } from './AudioPreference.ts'

test('removed devices fall back to the browser default without changing available choices', () => {
  const devices = [{ deviceId: 'built-in', kind: 'audioinput' }, { deviceId: 'webcam', kind: 'videoinput' }]
  assert.equal(resolveDevicePreference('usb-mic', 'audioinput', devices), '')
  assert.equal(resolveDevicePreference('built-in', 'audioinput', devices), 'built-in')
  assert.equal(resolveDevicePreference('webcam', 'audioinput', devices), '')
})

test('remote volume is bounded and muted playback remains silent', () => {
  assert.equal(clampRemoteVolume(150), 100)
  assert.equal(clampRemoteVolume(-20), 0)
  assert.equal(clampRemoteVolume(42.8), 43)
  assert.equal(clampRemoteVolume(Number.NaN), 100)
})

test('capture uses the default immediately when a stored camera is no longer connected', async () => {
  const calls = []
  const track = { id: 'new-camera-track' }
  const capture = await createWithDeviceFallback('removed-webcam', 'videoinput', [{ deviceId: 'built-in', kind: 'videoinput' }], async id => { calls.push(id); return track })
  assert.deepEqual(calls, [''])
  assert.deepEqual(capture, { track, deviceId: '' })
})

test('unplug between enumeration and capture retries once with default, but permission denial does not retry', async () => {
  const calls = []
  const devices = [{ deviceId: 'usb', kind: 'audioinput' }]
  const capture = await createWithDeviceFallback('usb', 'audioinput', devices, async id => {
    calls.push(id)
    if (id) throw Object.assign(new Error('device vanished'), { code: 'DEVICE_NOT_FOUND' })
    return 'track'
  })
  assert.deepEqual(calls, ['usb', ''])
  assert.deepEqual(capture, { track: 'track', deviceId: '' })
  const deniedCalls = []
  await assert.rejects(createWithDeviceFallback('usb', 'audioinput', devices, async id => {
    deniedCalls.push(id)
    throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
  }), /denied/)
  assert.deepEqual(deniedCalls, ['usb'])
})

test('replacement cameras use an actual available id and permission errors have an actionable message', () => {
  assert.equal(defaultDeviceId('videoinput', [{ deviceId: 'built-in', kind: 'videoinput' }]), 'built-in')
  assert.equal(defaultDeviceId('audioinput', [{ deviceId: 'usb', kind: 'audioinput' }, { deviceId: 'default', kind: 'audioinput' }]), 'default')
  assert.match(mediaErrorMessage({ code: 'PERMISSION_DENIED' }, 'câmera'), /Permita.*câmera/)
})
