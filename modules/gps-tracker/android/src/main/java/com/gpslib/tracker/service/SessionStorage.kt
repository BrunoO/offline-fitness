package com.gpslib.tracker.service

import android.content.Context
import com.gpslib.tracker.capture.CaptureOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The on-disk half of the session: `meta.json` plus `fixes.jsonl`, one
 * directory per session under the app's private files.
 *
 * This replaces the legacy `SessionStorage`, which kept the live session in
 * `SharedPreferences` and the track in a GPX file. Two things changed and one
 * did not:
 *
 * - the session directory is the contract the TypeScript replay reads (D3);
 * - `meta.json` is written to a temp file and renamed, so a kill mid-write
 *   cannot corrupt a session that recovery still has to offer;
 * - the live session still has to survive a process restart, so the *active*
 *   session id is kept in `SharedPreferences` - but only the id, never the
 *   numbers, which live in `meta.json`.
 */
class SessionStorage(private val context: Context) {

    private val root: File
        get() = File(context.filesDir, RECORDING_DIR_NAME)

    fun sessionDir(sessionId: String): File = File(root, sessionId)

    fun fixesFile(sessionId: String): File = File(sessionDir(sessionId), FIXES_FILE_NAME)

    fun logUri(sessionId: String): String = "file://${fixesFile(sessionId).absolutePath}"

    fun createSession(sessionId: String): File {
        val dir = sessionDir(sessionId)
        dir.mkdirs()
        return dir
    }

    fun writeMeta(meta: RecordingMeta) {
        val dir = sessionDir(meta.sessionId)
        dir.mkdirs()
        val target = File(dir, META_FILE_NAME)
        val temp = File(dir, "$META_FILE_NAME.tmp")
        temp.writeText(metaToJson(meta).toString())
        if (!temp.renameTo(target)) {
            target.writeText(temp.readText())
            temp.delete()
        }
    }

    fun readMeta(sessionId: String): RecordingMeta? {
        val file = File(sessionDir(sessionId), META_FILE_NAME)
        if (!file.exists()) {
            return null
        }
        return runCatching { jsonToMeta(JSONObject(file.readText())) }.getOrNull()
    }

    /** Every session on disk, newest first. */
    fun listMetas(): List<RecordingMeta> {
        val dirs = root.listFiles() ?: return emptyList()
        return dirs
            .filter { it.isDirectory }
            .mapNotNull { dir -> runCatching { jsonToMeta(JSONObject(File(dir, META_FILE_NAME).readText())) }.getOrNull() }
            .sortedByDescending { it.startedAtUtcMs }
    }

    fun markSaved(sessionId: String, activityId: String) {
        val meta = readMeta(sessionId) ?: return
        meta.savedActivityId = activityId
        writeMeta(meta)
        if (activeSessionId() == sessionId) {
            clearActiveSession()
        }
    }

    fun discard(sessionId: String) {
        sessionDir(sessionId).deleteRecursively()
        if (activeSessionId() == sessionId) {
            clearActiveSession()
        }
    }

    fun activeSessionId(): String? = prefs.getString(KEY_ACTIVE_SESSION, null)

    fun setActiveSession(sessionId: String) {
        prefs.edit().putString(KEY_ACTIVE_SESSION, sessionId).apply()
    }

    fun clearActiveSession() {
        prefs.edit().remove(KEY_ACTIVE_SESSION).apply()
    }

    private val prefs
        get() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun metaToJson(meta: RecordingMeta): JSONObject {
        val capture = JSONObject()
            .put("intervalMs", meta.capture.intervalMs)
            .put("minDistanceM", meta.capture.minDistanceMeters.toDouble())
            .put("accuracyCeilingM", meta.capture.accuracyCeilingMeters.toDouble())
            .put("useBarometer", meta.capture.useBarometer)

        val pauses = JSONArray()
        meta.pauses.forEach { pause ->
            pauses.put(
                JSONObject()
                    .put("startUtcMs", pause.startUtcMs)
                    .put("endUtcMs", pause.endUtcMs ?: JSONObject.NULL)
            )
        }

        return JSONObject()
            .put("sessionId", meta.sessionId)
            .put("profile", meta.profile)
            .put("startedAtUtcMs", meta.startedAtUtcMs)
            .put("endedAtUtcMs", meta.endedAtUtcMs ?: JSONObject.NULL)
            .put("deviceUtcOffsetSeconds", meta.deviceUtcOffsetSeconds)
            .put("capture", capture)
            .put("pauses", pauses)
            .put("fixCount", meta.fixCount)
            .put("logUri", meta.logUri)
            .put("libraryVersion", meta.libraryVersion)
            .put("savedActivityId", meta.savedActivityId ?: JSONObject.NULL)
    }

    private fun jsonToMeta(json: JSONObject): RecordingMeta {
        val captureJson = json.optJSONObject("capture") ?: JSONObject()
        val capture = CaptureOptions(
            intervalMs = captureJson.optLong("intervalMs", 1000L),
            minDistanceMeters = captureJson.optDouble("minDistanceM", 0.0).toFloat(),
            accuracyCeilingMeters = captureJson.optDouble("accuracyCeilingM", 50.0).toFloat(),
            useBarometer = captureJson.optBoolean("useBarometer", false)
        )

        val pausesJson = json.optJSONArray("pauses") ?: JSONArray()
        val pauses = mutableListOf<PauseInterval>()
        for (index in 0 until pausesJson.length()) {
            val pauseJson = pausesJson.optJSONObject(index) ?: continue
            pauses.add(
                PauseInterval(
                    startUtcMs = pauseJson.optLong("startUtcMs", 0L),
                    endUtcMs = if (pauseJson.isNull("endUtcMs")) null else pauseJson.optLong("endUtcMs")
                )
            )
        }

        return RecordingMeta(
            sessionId = json.optString("sessionId"),
            profile = json.optString("profile", "walking"),
            startedAtUtcMs = json.optLong("startedAtUtcMs", 0L),
            endedAtUtcMs = if (json.isNull("endedAtUtcMs")) null else json.optLong("endedAtUtcMs"),
            deviceUtcOffsetSeconds = json.optInt("deviceUtcOffsetSeconds", 0),
            capture = capture,
            pauses = pauses,
            fixCount = json.optInt("fixCount", 0),
            logUri = json.optString("logUri"),
            libraryVersion = json.optString("libraryVersion", LIBRARY_VERSION),
            savedActivityId = if (json.isNull("savedActivityId")) null else json.optString("savedActivityId")
        )
    }

    companion object {
        const val RECORDING_DIR_NAME = "recording"
        const val META_FILE_NAME = "meta.json"
        const val FIXES_FILE_NAME = "fixes.jsonl"
        const val LIBRARY_VERSION = "0.1.0"

        private const val PREFS_NAME = "gps_tracker_session"
        private const val KEY_ACTIVE_SESSION = "active_session_id"
    }
}
