package com.gpslib.tracker.service

import org.json.JSONObject

/**
 * One line of `fixes.jsonl`.
 *
 * The field names are the contract with the TypeScript reader
 * (`FixLogEntry` in `modules/gps-tracker/src/GpsTracker.types.ts`); renaming
 * one here breaks the reader, so they are spelled out once, here.
 *
 * `accepted` is metadata: the replay re-derives acceptance from the capture
 * options, so a future implementation may accept a different live set and
 * still produce the same activity.
 */
data class FixLogEntry(
    val t: Long,
    val lat: Double,
    val lon: Double,
    val ele: Double?,
    val geoid: Double?,
    val pressure: Double?,
    val hAcc: Float,
    val vAcc: Float?,
    val speed: Float?,
    val bearing: Float?,
    val source: String,
    val accepted: Boolean,
    val reason: String?
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("t", t)
        json.put("lat", lat)
        json.put("lon", lon)
        json.put("ele", ele ?: JSONObject.NULL)
        json.put("geoid", geoid ?: JSONObject.NULL)
        json.put("pressure", pressure ?: JSONObject.NULL)
        json.put("hAcc", hAcc.toDouble())
        json.put("vAcc", vAcc?.toDouble() ?: JSONObject.NULL)
        json.put("speed", speed?.toDouble() ?: JSONObject.NULL)
        json.put("bearing", bearing?.toDouble() ?: JSONObject.NULL)
        json.put("source", source)
        json.put("accepted", accepted)
        json.put("reason", reason ?: JSONObject.NULL)
        return json
    }
}
