package com.gpslib.tracker.service

import expo.modules.kotlin.exception.CodedException

/**
 * The three error codes the app branches on.
 *
 * Expo modules have no `userInfo` channel, so the session id of an
 * `E_SESSION_ACTIVE` travels in the message; the app reads the running
 * session from `getRecordingState()` anyway.
 */
class SessionActiveException(sessionId: String?) : CodedException(
    "E_SESSION_ACTIVE",
    "A recording is already running" + (sessionId?.let { " (session $it)" } ?: "") + ".",
    null
)

class NoSessionException : CodedException(
    "E_NO_SESSION",
    "There is no recording session.",
    null
)

class LocationUnavailableException : CodedException(
    "E_LOCATION_UNAVAILABLE",
    "Location services are unavailable or the location permission is missing.",
    null
)
