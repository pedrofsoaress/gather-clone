import signal from '../../signal'
import { createInputLocks } from './input-lock-core.mjs'

export const setOfficeInputLock = createInputLocks((blocked: boolean) => signal.emit('disableInput', blocked))
