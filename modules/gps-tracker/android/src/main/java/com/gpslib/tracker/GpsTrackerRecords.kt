package com.gpslib.tracker

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * The typed options the app sends when a recording starts.
 *
 * `Record` is Expo's typed argument: the JavaScript object is converted field
 * by field, and a missing or mistyped field fails with a readable error
 * instead of a `Map` cast three frames deep.
 */
class CaptureOptionsRecord : Record {
    @Field
    var intervalMs: Int = 1000

    @Field
    var minDistanceM: Double = 0.0

    @Field
    var accuracyCeilingM: Double = 50.0

    @Field
    var useBarometer: Boolean = false
}

class RecordingOptionsRecord : Record {
    @Field
    var profile: String = "walking"

    @Field
    var capture: CaptureOptionsRecord = CaptureOptionsRecord()
}
