
const LEVELS = { info: "INFO", warn: "WARN", error: "ERROR" };

/**
 * Writes a single structured log line. The one place to touch when
 * plugging in a reporting service later.
 * @param {"info"|"warn"|"error"} level - Log level.
 * @param {string} message - Human-readable log message.
 * @param {unknown} [meta] - Optional extra context (usually an Error).
 * @returns {void}
 */
function write(level, message, meta){
	const line = `[${new Date().toISOString()}] ${LEVELS[level]} ${message}`;

	if(level === "error") console.error(line, meta ?? "");
	else if(level === "warn") console.warn(line, meta ?? "");
	else console.log(line, meta ?? "");

	//TODO: forward to Sentry.captureException(meta) here once SENTRY_DSN is configured
}

module.exports = {
	info: (message, meta) => write("info", message, meta),
	warn: (message, meta) => write("warn", message, meta),
	error: (message, meta) => write("error", message, meta)
};
