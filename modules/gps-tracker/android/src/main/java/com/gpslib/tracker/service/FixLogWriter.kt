package com.gpslib.tracker.service

import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter

/**
 * Appends fixes to `fixes.jsonl`, one JSON object per line.
 *
 * The writer is flushed every [flushEvery] fixes and on pause/stop, so a
 * recording that is killed loses at most a handful of lines - and a truncated
 * final line is something the reader already tolerates.
 */
class FixLogWriter(
    private val file: File,
    private val flushEvery: Int = DEFAULT_FLUSH_EVERY
) {
    private var writer: BufferedWriter? = null
    private var sinceFlush = 0

    fun open() {
        file.parentFile?.mkdirs()
        writer = BufferedWriter(FileWriter(file, true))
        sinceFlush = 0
    }

    fun append(entry: FixLogEntry) {
        val target = writer ?: return
        target.write(entry.toJson().toString())
        target.newLine()
        sinceFlush += 1
        if (sinceFlush >= flushEvery) {
            flush()
        }
    }

    fun flush() {
        writer?.flush()
        sinceFlush = 0
    }

    fun close() {
        flush()
        writer?.close()
        writer = null
    }

    companion object {
        const val DEFAULT_FLUSH_EVERY = 10
    }
}
