/**
 * Recording configuration that the app owns.
 *
 * The native side writes the fix log; the app decides how long it stays.
 */

/** How long a finished session's fix log is kept on the device (D10). */
export const FIX_LOG_RETENTION_DAYS = 30;

/**
 * The directory the native side writes sessions into, under the app's private
 * files. The app never hardcodes the path - the session meta carries the
 * absolute URI of the log (D11).
 */
export const RECORDING_DIR_NAME = 'recording';
