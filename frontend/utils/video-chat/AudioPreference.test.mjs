import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampRemoteVolume, resolveDevicePreference } from './AudioPreference.ts'

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
